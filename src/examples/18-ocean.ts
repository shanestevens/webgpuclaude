import * as THREE from 'three/webgpu';
import {
  positionLocal, positionWorld, normalWorld, time, sin, cos,
  vec2, vec3, vec4, float, normalize, length, dot, mix,
  smoothstep, clamp, abs, max, uniform, Fn, uv, fract, floor, step
} from 'three/tsl';
import { createScene } from './setup';

// Wave params (wavelength, amplitude, dir XZ, speed)
const WAVES = [
  { L: 12.0, A: 0.55, dx: 0.9,  dz: 0.3,  spd: 1.5 },
  { L: 7.0,  A: 0.28, dx: -0.4, dz: 1.0,  spd: 1.8 },
  { L: 4.5,  A: 0.18, dx: 0.6,  dz: -0.8, spd: 2.2 },
  { L: 18.0, A: 0.65, dx: 0.7,  dz: 0.5,  spd: 1.1 },
  { L: 2.8,  A: 0.06, dx: -0.8, dz: 0.4,  spd: 3.0 },
];

function cpuWaveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of WAVES) {
    const k = (2 * Math.PI) / w.L;
    const len = Math.sqrt(w.dx * w.dx + w.dz * w.dz);
    h += w.A * Math.sin((w.dx / len * x + w.dz / len * z) * k + t * w.spd);
  }
  return h;
}

export async function createOcean(container: HTMLDivElement) {
  const { scene, camera, controls, animate } = await createScene(container, {
    cameraPos: [0, 5, 12],
    background: 0x0a1520,
  });

  camera.far = 500;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, -5);

  // ── Sky dome ──
  const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  skyMat.colorNode = Fn(() => {
    const p = positionLocal.normalize();
    const yy = p.y.clamp(float(-0.05), float(1.0));
    // Sunset: orange horizon → red low sky → deep blue zenith
    const horizon  = vec3(1.0, 0.52, 0.08);
    const lowSky   = vec3(0.75, 0.25, 0.12);
    const zenith   = vec3(0.04, 0.08, 0.32);
    const t1 = smoothstep(float(0.0), float(0.15), yy);
    const t2 = smoothstep(float(0.15), float(0.7), yy);
    const skyCol = mix(mix(horizon, lowSky, t1), zenith, t2);
    // Sun disc + halo
    const sunDir = normalize(vec3(0.6, 0.18, -0.78));
    const sd = dot(p, sunDir).max(float(0));
    const disc = smoothstep(float(0.994), float(0.998), sd).mul(float(5));
    const halo = float(0.12).div(float(1.04).sub(sd).max(float(0.01)).mul(float(25)));
    return vec4(skyCol.add(vec3(1.0, 0.85, 0.5).mul(disc.add(halo))), float(1));
  })();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 12), skyMat));

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x223355, 0.8));
  const sun = new THREE.DirectionalLight(0xffbb66, 5.0);
  sun.position.set(30, 14, -40);
  scene.add(sun);
  const skyFill = new THREE.DirectionalLight(0x4466aa, 1.5);
  skyFill.position.set(-15, 20, 10);
  scene.add(skyFill);

  // ── Ocean ──
  // PlaneGeometry in XY local → rotated to XZ world
  // Local Z displacement → World Y (vertical waves)
  const oceanMat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.05,
    metalness: 0.0,
    transparent: true,
    opacity: 0.94,
    side: THREE.FrontSide,
  });

  // Build wave displacement node (adds to local Z → world Y after rotation)
  // local.x = world X, local.y = world -Z (after rotation.x=-PI/2)
  let waveDisp: any = null;
  for (const w of WAVES) {
    const k = float((2 * Math.PI) / w.L);
    const len = Math.sqrt(w.dx * w.dx + w.dz * w.dz);
    const nx = float(w.dx / len), nz = float(w.dz / len);
    const phase = nx.mul(positionLocal.x).sub(nz.mul(positionLocal.y)).mul(k).add(time.mul(float(w.spd)));
    const term = float(w.A).mul(phase.sin());
    waveDisp = waveDisp ? waveDisp.add(term) : term;
  }

  // Displace in local Z → world Y
  oceanMat.positionNode = vec3(positionLocal.x, positionLocal.y, waveDisp);

  // Ocean color from world-Y height (available in fragment via positionWorld.y)
  const wh = positionWorld.y;
  const deepCol    = vec3(0.01, 0.18, 0.48);
  const midCol     = vec3(0.04, 0.48, 0.72);
  const foamCol    = vec3(0.78, 0.90, 1.00);

  const heightFac = smoothstep(float(-0.5), float(0.7), wh);
  const foamFac   = smoothstep(float(0.45), float(0.72), wh);

  // Also UV-based foam streaks along wave crests
  const fuv = uv();
  const streak = sin(fuv.x.mul(float(80)).add(time.mul(float(1.5)))).mul(float(0.5)).add(float(0.5))
    .mul(sin(fuv.y.mul(float(50)).sub(time)).mul(float(0.5)).add(float(0.5)));
  const streakFoam = smoothstep(float(0.75), float(0.92), streak).mul(foamFac.mul(float(0.5)));

  oceanMat.colorNode = mix(mix(deepCol, midCol, heightFac), foamCol, foamFac.add(streakFoam).min(float(1.0)));
  // Emissive foam glow
  oceanMat.emissiveNode = foamCol.mul(float(0.06).mul(foamFac.add(streakFoam)));

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150, 300, 300),
    oceanMat,
  );
  ocean.rotation.x = -Math.PI / 2;
  scene.add(ocean);

  // ── Distant fog ──
  scene.fog = new THREE.FogExp2(0x1a2a3a, 0.008);

  // ── Sailboat ──
  const boat = new THREE.Group();

  // Hull (dark wood)
  const hullGeo = new THREE.BoxGeometry(2.8, 0.5, 1.2);
  // Taper hull front
  const hullMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a0a04, roughness: 0.7 });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0;
  boat.add(hull);

  // Cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.4, 0.85),
    new THREE.MeshStandardNodeMaterial({ color: 0xddccaa, roughness: 0.5 })
  );
  cabin.position.set(0.2, 0.45, 0);
  boat.add(cabin);

  // Mast
  const mastMat = new THREE.MeshStandardNodeMaterial({ color: 0xddcc99, roughness: 0.4 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 5.0, 8), mastMat);
  mast.position.set(-0.1, 2.75, 0);
  boat.add(mast);

  // Main sail – large, white with red stripe
  const makeSail = (w: number, h: number, color: number) => {
    const sg = new THREE.Shape();
    sg.moveTo(0, 0); sg.lineTo(0, h); sg.quadraticCurveTo(w * 0.8, h * 0.6, w, 0); sg.closePath();
    return new THREE.Mesh(
      new THREE.ShapeGeometry(sg, 16),
      new THREE.MeshStandardNodeMaterial({ color, side: THREE.DoubleSide, roughness: 0.9, transparent: true, opacity: 0.95 })
    );
  };

  const mainSail = makeSail(2.0, 4.2, 0xf0ead8);
  mainSail.position.set(-0.05, 0.55, 0.04);
  boat.add(mainSail);

  // Red decorative stripe across sail
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.18),
    new THREE.MeshStandardNodeMaterial({ color: 0xcc1111, side: THREE.DoubleSide })
  );
  stripe.position.set(0.75, 1.8, 0.06);
  stripe.rotation.z = -0.12;
  boat.add(stripe);

  const jib = makeSail(1.4, 3.2, 0xe8e2d0);
  jib.position.set(-0.05, 0.55, -0.1);
  jib.rotation.y = 0.25;
  boat.add(jib);

  // Flag
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.24),
    new THREE.MeshStandardNodeMaterial({ color: 0xff2200, side: THREE.DoubleSide })
  );
  flag.position.set(0.22, 5.35, 0);
  boat.add(flag);

  boat.position.set(5, 0.6, -3);
  scene.add(boat);

  // ── Buoys ──
  const buoys: { g: THREE.Group; wx: number; wz: number }[] = [];
  const bColors = [0xff2200, 0xffaa00, 0xffee00, 0x00cc44, 0x0055ff, 0xcc0099];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 8),
      new THREE.MeshStandardNodeMaterial({ color: bColors[i], roughness: 0.25, metalness: 0.3 })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.04, 6, 24),
      new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6),
      new THREE.MeshStandardNodeMaterial({ color: 0x999999 })
    );
    pole.position.y = 0.6;
    g.add(body, ring, pole);
    const wx = (Math.random() - 0.5) * 20 - 2;
    const wz = (Math.random() - 0.5) * 16 - 4;
    g.position.set(wx, 0, wz);
    scene.add(g);
    buoys.push({ g, wx, wz });
  }

  // ── Animate ──
  animate((t) => {
    // Boat slow drift
    const bx = 5 + Math.sin(t * 0.12) * 3;
    const bz = -3 + Math.cos(t * 0.09) * 2;
    const bh = cpuWaveHeight(bx, bz, t);
    boat.position.set(bx, 0.6 + bh, bz);
    boat.rotation.z = Math.sin(t * 0.8) * 0.07;
    boat.rotation.x = Math.cos(t * 0.65) * 0.04;
    boat.rotation.y = Math.atan2(Math.cos(t * 0.09), -Math.sin(t * 0.12));

    // Flag flap
    flag.rotation.y = Math.sin(t * 5) * 0.28;

    // Buoys bob
    for (const { g, wx, wz } of buoys) {
      const h = cpuWaveHeight(wx, wz, t);
      g.position.y = h;
      g.rotation.z = Math.sin(t * 1.1 + wx * 0.3) * 0.12;
      g.rotation.x = Math.cos(t * 0.9 + wz * 0.3) * 0.08;
    }
  });
}
