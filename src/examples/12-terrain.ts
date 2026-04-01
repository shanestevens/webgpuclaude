/**
 * Quadtree LOD Terrain with proper T-junction seam fixes.
 * - 4 LOD levels; each tile = 17x17 vertices (16x16 quads)
 * - T-junction fix: edge vertex heights snapped via linear interpolation
 *   from the coarser neighbour's bracketing vertices
 * - LRU geometry cache keyed by (lod, gridX, gridZ, neighbourMask)
 * - Dynamic split/merge with 1.65x hysteresis
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

const TERRAIN_SIZE = 512;
const TERRAIN_H    = 50;
const TILE_Q       = 16;
const TILE_N       = TILE_Q + 1;
const MAX_LOD      = 3;
const SPLIT_D      = [240, 115, 58, 29] as const;
const MERGE_F      = 1.65;
const CACHE_MAX    = 512;

// ── Noise & FBM ──────────────────────────────────────────────────────────────
const PERM = (() => {
  const a = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (Math.random() * (i+1))|0; [a[i],a[j]]=[a[j],a[i]]; }
  return [...a, ...a];
})();

function fade(t: number) { return t*t*t*(t*(t*6-15)+10); }
function lrp(a: number, b: number, t: number) { return a+t*(b-a); }
function grad2(h: number, x: number, z: number) { return ((h&1)?-x:x)+((h&2)?-z:z); }
function pnoise(x: number, z: number): number {
  const xi=Math.floor(x)&255, zi=Math.floor(z)&255;
  const xf=x-Math.floor(x), zf=z-Math.floor(z);
  const u=fade(xf), v=fade(zf);
  const aa=PERM[PERM[xi]+zi], ab=PERM[PERM[xi]+zi+1];
  const ba=PERM[PERM[xi+1]+zi], bb=PERM[PERM[xi+1]+zi+1];
  return lrp(lrp(grad2(aa,xf,zf),grad2(ba,xf-1,zf),u),lrp(grad2(ab,xf,zf-1),grad2(bb,xf-1,zf-1),u),v);
}
function terrainH(wx: number, wz: number): number {
  const nx=(wx/TERRAIN_SIZE)*3.5+3.1, nz=(wz/TERRAIN_SIZE)*3.5+1.7;
  let h=0, amp=1, freq=1, max=0;
  for (let i=0;i<7;i++) { h+=pnoise(nx*freq,nz*freq)*amp; max+=amp; amp*=0.5; freq*=2; }
  const base=(h/max)*TERRAIN_H;
  const d=Math.max(0, 1-(Math.abs(wx)+Math.abs(wz))/(TERRAIN_SIZE*0.72));
  return base*(0.25+0.75*d*d);
}

// ── T-junction snapping ───────────────────────────────────────────────────────
function snapY(wx: number, wz: number, coarseDelta: number, edgeAlongX: boolean): number {
  if (edgeAlongX) {
    const lx=Math.floor(wx/coarseDelta)*coarseDelta;
    const t=coarseDelta>0?(wx-lx)/coarseDelta:0;
    return lrp(terrainH(lx,wz), terrainH(lx+coarseDelta,wz), t);
  } else {
    const lz=Math.floor(wz/coarseDelta)*coarseDelta;
    const t=coarseDelta>0?(wz-lz)/coarseDelta:0;
    return lrp(terrainH(wx,lz), terrainH(wx,lz+coarseDelta), t);
  }
}

// ── Tile geometry ─────────────────────────────────────────────────────────────
function buildTile(minX:number, minZ:number, maxX:number, maxZ:number, _lod:number, mask:number): THREE.BufferGeometry {
  const dx=(maxX-minX)/TILE_Q, dz=(maxZ-minZ)/TILE_Q;
  const cdx=dx*2, cdz=dz*2;
  const vc=TILE_N*TILE_N;
  const pos=new Float32Array(vc*3), uv=new Float32Array(vc*2), col=new Float32Array(vc*3);

  for (let row=0;row<TILE_N;row++) {
    for (let c=0;c<TILE_N;c++) {
      const wx=minX+c*dx, wz=minZ+row*dz;
      let wy=terrainH(wx,wz);
      const onN=(row===0)&&(mask&1), onS=(row===TILE_Q)&&(mask&2);
      const onW=(c===0)&&(mask&4),  onE=(c===TILE_Q)&&(mask&8);
      if ((onN||onS)&&c%2!==0)   wy=snapY(wx,wz,cdx,true);
      if ((onW||onE)&&row%2!==0) wy=snapY(wx,wz,cdz,false);

      const i3=(row*TILE_N+c)*3, i2=(row*TILE_N+c)*2;
      pos[i3]=wx; pos[i3+1]=wy; pos[i3+2]=wz;
      uv[i2]=c/TILE_Q; uv[i2+1]=row/TILE_Q;

      const t=Math.max(0,Math.min(1,wy/TERRAIN_H));
      let r:number, g:number, b:number;
      if      (t<0.18){r=0.13;g=0.16;b=0.11;}
      else if (t<0.42){const s=(t-0.18)/0.24;r=lrp(0.18,0.27,s);g=lrp(0.30,0.43,s);b=lrp(0.10,0.14,s);}
      else if (t<0.68){const s=(t-0.42)/0.26;r=lrp(0.40,0.56,s);g=lrp(0.36,0.47,s);b=lrp(0.22,0.34,s);}
      else if (t<0.84){const s=(t-0.68)/0.16;r=lrp(0.56,0.73,s);g=lrp(0.54,0.71,s);b=lrp(0.51,0.68,s);}
      else            {const s=(t-0.84)/0.16;r=lrp(0.83,1.00,s);g=lrp(0.87,1.00,s);b=lrp(0.91,1.00,s);}
      col[i3]=r; col[i3+1]=g; col[i3+2]=b;
    }
  }

  const idx=new Uint16Array(TILE_Q*TILE_Q*6); let i=0;
  for (let row=0;row<TILE_Q;row++) for (let c=0;c<TILE_Q;c++) {
    const tl=row*TILE_N+c,tr=tl+1,bl=(row+1)*TILE_N+c,br=bl+1;
    idx[i++]=tl;idx[i++]=bl;idx[i++]=tr;idx[i++]=tr;idx[i++]=bl;idx[i++]=br;
  }

  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(col,3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.computeVertexNormals();
  return geo;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
class TileCache {
  private map=new Map<number,THREE.BufferGeometry>(); private ord:number[]=[];
  key(l:number,gx:number,gz:number,m:number){return(l<<22)|(gx<<14)|(gz<<6)|(m&63);}
  get(k:number){return this.map.get(k);}
  set(k:number,g:THREE.BufferGeometry){
    if(this.map.size>=CACHE_MAX){const old=this.ord.shift()!;this.map.get(old)?.dispose();this.map.delete(old);}
    this.map.set(k,g);this.ord.push(k);
  }
  dispose(){this.map.forEach(g=>g.dispose());this.map.clear();}
}

// ── Quadtree node ─────────────────────────────────────────────────────────────
interface QN {
  minX:number;minZ:number;maxX:number;maxZ:number;
  lod:number;gx:number;gz:number;
  children:QN[]|null;mesh:THREE.Mesh|null;mask:number;
}
const mkN=(minX:number,minZ:number,maxX:number,maxZ:number,lod:number,gx:number,gz:number):QN=>
  ({minX,minZ,maxX,maxZ,lod,gx,gz,children:null,mesh:null,mask:-1});

function getLeaf(root:QN,tgx:number,tgz:number,atLod:number):QN {
  if(!root.children)return root;
  const cl=root.lod+1; if(cl>atLod)return root;
  const sc=1<<(atLod-cl);
  const cx=Math.floor(tgx/sc)-root.gx*2, cz=Math.floor(tgz/sc)-root.gz*2;
  const idx=Math.max(0,Math.min(3,cz*2+cx));
  return getLeaf(root.children[idx]??root,tgx,tgz,atLod);
}
function nbrLod(n:QN,dir:number,root:QN):number {
  const gs=1<<n.lod;
  const ngx=n.gx+(dir===3?1:dir===2?-1:0), ngz=n.gz+(dir===1?1:dir===0?-1:0);
  if(ngx<0||ngx>=gs||ngz<0||ngz>=gs)return n.lod;
  return getLeaf(root,ngx,ngz,n.lod).lod;
}
function getMask(n:QN,root:QN):number {
  let m=0; for(let d=0;d<4;d++) if(nbrLod(n,d,root)<n.lod)m|=1<<d; return m;
}
function refresh(n:QN,sc:THREE.Scene,mat:THREE.Material,cache:TileCache,root:QN){
  const mask=getMask(n,root); if(n.mask===mask)return; n.mask=mask;
  const k=cache.key(n.lod,n.gx,n.gz,mask);
  let geo=cache.get(k); if(!geo){geo=buildTile(n.minX,n.minZ,n.maxX,n.maxZ,n.lod,mask);cache.set(k,geo);}
  if(n.mesh)n.mesh.geometry=geo;
  else{
    n.mesh=new THREE.Mesh(geo,mat);
    n.mesh.receiveShadow=true;
    n.mesh.userData.skipWireframe=true;  // terrain manages its own wireframe
    n.mesh.userData.terrainMesh=true;
    sc.add(n.mesh);
  }
}
function refreshNbrs(n:QN,sc:THREE.Scene,mat:THREE.Material,cache:TileCache,root:QN){
  const gs=1<<n.lod;
  for(const[dgx,dgz]of[[0,-1],[0,1],[-1,0],[1,0]]as const){
    const ngx=n.gx+dgx,ngz=n.gz+dgz;
    if(ngx<0||ngx>=gs||ngz<0||ngz>=gs)continue;
    const nb=getLeaf(root,ngx,ngz,n.lod);
    if(!nb.children&&nb!==n)refresh(nb,sc,mat,cache,root);
  }
}
function splitN(n:QN,sc:THREE.Scene,mat:THREE.Material,cache:TileCache,root:QN){
  const mx=(n.minX+n.maxX)*0.5,mz=(n.minZ+n.maxZ)*0.5,l=n.lod+1,gx2=n.gx*2,gz2=n.gz*2;
  n.children=[mkN(n.minX,n.minZ,mx,mz,l,gx2,gz2),mkN(mx,n.minZ,n.maxX,mz,l,gx2+1,gz2),
               mkN(n.minX,mz,mx,n.maxZ,l,gx2,gz2+1),mkN(mx,mz,n.maxX,n.maxZ,l,gx2+1,gz2+1)];
  if(n.mesh){sc.remove(n.mesh);n.mesh=null;}
  for(const c of n.children)refresh(c,sc,mat,cache,root);
  refreshNbrs(n,sc,mat,cache,root);
}
function mergeN(n:QN,sc:THREE.Scene,mat:THREE.Material,cache:TileCache,root:QN){
  for(const c of n.children!){if(c.mesh){sc.remove(c.mesh);c.mesh=null;}}
  n.children=null;n.mask=-1;refresh(n,sc,mat,cache,root);refreshNbrs(n,sc,mat,cache,root);
}
function updateTree(n:QN,cam:THREE.Vector3,sc:THREE.Scene,mat:THREE.Material,cache:TileCache,root:QN){
  const cx=(n.minX+n.maxX)*0.5,cz=(n.minZ+n.maxZ)*0.5;
  const dist=Math.sqrt((cam.x-cx)**2+(cam.z-cz)**2);
  const canSplit=n.lod<MAX_LOD;
  const wantSplit=canSplit&&dist<SPLIT_D[n.lod];
  const wantMerge=!!n.children&&!wantSplit&&dist>SPLIT_D[n.lod]*MERGE_F;
  if(wantSplit&&!n.children)splitN(n,sc,mat,cache,root);
  else if(wantMerge&&n.children!.every(c=>!c.children))mergeN(n,sc,mat,cache,root);
  if(n.children)for(const c of n.children)updateTree(c,cam,sc,mat,cache,root);
  else refresh(n,sc,mat,cache,root);
}
function countLeaves(n:QN):number{return n.children?n.children.reduce((s,c)=>s+countLeaves(c),0):1;}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function createTerrain(container: HTMLDivElement) {
  const { renderer, scene, camera, cameraControls, gui, animate } = await createScene(container, {
    cameraPos: [0, 80, 140],
    background: 0x7aaec8,
  });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  camera.far = 1500; camera.near = 0.5; camera.updateProjectionMatrix();
  scene.fog  = new THREE.FogExp2(0x7aaec8, 0.0015);

  const sun = new THREE.DirectionalLight(0xfff0d0, 3.5);
  sun.position.set(100, 140, -80); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.near=10; sc.far=800; sc.left=sc.bottom=-220; sc.right=sc.top=220;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x66889a, 0.5));
  scene.add(new THREE.HemisphereLight(0x88b8e0, 0x4a6030, 0.9));

  const mat     = new THREE.MeshStandardNodeMaterial({ vertexColors:true, roughness:0.88, metalness:0 });
  const wireMat = new THREE.MeshBasicNodeMaterial  ({ vertexColors:true, wireframe:true });

  const H = TERRAIN_SIZE / 2;
  const root = mkN(-H, -H, H, H, 0, 0, 0);
  const cache = new TileCache();
  splitN(root, scene, mat, cache, root);

  // Pre-warm both pipelines so wireframe toggle never stalls
  renderer.render(scene, camera);
  scene.traverse(o => { if((o as THREE.Mesh).userData.terrainMesh)(o as THREE.Mesh).material=wireMat; });
  renderer.render(scene, camera);
  scene.traverse(o => { if((o as THREE.Mesh).userData.terrainMesh)(o as THREE.Mesh).material=mat; });

  let useWire = false;
  gui.addToggle('Wireframe', false, v => {
    useWire = v;
    const m = v ? wireMat : mat;
    scene.traverse(o => { if((o as THREE.Mesh).userData.terrainMesh)(o as THREE.Mesh).material=m; });
  });

  gui.addSlider('Sun angle', 50, 0, 360, 1, v => {
    const r=v*Math.PI/180; sun.position.set(Math.cos(r)*160, sun.position.y, Math.sin(r)*160);
  });
  gui.addSlider('Sun height', 140, 20, 300, 1, v => sun.position.setY(v));
  gui.addToggle('Shadows', true, v => { sun.castShadow = v; });
  gui.addSlider('Move speed', 30, 1, 120, 1, v => { (cameraControls as any).moveSpeed = v; });
  const info = gui.addText('Tiles');

  cameraControls.setMode('fps');

  animate(() => {
    const activeMat = useWire ? wireMat : mat;
    updateTree(root, camera.position, scene, activeMat, cache, root);
    // Newly split tiles always get activeMat; ensure consistency
    if (useWire) {
      scene.traverse(o => {
        if ((o as THREE.Mesh).userData.terrainMesh && (o as THREE.Mesh).material !== wireMat)
          (o as THREE.Mesh).material = wireMat;
      });
    }
    info.set(String(countLeaves(root)));
  });
}
