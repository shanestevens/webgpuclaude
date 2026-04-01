/**
 * Post-Processing — Bloom · Chromatic Aberration · Pixelate · Film Grain
 * Objects orbit a shadow-receiving ground plane. Switch effects via GUI.
 */
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom }               from 'three/examples/jsm/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/examples/jsm/tsl/display/ChromaticAberrationNode.js';
import { pixelationPass }      from 'three/examples/jsm/tsl/display/PixelationPassNode.js';
import { film }                from 'three/examples/jsm/tsl/display/FilmNode.js';
import { createScene } from './setup';

const EFFECTS = ['Bloom', 'Chromatic Aberration', 'Pixelate', 'Film Grain'] as const;
type EffectName = typeof EFFECTS[number];

export async function createPostProcessing(container: HTMLDivElement) {
  const { renderer, scene, camera, animate, gui } = await createScene(container, {
    cameraPos: [0, 6, 10],
    background: 0x111122,
  });

  camera.fov = 52;
  camera.updateProjectionMatrix();

  // ── Lighting ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x112244, 0.5));

  const sun = new THREE.DirectionalLight(0xfff8ee, 3.0);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 30;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
  sun.shadow.camera.right = sun.shadow.camera.top   =  8;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // ── Ground plane ──────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshStandardNodeMaterial({ color: 0x1a2537, roughness: 0.88, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Orbiting objects ──────────────────────────────────────────────────────
  const ITEMS = [
    { color: 0xff2255, geo: new THREE.TorusKnotGeometry(0.42, 0.15, 128, 16), r: 2.8, speed: 0.5,  phase: 0.0  },
    { color: 0x22aaff, geo: new THREE.SphereGeometry(0.55, 40, 24),           r: 2.0, speed: 0.8,  phase: 1.26 },
    { color: 0xffaa00, geo: new THREE.BoxGeometry(0.85, 0.85, 0.85),          r: 3.5, speed: 0.35, phase: 2.51 },
    { color: 0x44ee88, geo: new THREE.TorusGeometry(0.42, 0.18, 16, 64),      r: 2.4, speed: 0.65, phase: 3.77 },
    { color: 0xcc44ff, geo: new THREE.IcosahedronGeometry(0.5, 1),            r: 3.0, speed: 0.45, phase: 5.03 },
  ];

  const objects = ITEMS.map(({ color, geo, r, speed, phase }) => {
    const mat = new THREE.MeshStandardNodeMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, r, speed, phase };
  });

  // Central accent light
  const centreLight = new THREE.PointLight(0x8899ff, 2.0, 12);
  centreLight.position.set(0, 3, 0);
  scene.add(centreLight);

  // ── Post-processing pipeline ──────────────────────────────────────────────
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);

  const bloomNode  = bloom(scenePass, 0.4, 0.35, 0.22);
  const chromaNode = (chromaticAberration as any)(scenePass, 2.0);
  const pixelNode  = pixelationPass(scene, camera, 6, 1.0, 0.5);
  const filmNode   = (film as any)(scenePass);

  const effectNodes: Record<EffectName, any> = {
    'Bloom':                bloomNode,
    'Chromatic Aberration': chromaNode,
    'Pixelate':             pixelNode,
    'Film Grain':           filmNode,
  };

  let currentEffect: EffectName = 'Bloom';
  pipeline.outputNode = bloomNode;

  // ── GUI ───────────────────────────────────────────────────────────────────
  gui.addSelect('Effect', [...EFFECTS], currentEffect, v => {
    currentEffect = v as EffectName;
    pipeline.outputNode = effectNodes[currentEffect];
    pipeline.needsUpdate = true;
  });
  gui.addSlider('Bloom strength', 0.4, 0, 3.0, 0.05, v => { bloomNode.strength.value = v; });
  gui.addSlider('Bloom radius',   0.35, 0, 1.0, 0.02, v => { bloomNode.radius.value   = v; });

  // ── Animate ───────────────────────────────────────────────────────────────
  animate(t => {
    objects.forEach(({ mesh, r, speed, phase }) => {
      const angle = phase + t * speed;
      mesh.position.set(Math.cos(angle) * r, 0.55, Math.sin(angle) * r);
      mesh.rotation.x = t * 0.4;
      mesh.rotation.y = t * 0.6;
    });
    pipeline.render();
    return true;
  });
}
