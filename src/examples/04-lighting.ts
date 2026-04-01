/**
 * Lighting — 4 light types demonstrated on a shared scene with shadows.
 * Ambient · Directional (with shadow) · Point (orbiting) · Spot (sweeping)
 * GUI lets you toggle each light on/off and tweak intensity.
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createLighting(container: HTMLDivElement) {
  const { renderer, scene, animate, gui } = await createScene(container, {
    cameraPos: [0, 4, 8],
    background: 0x080c14,
  });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.0;

  // ── Lights ──────────────────────────────────────────────────────────────────

  // 1. Ambient — lifts shadows, no directionality
  const ambient = new THREE.AmbientLight(0x223355, 0.5);
  scene.add(ambient);

  // 2. Directional — parallel rays, sun-like, casts sharp shadows
  const dir = new THREE.DirectionalLight(0xfff5e0, 2.5);
  dir.position.set(5, 8, 4);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = dir.shadow.camera.bottom = -6;
  dir.shadow.camera.right = dir.shadow.camera.top   =  6;
  dir.shadow.camera.near  = 1; dir.shadow.camera.far = 20;
  dir.shadow.bias = -0.001;
  scene.add(dir);
  const dirHelper = new THREE.DirectionalLightHelper(dir, 1);
  scene.add(dirHelper);

  // 3. Point — radiates in all directions, distance falloff
  const pt = new THREE.PointLight(0xff3388, 18, 10, 2);
  pt.castShadow = true;
  pt.shadow.mapSize.set(512, 512);
  scene.add(pt);
  const ptSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 8),
    new THREE.MeshBasicNodeMaterial({ color: 0xff3388 })
  );
  scene.add(ptSphere);

  // 4. Spot — cone, angle + penumbra, sweeps slowly
  const spot = new THREE.SpotLight(0x44aaff, 40, 14, Math.PI / 7, 0.4, 2);
  spot.position.set(-4, 7, -2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  scene.add(spot);
  scene.add(spot.target);
  const spotHelper = new THREE.SpotLightHelper(spot);
  scene.add(spotHelper);

  // ── Scene objects ────────────────────────────────────────────────────────────

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardNodeMaterial({ color: 0x1a2030, roughness: 0.85, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 40, 32),
    new THREE.MeshStandardNodeMaterial({ color: 0x4488ff, roughness: 0.25, metalness: 0.15 })
  );
  sphere.position.set(-2.2, 0.1, 0);
  sphere.castShadow = sphere.receiveShadow = true;
  scene.add(sphere);

  // Box
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshStandardNodeMaterial({ color: 0xff5533, roughness: 0.5, metalness: 0.2 })
  );
  box.position.set(0, -0.05, 0);
  box.castShadow = box.receiveShadow = true;
  scene.add(box);

  // Torus knot
  const torus = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.45, 0.16, 100, 20),
    new THREE.MeshStandardNodeMaterial({ color: 0x44ff99, roughness: 0.2, metalness: 0.5 })
  );
  torus.position.set(2.2, 0.2, 0);
  torus.castShadow = torus.receiveShadow = true;
  scene.add(torus);

  // Cylinder (extra shadow catcher)
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 1.2, 28),
    new THREE.MeshStandardNodeMaterial({ color: 0xddaa22, roughness: 0.4, metalness: 0.6 })
  );
  cyl.position.set(0, -0.05, -2.2);
  cyl.castShadow = cyl.receiveShadow = true;
  scene.add(cyl);

  // ── GUI ──────────────────────────────────────────────────────────────────────
  gui.addToggle('Ambient',     true, v => { ambient.visible = v; });
  gui.addToggle('Directional', true, v => { dir.visible = v; dirHelper.visible = v; });
  gui.addToggle('Point',       true, v => { pt.visible = v; ptSphere.visible = v; });
  gui.addToggle('Spot',        true, v => { spot.visible = v; spotHelper.visible = v; });
  gui.addSeparator('Intensity');
  gui.addSlider('Ambient',     0.5, 0, 2,  0.05, v => { ambient.intensity = v; });
  gui.addSlider('Directional', 2.5, 0, 6,  0.1,  v => { dir.intensity = v; });
  gui.addSlider('Point',       18,  0, 40, 0.5,  v => { pt.intensity = v; });
  gui.addSlider('Spot',        40,  0, 80, 1,    v => { spot.intensity = v; });
  gui.addSlider('Spot angle',  26,  5, 60, 1,    v => { spot.angle = v * Math.PI / 180; spotHelper.update(); });

  // ── Animate ──────────────────────────────────────────────────────────────────
  animate(t => {
    // Point light orbits the scene
    pt.position.set(Math.cos(t * 0.8) * 3, 1.5 + Math.sin(t * 1.2) * 0.6, Math.sin(t * 0.8) * 3);
    ptSphere.position.copy(pt.position);

    // Spot sweeps slowly left-right
    spot.target.position.set(Math.sin(t * 0.3) * 3, 0, Math.cos(t * 0.3) * 1.5 - 0.5);
    spot.target.updateMatrixWorld();
    spotHelper.update();

    box.rotation.y  = t * 0.4;
    torus.rotation.x = t * 0.35;
    torus.rotation.z = t * 0.2;
  });
}
