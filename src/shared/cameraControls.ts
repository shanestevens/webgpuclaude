/**
 * Unified camera controller supporting:
 *   - Orbit mode  : Three.js OrbitControls (LMB orbit, RMB pan, scroll zoom)
 *   - FPS mode    : WSAD move + Shift sprint, LMB look, RMB pan, scroll zoom
 *
 * Keyboard events are scoped to the canvas — only affects the last-clicked example.
 * Scroll zoom works on hover in both modes (no focus required).
 * Switching modes preserves camera position & orientation exactly.
 */
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'orbit' | 'fps';

export class CameraControls {
  readonly orbit: OrbitControls;
  private _mode: CameraMode = 'orbit';
  private camera: THREE.PerspectiveCamera;
  private domEl: HTMLElement;

  // FPS state
  private keys      = new Set<string>();
  private moveSpeed = 8;       // world-units / second
  private lookSpeed = 0.0025;  // radians / pixel

  private rmbDown = false;
  private lmbDown = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Euler angles maintained separately — no gimbal from quaternion extraction
  private yaw   = 0;
  private pitch = 0;

  private readonly _keydown:   (e: KeyboardEvent) => void;
  private readonly _keyup:     (e: KeyboardEvent) => void;
  private readonly _blur:      ()                 => void;
  private readonly _mousedown: (e: MouseEvent)    => void;
  private readonly _mouseup:   (e: MouseEvent)    => void;
  private readonly _mousemove: (e: MouseEvent)    => void;
  private readonly _wheel:     (e: WheelEvent)    => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domEl  = domElement;

    // ── OrbitControls ──
    this.orbit = new OrbitControls(camera, domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.mouseButtons = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.PAN,
    };

    // Make canvas focusable for scoped keyboard events
    domElement.tabIndex = -1;
    domElement.style.outline = 'none';

    this._syncAnglesFromCamera();

    // ── Keyboard — scoped to this canvas via focus ──
    this._keydown = (e) => {
      // Prevent page scroll for space / arrows while canvas is focused
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      this.keys.add(e.key.toLowerCase());
    };
    this._keyup = (e) => this.keys.delete(e.key.toLowerCase());
    // Clear all held keys when canvas loses focus — prevents stuck movement
    this._blur  = () => this.keys.clear();

    // ── Mouse ──
    this._mousedown = (e) => {
      domElement.focus(); // claim keyboard focus for this canvas
      if (e.button === 1) e.preventDefault(); // block browser autoscroll on MMB
      if (e.button === 0) this.lmbDown = true;
      if (e.button === 2) this.rmbDown = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    };
    this._mouseup   = (e) => {
      if (e.button === 0) this.lmbDown = false;
      if (e.button === 2) this.rmbDown = false;
    };
    this._mousemove = (e) => this._onMouseMove(e);

    // Scroll zoom — works on hover, no focus needed.
    // Must be non-passive so e.preventDefault() blocks the outer scrollable
    // container (#tab-examples overflow-y:auto) from stealing the event.
    this._wheel = (e) => {
      e.preventDefault();
      if (this._mode === 'fps') {
        const fwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const delta = -e.deltaY * this.moveSpeed * 0.04;
        this.camera.position.addScaledVector(fwd, delta);
      }
      // Orbit mode: OrbitControls handles wheel itself (also fires on this element)
    };

    domElement.addEventListener('keydown',     this._keydown);
    domElement.addEventListener('keyup',       this._keyup);
    domElement.addEventListener('blur',        this._blur);
    domElement.addEventListener('mousedown',   this._mousedown);
    window.addEventListener    ('mouseup',     this._mouseup);
    window.addEventListener    ('mousemove',   this._mousemove);
    domElement.addEventListener('wheel',       this._wheel, { passive: false });
    domElement.addEventListener('contextmenu', e => e.preventDefault());
  }

  get mode(): CameraMode { return this._mode; }

  setMode(mode: CameraMode) {
    if (mode === this._mode) return;
    this._mode = mode;

    if (mode === 'fps') {
      this._syncAnglesFromCamera();
      this.orbit.enabled = false;
      this.domEl.focus(); // auto-focus so WASD works immediately after switching
    } else {
      this.keys.clear();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.orbit.target.copy(this.camera.position).addScaledVector(fwd, 8);
      this.orbit.enabled = true;
      this.orbit.update();
    }
  }

  update(dt: number) {
    if (this._mode === 'orbit') {
      this.orbit.update();
      return;
    }

    // Free-fly: movement follows true camera orientation
    const sprint = this.keys.has('shift') ? 3.5 : 1.0;
    const speed  = this.moveSpeed * dt * sprint;
    const fwd    = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right  = new THREE.Vector3(1, 0,  0).applyQuaternion(this.camera.quaternion);
    const up     = new THREE.Vector3(0, 1,  0);

    const move = new THREE.Vector3();
    if (this.keys.has('w') || this.keys.has('arrowup'))    move.addScaledVector(fwd,    1);
    if (this.keys.has('s') || this.keys.has('arrowdown'))  move.addScaledVector(fwd,   -1);
    if (this.keys.has('a') || this.keys.has('arrowleft'))  move.addScaledVector(right,  -1);
    if (this.keys.has('d') || this.keys.has('arrowright')) move.addScaledVector(right,   1);
    if (this.keys.has('q') || this.keys.has(' '))          move.addScaledVector(up,      1);
    if (this.keys.has('e'))                                move.addScaledVector(up,     -1);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      this.camera.position.add(move);
    }
  }

  private _onMouseMove(e: MouseEvent) {
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    if (this._mode !== 'fps') return;

    if (this.lmbDown) {
      this.yaw   -= dx * this.lookSpeed;
      this.pitch -= dy * this.lookSpeed;
      this.pitch  = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
      this._applyAngles();
    }

    if (this.rmbDown) {
      const right    = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up       = new THREE.Vector3(0, 1, 0);
      const panSpeed = this.moveSpeed * 0.008;
      this.camera.position.addScaledVector(right, -dx * panSpeed);
      this.camera.position.addScaledVector(up,     dy * panSpeed);
    }
  }

  private _syncAnglesFromCamera() {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw   = euler.y;
    this.pitch = euler.x;
  }

  private _applyAngles() {
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);
  }

  dispose() {
    this.domEl.removeEventListener('keydown',   this._keydown);
    this.domEl.removeEventListener('keyup',     this._keyup);
    this.domEl.removeEventListener('blur',      this._blur);
    this.domEl.removeEventListener('mousedown', this._mousedown);
    window.removeEventListener    ('mouseup',   this._mouseup);
    window.removeEventListener    ('mousemove', this._mousemove);
    this.domEl.removeEventListener('wheel',     this._wheel as any);
    this.orbit.dispose();
  }
}
