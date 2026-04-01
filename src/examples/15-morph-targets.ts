import * as THREE from 'three/webgpu';
import {
  attribute, mix, uniform, positionLocal,
  vec3, float, sin, Fn,
} from 'three/tsl';
import { createScene } from './setup';

function computeSpiky(geo: THREE.BufferGeometry): Float32Array {
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    const nx = x / r, ny = y / r, nz = z / r;
    // Very dramatic spike using octahedral harmonics
    const a1 = Math.abs(Math.sin(nx * Math.PI * 3 + 0.5) * Math.cos(ny * Math.PI * 4) * Math.sin(nz * Math.PI * 3));
    const a2 = Math.abs(Math.cos(nx * Math.PI * 5) * Math.sin(nz * Math.PI * 5 + 1.0));
    const spike = 1.0 + 1.5 * Math.pow(Math.max(a1, a2), 0.5);
    out[i * 3] = nx * r * spike;
    out[i * 3 + 1] = ny * r * spike;
    out[i * 3 + 2] = nz * r * spike;
  }
  return out;
}

function computeCube(geo: THREE.BufferGeometry): Float32Array {
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    const nx = x / r, ny = y / r, nz = z / r;
    // Map to unit cube surface, scale by radius
    const maxC = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
    out[i * 3] = (nx / maxC) * r * 0.85;
    out[i * 3 + 1] = (ny / maxC) * r * 0.85;
    out[i * 3 + 2] = (nz / maxC) * r * 0.85;
  }
  return out;
}

function computeTwist(geo: THREE.BufferGeometry): Float32Array {
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const twist = y * 4.0;
    const cx = Math.cos(twist), sx = Math.sin(twist);
    out[i * 3] = cx * x - sx * z;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = sx * x + cx * z;
  }
  return out;
}

export async function createMorphTargets(container: HTMLDivElement) {
  const { scene, animate } = await createScene(container, { cameraPos: [0, 1.2, 5] });

  // Dramatic lighting
  scene.add(new THREE.AmbientLight(0x111122, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(4, 6, 3);
  scene.add(key);
  const fill = new THREE.PointLight(0x4488ff, 8, 10);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
  const rim = new THREE.PointLight(0xff3388, 6, 10);
  rim.position.set(0, -2, -4);
  scene.add(rim);

  // High-detail sphere base
  const geo = new THREE.IcosahedronGeometry(1.3, 6);

  // Bake all three morph targets as vertex attributes
  geo.setAttribute('spikyPos', new THREE.Float32BufferAttribute(computeSpiky(geo), 3));
  geo.setAttribute('cubePos', new THREE.Float32BufferAttribute(computeCube(geo), 3));
  geo.setAttribute('twistPos', new THREE.Float32BufferAttribute(computeTwist(geo), 3));

  // TSL morph uniforms
  const mf1 = uniform(0.0); // base → spiky
  const mf2 = uniform(0.0); // spiky → cube
  const mf3 = uniform(0.0); // cube → twist
  const colorT = uniform(0.0);

  const spikyAttr = attribute('spikyPos', 'vec3') as any;
  const cubeAttr  = attribute('cubePos',  'vec3') as any;
  const twistAttr = attribute('twistPos', 'vec3') as any;

  // Chain: base → spiky → cube → twist → base
  const step1   = mix(positionLocal as any, spikyAttr, mf1 as any) as any;
  const step2   = mix(step1, cubeAttr, mf2 as any) as any;
  const finalPos = mix(step2, twistAttr, mf3 as any) as any;

  // Pure TSL hue cycle — no CPU Color manipulation needed
  const hueU = uniform(0.0); // 0..1 drives a full hue rotation
  const PI2  = float(Math.PI * 2);

  const hueColor = Fn(() => {
    const h  = (hueU as any).mul(PI2);
    const r  = sin(h).mul(float(0.5)).add(float(0.5)) as any;
    const g  = sin(h.add(float(2.094))).mul(float(0.5)).add(float(0.5)) as any;
    const b  = sin(h.add(float(4.189))).mul(float(0.5)).add(float(0.5)) as any;
    return vec3(r, g, b);
  })();

  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.9, roughness: 0.05 });
  mat.colorNode    = hueColor;
  mat.emissiveNode = hueColor.mul(float(0.15)) as any;
  mat.positionNode = finalPos;

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // Reflective ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardNodeMaterial({ color: 0x050510, roughness: 0.4, metalness: 0.6 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.8;
  scene.add(ground);

  // Phase system: 4 phases, 2.5s each
  const PHASE = 2.5;
  function easeInOut(t: number) { return t * t * (3 - 2 * t); }

  animate((t) => {
    mesh.rotation.y = t * 0.3;
    mesh.rotation.x = Math.sin(t * 0.2) * 0.15;

    const cycle = t % (PHASE * 4);
    const phase = Math.min(3, Math.floor(cycle / PHASE));
    const pf = easeInOut(Math.max(0, Math.min(1, (cycle % PHASE) / PHASE)));

    switch (phase) {
      case 0: mf1.value = pf;  mf2.value = 0;  mf3.value = 0; break;
      case 1: mf1.value = 1;   mf2.value = pf;  mf3.value = 0; break;
      case 2: mf1.value = 1;   mf2.value = 1;   mf3.value = pf; break;
      case 3: mf1.value = 0;   mf2.value = 0;   mf3.value = 0; break;
    }

    // Advance hue based on phase — pure float, no Color objects
    hueU.value = (phase * 0.25 + pf * 0.25) % 1.0;

    // Rim light orbits
    rim.position.x = Math.sin(t * 0.6) * 4;
    rim.position.z = Math.cos(t * 0.6) * 4;
    fill.position.x = Math.cos(t * 0.4) * 4;
    fill.position.z = Math.sin(t * 0.4) * 4;
  });
}
