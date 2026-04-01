/**
 * Shader Planetarium — 5 procedural TSL planets orbiting a glowing star.
 * Each planet demonstrates a different TSL node material technique:
 *   1. Plasma    — sin-wave rainbow interference
 *   2. Lava      — FBM noise + hot colour ramp + emissive cracks
 *   3. Iridescent— Fresnel-based hue cycling
 *   4. Hologram  — concentric scan rings + edge glow
 *   5. Cosmic    — FBM nebula clouds + procedural stars
 */
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, time,
  positionLocal, normalWorld, cameraPosition, positionWorld,
  sin, cos, abs, fract, floor, mix, smoothstep, clamp, step,
  vec2, vec3, float,
  length, normalize, dot, pow, max,
} from 'three/tsl';
import { createScene } from './setup';

export async function createCustomShader(container: HTMLDivElement) {
  const { scene, camera, animate, gui } = await createScene(container, {
    cameraPos: [0, 7, 16],
    background: 0x020410,
  });

  camera.fov = 58;
  camera.updateProjectionMatrix();

  scene.fog = new THREE.FogExp2(0x020410, 0.008);
  scene.add(new THREE.AmbientLight(0x0a0820, 1.0));

  const speedU = uniform(1.0);

  // ── Noise helpers ─────────────────────────────────────────────────────────
  const hash21 = Fn(([p]: [any]) =>
    fract(sin((p as any).dot(vec2(127.1, 311.7))).mul(43758.5453))
  );

  const noise2D = Fn(([p]: [any]) => {
    const i = floor(p) as any;
    const f = fract(p) as any;
    const u = f.mul(f).mul(float(3).sub(f.mul(float(2))));
    return mix(
      mix((hash21 as any)(i), (hash21 as any)(i.add(vec2(1, 0))), u.x),
      mix((hash21 as any)(i.add(vec2(0, 1))), (hash21 as any)(i.add(vec2(1, 1))), u.x),
      u.y,
    ) as any;
  });

  const fbm5 = Fn(([p]: [any]) => {
    let val: any = float(0);
    let amp: any = float(0.5);
    let pp: any  = p;
    for (let i = 0; i < 5; i++) {
      val = val.add((noise2D as any)(pp).mul(amp));
      pp  = pp.mul(float(2.13));
      amp = amp.mul(float(0.48));
    }
    return val;
  });

  // ── 1. Plasma ─────────────────────────────────────────────────────────────
  const plasmaMat = new THREE.MeshBasicNodeMaterial();
  plasmaMat.colorNode = Fn(() => {
    const p = (positionLocal.xz as any).mul(float(3.5));
    const t = (time as any).mul(speedU);
    const v = (sin(p.x.add(t)) as any)
      .add(sin(p.y.mul(float(0.9)).add(t.mul(float(1.3)))))
      .add(sin(p.x.add(p.y).mul(float(0.6)).add(t.mul(float(0.8)))))
      .add(sin(length(p).mul(float(2.5)).sub(t.mul(float(1.2)))))
      .mul(float(0.25)).add(float(0.5)) as any;
    const hue = v.mul(float(Math.PI * 2));
    return clamp(vec3(
      sin(hue).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(2.094))).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(4.189))).mul(float(0.5)).add(float(0.5)),
    ).mul(float(2.0)), float(0), float(1));
  })();

  // ── 2. Lava ───────────────────────────────────────────────────────────────
  const lavaMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  lavaMat.colorNode = Fn(() => {
    const t = (time as any).mul(speedU).mul(float(0.15));
    const p = (positionLocal.xz as any).mul(float(2.5)).add(vec2(t, t.mul(float(0.7))));
    const n = (fbm5 as any)(p) as any;
    return mix(mix(mix(mix(
      vec3(0.0, 0.0, 0.0), vec3(0.7, 0.0, 0.0), smoothstep(float(0.0), float(0.28), n)),
      vec3(1.0, 0.35, 0.0), smoothstep(float(0.28), float(0.55), n)),
      vec3(1.0, 0.9, 0.15), smoothstep(float(0.55), float(0.78), n)),
      vec3(1.0, 1.0, 1.0),  smoothstep(float(0.78), float(1.0),  n)) as any;
  })();
  lavaMat.emissiveNode = Fn(() => {
    const t = (time as any).mul(speedU).mul(float(0.15));
    const p = (positionLocal.xz as any).mul(float(2.5)).add(vec2(t, t.mul(float(0.7))));
    const n = (fbm5 as any)(p) as any;
    const g = smoothstep(float(0.45), float(1.0), n) as any;
    return vec3(g.mul(float(3.5)), g.mul(float(0.6)), float(0));
  })();

  // ── 3. Iridescent ─────────────────────────────────────────────────────────
  const iridMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.03, metalness: 0.95 });
  iridMat.colorNode = Fn(() => {
    const N  = normalWorld as any;
    const V  = normalize((cameraPosition as any).sub(positionWorld));
    const fr = clamp(float(1).sub(dot(N, V)), float(0), float(1)) as any;
    const hue = fr.mul(float(6.5)).add((time as any).mul(speedU).mul(float(0.5)));
    return mix(vec3(0.04, 0.02, 0.08), vec3(
      sin(hue).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(2.094))).mul(float(0.5)).add(float(0.5)),
      sin(hue.add(float(4.189))).mul(float(0.5)).add(float(0.5)),
    ), pow(fr, float(0.25))) as any;
  })();

  // ── 4. Hologram ───────────────────────────────────────────────────────────
  const holoMat = new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.92 });
  holoMat.colorNode = Fn(() => {
    const p    = positionLocal.xz as any;
    const t    = (time as any).mul(speedU);
    const rings = pow(sin(length(p).mul(float(11)).sub(t.mul(float(3)))).mul(float(0.5)).add(float(0.5)), float(4)) as any;
    const scan  = pow(sin((positionLocal.y as any).mul(float(45)).sub(t.mul(float(5)))).mul(float(0.5)).add(float(0.5)), float(6)) as any;
    const N2    = normalWorld as any;
    const V2    = normalize((cameraPosition as any).sub(positionWorld));
    const edge  = pow(clamp(float(1).sub(abs(dot(N2, V2))), float(0), float(1)), float(2)) as any;
    const c     = rings.mul(float(1.2)).add(scan.mul(float(0.8))).add(edge.mul(float(1.5))) as any;
    return clamp(vec3(c.mul(float(0.1)), c.mul(float(0.85)), c), float(0), float(1));
  })();

  // ── 5. Cosmic ─────────────────────────────────────────────────────────────
  const cosmicMat = new THREE.MeshBasicNodeMaterial();
  cosmicMat.colorNode = Fn(() => {
    const n    = normalWorld as any;
    const t    = (time as any).mul(speedU).mul(float(0.05));
    const c1   = (fbm5 as any)(vec2(n.x.add(n.z), n.y).mul(float(2.8)).add(vec2(t, t.mul(float(0.6))))) as any;
    const c2   = (fbm5 as any)(vec2(n.x.sub(n.y), n.z).mul(float(4.2)).add(vec2(t.mul(float(-0.7)), t))) as any;
    const neb  = vec3(
      c1.mul(float(1.4)).add(c2.mul(float(0.3))),
      c1.mul(float(0.2)).add(c2.mul(float(0.8))),
      c1.mul(float(0.6)).add(c2.mul(float(1.6))),
    ) as any;
    const uv2  = floor((n.xy as any).mul(float(50)).add(float(50)));
    const star = step(float(0.972), (hash21 as any)(uv2)) as any;
    return clamp(neb.mul(float(1.6)).add(vec3(star, star, star)), float(0), float(1.5));
  })();

  // ── Background nebula (large inside-out sphere) ───────────────────────────
  const bgMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  bgMat.colorNode = Fn(() => {
    const n    = normalWorld as any;
    const t    = (time as any).mul(speedU).mul(float(0.02));
    const c1   = (fbm5 as any)(vec2(n.x.add(n.z), n.y).mul(float(1.4)).add(vec2(t, t.mul(float(0.5))))) as any;
    const c2   = (fbm5 as any)(vec2(n.z.sub(n.x), n.y).mul(float(2.0)).add(vec2(t.mul(float(-0.6)), t.mul(float(0.8))))) as any;
    const col  = vec3(
      c1.mul(float(0.5)).add(c2.mul(float(0.1))),
      c1.mul(float(0.1)).add(c2.mul(float(0.3))),
      c1.mul(float(0.3)).add(c2.mul(float(0.7))),
    ) as any;
    const uv3  = floor((n.xy as any).mul(float(80)).add(float(80)));
    const star = step(float(0.985), (hash21 as any)(uv3)) as any;
    return clamp(col.mul(float(0.6)).add(vec3(star, star, star.mul(float(1.2)))), float(0), float(1));
  })();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), bgMat));

  // ── Star at centre ────────────────────────────────────────────────────────
  const starMat = new THREE.MeshBasicNodeMaterial();
  starMat.colorNode = Fn(() => {
    const N  = normalWorld as any;
    const v  = sin(N.x.mul(float(8)).add((time as any).mul(speedU))).mul(float(0.3)).add(float(0.7)) as any;
    return vec3(v, v.mul(float(0.7)), v.mul(float(0.2)));
  })();
  const centralStar = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 16), starMat);
  scene.add(centralStar);
  const starLight = new THREE.PointLight(0xffcc66, 8.0, 30);
  scene.add(starLight);
  // Glow sprite
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 256;
  const gc = glowCanvas.getContext('2d')!;
  const gg = gc.createRadialGradient(128, 128, 0, 128, 128, 128);
  gg.addColorStop(0,   'rgba(255,220,120,0.9)');
  gg.addColorStop(0.3, 'rgba(255,180,60,0.4)');
  gg.addColorStop(1,   'rgba(255,100,0,0)');
  gc.fillStyle = gg; gc.fillRect(0, 0, 256, 256);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glowSprite.scale.set(7, 7, 1);
  scene.add(glowSprite);

  // ── Planets ───────────────────────────────────────────────────────────────
  const GEO = new THREE.SphereGeometry(1, 64, 32);

  const PLANETS = [
    { mat: plasmaMat,  r: 2.2, size: 0.42, speed: 0.80, phase: 0.0,  color: 0xff44ff, label: 'Plasma'     },
    { mat: lavaMat,    r: 3.4, size: 0.55, speed: 0.52, phase: 1.2,  color: 0xff5500, label: 'Lava'       },
    { mat: iridMat,    r: 4.8, size: 0.62, speed: 0.35, phase: 2.5,  color: 0x44ffcc, label: 'Iridescent' },
    { mat: holoMat,    r: 6.2, size: 0.50, speed: 0.24, phase: 4.1,  color: 0x00aaff, label: 'Hologram'   },
    { mat: cosmicMat,  r: 7.8, size: 0.48, speed: 0.16, phase: 0.8,  color: 0x9955ff, label: 'Cosmic'     },
  ];

  const planetMeshes = PLANETS.map(p => {
    const mesh = new THREE.Mesh(GEO, p.mat);
    mesh.scale.setScalar(p.size);
    scene.add(mesh);

    // Coloured point light per planet
    const pl = new THREE.PointLight(p.color, 4.0, 4.0);
    scene.add(pl);
    (mesh as any).userData = { ...p, light: pl };

    // Glow sprite per planet
    const gc2 = document.createElement('canvas');
    gc2.width = gc2.height = 128;
    const c2 = gc2.getContext('2d')!;
    const rr = (p.color >> 16) & 0xff, gg2 = (p.color >> 8) & 0xff, bb = p.color & 0xff;
    const gg3 = c2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg3.addColorStop(0,   `rgba(${rr},${gg2},${bb},0.5)`);
    gg3.addColorStop(0.5, `rgba(${rr},${gg2},${bb},0.15)`);
    gg3.addColorStop(1,   'rgba(0,0,0,0)');
    c2.fillStyle = gg3; c2.fillRect(0, 0, 128, 128);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc2),
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.scale.set(p.size * 5, p.size * 5, 1);
    scene.add(sprite);
    (mesh as any).userData.sprite = sprite;

    return mesh;
  });

  // ── GUI ───────────────────────────────────────────────────────────────────
  gui.addSlider('Speed', 1.0, 0, 3, 0.05, v => { speedU.value = v; });

  // ── Animate ───────────────────────────────────────────────────────────────
  animate(t => {
    centralStar.rotation.y = t * 0.2;

    planetMeshes.forEach(mesh => {
      const d = mesh.userData;
      const angle = d.phase + t * d.speed * speedU.value;
      const x = Math.cos(angle) * d.r;
      const z = Math.sin(angle) * d.r;
      const y = Math.sin(angle * 0.5 + d.phase) * 0.4;  // slight inclination
      mesh.position.set(x, y, z);
      mesh.rotation.y = t * 0.4 + d.phase;
      d.light.position.set(x, y, z);
      d.sprite.position.set(x, y, z);
      d.light.intensity = 3.5 + Math.sin(t * 1.8 + d.phase) * 1.0;
    });
  });
}
