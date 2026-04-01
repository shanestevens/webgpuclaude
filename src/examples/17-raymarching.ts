/**
 * Ray Marching — SDF scene with surface normals and dynamic lighting.
 * Full-screen quad runs a per-pixel sphere-trace: 3 animated blobs + torus + floor.
 * Aspect-ratio-correct ray directions; 3 coloured point lights.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, time,
  sin, cos, abs, min, max, length, normalize,
  dot, clamp, mix, smoothstep, floor, fract, select, pow,
  positionLocal,
} from 'three/tsl';
import { createScene } from './setup';

export async function createRaymarching(container: HTMLDivElement) {
  const { scene, camera, animate } = await createScene(container, { cameraPos: [0, 0, 2] });

  const aspectU = uniform(container.clientWidth / container.clientHeight);

  const material = new THREE.MeshBasicNodeMaterial();
  material.userData.skipWireframe = true;

  material.colorNode = Fn(() => {
    // Aspect-corrected screen coordinates (positionLocal is -1..+1 per axis on PlaneGeometry(2,2))
    const px = (positionLocal.x as any).mul(aspectU) as any; // -aspect..+aspect
    const py = positionLocal.y as any;                        // -1 (bottom) .. +1 (top)

    // Camera — elevated 1 unit, pulled back 5 units
    const ro = vec3(float(0.0), float(1.0), float(-5.0)) as any;
    // Slight upward tilt so floor occupies only the lower portion
    const rd = normalize(vec3(px, py.add(float(0.1)), float(2.0))) as any;

    // ── SDF primitives ────────────────────────────────────────────────────
    const sdSphere = (p: any, r: number) => length(p).sub(float(r));

    const sdTorus = (p: any, R: number, r: number) => {
      const q = vec2(length(p.xz).sub(float(R)), p.y);
      return length(q).sub(float(r));
    };

    const smin = (a: any, b: any, k: number) => {
      const h = clamp(float(0.5).add(b.sub(a).mul(float(0.5 / k))), float(0), float(1));
      return mix(b, a, h).sub(float(k).mul(h).mul(h.oneMinus()));
    };

    // Animated object positions
    const ta = time.mul(0.55);
    const c1 = vec3(sin(ta).mul(float(1.4)),           cos(ta.mul(float(0.75))).mul(float(0.6)),  sin(ta.mul(float(0.5))).mul(float(0.9)));
    const c2 = vec3(cos(ta.mul(float(1.1))).mul(float(1.2)), sin(ta.mul(float(1.3))).mul(float(0.55)), cos(ta).mul(float(1.0)));
    const c3 = vec3(sin(ta.mul(float(0.7)).add(float(2.0))).mul(float(1.0)), float(0.1), cos(ta.mul(float(0.85)).add(float(1.5))).mul(float(1.0)));

    // Scene SDF
    const scene3D = (p: any) => {
      const d1    = sdSphere(p.sub(c1), 0.50);
      const d2    = sdSphere(p.sub(c2), 0.44);
      const d3    = sdSphere(p.sub(c3), 0.40);
      const dTor  = sdTorus(p.sub(vec3(float(0), float(-0.2), float(0))), 1.0, 0.28);
      const dFloor = p.y.add(float(2.5));
      const blobs = smin(smin(d1, d2, 0.6), d3, 0.5);
      return min(smin(blobs, dTor, 0.35), dFloor);
    };

    // ── Ray march (56 steps) ─────────────────────────────────────────────
    const t = float(0.05).toVar();
    const minDist  = float(99.0).toVar();
    const hitFlag  = float(0.0).toVar();

    for (let i = 0; i < 56; i++) {
      const pos = ro.add(rd.mul(t));
      const d   = scene3D(pos);
      minDist.assign(min(minDist, d));
      const notHit = hitFlag.lessThan(float(0.5));
      const isHit  = d.lessThan(float(0.0015));
      hitFlag.assign(select(isHit, float(1.0), hitFlag));
      t.addAssign(select(notHit, d.max(float(0.008)), float(0.0)));
    }

    const hitPos = ro.add(rd.mul(t));
    const hit    = hitFlag.greaterThan(float(0.5));

    // ── Surface normal ────────────────────────────────────────────────────
    const eps = float(0.002);
    const nx  = scene3D(hitPos.add(vec3(eps, 0, 0))).sub(scene3D(hitPos.sub(vec3(eps, 0, 0))));
    const ny  = scene3D(hitPos.add(vec3(0, eps, 0))).sub(scene3D(hitPos.sub(vec3(0, eps, 0))));
    const nz  = scene3D(hitPos.add(vec3(0, 0, eps))).sub(scene3D(hitPos.sub(vec3(0, 0, eps))));
    const N   = normalize(vec3(nx, ny, nz));

    // ── Object ID for colouring ───────────────────────────────────────────
    const dB1    = sdSphere(hitPos.sub(c1), 0.50);
    const dB2    = sdSphere(hitPos.sub(c2), 0.44);
    const dB3    = sdSphere(hitPos.sub(c3), 0.40);
    const dTorus = sdTorus(hitPos.sub(vec3(float(0), float(-0.2), float(0))), 1.0, 0.28);
    const dFloor = hitPos.y.add(float(2.5));
    const minSD  = min(min(min(min(dB1, dB2), dB3), dTorus), dFloor);

    const isFloor = dFloor.lessThan(float(0.02));
    const isTorus = abs(dTorus.sub(minSD)).lessThan(float(0.02));
    const colBlobs = vec3(float(1.0), float(0.32), float(0.06));
    const colTorus = vec3(float(0.05), float(0.75), float(1.0));
    const colFloor = vec3(float(0.07), float(0.05), float(0.14));
    const baseCol  = select(isFloor, colFloor, select(isTorus, colTorus, colBlobs));

    // Checkerboard floor
    const chk    = fract(floor(hitPos.x.add(float(50))).add(floor(hitPos.z.add(float(50)))).mul(float(0.5))).mul(float(2.0));
    const checker = mix(vec3(float(0.05), float(0.04), float(0.12)), vec3(float(0.16), float(0.12), float(0.30)), chk);
    const surfaceCol = select(isFloor, checker, baseCol);

    // ── Lighting — 3 animated coloured point lights ───────────────────────
    const V = normalize(ro.sub(hitPos));
    const light = (lpos: any, lcol: any, intensity: number) => {
      const L2      = normalize(lpos.sub(hitPos));
      const H2      = normalize(L2.add(V));
      const diff    = dot(N, L2).max(float(0));
      const spec    = dot(N, H2).max(float(0)).pow(float(64)).mul(float(intensity * 2));
      const falloff = float(intensity).div(length(lpos.sub(hitPos)).mul(float(0.45)).add(float(0.55)));
      return lcol.mul(diff.add(spec)).mul(falloff);
    };

    const ta2  = time.mul(0.38);
    const l1   = vec3(sin(ta2).mul(float(3.5)), float(2.8), cos(ta2).mul(float(3.5)));
    const l2   = vec3(cos(ta2.add(float(2.1))).mul(float(3.0)), float(1.8), sin(ta2.add(float(2.1))).mul(float(3.0)));
    const l3   = vec3(float(-2.5), sin(ta2.mul(float(0.7))).mul(float(2)).add(float(1.0)), float(-1.5));

    const lighting =
      light(l1, vec3(float(1.0), float(0.38), float(0.08)), 3.5)
        .add(light(l2, vec3(float(0.15), float(0.45), float(1.0)), 3.0))
        .add(light(l3, vec3(float(0.75), float(0.1),  float(0.9)), 2.5))
        .add(vec3(float(0.04), float(0.03), float(0.08)));

    const surfLit = surfaceCol.mul(lighting);

    // Fresnel rim
    const fresnel  = float(1.0).sub(dot(N, V).max(float(0))).pow(float(3)).mul(float(0.9));
    const rimColor = vec3(float(0.25), float(0.55), float(1.0)).mul(fresnel);
    const finalSurface = surfLit.add(rimColor);

    // Glow near surfaces
    const glowDist = minDist.max(float(0));
    const glow     = float(0.05).div(glowDist.mul(float(3)).add(float(0.05)));
    const glowCol  = vec3(float(0.45), float(0.25), float(1.0)).mul(glow);

    // Background: deep-space gradient + stars
    const sky = mix(vec3(float(0.02), float(0.01), float(0.06)),
                    vec3(float(0.06), float(0.03), float(0.18)),
                    py.mul(float(0.5)).add(float(0.5)));
    // Use positionLocal (±1 range) so star density is independent of aspect ratio
    const stUV = vec2(positionLocal.x as any, positionLocal.y as any).mul(vec2(float(68), float(44)));
    const h1   = fract(sin(stUV.x.mul(float(127.1)).add(stUV.y.mul(float(311.7)))).mul(float(43758.5)));
    const h2   = fract(sin(stUV.x.mul(float(269.5)).add(stUV.y.mul(float(183.3)))).mul(float(85734.3)));
    const star = smoothstep(float(0.985), float(1.0), h1).mul(h2.mul(float(0.8)).add(float(0.2)));
    const bg   = sky.add(vec3(star));

    const col = select(hit, finalSurface, bg.add(glowCol));

    // Tone map (Reinhard)
    const mapped = col.div(col.add(vec3(float(1.0))));
    return vec4(mapped, float(1.0));
  })();

  // Scale quad to fill the viewport at the scene camera's effective FOV
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.scale.x = aspectU.value;
  scene.add(quad);

  new ResizeObserver(() => {
    aspectU.value = container.clientWidth / container.clientHeight;
    quad.scale.x = aspectU.value;
  }).observe(container);

  animate();
}
