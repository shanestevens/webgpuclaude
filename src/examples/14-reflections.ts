/**
 * Reflections — CubeCamera environment reflections.
 * Objects sit on a mirror-polished floor; a live CubeCamera
 * captures the scene so the central chrome sphere reflects everything.
 */
import * as THREE from 'three/webgpu';
import { WebGLCubeRenderTarget } from 'three';
import { createScene } from './setup';

export async function createReflections(container: HTMLDivElement) {
  const { renderer, scene, camera, gui, animate } = await createScene(container, {
    cameraPos: [0, 3.5, 7],
    background: 0x08080f,
  });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  camera.fov = 55; camera.updateProjectionMatrix();

  // ── Lighting ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x446699, 1.8));

  const key = new THREE.DirectionalLight(0xfff0e0, 3.5);
  key.position.set(5, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -7;
  key.shadow.camera.right = key.shadow.camera.top   =  7;
  key.shadow.bias = -0.001;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x4488ff, 1.2);
  fill.position.set(-5, 4, -3);
  scene.add(fill);

  // Under-light to brighten the floor from below
  const under = new THREE.DirectionalLight(0x8855ff, 0.8);
  under.position.set(0, -4, 0);
  scene.add(under);

  // ── Procedural env cube texture (coloured gradient faces) ─────────────────
  const faceColors: [string, string][] = [
    ['#6633aa', '#ff7755'], // +x  purple → coral
    ['#224488', '#aa88ff'], // -x  navy → lavender
    ['#eef4ff', '#aaccff'], // +y  bright sky top
    ['#334466', '#667799'], // -y  muted blue-grey ground
    ['#441155', '#ff66aa'], // +z  deep purple → pink
    ['#113355', '#44ddcc'], // -z  dark blue → cyan
  ];
  const envFaces = faceColors.map(([c1, c2]) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return cv;
  });
  const envMap = new THREE.CubeTexture(envFaces);
  envMap.needsUpdate = true;
  scene.environment = envMap;
  scene.background  = envMap;

  // ── Mirror floor ─────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardNodeMaterial({
      color: 0x4466aa, metalness: 0.85, roughness: 0.06, envMap,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Orbiting objects — placed ON the floor (y = their radius) ────────────
  const GEO_DEFS = [
    { geo: new THREE.TorusKnotGeometry(0.32, 0.11, 100, 16), r: 0.45, color: 0xff2255 },
    { geo: new THREE.OctahedronGeometry(0.42, 2),             r: 0.42, color: 0x22ff88 },
    { geo: new THREE.IcosahedronGeometry(0.38, 1),            r: 0.38, color: 0x2255ff },
    { geo: new THREE.TorusGeometry(0.30, 0.13, 16, 48),      r: 0.43, color: 0xffaa00 },
    { geo: new THREE.DodecahedronGeometry(0.36, 0),           r: 0.36, color: 0xcc33ff },
  ];

  const objects: { mesh: THREE.Mesh; r: number }[] = [];
  const RING_R = 2.4;

  GEO_DEFS.forEach(({ geo, r, color }, i) => {
    const mesh = new THREE.Mesh(geo,
      new THREE.MeshStandardNodeMaterial({
        color, metalness: 0.75, roughness: 0.1,
        emissive: new THREE.Color(color).multiplyScalar(0.22), envMap,
      })
    );
    const angle = (i / GEO_DEFS.length) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * RING_R, r, Math.sin(angle) * RING_R);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    objects.push({ mesh, r });
  });

  // ── Central chrome sphere with live CubeCamera ───────────────────────────
  const cubeCamera = new THREE.CubeCamera(0.1, 20, new WebGLCubeRenderTarget(256, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  }));
  cubeCamera.position.y = 0.65;
  scene.add(cubeCamera);

  const chromeSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 32, 24),
    new THREE.MeshStandardNodeMaterial({
      metalness: 1.0, roughness: 0.0,
      envMap: cubeCamera.renderTarget.texture,
    })
  );
  chromeSphere.position.y = 0.65;
  chromeSphere.castShadow = true;
  scene.add(chromeSphere);

  // ── GUI ───────────────────────────────────────────────────────────────────
  gui.addSlider('Orbit speed',  0.3,  0, 1.5, 0.05, v => { orbitSpeed = v; });
  gui.addSlider('Floor rough',  0.04, 0, 0.8, 0.01, v => { (floor.material as any).roughness = v; });
  gui.addSlider('Floor metal',  0.95, 0, 1.0, 0.01, v => { (floor.material as any).metalness = v; });

  let orbitSpeed = 0.3;
  let frameCount = 0;

  // ── Animate ───────────────────────────────────────────────────────────────
  animate(t => {
    frameCount++;

    // Orbit objects around the centre, staying on the floor
    objects.forEach(({ mesh, r }, i) => {
      const angle = (i / objects.length) * Math.PI * 2 + t * orbitSpeed;
      mesh.position.x = Math.cos(angle) * RING_R;
      mesh.position.z = Math.sin(angle) * RING_R;
      mesh.position.y = r;
      mesh.rotation.x = t * (0.5 + i * 0.1);
      mesh.rotation.y = t * (0.3 + i * 0.15);
    });

    // CubeCamera renders the scene 6× — throttle to every 3rd frame
    if (frameCount % 3 === 0) {
      chromeSphere.visible = false;
      cubeCamera.update(renderer as any, scene);
      chromeSphere.visible = true;
    }
  });
}
