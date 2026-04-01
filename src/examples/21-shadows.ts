/**
 * Shadow Techniques — BasicShadowMap · PCF · PCFSoft · VSM
 * Single scene, GUI dropdown to switch algorithms in real time.
 * Low map resolution (default 128²) makes the differences very obvious.
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

const MODES = {
  'Basic':    { type: THREE.BasicShadowMap,   radius: 1,  desc: 'Hard-edged · no filtering',           color: '#ff5533' },
  'PCF':      { type: THREE.PCFShadowMap,     radius: 3,  desc: 'Percentage-Closer Filtering',          color: '#3399ff' },
  'PCF Soft': { type: THREE.PCFSoftShadowMap, radius: 8,  desc: 'Gaussian blur · soft edges',           color: '#33dd77' },
  'VSM':      { type: THREE.VSMShadowMap,     radius: 12, desc: 'Variance Shadow Maps · ultra smooth',  color: '#cc55ff' },
} as const;
type ModeName = keyof typeof MODES;

export async function createShadowTypes(container: HTMLDivElement) {
  const { renderer, scene, camera, animate, gui } = await createScene(container, {
    cameraPos: [5, 8, 10],
    background: 0x1b1c2e,
  });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // set initial type before any shadow map is created
  camera.fov = 46;
  camera.updateProjectionMatrix();

  // ── Lighting ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x223366, 0.7));
  const fill = new THREE.DirectionalLight(0x6688ff, 0.35);
  fill.position.set(4, -1, 6);
  scene.add(fill);

  const sun = new THREE.DirectionalLight(0xfff5e0, 4.5);
  sun.position.set(-4, 10, 5);
  sun.castShadow = true;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 28;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
  sun.shadow.camera.right = sun.shadow.camera.top   =  7;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.bias   = -0.0005;
  sun.shadow.radius = 8;
  scene.add(sun);

  // ── Floor ─────────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardNodeMaterial({ color: 0xf4f0e6, roughness: 0.93 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall — catches nice shadows
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    new THREE.MeshStandardNodeMaterial({ color: 0xeceae0, roughness: 0.88 })
  );
  wall.position.set(0, 7, -6);
  wall.receiveShadow = true;
  scene.add(wall);

  // ── Objects ───────────────────────────────────────────────────────────────
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.33, 20, 64),
    new THREE.MeshStandardNodeMaterial({ color: 0xff2244, metalness: 0.3, roughness: 0.2 })
  );
  torus.position.set(-2.5, 1.0, 0.5);
  torus.castShadow = torus.receiveShadow = true;
  scene.add(torus);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 48, 32),
    new THREE.MeshStandardNodeMaterial({ color: 0x2288ff, metalness: 0.4, roughness: 0.15 })
  );
  sphere.position.set(0.3, 0.75, 0.8);
  sphere.castShadow = sphere.receiveShadow = true;
  scene.add(sphere);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.3, 1.3),
    new THREE.MeshStandardNodeMaterial({ color: 0xffaa00, metalness: 0.15, roughness: 0.35 })
  );
  box.position.set(2.6, 0.65, -0.3);
  box.castShadow = box.receiveShadow = true;
  scene.add(box);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 2.2, 7),
    new THREE.MeshStandardNodeMaterial({ color: 0x44dd88, metalness: 0.1, roughness: 0.4 })
  );
  cone.position.set(-0.4, 1.1, -2.2);
  cone.castShadow = cone.receiveShadow = true;
  scene.add(cone);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.5, 0.18, 96, 16),
    new THREE.MeshStandardNodeMaterial({ color: 0xdd44ff, metalness: 0.5, roughness: 0.1 })
  );
  knot.position.set(0.8, 0.65, -3.0);
  knot.castShadow = knot.receiveShadow = true;
  scene.add(knot);

  // ── Mode label overlay ────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  container.appendChild(overlay);

  const modeEl = document.createElement('div');
  modeEl.style.cssText = [
    'position:absolute', 'left:12px', 'bottom:12px',
    'padding:10px 16px',
    'background:rgba(0,0,0,0.58)',
    'border-radius:10px',
    'backdrop-filter:blur(6px)',
    'font-family:"SF Mono",Menlo,Consolas,monospace',
  ].join(';');
  overlay.appendChild(modeEl);

  // ── Deferred shadow map changes ───────────────────────────────────────────
  // shadowMap.type must only be changed inside the animate callback (before render).
  // Setting it outside the loop on the WebGPU backend marks shadow maps dirty
  // every frame, causing continuous "Destroyed texture in submit" errors.
  // We never call dispose() — drop the reference and let GC clean up.
  let pendingShadowType: THREE.ShadowMapType | null = null;
  let pendingMapSize: number | null = null;
  let pendingShadowReset = false;

  const updateLabel = (name: ModeName, displaySize = sun.shadow.mapSize.x) => {
    const m = MODES[name];
    modeEl.innerHTML = `
      <div style="font-size:20px;font-weight:bold;color:${m.color};line-height:1.2">${name}</div>
      <div style="font-size:10px;color:#bbc;margin-top:3px">${m.desc}</div>
      <div style="font-size:9px;color:#778;margin-top:1px">radius&nbsp;${m.radius} · map&nbsp;${displaySize}²</div>
    `;
  };

  const applyMode = (name: ModeName, displaySize = sun.shadow.mapSize.x) => {
    const m = MODES[name];
    sun.shadow.radius = m.radius;    // safe: just a number, no GPU impact
    pendingShadowType  = m.type;     // deferred: set inside animate before render
    pendingShadowReset = true;       // deferred: null the map inside animate
    updateLabel(name, displaySize);
  };

  // ── GUI ───────────────────────────────────────────────────────────────────
  let currentMode: ModeName = 'PCF Soft';
  gui.addSelect('Shadow Type', Object.keys(MODES), currentMode, v => {
    currentMode = v as ModeName;
    applyMode(currentMode);
  });
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  gui.addSlider('Map Res', 512, 64, 2048, 64, v => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      pendingMapSize = v;
      applyMode(currentMode, v);
    }, 200);
  });
  let orbitLight = true;
  gui.addToggle('Orbit light', true, v => { orbitLight = v; });
  gui.addToggle('Rotate objects', true, v => { rotating = v; });

  let rotating = true;
  // Initial label only — type already set at line 23, no shadow map exists yet
  updateLabel(currentMode);
  sun.shadow.radius = MODES[currentMode].radius;

  // ── Animate ───────────────────────────────────────────────────────────────
  animate(t => {
    // All shadow map mutations happen here, before renderer.render(), so no
    // GPU submit is in flight when the old texture reference is dropped.
    if (pendingShadowType !== null || pendingMapSize !== null || pendingShadowReset) {
      if (pendingShadowType !== null) {
        (renderer.shadowMap as any).type = pendingShadowType;
        pendingShadowType = null;
      }
      if (pendingMapSize !== null) {
        sun.shadow.mapSize.set(pendingMapSize, pendingMapSize);
        pendingMapSize = null;
      }
      pendingShadowReset = false;
      (sun.shadow as any).map = null; // force Three.js to recreate with new settings
    }
    if (rotating) {
      torus.rotation.x = t * 0.4;
      torus.rotation.y = t * 0.25;
      box.rotation.y   = t * 0.3;
      cone.rotation.y  = t * 0.5;
      knot.rotation.x  = t * 0.3;
      knot.rotation.y  = t * 0.4;
    }
    if (orbitLight) {
      sun.position.x = Math.sin(t * 0.4) * 6;
      sun.position.z = Math.cos(t * 0.3) * 4 + 2;
    }
  });
}
