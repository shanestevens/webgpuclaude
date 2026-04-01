import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createColoredCube(container: HTMLDivElement) {
  const { scene, animate } = await createScene(container);

  const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < colors.length; i += 3) {
    color.setHSL((i / colors.length) * 0.8, 0.9, 0.6);
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
  );
  cube.add(edges);

  animate((t) => {
    cube.rotation.x = t * 0.5;
    cube.rotation.y = t * 0.7;
  });
}
