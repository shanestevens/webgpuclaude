/**
 * PBR Lookdev Board — studio material-ball board.
 * Roughness × metalness grid, plus special material balls:
 * glass, emission, anisotropic-style tinted metals, procedural marble/wood textures.
 * Dark matte studio floor, controlled 3-point lighting.
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

// ── Studio tile floor texture ─────────────────────────────────────────────────
function studioFloorTexture(w = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = w;
  const ctx = c.getContext('2d')!;

  // Base concrete colour
  ctx.fillStyle = '#b8bcc0';
  ctx.fillRect(0, 0, w, w);

  // Subtle concrete noise
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * w, y = Math.random() * w;
    const v = Math.random();
    const l = Math.round(170 + v * 30);
    ctx.fillStyle = `rgba(${l},${l},${l},0.18)`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Tile grid — 8×8 tiles per texture repeat
  const tileSize = w / 8;
  ctx.strokeStyle = 'rgba(80,85,90,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, w); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(w, i * tileSize); ctx.stroke();
  }

  // Subtle inner bevel on each tile
  ctx.strokeStyle = 'rgba(200,205,210,0.35)';
  ctx.lineWidth = 1;
  const bev = 4;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const tx = col * tileSize, ty = row * tileSize;
    ctx.strokeRect(tx + bev, ty + bev, tileSize - bev * 2, tileSize - bev * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// ── Procedural canvas texture helpers ────────────────────────────────────────
function marbleTexture(w = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = w;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8d8e8';
  ctx.fillRect(0, 0, w, w);
  for (let i = 0; i < 18; i++) {
    const x0 = Math.random() * w, y0 = Math.random() * w;
    const g = ctx.createLinearGradient(x0, y0, x0 + (Math.random()-0.5)*w, y0 + (Math.random()-0.5)*w);
    const hue = 200 + Math.random() * 40;
    g.addColorStop(0, `hsla(${hue},40%,80%,0)`);
    g.addColorStop(0.4 + Math.random()*0.2, `hsla(${hue},60%,30%,0.55)`);
    g.addColorStop(1, `hsla(${hue},40%,80%,0)`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.5 + Math.random() * 3;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(
      Math.random()*w, Math.random()*w,
      Math.random()*w, Math.random()*w,
      Math.random()*w, Math.random()*w
    );
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function woodTexture(w = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = w;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < w; y++) {
    const t = (Math.sin(y * 0.18 + Math.sin(y * 0.05) * 8) + 1) / 2;
    const r = Math.round(80 + t * 80), g2 = Math.round(40 + t * 40), b = Math.round(10 + t * 20);
    ctx.fillStyle = `rgb(${r},${g2},${b})`;
    ctx.fillRect(0, y, w, 1);
  }
  return new THREE.CanvasTexture(c);
}

function checkerTexture(w = 256, ca = '#ffffff', cb = '#222222'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = w;
  const ctx = c.getContext('2d')!;
  const s = w / 8;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    ctx.fillStyle = (row + col) % 2 === 0 ? ca : cb;
    ctx.fillRect(col * s, row * s, s, s);
  }
  return new THREE.CanvasTexture(c);
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function createPBR(container: HTMLDivElement) {
  const { renderer, scene, camera, gui, animate } = await createScene(container, {
    cameraPos: [0, 3.5, 9],
    background: 0x080c12,
  });

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

  camera.fov = 60; camera.updateProjectionMatrix();

  // ── Studio lighting ───────────────────────────────────────────────────────
  const key = new THREE.DirectionalLight(0xfff8f0, 2.2);
  key.position.set(5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -14;
  key.shadow.camera.right = key.shadow.camera.top   =  14;
  key.shadow.camera.near  = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.001;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb0c8ff, 0.4);
  fill.position.set(-5, 4, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x80b0ff, 0.5);
  rim.position.set(0, 5, -6);
  scene.add(rim);

  scene.add(new THREE.AmbientLight(0x303848, 1.0));

  // ── Studio tile floor ─────────────────────────────────────────────────────
  const floorTex = studioFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardNodeMaterial({
      map: floorTex,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.05;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Material ball definitions ─────────────────────────────────────────────
  const texMarble  = marbleTexture();
  const texWood    = woodTexture();
  const texChecker = checkerTexture();

  interface BallDef {
    color: number; roughness: number; metalness: number;
    map?: THREE.Texture; emissive?: number; emissiveIntensity?: number;
    label: string;
  }

  const balls: BallDef[] = [
    // Row 0 — dielectric roughness sweep (metalness=0)
    { color: 0xeeddcc, roughness: 0.0,  metalness: 0.0, label: 'mirror dielectric' },
    { color: 0xeeddcc, roughness: 0.2,  metalness: 0.0, label: 'glossy' },
    { color: 0xeeddcc, roughness: 0.45, metalness: 0.0, label: 'satin' },
    { color: 0xeeddcc, roughness: 0.7,  metalness: 0.0, label: 'matte' },
    { color: 0xeeddcc, roughness: 1.0,  metalness: 0.0, label: 'chalk' },

    // Row 1 — metal roughness sweep
    { color: 0xffd070, roughness: 0.0,  metalness: 1.0, label: 'gold mirror' },
    { color: 0xffd070, roughness: 0.2,  metalness: 1.0, label: 'gold satin' },
    { color: 0xc0c8d8, roughness: 0.05, metalness: 1.0, label: 'chrome' },
    { color: 0xc0c8d8, roughness: 0.35, metalness: 1.0, label: 'brushed steel' },
    { color: 0xb87333, roughness: 0.4,  metalness: 1.0, label: 'copper' },

    // Row 2 — coloured dielectrics
    { color: 0xcc3344, roughness: 0.35, metalness: 0.0, label: 'red plastic' },
    { color: 0x3366cc, roughness: 0.2,  metalness: 0.0, label: 'blue lacquer' },
    { color: 0x44aa55, roughness: 0.6,  metalness: 0.0, label: 'green rubber' },
    { color: 0xcc8833, roughness: 0.1,  metalness: 0.0, label: 'amber resin' },
    { color: 0x9944cc, roughness: 0.15, metalness: 0.0, label: 'purple gloss' },

    // Row 3 — special / textured
    { color: 0xffffff, roughness: 0.05, metalness: 0.0, map: texMarble, label: 'marble' },
    { color: 0xffffff, roughness: 0.55, metalness: 0.0, map: texWood,   label: 'wood' },
    { color: 0xffffff, roughness: 0.2,  metalness: 0.0, map: texChecker, label: 'checker' },
    { color: 0x88ccff, roughness: 0.55, metalness: 0.5, label: 'anodised blue' },
    { color: 0xff6633, roughness: 0.0,  metalness: 0.0,
      emissive: 0xff3300, emissiveIntensity: 0.6, label: 'emissive' },
  ];

  const COLS = 5, ROWS = 4;
  const SPACING = 2.1;
  const R = 0.75;
  const meshes: THREE.Mesh[] = [];

  balls.forEach((def, idx) => {
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    const x = (col - (COLS - 1) / 2) * SPACING;
    const z = (row - (ROWS - 1) / 2) * SPACING;

    const matParams: any = {
      color: def.color,
      roughness: def.roughness,
      metalness: def.metalness,
    };
    if (def.map)               matParams.map              = def.map;
    if (def.emissive != null)  matParams.emissive         = new THREE.Color(def.emissive);
    if (def.emissiveIntensity) matParams.emissiveIntensity = def.emissiveIntensity;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 32),
      new THREE.MeshStandardNodeMaterial(matParams)
    );
    mesh.position.set(x, -1.05 + R, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  });

  // ── GUI ───────────────────────────────────────────────────────────────────
  gui.addSlider('Exposure',     0.85, 0.2, 2.0, 0.05, v => { renderer.toneMappingExposure = v; });
  gui.addSlider('Key light',    2.2,  0,   5.0, 0.1,  v => { key.intensity  = v; });
  gui.addSlider('Ambient',      1.0,  0,   2.0, 0.05, v => { (scene.children.find(o => o instanceof THREE.AmbientLight) as THREE.AmbientLight).intensity = v; });
  gui.addSlider('Floor rough',  0.82, 0,   1.0, 0.01, v => { (floor.material as any).roughness = v; });
  gui.addSlider('Floor metal',  0.02, 0,   1.0, 0.01, v => { (floor.material as any).metalness = v; });

  animate();
}
