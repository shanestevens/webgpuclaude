import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createInstancing(container: HTMLDivElement) {
  const { scene, animate } = await createScene(container, { cameraPos: [0, 5, 12] });

  scene.add(new THREE.AmbientLight(0x334455, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  const count = 2000;
  const geometry = new THREE.IcosahedronGeometry(0.15, 1);
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.4,
    metalness: 0.6,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const positions: { x: number; y: number; z: number; speed: number; offset: number }[] = [];

  for (let i = 0; i < count; i++) {
    const radius = 1 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.8;

    const x = radius * Math.cos(theta) * Math.cos(phi);
    const y = radius * Math.sin(phi);
    const z = radius * Math.sin(theta) * Math.cos(phi);

    positions.push({ x, y, z, speed: 0.2 + Math.random() * 0.8, offset: Math.random() * Math.PI * 2 });

    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    const s = 0.5 + Math.random() * 1.5;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    color.setHSL(theta / (Math.PI * 2), 0.7, 0.5);
    mesh.setColorAt(i, color);
  }

  scene.add(mesh);

  animate((t) => {
    for (let i = 0; i < count; i++) {
      const p = positions[i];
      dummy.position.set(
        p.x + Math.sin(t * p.speed + p.offset) * 0.3,
        p.y + Math.cos(t * p.speed * 1.3 + p.offset) * 0.2,
        p.z + Math.sin(t * p.speed * 0.7 + p.offset) * 0.3
      );
      dummy.rotation.x = t * p.speed;
      dummy.rotation.y = t * p.speed * 0.7;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}
