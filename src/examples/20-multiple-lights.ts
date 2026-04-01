/**
 * Multiple Lights — 3-point lighting + moving coloured points + shadow maps.
 * Demonstrates how multiple lights interact on PBR surfaces.
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createMultipleLights(container: HTMLDivElement) {
  const { renderer, scene, camera, gui, animate } = await createScene(container, {
    cameraPos: [0, 3, 9],
    background: 0x050508,
  });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

  // ── Scene geometry ──────────────────────────────────────────────────────
  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardNodeMaterial({ color: 0x1a1a24, roughness: 0.9, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  // Back wall
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 6),
    new THREE.MeshStandardNodeMaterial({ color: 0x14141e, roughness: 0.85 })
  );
  backWall.position.set(0, 3, -5); backWall.receiveShadow = true;
  scene.add(backWall);

  // Showcase objects
  const objects: THREE.Mesh[] = [];
  const geos: THREE.BufferGeometry[] = [
    new THREE.SphereGeometry(0.8, 64, 32),
    new THREE.TorusKnotGeometry(0.5, 0.18, 128, 16),
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.CylinderGeometry(0.4, 0.6, 1.4, 32),
    new THREE.IcosahedronGeometry(0.75, 2),
  ];
  const mats = [
    new THREE.MeshStandardNodeMaterial({ color: 0xeeddcc, roughness: 0.1, metalness: 0.9 }),
    new THREE.MeshStandardNodeMaterial({ color: 0xcc3344, roughness: 0.3, metalness: 0.7 }),
    new THREE.MeshStandardNodeMaterial({ color: 0x44aacc, roughness: 0.05, metalness: 0.95 }),
    new THREE.MeshStandardNodeMaterial({ color: 0x88cc44, roughness: 0.6, metalness: 0.3 }),
    new THREE.MeshStandardNodeMaterial({ color: 0xcc88ff, roughness: 0.15, metalness: 0.85 }),
  ];

  geos.forEach((geo, i) => {
    const mesh = new THREE.Mesh(geo, mats[i]);
    mesh.position.set((i - 2) * 2.8, 0.85, 0);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    objects.push(mesh);
  });

  // ── 3-Point Lighting ────────────────────────────────────────────────────
  const keyLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
  keyLight.position.set(5, 8, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -10; keyLight.shadow.camera.right  = 10;
  keyLight.shadow.camera.top  =  8; keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.bias = -0.001;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x4466aa, 0.8);
  fillLight.position.set(-5, 4, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x88bbff, 1.2);
  rimLight.position.set(0, 3, -6);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0x111122, 0.4));

  // ── Coloured moving point lights ────────────────────────────────────────
  const ptColors = [0xff2244, 0x22aaff, 0xffaa22, 0x44ff88];
  const ptLights = ptColors.map((col, i) => {
    const l = new THREE.PointLight(col, 10, 8, 1.8);
    l.castShadow = true;
    l.shadow.mapSize.set(512, 512);
    scene.add(l);
    // Visual glow sphere
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicNodeMaterial({ color: col })
    );
    l.add(glow);
    return l;
  });

  // ── Spot light for drama ────────────────────────────────────────────────
  const spot = new THREE.SpotLight(0xffffff, 20, 12, Math.PI / 9, 0.4, 1.5);
  spot.position.set(0, 8, 2);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot, spot.target);

  // ── GUI ─────────────────────────────────────────────────────────────────
  gui.addToggle('Key light', true,  v => { keyLight.visible  = v; });
  gui.addToggle('Fill light', true, v => { fillLight.visible = v; });
  gui.addToggle('Rim light',  true, v => { rimLight.visible  = v; });
  gui.addToggle('Point lights', true, v => ptLights.forEach(l => l.visible = v));
  gui.addToggle('Spot light', true,   v => { spot.visible = v; });
  gui.addToggle('Shadows',    true,   v => { renderer.shadowMap.enabled = v; });

  gui.addSlider('Key intensity',   2.5, 0, 8,  0.1, v => keyLight.intensity   = v);
  gui.addSlider('Point intensity', 10,  0, 30, 0.5, v => ptLights.forEach(l => l.intensity = v));
  gui.addSlider('Spot intensity',  20,  0, 60, 1,   v => spot.intensity       = v);
  gui.addSlider('Spot angle°',     20,  5, 60, 1,   v => { spot.angle = v*Math.PI/180; });

  animate((t) => {
    // Objects slowly rotate
    objects.forEach((o, i) => { o.rotation.y = t * 0.3 + i; });

    // Orbit point lights in an arc above the objects
    ptLights.forEach((l, i) => {
      const phase = t * 0.5 + i * Math.PI / 2;
      const r = 3.5;
      l.position.set(Math.cos(phase) * r, 2.5 + Math.sin(phase * 0.7) * 1.0, Math.sin(phase) * r * 0.5);
    });

    // Slow spot sweep
    spot.target.position.x = Math.sin(t * 0.3) * 4;
  });
}
