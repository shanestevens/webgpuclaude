import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createParticles(container: HTMLDivElement) {
  const { scene, animate } = await createScene(container, { cameraPos: [0, 2, 5] });

  const count = 5000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocities: { x: number; y: number; z: number }[] = [];

  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const radius = Math.random() * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;

    positions[i3] = Math.cos(theta) * Math.cos(phi) * radius;
    positions[i3 + 1] = Math.sin(phi) * radius;
    positions[i3 + 2] = Math.sin(theta) * Math.cos(phi) * radius;

    color.setHSL(0.55 + Math.random() * 0.3, 0.8, 0.5 + Math.random() * 0.3);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = 2 + Math.random() * 4;

    velocities.push({
      x: (Math.random() - 0.5) * 0.01,
      y: (Math.random() - 0.5) * 0.01,
      z: (Math.random() - 0.5) * 0.01,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsNodeMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    size: 0.04,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // Center glow
  const glowSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshBasicNodeMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 })
  );
  scene.add(glowSphere);

  animate((t) => {
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x = posAttr.array[i3] as number;
      let y = posAttr.array[i3 + 1] as number;
      let z = posAttr.array[i3 + 2] as number;

      // Swirl towards center
      const dist = Math.sqrt(x * x + y * y + z * z);
      const force = 0.001 / (dist + 0.5);
      velocities[i].x -= x * force;
      velocities[i].y -= y * force;
      velocities[i].z -= z * force;

      // Tangential force for swirling
      velocities[i].x += -z * 0.0005;
      velocities[i].z += x * 0.0005;

      x += velocities[i].x;
      y += velocities[i].y;
      z += velocities[i].z;

      // Reset if too far or too close
      if (dist > 5 || dist < 0.1) {
        const r = 2 + Math.random() * 2;
        const th = Math.random() * Math.PI * 2;
        const ph = (Math.random() - 0.5) * Math.PI;
        x = Math.cos(th) * Math.cos(ph) * r;
        y = Math.sin(ph) * r;
        z = Math.sin(th) * Math.cos(ph) * r;
        velocities[i].x = velocities[i].y = velocities[i].z = 0;
      }

      (posAttr.array as Float32Array)[i3] = x;
      (posAttr.array as Float32Array)[i3 + 1] = y;
      (posAttr.array as Float32Array)[i3 + 2] = z;
    }
    posAttr.needsUpdate = true;

    glowSphere.scale.setScalar(1 + Math.sin(t * 3) * 0.2);
    points.rotation.y = t * 0.05;
  });
}
