/**
 * Nexus — Grand Finale Showpiece
 * Combines every major technique from the learning series:
 *   • Hologram TSL shader (scan rings, fresnel, hue cycle)    → Custom Shaders
 *   • Plasma core orb (sin-wave interference)                 → TSL / Ray Marching
 *   • 50k particle vortex spiraling the pillar                → GPU Particles
 *   • 8 PBR material balls in an orbit ring                   → PBR Materials
 *   • 3 tilted torus rings orbiting at different heights       → Instancing
 *   • 6 coloured PointLights + key DirectionalLight            → Multiple Lights
 *   • PCF soft shadows on a reflective hex-tile floor         → Shadows / Reflections
 *   • Exponential fog for depth                               → Environment
 *   • Orbit + FPS camera with shared GUI                      → Camera Controls
 */
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, time,
  positionLocal, normalWorld, cameraPosition, positionWorld,
  sin, cos, clamp, vec3, float, normalize, dot, pow,
} from 'three/tsl';
import { createScene } from './setup';

// ── Hex floor canvas texture ──────────────────────────────────────────────────
function hexFloorTex(w = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = w;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#050810';
  ctx.fillRect(0, 0, w, w);

  const size = 26;
  const rowH = size * Math.sqrt(3);
  const cols = Math.ceil(w / (size * 1.5)) + 3;
  const rows = Math.ceil(w / rowH) + 3;

  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const cx = col * size * 1.5 + size;
      const cy = row * rowH + (col & 1 ? rowH / 2 : 0);

      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 3 * k - Math.PI / 6;
        const px = cx + (size - 1) * Math.cos(a);
        const py = cy + (size - 1) * Math.sin(a);
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
      g.addColorStop(0, 'rgba(18,36,72,0.35)');
      g.addColorStop(1, 'rgba(4,8,18,0.05)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,80,200,0.55)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function createNexus(container: HTMLDivElement) {
  const { renderer, scene, camera, cameraControls, gui, animate } = await createScene(container, {
    cameraPos: [9, 6, 13],
    background: 0x000008,
  });

  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled  = true;
  renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
  camera.fov = 52; camera.updateProjectionMatrix();
  camera.far = 200; camera.updateProjectionMatrix();
  scene.fog  = new THREE.FogExp2(0x000812, 0.016);

  const speedU = uniform(1.0);
  const PILLAR_H = 18;

  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x060c1a, 1.0));

  const key = new THREE.DirectionalLight(0x6699ff, 2.0);
  key.position.set(12, 22, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -22;
  key.shadow.camera.right = key.shadow.camera.top   =  22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.001;
  scene.add(key);

  const LCOLORS = [0xff2244, 0x2255ff, 0x22ffaa, 0xffaa00, 0xbb22ff, 0x00eeff];
  const ptLights = LCOLORS.map(c => {
    const l = new THREE.PointLight(c, 10, 14, 2.0);
    scene.add(l);
    return l;
  });

  // ── Hex reflective floor ─────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardNodeMaterial({
      map: hexFloorTex(), color: 0xffffff,
      roughness: 0.12, metalness: 0.88,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Hologram pillar ──────────────────────────────────────────────────────────
  const pillarMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true });
  pillarMat.colorNode = Fn(() => {
    const t = (time as any).mul(speedU);
    const wy = positionWorld.y as any;

    // Scan rings moving upward
    const rings = pow(
      sin(wy.mul(float(6)).sub(t.mul(float(2.5)))).mul(float(0.5)).add(float(0.5)),
      float(5)
    ) as any;
    // Fine scan lines
    const fine = pow(
      sin(wy.mul(float(35)).sub(t.mul(float(7)))).mul(float(0.5)).add(float(0.5)),
      float(10)
    ) as any;
    // Fresnel edge glow
    const N = normalWorld as any;
    const V = normalize((cameraPosition as any).sub(positionWorld));
    const edge = clamp(float(1).sub(dot(N, V)), float(0), float(1)) as any;
    // Animated hue
    const hue = t.mul(float(0.25)).add(wy.mul(float(0.08)));
    const col = vec3(
      sin(hue).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(2.094))).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(4.189))).mul(float(0.5)).add(float(0.5)),
    ) as any;
    const br = rings.mul(float(0.6)).add(fine.mul(float(0.25))).add(edge.mul(float(0.9)));
    return col.mul(br);
  })();

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, PILLAR_H, 32, 80, true),
    pillarMat
  );
  pillar.position.y = PILLAR_H / 2;
  scene.add(pillar);

  // Glowing pillar base ring
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.12, 8, 48),
    new THREE.MeshStandardNodeMaterial({ color: 0x2255ff, emissive: new THREE.Color(0x1133cc), emissiveIntensity: 2, metalness: 1, roughness: 0.1 })
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.12;
  scene.add(baseRing);

  // ── Plasma core orb ──────────────────────────────────────────────────────────
  const coreMat = new THREE.MeshBasicNodeMaterial();
  coreMat.colorNode = Fn(() => {
    const t  = (time as any).mul(speedU);
    const n  = normalWorld as any;
    const v1 = sin(n.x.mul(float(5.0)).add(t.mul(float(2.1))));
    const v2 = sin(n.y.mul(float(4.3)).add(t.mul(float(1.7))));
    const v3 = sin(n.z.mul(float(5.7)).sub(t.mul(float(2.4))));
    const plasma = v1.add(v2).add(v3).mul(float(0.333)).mul(float(0.5)).add(float(0.5)) as any;
    const hue = plasma.mul(float(Math.PI * 3)).add(t.mul(float(0.6)));
    return vec3(
      sin(hue).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(2.094))).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(4.189))).mul(float(0.5)).add(float(0.5)),
    ).mul(float(2.5)) as any;
  })();
  const coreOrb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 48, 32), coreMat);
  coreOrb.position.y = PILLAR_H + 0.8;
  scene.add(coreOrb);

  // ── 50k particle vortex ──────────────────────────────────────────────────────
  const NP = 50000;
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);

  for (let i = 0; i < NP; i++) {
    const tN   = i / NP;
    const angle = tN * Math.PI * 2 * 22 + (Math.random() - 0.5) * 0.15;
    const r    = 0.7 + tN * 4.0 + (Math.random() - 0.5) * 0.25;
    const y    = tN * (PILLAR_H + 2) + (Math.random() - 0.5) * 0.5;
    pPos[i*3]   = Math.cos(angle) * r;
    pPos[i*3+1] = y;
    pPos[i*3+2] = Math.sin(angle) * r;
    // Cyan base → white mid → magenta top
    pCol[i*3]   = tN < 0.5 ? tN * 2 : 1.0;
    pCol[i*3+1] = tN < 0.5 ? 1.0 : 1.0 - (tN - 0.5) * 2;
    pCol[i*3+2] = tN < 0.5 ? 1.0 : 0.5 + (tN - 0.5);
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
  pGeo.setAttribute('color',    new THREE.Float32BufferAttribute(pCol, 3));

  const pMat = new THREE.PointsNodeMaterial({ vertexColors: true, size: 0.022, sizeAttenuation: true });
  pMat.positionNode = Fn(() => {
    const p     = positionLocal as any;
    const yNorm = p.y.div(float(PILLAR_H + 2));
    const spin  = (time as any).mul(speedU).mul(float(0.45)).add(yNorm.mul(float(Math.PI * 10)));
    const c = cos(spin) as any, s = sin(spin) as any;
    return vec3(c.mul(p.x).sub(s.mul(p.z)), p.y, s.mul(p.x).add(c.mul(p.z)));
  })();
  scene.add(new THREE.Points(pGeo, pMat));

  // ── PBR material ring ────────────────────────────────────────────────────────
  const RING_R = 6.5, RING_N = 8;
  const bGeo   = new THREE.SphereGeometry(0.58, 32, 24);
  const bDefs  = [
    { color: 0xffd070, metalness: 1.0, roughness: 0.04 }, // gold mirror
    { color: 0xc0c8d8, metalness: 1.0, roughness: 0.02 }, // chrome
    { color: 0xcc3344, metalness: 0.0, roughness: 0.18 }, // red lacquer
    { color: 0x44aadd, metalness: 0.0, roughness: 0.04 }, // gloss cyan
    { color: 0xb87333, metalness: 1.0, roughness: 0.42 }, // brushed copper
    { color: 0x44cc66, metalness: 0.0, roughness: 0.65 }, // green rubber
    { color: 0xffffff, metalness: 0.0, roughness: 0.0  }, // mirror dielectric
    { color: 0xaa44cc, metalness: 0.6, roughness: 0.25 }, // purple metallic
  ];
  bDefs.forEach((props, i) => {
    const ball = new THREE.Mesh(bGeo, new THREE.MeshStandardNodeMaterial(props as any));
    const a = (i / RING_N) * Math.PI * 2;
    ball.position.set(Math.cos(a) * RING_R, 0.58, Math.sin(a) * RING_R);
    ball.castShadow = ball.receiveShadow = true;
    scene.add(ball);
  });

  // ── Orbiting torus rings ─────────────────────────────────────────────────────
  const tGeo  = new THREE.TorusGeometry(4.0, 0.07, 8, 80);
  const tMat  = new THREE.MeshStandardNodeMaterial({
    color: 0x3366ff, metalness: 1.0, roughness: 0.08,
    emissive: new THREE.Color(0x112255), emissiveIntensity: 1.0,
  });
  const torusRings: THREE.Mesh[] = [7, 11, 15].map((y, i) => {
    const r = new THREE.Mesh(tGeo, tMat);
    r.position.y = y;
    r.rotation.x = Math.PI / 2 + i * 0.38;
    r.rotation.z = i * 0.55;
    scene.add(r);
    return r;
  });

  // ── GUI ──────────────────────────────────────────────────────────────────────
  gui.addSlider('Speed',      1.0, 0,   3,    0.05, v => { speedU.value = v; });
  gui.addSlider('Lights',     10,  0,   25,   0.5,  v => ptLights.forEach(l => l.intensity = v));
  gui.addSlider('Exposure',   1.3, 0.4, 2.5,  0.05, v => { renderer.toneMappingExposure = v; });

  cameraControls.setMode('orbit');

  // ── Animation loop ───────────────────────────────────────────────────────────
  animate(t => {
    const s = speedU.value;

    // Orbit point lights — two tiers
    ptLights.forEach((l, i) => {
      const a = t * s * (0.28 + i * 0.035) + (i / 6) * Math.PI * 2;
      const tier = i < 3;
      l.position.set(
        Math.cos(a) * (tier ? 5.5 : 4.5),
        tier ? 6 : 11,
        Math.sin(a) * (tier ? 5.5 : 4.5),
      );
    });

    // Spin + tilt torus rings
    torusRings.forEach((r, i) => {
      r.rotation.y = t * s * (0.18 + i * 0.08);
      r.rotation.x = Math.PI / 2 + Math.sin(t * s * 0.22 + i * 1.2) * 0.28;
    });

    // Pulse + levitate core orb
    coreOrb.scale.setScalar(1.0 + Math.sin(t * s * 2.8) * 0.07);
    coreOrb.position.y = PILLAR_H + 0.8 + Math.sin(t * s * 1.6) * 0.35;

    // Rotate base ring
    baseRing.rotation.z = t * s * 0.6;
  });
}
