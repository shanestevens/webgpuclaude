/**
 * Lava Lamp — TSL metaball SDF rendered in a full-screen quad.
 * 5 blobs merge/split via smooth-min; finite-difference normals give 3-D shading.
 * Demonstrates: TSL outputNode, SDF smooth-union, procedural lighting, aspect-ratio correction.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, time,
  positionLocal,
  sqrt, abs, clamp, mix, smoothstep,
  vec2, vec3, vec4, float,
  dot, length, normalize, pow,
} from 'three/tsl';
import { createScene } from './setup';

export async function createAurora(container: HTMLDivElement) {
  const { scene, camera, animate, gui } = await createScene(container, {
    cameraPos: [0, 0, 1],
    background: 0x000000,
  });

  camera.fov = 90;
  camera.updateProjectionMatrix();

  // ── Uniforms ──────────────────────────────────────────────────────────────
  const speedU  = uniform(1.0);
  const aspectU = uniform(container.clientWidth / container.clientHeight);
  const blob1   = uniform(new THREE.Vector3());
  const blob2   = uniform(new THREE.Vector3());
  const blob3   = uniform(new THREE.Vector3());
  const blob4   = uniform(new THREE.Vector3());
  const blob5   = uniform(new THREE.Vector3());

  // ── TSL helpers ───────────────────────────────────────────────────────────
  const K = float(0.52);   // blend radius
  const R = float(0.27);   // blob radius

  // Polynomial smooth-min: blends two SDF distances
  const smin = Fn(([a, b, k]: any[]) => {
    const h = clamp(float(0.5).add((b as any).sub(a).div(k).mul(float(0.5))), float(0.0), float(1.0)) as any;
    return mix(b, a, h).sub((h as any).mul(float(1.0).sub(h)).mul(k));
  });

  // Combined SDF for all 5 blobs — called 5× for finite-diff normals
  const sceneSDF = Fn(([p]: any[]) => {
    const d1 = length((p as any).sub(blob1.xy as any)).sub(R) as any;
    const d2 = length((p as any).sub(blob2.xy as any)).sub(R) as any;
    const d3 = length((p as any).sub(blob3.xy as any)).sub(R) as any;
    const d4 = length((p as any).sub(blob4.xy as any)).sub(R) as any;
    const d5 = length((p as any).sub(blob5.xy as any)).sub(R) as any;
    const s12    = (smin as any)(d1, d2, K) as any;
    const s123   = (smin as any)(s12, d3, K) as any;
    const s1234  = (smin as any)(s123, d4, K) as any;
    return (smin as any)(s1234, d5, K);
  });

  // ── Full-screen quad material ─────────────────────────────────────────────
  const quadMat = new THREE.MeshBasicNodeMaterial({ depthWrite: false });
  quadMat.userData.skipWireframe = true;

  quadMat.outputNode = Fn(() => {
    // Aspect-corrected coordinates: x spans ±aspect, y spans ±1
    const px = (positionLocal.x as any).mul(aspectU) as any;
    const py = positionLocal.y as any;
    const p  = vec2(px, py) as any;

    const dist   = (sceneSDF as any)(p) as any;
    const inside = smoothstep(float(0.018), float(-0.018), dist) as any;
    const glow   = clamp(float(0.065).div((abs(dist) as any).add(float(0.065))), float(0.0), float(1.0)) as any;

    // Surface normal via SDF gradient (finite differences, 2-D)
    const e  = float(0.012);
    const nx = ((sceneSDF as any)(vec2(px.add(e), py)  ) as any).sub(
               (sceneSDF as any)(vec2(px.sub(e), py)  ) as any) as any;
    const ny = ((sceneSDF as any)(vec2(px,        py.add(e))) as any).sub(
               (sceneSDF as any)(vec2(px,        py.sub(e))) as any) as any;
    const nz = float(0.5) as any;
    const nl = sqrt((nx as any).mul(nx).add((ny as any).mul(ny)).add(nz.mul(nz))) as any;
    const N  = vec3((nx as any).div(nl), (ny as any).div(nl), nz.div(nl)) as any;

    // Warm key light from above, as if from the lamp bulb
    const L    = normalize(vec3(float(0.3), float(0.8), float(1.0))) as any;
    const diff = clamp(dot(N, L), float(0.0), float(1.0)) as any;
    const H    = normalize(vec3(float(0.3), float(0.8), float(2.0))) as any;
    const spec = pow(clamp(dot(N, H), float(0.0), float(1.0)), float(24)) as any;

    // Lava colour: deep red (bottom) → orange (mid) → bright yellow (top)
    const yN      = py.mul(float(0.5)).add(float(0.5)) as any; // 0=bottom 1=top
    const colLow  = vec3(float(0.85), float(0.08), float(0.0)) as any;
    const colMid  = vec3(float(1.0),  float(0.44), float(0.0)) as any;
    const colHigh = vec3(float(1.0),  float(0.92), float(0.12)) as any;
    const lavaCol = mix(
      mix(colLow, colMid,  smoothstep(float(0.0), float(0.5), yN)),
      colHigh,             smoothstep(float(0.5), float(1.0), yN),
    ) as any;

    const lit = lavaCol.mul(diff.mul(float(0.7)).add(float(0.3))).add(spec.mul(float(0.8))) as any;

    // Background: warm embers at bottom, deep dark-purple at top
    const bg = mix(
      vec3(float(0.12), float(0.04), float(0.0)),
      vec3(float(0.02), float(0.01), float(0.08)),
      py.mul(float(0.5)).add(float(0.5)),
    ) as any;
    const glowColor = vec3(float(1.0), float(0.38), float(0.0)).mul(glow.mul(float(0.28))) as any;

    return vec4(mix(bg.add(glowColor), lit, inside), float(1.0));
  })();

  // Scale quad so it fills the viewport at FOV-90 with camera at z=1
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  quad.scale.x = aspectU.value;
  scene.add(quad);

  new ResizeObserver(() => {
    aspectU.value = container.clientWidth / container.clientHeight;
    quad.scale.x = aspectU.value;
  }).observe(container);

  // ── GUI ───────────────────────────────────────────────────────────────────
  gui.addSlider('Speed', 1.0, 0, 3, 0.05, v => { speedU.value = v; });

  // ── Animate blobs ─────────────────────────────────────────────────────────
  // Lissajous paths spanning the full visible area
  animate(t => {
    const s  = t * speedU.value;
    const ax = aspectU.value * 0.75; // blobs fill ~75 % of width on each side
    blob1.value.set(Math.sin(s * 0.31 + 0.0) * ax,         Math.sin(s * 0.19 + 0.0) * 0.82, 0);
    blob2.value.set(Math.sin(s * 0.27 + 2.1) * ax,         Math.sin(s * 0.23 + 1.8) * 0.80, 0);
    blob3.value.set(Math.sin(s * 0.43 + 4.2) * ax * 0.70,  Math.sin(s * 0.17 + 3.5) * 0.84, 0);
    blob4.value.set(Math.sin(s * 0.37 + 1.5) * ax,         Math.sin(s * 0.29 + 2.7) * 0.78, 0);
    blob5.value.set(Math.sin(s * 0.23 + 3.7) * ax * 0.85,  Math.sin(s * 0.37 + 0.9) * 0.82, 0);
  });
}
