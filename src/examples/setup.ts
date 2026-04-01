import * as THREE from 'three/webgpu';
import { SimpleGUI } from '../shared/gui';
import { CameraControls } from '../shared/cameraControls';

export interface SceneKit {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Legacy – use cameraControls instead */
  controls: CameraControls['orbit'];
  cameraControls: CameraControls;
  gui: SimpleGUI;
  /** Return true from callback to skip the default renderer.render(scene, camera) */
  animate: (callback?: (time: number) => boolean | void) => void;
}

export async function createScene(container: HTMLDivElement, opts?: {
  cameraPos?:  [number, number, number];
  background?: THREE.ColorRepresentation;
}): Promise<SceneKit> {
  const width  = container.clientWidth;
  const height = container.clientHeight;

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts?.background ?? 0x0a0a12);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  const pos = opts?.cameraPos ?? [0, 1.5, 4];
  camera.position.set(pos[0], pos[1], pos[2]);

  const camCtrl = new CameraControls(camera, renderer.domElement);

  // ── Resize handler ──
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);

  // ── GUI with built-in controls ──
  const gui = new SimpleGUI(container, 'Controls');

  // Wireframe toggle — swaps to a cloned material with wireframe=true so the
  // WebGPU renderer always sees a *new* material and compiles a fresh pipeline
  // (triangle-list → line-list).  Restoring the original reuses its cached pipeline.
  // Skips meshes that manage their own wireframe (userData.skipWireframe).
  const _wfOrig = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const _wfMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const _mkWF   = (m: THREE.Material) => { const c = (m as any).clone(); c.wireframe = true; return c; };

  gui.addToggle('Wireframe', false, (v) => {
    scene.traverse(obj => {
      if (!(obj as THREE.Mesh).isMesh || obj.userData.skipWireframe) return;
      const mesh = obj as THREE.Mesh;
      if (v) {
        if (!_wfOrig.has(mesh)) {
          _wfOrig.set(mesh, mesh.material);
          const orig = mesh.material;
          _wfMats.set(mesh, Array.isArray(orig) ? (orig as THREE.Material[]).map(_mkWF) : _mkWF(orig));
        }
        mesh.material = _wfMats.get(mesh)!;
      } else {
        const orig = _wfOrig.get(mesh);
        if (orig !== undefined) mesh.material = orig;
      }
    });
  });

  // Camera mode toggle
  gui.addSelect('Camera', ['Orbit', 'FPS'], 'Orbit', (v) => {
    camCtrl.setMode(v === 'FPS' ? 'fps' : 'orbit');
  });

  gui.addSeparator();

  // ── FPS counter ──
  const fpsEl = document.createElement('div');
  fpsEl.style.cssText = [
    'position:absolute', 'right:12px', 'bottom:12px',
    'padding:3px 8px',
    'background:rgba(0,0,0,0.5)',
    'border-radius:5px',
    'font:bold 12px "SF Mono",Menlo,Consolas,monospace',
    'color:#fff',
    'z-index:50',
    'pointer-events:none',
  ].join(';');
  fpsEl.textContent = '-- fps';
  container.appendChild(fpsEl);

  // ── Animation loop ──
  const timer = new THREE.Timer();
  let lastTimestamp = 0;
  let fpsFrameN = 0, fpsTs = performance.now();
  let loopFn: ((ts: number) => void) | null = null;
  let isVisible = true;

  // Pause the loop when scrolled off-screen, resume when visible again.
  const visObs = new IntersectionObserver(entries => {
    isVisible = entries[0].isIntersecting;
    if (isVisible && loopFn) {
      renderer.setAnimationLoop(loopFn);
    } else {
      renderer.setAnimationLoop(null);
    }
  }, { threshold: 0 });
  visObs.observe(container);

  function animate(callback?: (time: number) => boolean | void) {
    // Pre-compile all shaders before the loop to avoid first-frame stalls.
    renderer.compileAsync(scene, camera).then(() => {
      loopFn = (timestamp) => {
        timer.update(timestamp);
        const t  = timer.getElapsed();
        const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
        lastTimestamp = timestamp;

        fpsFrameN++;
        if (fpsFrameN % 30 === 0) {
          const now = performance.now();
          fpsEl.textContent = `${Math.round(30000 / (now - fpsTs))} fps`;
          fpsTs = now;
        }

        camCtrl.update(dt);
        const handled = callback ? callback(t) : false;
        if (!handled) renderer.render(scene, camera);
      };

      if (isVisible) renderer.setAnimationLoop(loopFn);
    }); // compileAsync
  }

  return {
    renderer,
    scene,
    camera,
    controls:       camCtrl.orbit,   // backwards compat
    cameraControls: camCtrl,
    gui,
    animate,
  };
}
