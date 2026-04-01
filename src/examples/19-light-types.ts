/**
 * Light Types — 5 Three.js light types shown side by side.
 * AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight
 * (RectAreaLight omitted — LTC lookup-texture init is broken in three/webgpu 0.183)
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

const COLORS = [0xff6644, 0x66aaff, 0x44ff88, 0xffaa22, 0xcc44ff] as const;

export async function createLightTypes(container: HTMLDivElement) {
  const { scene, gui, animate } = await createScene(container, {
    cameraPos: [0, 3.5, 12],
    background: 0x08080f,
  });

  scene.add(new THREE.AmbientLight(0x111122, 0.3));

  const sphereGeo = new THREE.SphereGeometry(0.65, 32, 24);
  const planeGeo  = new THREE.PlaneGeometry(4.0, 4.0);
  const wallGeo   = new THREE.PlaneGeometry(4.0, 3.2);
  const mat       = () => new THREE.MeshStandardNodeMaterial({ color: 0xddddd0, roughness: 0.55, metalness: 0.1 });

  const COLS = 5, GAP = 4.4;
  const titles = ['Ambient', 'Directional', 'Point', 'Spot', 'Hemisphere'];
  const groups: THREE.Group[] = [];

  for (let i = 0; i < COLS; i++) {
    const g = new THREE.Group();
    g.position.x = (i - (COLS - 1) / 2) * GAP;
    scene.add(g);
    groups.push(g);

    const wall = new THREE.Mesh(wallGeo, mat());
    wall.position.set(0, 0.4, -1.6); g.add(wall);

    const floor = new THREE.Mesh(planeGeo, mat());
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.8; g.add(floor);

    const sphere = new THREE.Mesh(sphereGeo,
      new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.8 }));
    sphere.position.y = 0.1; g.add(sphere);

    g.add(makeLabelMesh(titles[i], COLORS[i]));
  }

  // ── 0 · AmbientLight ─────────────────────────────────────────────────────
  const ambLight = new THREE.AmbientLight(COLORS[0], 1.8);
  groups[0].add(ambLight);

  // ── 1 · DirectionalLight ─────────────────────────────────────────────────
  const dirLight = new THREE.DirectionalLight(COLORS[1], 5);
  dirLight.position.set(1.5, 3, 1.5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(512, 512);
  const dirHelper = new THREE.DirectionalLightHelper(dirLight, 0.5);
  groups[1].add(dirLight, dirHelper);

  // ── 2 · PointLight ───────────────────────────────────────────────────────
  const ptLight = new THREE.PointLight(COLORS[2], 18, 6, 1.8);
  ptLight.position.set(0, 2.2, 0);
  ptLight.castShadow = true;
  const ptHelper = new THREE.PointLightHelper(ptLight, 0.18);
  groups[2].add(ptLight, ptHelper);

  // ── 3 · SpotLight ────────────────────────────────────────────────────────
  const spotLight = new THREE.SpotLight(COLORS[3], 35, 9, Math.PI / 6, 0.35, 1.8);
  spotLight.position.set(0, 3.8, 0.6);
  spotLight.target.position.set(0, 0, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(512, 512);
  const spotHelper = new THREE.SpotLightHelper(spotLight);
  groups[3].add(spotLight, spotLight.target, spotHelper);

  // ── 4 · HemisphereLight ──────────────────────────────────────────────────
  const hemiLight = new THREE.HemisphereLight(COLORS[4], 0x443322, 3.0);
  const hemiHelper = new THREE.HemisphereLightHelper(hemiLight, 0.45);
  groups[4].add(hemiLight, hemiHelper);

  // ── GUI ───────────────────────────────────────────────────────────────────
  gui.addToggle('Helpers', true, v => {
    [dirHelper, ptHelper, spotHelper, hemiHelper].forEach(h => { h.visible = v; });
  });
  gui.addSlider('Intensity', 1, 0, 3, 0.05, v => {
    ambLight.intensity  = v * 1.8;
    dirLight.intensity  = v * 5;
    ptLight.intensity   = v * 18;
    spotLight.intensity = v * 35;
    hemiLight.intensity = v * 3.0;
  });
  gui.addSlider('Spot angle', 30, 5, 75, 1, v => {
    spotLight.angle = v * Math.PI / 180;
    spotHelper.update();
  });

  animate(t => {
    ptLight.position.set(Math.sin(t) * 1.3, 2.2, Math.cos(t) * 1.3);
    ptHelper.update();
    spotHelper.update();
  });
}

function makeLabelMesh(text: string, color: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 52;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 52);
  const c = new THREE.Color(color);
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.45),
    new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  mesh.position.y = -1.4;
  return mesh;
}
