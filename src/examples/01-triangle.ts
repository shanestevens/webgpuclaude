import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createTriangle(container: HTMLDivElement) {
  const { scene, animate } = await createScene(container, { cameraPos: [0, 0, 3] });

  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -1, -0.7, 0,
     1, -0.7, 0,
     0,  0.9, 0,
  ]);
  const colors = new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicNodeMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // wireframe outline
  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
  );
  scene.add(wire);

  animate((t) => {
    mesh.rotation.y = Math.sin(t * 0.5) * 0.3;
    wire.rotation.y = mesh.rotation.y;
  });
}
