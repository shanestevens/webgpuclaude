import * as THREE from 'three/webgpu';
import { normalWorld, mix, color as tslColor } from 'three/tsl';
import { CameraControls } from '../shared/cameraControls';
import { Wall } from './types';
import { CELL_M } from './FloorPlanEditor';

const WALL_HEIGHT    = 2.8;
const WALL_THICKNESS = 0.18;

/**
 * Wait until the element reports a non-zero measured size via ResizeObserver.
 * ResizeObserver.contentRect is the reliable source — clientWidth can be stale
 * immediately after DOM insertion when flex layout hasn't settled yet.
 */
function waitForSize(el: HTMLElement): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        ro.disconnect();
        resolve({ w, h });
      }
    });
    ro.observe(el);
  });
}

export class Preview3D {
  private renderer!: THREE.WebGPURenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private camCtrl!: CameraControls;
  private wallGroup!: THREE.Group;
  private wallMat!: THREE.MeshStandardNodeMaterial;   // default (no color)
  private matCache = new Map<string, THREE.MeshStandardNodeMaterial>();
  private ro!: ResizeObserver;
  private lastTs = 0;

  constructor(private container: HTMLDivElement) {}

  async init() {
    const { container } = this;

    // ── 1. Wait for a real layout measurement BEFORE touching the renderer ────
    // This mirrors what createScene() relies on: containers always have a size
    // before renderer creation. Flex layout may not be settled right after
    // innerHTML, so we wait for ResizeObserver rather than reading clientWidth.
    const { w: W, h: H } = await waitForSize(container);

    // ── 2. Create renderer, set size, add to DOM, then init ───────────────────
    // Order matters: setSize → appendChild → init(), same as createScene().
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(W, H);
    this.renderer.shadowMap.enabled   = true;
    this.renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);
    await this.renderer.init();

    // ── 3. Scene ──────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    // Gradient sky: deep navy at zenith → powder blue at horizon
    // normalWorld.y is +1 at top, 0 at horizon; pow() controls the curve.
    this.scene.backgroundNode = mix(
      tslColor(0x9ec8dd),   // horizon
      tslColor(0x0c1a3a),   // zenith
      normalWorld.y.clamp(0, 1).pow(0.45)
    );
    // Fog matches the horizon colour so geometry fades into the sky naturally.
    this.scene.fog = new THREE.FogExp2(0x9ec8dd, 0.010);

    // ── 4. Camera ─────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);
    this.camera.position.set(10, 8, 12);
    this.camCtrl = new CameraControls(this.camera, this.renderer.domElement);
    this.camCtrl.setMode('orbit');

    // ── 5. Lighting ───────────────────────────────────────────────────────────
    // Hemisphere: sky colour from above, warm earth from below — free fill light.
    this.scene.add(new THREE.HemisphereLight(0x9ec8dd, 0x7a6040, 0.9));

    // Main sun — warm afternoon angle, generous shadow map.
    const sun = new THREE.DirectionalLight(0xffe8c0, 3.2);
    sun.position.set(18, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left   = -30;
    sun.shadow.camera.right  =  30;
    sun.shadow.camera.top    =  30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far    = 100;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    // Subtle cool bounce from opposite side (sky-bounce).
    const bounce = new THREE.DirectionalLight(0xaad0ee, 0.4);
    bounce.position.set(-10, 5, -8);
    this.scene.add(bounce);

    // ── 6. Floor + grid ───────────────────────────────────────────────────────
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardNodeMaterial({ color: 0xc8bfa8, roughness: 0.92, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(new THREE.GridHelper(200, 400, 0x9a8e7a, 0xb8ad98));

    // ── 7. Wall material & group ──────────────────────────────────────────────
    this.wallMat = new THREE.MeshStandardNodeMaterial({
      color: 0xd8d8d8, roughness: 0.85, metalness: 0.02,
    });
    // Push grey walls slightly away from the camera so colored coplanar
    // walls always win the depth test (no z-fighting with room colours).
    this.wallMat.polygonOffset       = true;
    this.wallMat.polygonOffsetFactor = 1;
    this.wallMat.polygonOffsetUnits  = 1;
    this.wallGroup = new THREE.Group();
    this.scene.add(this.wallGroup);

    // ── 8. Ongoing resize ─────────────────────────────────────────────────────
    this.ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    this.ro.observe(container);

    // ── 9. Animation loop ─────────────────────────────────────────────────────
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setAnimationLoop(ts => {
      const dt = Math.min((ts - this.lastTs) / 1000, 0.1);
      this.lastTs = ts;
      this.camCtrl.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getColorMat(hex: string): THREE.MeshStandardNodeMaterial {
    if (!this.matCache.has(hex)) {
      const mat = new THREE.MeshStandardNodeMaterial({
        color:    new THREE.Color(hex),
        roughness: 0.80,
        metalness: 0.02,
      });
      // Pull colored faces slightly toward the camera so they always win
      // over coplanar grey walls at the same position (eliminates z-fighting).
      mat.polygonOffset      = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits  = -1;
      this.matCache.set(hex, mat);
    }
    return this.matCache.get(hex)!;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  updateWalls(walls: Wall[]) {
    for (const child of [...this.wallGroup.children]) {
      (child as THREE.Mesh).geometry.dispose();
    }
    this.wallGroup.clear();

    for (const w of walls) {
      const x1 = w.start.col * CELL_M,  z1 = w.start.row * CELL_M;
      const x2 = w.end.col   * CELL_M,  z2 = w.end.row   * CELL_M;
      const dx = x2 - x1, dz = z2 - z1;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.02) continue;

      const wallH = w.height    ?? WALL_HEIGHT;
      const wallT = w.thickness ?? WALL_THICKNESS;
      const mat   = w.color ? this.getColorMat(w.color) : this.wallMat;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(length, wallH, wallT),
        mat
      );
      mesh.position.set((x1 + x2) / 2, wallH / 2, (z1 + z2) / 2);
      mesh.rotation.y = Math.atan2(-dz, dx);
      mesh.castShadow = mesh.receiveShadow = true;
      this.wallGroup.add(mesh);
    }
  }

  dispose() {
    this.ro?.disconnect();
    this.renderer.setAnimationLoop(null);
    for (const mat of this.matCache.values()) mat.dispose();
    this.renderer.dispose();
  }
}
