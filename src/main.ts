import * as THREE from 'three/webgpu';
import { HouseDesigner } from './house-designer/index';
import { createTriangle } from './examples/01-triangle';
import { createColoredCube } from './examples/02-colored-cube';
import { createTextures } from './examples/03-textures';
import { createLighting } from './examples/04-lighting';
import { createPBR } from './examples/05-pbr';
import { createEnvironment } from './examples/06-environment';
import { createInstancing } from './examples/07-instancing';
import { createCustomShader } from './examples/08-custom-shader';
import { createPostProcessing } from './examples/09-post-processing';
import { createParticles } from './examples/10-particles';
import { createSkinning } from './examples/11-skinning';
import { createTerrain } from './examples/12-terrain';
import { createShadows } from './examples/13-shadows';
import { createReflections } from './examples/14-reflections';
import { createMorphTargets } from './examples/15-morph-targets';
import { createAurora } from './examples/16-compute';
import { createRaymarching } from './examples/17-raymarching';
import { createOcean } from './examples/18-ocean';
import { createLightTypes } from './examples/19-light-types';
import { createMultipleLights } from './examples/20-multiple-lights';
import { createShadowTypes } from './examples/21-shadows';
import { createNexus }       from './examples/22-nexus';
import { createPBRHelmet }   from './examples/23-pbr-helmet';

const examples = [
  { id: '01', title: 'Hello Triangle', desc: 'Minimal geometry', init: createTriangle },
  { id: '02', title: 'Colored Cube', desc: 'Vertex colors & rotation', init: createColoredCube },
  { id: '03', title: 'Textures', desc: 'UV mapping & textures', init: createTextures },
  { id: '04', title: 'Lighting', desc: 'Ambient · Directional · Point · Spot with shadows', init: createLighting },
  { id: '05', title: 'PBR Materials', desc: 'Physically-based rendering', init: createPBR },
  { id: '06', title: 'Environment Map', desc: 'Reflections & HDR', init: createEnvironment },
  { id: '07', title: 'Instancing', desc: '1000s of objects efficiently', init: createInstancing },
  { id: '08', title: 'Custom Shader', desc: 'TSL node materials', init: createCustomShader },
  { id: '09', title: 'Post-Processing', desc: 'Bloom & effects', init: createPostProcessing },
  { id: '10', title: 'Particles', desc: 'GPU particle system', init: createParticles },
  { id: '11', title: 'Skinned Mesh', desc: 'Animated skeleton', init: createSkinning },
  { id: '12', title: 'Terrain', desc: 'Heightmap & fog', init: createTerrain },
  { id: '13', title: 'Shadows', desc: 'Shadow mapping & soft shadows', init: createShadows },
  { id: '14', title: 'Reflections', desc: 'CubeCamera mirror', init: createReflections },
  { id: '15', title: 'Morph Targets', desc: 'TSL vertex-shader morphing', init: createMorphTargets },
  { id: '16', title: 'Lava Lamp',       desc: 'Metaball SDF blobs · TSL procedural lighting', init: createAurora },
  { id: '17', title: 'Ray Marching', desc: 'SDF scene with surface normals', init: createRaymarching },
  { id: '18', title: 'Ocean', desc: 'Gerstner waves, sunset & sailboat', init: createOcean },
  { id: '19', title: 'Light Types', desc: 'All 6 Three.js light types side by side', init: createLightTypes },
  { id: '20', title: 'Multiple Lights', desc: '3-point lighting + coloured point lights', init: createMultipleLights },
  { id: '21', title: 'Shadow Types',     desc: 'Basic / PCF / PCFSoft / VSM compared',            init: createShadowTypes },
  { id: '22', title: 'Nexus',           desc: 'Grand finale — all techniques combined',           init: createNexus },
  { id: '23', title: 'PBR Helmet',      desc: 'Damaged Helmet (CC0) · HDRI image-based lighting', init: createPBRHelmet },
];

// ── Version & compatibility checking ────────────────────────────────────────

const APP_VERSION = '1.0.0';

interface GPUCheckResult {
  supported: boolean;
  adapterName?: string;
  reason?: string;
}

async function checkWebGPU(): Promise<GPUCheckResult> {
  if (!navigator.gpu) {
    return { supported: false, reason: 'WebGPU API not available in this browser' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: 'No GPU adapter found — your GPU may not support WebGPU' };
    }
    const info = adapter.info;
    const parts = [info.vendor, info.architecture, info.device, info.description]
      .filter(Boolean);
    return { supported: true, adapterName: parts.join(' · ') || 'Unknown adapter' };
  } catch (e) {
    return { supported: false, reason: `GPU adapter request failed: ${(e as Error).message}` };
  }
}

function detectBrowser(): { name: string; version: string } {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/'))     return { name: 'Firefox',  version: ua.split('Firefox/')[1]?.split(' ')[0] ?? '' };
  if (ua.includes('Edg/'))         return { name: 'Edge',     version: ua.split('Edg/')[1]?.split(' ')[0] ?? '' };
  if (ua.includes('Chrome/'))      return { name: 'Chrome',   version: ua.split('Chrome/')[1]?.split(' ')[0] ?? '' };
  if (ua.includes('Safari/') && !ua.includes('Chrome'))
    return { name: 'Safari', version: ua.split('Version/')[1]?.split(' ')[0] ?? '' };
  return { name: 'Unknown', version: '' };
}

function showGPUWarning(reason: string) {
  const el = document.getElementById('gpu-warning')!;
  const browser = detectBrowser();
  let hint = '';

  if (browser.name === 'Firefox') {
    hint = 'Firefox has limited WebGPU support. Try <strong>Chrome 113+</strong> or <strong>Edge 113+</strong>.';
  } else if (browser.name === 'Safari') {
    hint = 'Safari WebGPU support is experimental. Try <strong>Chrome 113+</strong> or <strong>Edge 113+</strong>.';
  } else if (browser.name === 'Chrome' || browser.name === 'Edge') {
    const ver = parseInt(browser.version, 10);
    if (ver && ver < 113) {
      hint = `Your ${browser.name} version (${ver}) is too old. Please update to <strong>${browser.name} 113+</strong>.`;
    } else {
      hint = 'WebGPU may be disabled. Check <strong>chrome://flags/#enable-unsafe-webgpu</strong>.';
    }
  } else {
    hint = 'Please use <strong>Chrome 113+</strong> or <strong>Edge 113+</strong> for full WebGPU support.';
  }

  el.innerHTML = `
    <strong>WebGPU is not available</strong> — ${reason}
    <div class="warn-detail">${hint} (Detected: ${browser.name} ${browser.version})</div>
  `;
  el.style.display = 'block';
}

function populateVersionBar(gpuResult: GPUCheckResult) {
  // App version
  document.getElementById('ver-app')!.textContent = `v${APP_VERSION}`;

  // Three.js version
  document.getElementById('ver-three')!.textContent = `r${THREE.REVISION}`;

  // WebGPU status
  const gpuEl = document.getElementById('ver-gpu')!;
  if (gpuResult.supported) {
    gpuEl.textContent = 'Available';
    gpuEl.className = 'ver-ok';
  } else {
    gpuEl.textContent = 'Unavailable';
    gpuEl.className = 'ver-err';
  }

  // GPU adapter info
  if (gpuResult.adapterName) {
    const chip = document.getElementById('ver-adapter-chip')!;
    chip.style.display = '';
    document.getElementById('ver-adapter')!.textContent = gpuResult.adapterName;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const gpuResult = await checkWebGPU();
  populateVersionBar(gpuResult);

  if (!gpuResult.supported) {
    showGPUWarning(gpuResult.reason!);
  }

  const grid     = document.getElementById('grid')!;
  const backdrop = document.getElementById('fs-backdrop')!;

  // ── Fullscreen expand/collapse ────────────────────────────────────────────
  let fullscreenCard: HTMLDivElement | null = null;

  const enterFullscreen = (card: HTMLDivElement) => {
    fullscreenCard = card;
    card.classList.add('is-fullscreen');
    backdrop.classList.add('active');
    const btn = card.querySelector<HTMLButtonElement>('.expand-btn')!;
    btn.innerHTML = '&#x2715;'; // ✕
    btn.title = 'Minimize';
  };

  const exitFullscreen = () => {
    if (!fullscreenCard) return;
    fullscreenCard.classList.remove('is-fullscreen');
    backdrop.classList.remove('active');
    const btn = fullscreenCard.querySelector<HTMLButtonElement>('.expand-btn')!;
    btn.innerHTML = '&#x26F6;'; // ⛶
    btn.title = 'Expand';
    fullscreenCard = null;
  };

  backdrop.addEventListener('click', exitFullscreen);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') exitFullscreen(); });

  // Serialised init queue — only one example compiles shaders at a time,
  // preventing simultaneous GPU shader linking from stalling running examples.
  let initQueue: HTMLDivElement[] = [];
  let compiling = false;

  const runQueue = () => {
    if (compiling || initQueue.length === 0) return;
    compiling = true;
    const container = initQueue.shift()!;
    const initFn = (container as any)._initFn as (c: HTMLDivElement) => Promise<void>;
    initFn(container)
      .catch(e => {
        console.error('Failed to init example:', e);
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6666;padding:1rem;text-align:center;font-size:0.8rem;">Error: ${e}</div>`;
      })
      .finally(() => {
        compiling = false;
        runQueue();
      });
  };

  // Lazy-init via IntersectionObserver — only boot a renderer when its card
  // scrolls into view. Prevents exceeding the browser WebGL context limit (~16).
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const container = entry.target as HTMLDivElement;
      if (container.dataset.initialized) return;
      container.dataset.initialized = 'true';
      observer.unobserve(container);
      initQueue.push(container);
      runQueue();
    });
  }, { rootMargin: '200px' });

  for (const ex of examples) {
    const card = document.createElement('div');
    card.className = 'example-card';
    card.innerHTML = `
      <div class="card-header">
        <span class="card-number">${ex.id}</span>
        <h2>${ex.title}</h2>
        <p>${ex.desc}</p>
      </div>
      <div class="canvas-container" id="container-${ex.id}"></div>
    `;
    grid.appendChild(card);

    const container = card.querySelector<HTMLDivElement>('.canvas-container')!;

    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.innerHTML = '&#x26F6;'; // ⛶
    expandBtn.title = 'Expand';
    expandBtn.addEventListener('click', () => {
      if (fullscreenCard === card) exitFullscreen();
      else enterFullscreen(card);
    });
    card.querySelector('.card-header')!.appendChild(expandBtn);

    (container as any)._initFn = ex.init;
    observer.observe(container);
  }
}

main();

// ── Tab switching ──────────────────────────────────────────────────────────
function initTabs() {
  const btnExamples = document.getElementById('tab-btn-examples')!;
  const btnDesigner = document.getElementById('tab-btn-designer')!;
  const tabExamples = document.getElementById('tab-examples')!;
  const tabDesigner = document.getElementById('tab-designer')!;

  let designerInstance: HouseDesigner | null = null;
  let designerReady = false;

  const showExamples = () => {
    // Restore examples tab — undo the visibility-hiding applied when designer was shown
    tabExamples.style.position   = '';
    tabExamples.style.visibility = '';
    tabExamples.style.pointerEvents = '';
    tabDesigner.style.display = 'none';
    btnExamples.classList.add('active');
    btnDesigner.classList.remove('active');
  };

  const showDesigner = async () => {
    // Hide examples WITHOUT display:none so the example canvases keep their
    // CSS dimensions — display:none collapses them to 0×0 and their still-running
    // animation loops trigger WebGPU 0×0 swap-chain / depth-buffer errors.
    tabExamples.style.position   = 'absolute';
    tabExamples.style.visibility = 'hidden';
    tabExamples.style.pointerEvents = 'none';
    tabDesigner.style.display = 'block'; // 'flex' made it a row container; block lets #designer-root fill naturally
    btnExamples.classList.remove('active');
    btnDesigner.classList.add('active');

    if (!designerReady) {
      designerReady = true;
      // Wait two frames so the browser completes layout before we query dimensions
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const root = document.getElementById('designer-root') as HTMLElement;
      designerInstance = new HouseDesigner(root);
      await designerInstance.init();
    }
  };

  btnExamples.addEventListener('click', showExamples);
  btnDesigner.addEventListener('click', showDesigner);
}

initTabs();
