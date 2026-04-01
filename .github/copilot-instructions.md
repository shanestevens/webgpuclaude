# Copilot Instructions

## Commands

```bash
npm run dev      # Vite dev server (opens browser automatically)
npm run build    # tsc + vite build
npm run preview  # Preview production build
```

There are no test or lint scripts.

## Architecture

This is a WebGPU learning showcase: a single HTML page that renders 22 interactive Three.js examples in a CSS grid, each in its own canvas card.

**Entry point** (`src/main.ts`): Imports all examples and uses `IntersectionObserver` (200px rootMargin) to lazy-initialize each renderer only when its card scrolls into view — this prevents exhausting the browser's WebGL context limit (~16 active contexts).

**Scene factory** (`src/examples/setup.ts`): All examples call `createScene(container, opts?)` which returns a `SceneKit`:
- Creates a `WebGPURenderer`, calls `await renderer.init()`, and appends its canvas
- Attaches a `ResizeObserver` for responsive resizing
- Mounts a `SimpleGUI` panel (top-right overlay) with built-in Wireframe toggle and Camera mode selector
- Returns `animate(callback?)` — drives the render loop via `renderer.setAnimationLoop`; callback receives elapsed time `t` in seconds

**Each example** (`src/examples/NN-name.ts`): Exports a single `async function createXxx(container: HTMLDivElement)`. Pattern is always: call `createScene` → add objects to scene → call `animate(t => { ... })`.

**Shared utilities** (`src/shared/`):
- `CameraControls`: Wraps `OrbitControls` with an FPS mode (WASD + mouse-drag look). Switch via `cameraControls.setMode('fps' | 'orbit')`. The GUI's Camera select calls this.
- `SimpleGUI`: Zero-dependency overlay panel. Fluent API: `gui.addToggle / addSlider / addSelect / addButton / addColor / addText / addSeparator`.

## Key Conventions

**Always import from `three/webgpu`, never `three`:**
```ts
import * as THREE from 'three/webgpu';
```
TSL (Three Shading Language) node helpers come from `three/tsl`:
```ts
import { Fn, uniform, time, sin, vec3, ... } from 'three/tsl';
```

**WebGPU renderer init is async** — `await renderer.init()` must be called before rendering. This is handled inside `createScene`; examples don't need to call it manually.

**TSL node materials** use `.colorNode`, `.emissiveNode`, etc. instead of plain color properties. Use `Fn(([arg]: [any]) => ...)` to define reusable node functions. Uniforms are created with `uniform(value)` and mutated via `.value`.

**Wireframe exemption**: Set `mesh.userData.skipWireframe = true` on any mesh that manages its own wireframe state, to prevent the global GUI toggle from overriding it.

**Animation time**: The `animate` callback receives elapsed time `t` in seconds (from `THREE.Timer`). Delta time is available internally for camera updates but not passed to example callbacks.

**Adding a new example**:
1. Create `src/examples/NN-name.ts` exporting `async function createXxx(container: HTMLDivElement)`
2. Import and register it in `src/main.ts` — add to both the imports and the `examples` array with `{ id, title, desc, init }`
