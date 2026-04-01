import * as THREE from 'three/webgpu';
import { createScene } from './setup';

function generateCheckerTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const check = ((x >> 4) ^ (y >> 4)) & 1;
      const v = check ? 220 : 40;
      const tint = Math.sin(x * 0.05) * 20;
      data[i] = v + tint;
      data[i + 1] = v;
      data[i + 2] = v + (check ? 40 : 0);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export async function createTextures(container: HTMLDivElement) {
  const { scene, animate } = await createScene(container);

  const texture = generateCheckerTexture();

  // Sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 32, 32),
    new THREE.MeshBasicNodeMaterial({ map: texture })
  );
  sphere.position.x = -1.2;
  scene.add(sphere);

  // Box
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicNodeMaterial({ map: texture })
  );
  box.position.x = 0;
  scene.add(box);

  // Torus
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.2, 16, 48),
    new THREE.MeshBasicNodeMaterial({ map: texture })
  );
  torus.position.x = 1.4;
  scene.add(torus);

  animate((t) => {
    sphere.rotation.y = t * 0.4;
    box.rotation.x = t * 0.3;
    box.rotation.y = t * 0.5;
    torus.rotation.x = t * 0.6;
    torus.rotation.y = t * 0.3;
  });
}
