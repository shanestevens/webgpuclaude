/**
 * PBR Showcase — Khronos Damaged Helmet (CC0 glTF)
 * Image-based lighting via Poly Haven HDRI (CC0).
 * Demonstrates the full PBR workflow:
 *   albedo · metalness/roughness · normal · ambient-occlusion · emissive
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader }     from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createScene }    from './setup';

// CC0 assets ----------------------------------------------------------------
const HELMET_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb';
const HDRI_URL   = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr';

export async function createPBRHelmet(container: HTMLDivElement) {
  const { renderer, scene, camera, gui, animate } = await createScene(container, {
    cameraPos:  [0, 0, 4],
    background: 0x0d0d1a,
  });

  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  camera.fov = 40;
  camera.updateProjectionMatrix();

  // ── Environment (IBL) ────────────────────────────────────────────────────
  // Boot with a built-in RoomEnvironment so the helmet looks decent before the
  // HDRI arrives, then swap once the network fetch completes.
  const pmrem   = new THREE.PMREMGenerator(renderer as any);
  const roomEnv = pmrem.fromScene(new (RoomEnvironment as any)(), 0.04).texture;
  scene.environment = roomEnv;

  new RGBELoader().load(
    HDRI_URL,
    (hdr) => {
      const envMap = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      scene.environment          = envMap;
      scene.background           = envMap;
      (scene as any).backgroundBlurriness = 0.08;
      roomEnv.dispose();
      pmrem.dispose();
    },
    undefined,
    () => {
      // CORS / network failure — RoomEnvironment stays in place
      pmrem.dispose();
    }
  );

  // ── Loading overlay ───────────────────────────────────────────────────────
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = [
    'position:absolute', 'inset:0',
    'display:flex', 'align-items:center', 'justify-content:center',
    'color:#888', 'font:13px "SF Mono",Menlo,Consolas,monospace',
    'pointer-events:none', 'letter-spacing:0.05em',
  ].join(';');
  loadingEl.textContent = 'Fetching model…';
  container.appendChild(loadingEl);

  // ── Load Damaged Helmet ───────────────────────────────────────────────────
  let helmet: THREE.Group | null = null;

  new GLTFLoader().load(
    HELMET_URL,
    (gltf) => {
      loadingEl.remove();
      helmet = gltf.scene;
      helmet.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow    = true;
          mesh.receiveShadow = true;
        }
      });
      scene.add(helmet);
    },
    undefined,
    (err) => {
      loadingEl.textContent = `Failed to load model — ${(err as any).message ?? err}`;
      console.error('[23-pbr-helmet] GLTFLoader error:', err);
    }
  );

  // ── GUI ───────────────────────────────────────────────────────────────────
  let autoRotate = true;
  gui.addSlider('Exposure',      1.0, 0.1, 3.0,  0.05, v => { renderer.toneMappingExposure = v; });
  gui.addSlider('Env intensity', 1.0, 0.0, 3.0,  0.05, v => { (scene as any).environmentIntensity = v; });
  gui.addSlider('Rotation speed', 0.35, 0.0, 2.0, 0.05, v => { rotSpeed = v; });
  gui.addToggle('Auto-rotate', true, v => { autoRotate = v; });

  let rotSpeed = 0.35;

  animate(t => {
    if (autoRotate && helmet) helmet.rotation.y = t * rotSpeed;
  });
}
