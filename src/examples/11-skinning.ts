/**
 * Skinning — Real rigged character loaded from three.js CDN.
 * Uses the "Soldier" GLB model with Idle / Walk / Run animations.
 * AnimationMixer drives the skeleton; SkeletonHelper visualises the bones.
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createScene } from './setup';

const MODEL_URL =
  'https://threejs.org/examples/models/gltf/Soldier.glb';

export async function createSkinning(container: HTMLDivElement) {
  const { renderer, scene, camera, gui, animate } = await createScene(container, {
    cameraPos: [0, 1.6, 4],
    background: 0x0a0e14,
  });

  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.4;

  camera.fov = 55; camera.updateProjectionMatrix();

  // ── Lighting ────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x8899bb, 1.2));

  const key = new THREE.DirectionalLight(0xfff4e0, 4.0);
  key.position.set(3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
  key.shadow.camera.left = key.shadow.camera.bottom = -4;
  key.shadow.camera.right = key.shadow.camera.top = 4;
  key.shadow.bias = -0.001;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xaac4ff, 1.8);
  fill.position.set(-4, 3, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd0aa, 1.5);
  rim.position.set(0, 5, -4);
  scene.add(rim);

  // ── Ground ───────────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardNodeMaterial({ color: 0x1a1e26, roughness: 0.9, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid lines on ground
  const grid = new THREE.GridHelper(12, 24, 0x223344, 0x223344);
  (grid.material as THREE.Material).opacity = 0.4;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  // ── Load GLTF ────────────────────────────────────────────────────────────
  const loader = new GLTFLoader();

  let mixer: THREE.AnimationMixer | null = null;
  let actions: Record<string, THREE.AnimationAction> = {};
  let currentAction: THREE.AnimationAction | null = null;
  let skeletonHelper: THREE.SkeletonHelper | null = null;
  let showSkeleton = true;

  // Loading indicator
  const loadMsg = document.createElement('div');
  loadMsg.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#88aacc;font:bold 14px monospace;pointer-events:none;';
  loadMsg.textContent = 'Loading Soldier.glb…';
  container.appendChild(loadMsg);

  function crossFadeTo(name: string, duration = 0.4) {
    const next = actions[name];
    if (!next || next === currentAction) return;
    next.reset().play();
    if (currentAction) currentAction.crossFadeTo(next, duration, true);
    currentAction = next;
  }

  try {
    const gltf = await loader.loadAsync(MODEL_URL);
    loadMsg.remove();

    const model = gltf.scene;
    model.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        // Remap to MeshStandardNodeMaterial so WebGPU renderer handles it
        const mesh = obj as THREE.Mesh;
        const old = mesh.material as THREE.MeshStandardMaterial;
        mesh.material = new THREE.MeshStandardNodeMaterial({
          color: old.color,
          map: old.map ?? undefined,
          roughness: old.roughness ?? 0.6,
          metalness: old.metalness ?? 0.1,
        } as any);
      }
    });
    scene.add(model);

    // Skeleton visualiser
    skeletonHelper = new THREE.SkeletonHelper(model);
    skeletonHelper.visible = showSkeleton;
    scene.add(skeletonHelper);

    // Mixer + actions
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      actions[clip.name] = mixer.clipAction(clip);
    }

    // Play first available clip or known defaults
    const preferred = ['Walk', 'Idle', 'Run'];
    const first = preferred.find(n => actions[n]) ?? Object.keys(actions)[0];
    if (first) { currentAction = actions[first]; currentAction.play(); }

    // ── GUI ──────────────────────────────────────────────────────────────
    const clipNames = Object.keys(actions);
    if (clipNames.length > 0) {
      gui.addSelect('Animation', clipNames, first ?? clipNames[0], v => crossFadeTo(v));
    }
    gui.addToggle('Show skeleton', true, v => {
      showSkeleton = v;
      if (skeletonHelper) skeletonHelper.visible = v;
    });
    gui.addSlider('Anim speed', 1, 0, 3, 0.05, v => { if (mixer) mixer.timeScale = v; });

  } catch (err) {
    loadMsg.textContent = `Failed to load model: ${err}`;
    console.error(err);
  }

  let prevT = 0;
  animate((t) => {
    const dt = Math.min(t - prevT, 0.1);
    prevT = t;
    if (mixer) mixer.update(dt);
  });
}
