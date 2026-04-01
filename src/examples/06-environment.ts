import * as THREE from 'three/webgpu';
import { createScene } from './setup';

/** Equirectangular canvas → PMREMGenerator → works correctly in WebGPU for all reflection directions */
function buildEnv(renderer: THREE.WebGPURenderer): { background: THREE.Texture; envMap: THREE.Texture } {
  const w = 1024, h = 512;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;

  // Upper hemisphere — sky: white zenith → vivid blue horizon
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  sky.addColorStop(0,   '#f0f2ff');
  sky.addColorStop(0.6, '#5588dd');
  sky.addColorStop(1,   '#3366bb');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.5);

  // Lower hemisphere — ground: dark blue-grey nadir → horizon meeting point
  const ground = ctx.createLinearGradient(0, h * 0.5, 0, h);
  ground.addColorStop(0,   '#4466aa');
  ground.addColorStop(1,   '#1a2a44');
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // Colourful horizon band
  const band = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.58);
  band.addColorStop(0,    'rgba(0,0,0,0)');
  band.addColorStop(0.3,  'rgba(180,100,255,0.35)');
  band.addColorStop(0.5,  'rgba(255,130,80,0.25)');
  band.addColorStop(0.7,  'rgba(80,220,200,0.3)');
  band.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);

  const equirect = new THREE.CanvasTexture(cv);
  equirect.mapping    = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer as any);
  const envMap = pmrem.fromEquirectangular(equirect).texture;
  pmrem.dispose();

  return { background: equirect, envMap };
}

export async function createEnvironment(container: HTMLDivElement) {
  const { renderer, scene, animate } = await createScene(container, { cameraPos: [0, 1, 4] });

  const { background, envMap } = buildEnv(renderer);
  scene.background  = background;
  scene.environment = envMap;

  // Subtle fill lights so non-metallic faces aren't purely env-lit
  scene.add(new THREE.AmbientLight(0x446688, 0.6));
  const key = new THREE.DirectionalLight(0xfff8f0, 1.5);
  key.position.set(4, 6, 4);
  scene.add(key);

  // Chrome sphere — perfect mirror, fully driven by env map
  const chromeSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 64, 64),
    new THREE.MeshStandardNodeMaterial({ metalness: 1.0, roughness: 0.0 })
  );
  chromeSphere.position.x = -1.3;
  scene.add(chromeSphere);

  // Frosted glass sphere
  const glassSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 64, 64),
    new THREE.MeshPhysicalNodeMaterial({
      color: 0xaaccff, metalness: 0.0, roughness: 0.05,
      transmission: 0.92, thickness: 1.5,
    })
  );
  glassSphere.position.x = 0;
  scene.add(glassSphere);

  // Rough metallic torus knot
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.5, 0.18, 128, 32),
    new THREE.MeshStandardNodeMaterial({ color: 0xff8844, metalness: 0.8, roughness: 0.3 })
  );
  knot.position.x = 1.5;
  scene.add(knot);

  animate((t) => {
    knot.rotation.y = t * 0.3;
    knot.rotation.x = t * 0.2;
  });
}
