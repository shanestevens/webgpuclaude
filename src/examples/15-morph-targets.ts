/**
 * Morph Targets — Three.js native morphAttributes with WebGPU.
 * A chrome sphere smoothly transitions between a box and a spiky star.
 * GUI lets you override the auto-cycle and blend shapes manually.
 *
 * Performance note: IcosahedronGeometry level 4 (≈2.5k verts) is used
 * rather than 6 (≈41k) — morph targets duplicate the position buffer so
 * poly count matters here more than in most examples.
 */
import * as THREE from 'three/webgpu';
import { createScene } from './setup';

/** Project sphere surface to cube surface, preserving radius. */
function toBox(geo: THREE.BufferGeometry): Float32Array {
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    const m = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    out[i * 3]     = (x / m) * r * 0.87;
    out[i * 3 + 1] = (y / m) * r * 0.87;
    out[i * 3 + 2] = (z / m) * r * 0.87;
  }
  return out;
}

/** Gentle spikes along the 12 icosahedron vertex directions. */
function toSpiky(geo: THREE.BufferGeometry): Float32Array {
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  // Golden ratio directions for 12 icosahedron poles
  const phi = (1 + Math.sqrt(5)) / 2;
  const poles: [number, number, number][] = [];
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    poles.push([0, s * phi, t], [t, 0, s * phi], [s * phi, t, 0]);
  }
  const poleNorms = poles.map(([x, y, z]) => {
    const r = Math.sqrt(x*x + y*y + z*z);
    return [x/r, y/r, z/r] as [number, number, number];
  });

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x*x + y*y + z*z);
    const nx = x/r, ny = y/r, nz = z/r;
    // Spike strength = how aligned this vertex is with the nearest pole
    let maxDot = 0;
    for (const [px, py, pz] of poleNorms) {
      maxDot = Math.max(maxDot, nx*px + ny*py + nz*pz);
    }
    const spike = 0.85 + Math.pow(Math.max(0, maxDot), 4) * 0.7;
    out[i * 3]     = nx * r * spike;
    out[i * 3 + 1] = ny * r * spike;
    out[i * 3 + 2] = nz * r * spike;
  }
  return out;
}

export async function createMorphTargets(container: HTMLDivElement) {
  const { scene, animate, gui } = await createScene(container, {
    cameraPos: [0, 1.2, 4.5],
    background: 0x080c18,
  });

  // Lighting — cool chrome look
  scene.add(new THREE.AmbientLight(0x223355, 1.8));
  const key = new THREE.DirectionalLight(0xffeedd, 4.5);
  key.position.set(3, 6, 3);
  scene.add(key);
  const rimA = new THREE.PointLight(0x4499ff, 12, 14);
  rimA.position.set(-3, 2, -2);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xff6633, 8, 12);
  rimB.position.set(3, -1, -3);
  scene.add(rimB);

  // Geometry — level 4: 2 562 verts (vs 41k at level 6)
  const geo = new THREE.IcosahedronGeometry(1.4, 4);
  geo.morphAttributes.position = [
    new THREE.Float32BufferAttribute(toBox(geo),   3),
    new THREE.Float32BufferAttribute(toSpiky(geo), 3),
  ];

  const mat = new THREE.MeshStandardNodeMaterial({
    color: 0x99bbee,
    metalness: 0.95,
    roughness: 0.07,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.morphTargetInfluences = [0, 0];
  scene.add(mesh);

  // Dark reflective floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardNodeMaterial({ color: 0x050510, roughness: 0.5, metalness: 0.5 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.8;
  scene.add(floor);

  // GUI controls
  let autoPlay = true;
  gui.addToggle('Auto-cycle', true, v => { autoPlay = v; });
  gui.addSlider('Box',   0, 0, 1, 0.01, v => { if (!autoPlay) mesh.morphTargetInfluences![0] = v; });
  gui.addSlider('Spiky', 0, 0, 1, 0.01, v => { if (!autoPlay) mesh.morphTargetInfluences![1] = v; });

  const PHASE = 2.8;
  const ease  = (t: number) => t * t * (3 - 2 * t);

  animate((t) => {
    mesh.rotation.y = t * 0.28;
    mesh.rotation.x = Math.sin(t * 0.18) * 0.12;

    rimA.position.set(Math.cos(t * 0.45) * 4, 2, Math.sin(t * 0.45) * 2.5);
    rimB.position.set(Math.sin(t * 0.35) * 3, -1, Math.cos(t * 0.35) * 3);

    if (!autoPlay) return;

    // 4-phase: →box, box→sphere, →spiky, spiky→sphere
    const cycle = t % (PHASE * 4);
    const phase = Math.floor(cycle / PHASE);
    const pf    = ease(Math.min(1, (cycle % PHASE) / PHASE));

    switch (phase) {
      case 0: mesh.morphTargetInfluences![0] = pf;    mesh.morphTargetInfluences![1] = 0;    break;
      case 1: mesh.morphTargetInfluences![0] = 1 - pf; mesh.morphTargetInfluences![1] = 0;   break;
      case 2: mesh.morphTargetInfluences![0] = 0;    mesh.morphTargetInfluences![1] = pf;    break;
      case 3: mesh.morphTargetInfluences![0] = 0;    mesh.morphTargetInfluences![1] = 1 - pf; break;
    }
  });
}
