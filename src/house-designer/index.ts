import { FloorPlanEditor, CELL_M } from './FloorPlanEditor';
import { Preview3D }               from './Preview3D';
import { Tool, Wall }              from './types';

const DEFAULT_WALL_HEIGHT    = 2.8;
const DEFAULT_WALL_THICKNESS = 0.18;

const ROOM_PRESETS = [
  { name: 'Living',  wm: 6.0, hm: 4.5, color: '#d4895a' }, // warm terracotta
  { name: 'Bedroom', wm: 4.0, hm: 3.5, color: '#5a85d4' }, // soft blue
  { name: 'Kitchen', wm: 3.5, hm: 3.0, color: '#5ab87a' }, // fresh green
  { name: 'Bath',    wm: 2.5, hm: 2.5, color: '#5ab8b8' }, // teal
];

export class HouseDesigner {
  private editor!: FloorPlanEditor;
  private preview!: Preview3D;
  private activeBtn: HTMLButtonElement | null = null;

  constructor(private root: HTMLElement) {}

  async init() {
    this.root.innerHTML = '';
    this.buildLayout();

    const canvas    = this.root.querySelector<HTMLCanvasElement>('#fp-canvas')!;
    const preview3d = this.root.querySelector<HTMLDivElement>('#preview3d')!;
    const countEl   = this.root.querySelector<HTMLSpanElement>('#wall-count')!;

    const drawStatus = this.root.querySelector<HTMLElement>('#draw-status')!;

    this.editor = new FloorPlanEditor(canvas);
    this.editor.onWallsChanged = walls => {
      this.preview.updateWalls(walls);
      countEl.textContent = `Walls: ${walls.length}`;
    };
    this.editor.onDrawChainChanged = active => {
      drawStatus.style.display = active ? 'inline' : 'none';
    };

    this.preview = new Preview3D(preview3d);
    await this.preview.init();

    this.wireToolbar();
    this.wireRooms();
    this.wireProperties();
  }

  dispose() {
    this.preview?.dispose();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private buildLayout() {
    this.root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const roomBtns = ROOM_PRESETS.map(r => {
      const wCells = Math.round(r.wm / CELL_M);
      const hCells = Math.round(r.hm / CELL_M);
      const wLabel = (wCells * CELL_M).toFixed(1);
      const hLabel = (hCells * CELL_M).toFixed(1);
      return `<button class="hd-room-btn" data-w="${wCells}" data-h="${hCells}" data-color="${r.color}" data-name="${r.name}"
                style="border-left: 3px solid ${r.color};">
        <span class="hd-room-name">${r.name}</span>
        <span class="hd-room-dim">${wLabel} m × ${hLabel} m</span>
      </button>`;
    }).join('');

    this.root.innerHTML = `
<div class="hd-bar">
  <div class="hd-group">
    <button id="tool-draw"   class="hd-btn tool">✏ Draw</button>
    <button id="tool-select" class="hd-btn tool">↖ Select</button>
  </div>
  <div class="hd-sep"></div>
  <div class="hd-group">
    <button id="tool-undo"   class="hd-btn">↩ Undo</button>
    <button id="tool-delete" class="hd-btn danger">✕ Delete</button>
    <button id="tool-clear"  class="hd-btn danger">⊘ Clear</button>
  </div>
  <div class="hd-sep"></div>
  <div class="hd-group">
    <button id="tool-fit" class="hd-btn">⊡ Fit view</button>
    <span id="wall-count" class="hd-count">Walls: 0</span>
  </div>
  <span class="hd-hint">Draw: click to place points · chains automatically · Escape or right-click to stop · Scroll/Alt+drag to pan</span>
</div>

<div class="hd-panels">
  <div class="hd-panel">
    <div class="hd-panel-title">Quick Add Rooms</div>
    <div class="hd-rooms">${roomBtns}</div>
  </div>
  <div class="hd-panel-vsep"></div>
  <div class="hd-panel hd-panel-props">
    <div class="hd-panel-title">Properties <span id="hd-props-subtitle" style="font-weight:400;color:#444;font-size:11px;">· drawing defaults</span></div>
    <div id="hd-props-form" style="display:flex">
      <div class="hd-prop-label-row">
        <span class="hd-prop-lbl">Label</span>
        <input id="prop-label" type="text" class="hd-prop-input hd-prop-text" placeholder="no wall selected" disabled />
      </div>
      <div class="hd-props-grid">
        <div class="hd-prop-col"><span class="hd-prop-lbl">Start X</span><input id="prop-sx" type="number" step="0.2" class="hd-prop-input" disabled /></div>
        <div class="hd-prop-col"><span class="hd-prop-lbl">Start Y</span><input id="prop-sy" type="number" step="0.2" class="hd-prop-input" disabled /></div>
        <div class="hd-prop-col"><span class="hd-prop-lbl">End X</span><input id="prop-ex" type="number" step="0.2" class="hd-prop-input" disabled /></div>
        <div class="hd-prop-col"><span class="hd-prop-lbl">End Y</span><input id="prop-ey" type="number" step="0.2" class="hd-prop-input" disabled /></div>
        <div class="hd-prop-col"><span class="hd-prop-lbl">Wall height</span><input id="prop-h" type="number" step="0.1" min="0.5" max="10" class="hd-prop-input" /></div>
        <div class="hd-prop-col"><span class="hd-prop-lbl">Wall thickness</span><input id="prop-t" type="number" step="0.01" min="0.05" max="1" class="hd-prop-input" /></div>
      </div>
    </div>
  </div>
</div>

<div class="hd-body">
  <div class="hd-pane">
    <div class="hd-pane-title">2D Floor Plan <span class="hd-pane-sub">· 1 grid cell = 20 cm · major lines = 1 m</span><span id="draw-status" style="margin-left:10px;font-size:11px;color:#5a9aff;display:none;">● drawing — Escape to stop</span></div>
    <canvas id="fp-canvas"></canvas>
  </div>
  <div class="hd-divider"></div>
  <div class="hd-pane">
    <div class="hd-pane-title">3D Preview <span class="hd-pane-sub">· Drag to orbit · Scroll to zoom</span></div>
    <div id="preview3d"></div>
  </div>
</div>`;
  }

  // ── Toolbar wiring ────────────────────────────────────────────────────────

  private wireToolbar() {
    const q = (id: string) => this.root.querySelector(`#${id}`)!;

    const setTool = (tool: Tool, btn: HTMLButtonElement) => {
      this.editor.setTool(tool);
      this.activeBtn?.classList.remove('active');
      btn.classList.add('active');
      this.activeBtn = btn;
    };

    const drawBtn   = q('tool-draw')   as HTMLButtonElement;
    const selectBtn = q('tool-select') as HTMLButtonElement;

    drawBtn.addEventListener('click',   () => setTool('draw',   drawBtn));
    selectBtn.addEventListener('click', () => setTool('select', selectBtn));

    // Keep button highlight in sync when the tool changes internally (e.g. Escape key).
    this.editor.onToolChanged = tool => {
      const btn = tool === 'draw' ? drawBtn : selectBtn;
      this.activeBtn?.classList.remove('active');
      btn.classList.add('active');
      this.activeBtn = btn;
    };
    q('tool-undo').addEventListener('click',   () => this.editor.undo());
    q('tool-delete').addEventListener('click', () => this.editor.deleteSelected());
    q('tool-clear').addEventListener('click',  () => this.editor.clear());
    q('tool-fit').addEventListener('click',    () => this.editor.fitView());

    drawBtn.classList.add('active');
    this.activeBtn = drawBtn;
  }

  // ── Room presets ──────────────────────────────────────────────────────────

  private wireRooms() {
    this.root.querySelectorAll<HTMLButtonElement>('.hd-room-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wCells = parseInt(btn.dataset.w ?? '0');
        const hCells = parseInt(btn.dataset.h ?? '0');
        const color  = btn.dataset.color;
        if (!wCells || !hCells) return;
        const { col: c, row: r } = this.editor.getViewCenter();
        const c0 = c - Math.floor(wCells / 2);
        const r0 = r - Math.floor(hCells / 2);
        const roomName = btn.dataset.name;
        this.editor.addWalls([
          { start: { col: c0,          row: r0          }, end: { col: c0 + wCells, row: r0          } },
          { start: { col: c0 + wCells, row: r0          }, end: { col: c0 + wCells, row: r0 + hCells } },
          { start: { col: c0 + wCells, row: r0 + hCells }, end: { col: c0,          row: r0 + hCells } },
          { start: { col: c0,          row: r0 + hCells }, end: { col: c0,          row: r0          } },
        ], color, roomName);
      });
    });
  }

  // ── Properties panel ─────────────────────────────────────────────────────

  private wireProperties() {
    const q = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;

    const subtitle = q<HTMLElement>('hd-props-subtitle');
    const inputs = {
      label: q<HTMLInputElement>('prop-label'),
      sx:    q<HTMLInputElement>('prop-sx'),
      sy:    q<HTMLInputElement>('prop-sy'),
      ex:    q<HTMLInputElement>('prop-ex'),
      ey:    q<HTMLInputElement>('prop-ey'),
      h:     q<HTMLInputElement>('prop-h'),
      t:     q<HTMLInputElement>('prop-t'),
    };

    const coordInputs = [inputs.sx, inputs.sy, inputs.ex, inputs.ey, inputs.label];

    // Populate with drawing defaults initially
    inputs.h.value = this.editor.defaultHeight.toFixed(2);
    inputs.t.value = this.editor.defaultThickness.toFixed(2);

    let currentId: string | null = null;

    const showWall = (wall: Wall | null) => {
      if (!wall) {
        currentId = null;
        subtitle.textContent = '· drawing defaults';
        coordInputs.forEach(i => { i.disabled = true; i.value = ''; });
        inputs.label.placeholder = 'no wall selected';
        // Keep h/t showing current defaults
        if (document.activeElement !== inputs.h) inputs.h.value = this.editor.defaultHeight.toFixed(2);
        if (document.activeElement !== inputs.t) inputs.t.value = this.editor.defaultThickness.toFixed(2);
        return;
      }
      currentId = wall.id;
      subtitle.textContent = `· ${wall.label ?? wall.id}`;
      coordInputs.forEach(i => { i.disabled = false; });
      inputs.label.placeholder = '';
      if (document.activeElement !== inputs.label) inputs.label.value = wall.label ?? '';
      if (document.activeElement !== inputs.sx)    inputs.sx.value = (wall.start.col * CELL_M).toFixed(1);
      if (document.activeElement !== inputs.sy)    inputs.sy.value = (wall.start.row * CELL_M).toFixed(1);
      if (document.activeElement !== inputs.ex)    inputs.ex.value = (wall.end.col   * CELL_M).toFixed(1);
      if (document.activeElement !== inputs.ey)    inputs.ey.value = (wall.end.row   * CELL_M).toFixed(1);
      if (document.activeElement !== inputs.h)     inputs.h.value  = (wall.height    ?? DEFAULT_WALL_HEIGHT).toFixed(2);
      if (document.activeElement !== inputs.t)     inputs.t.value  = (wall.thickness ?? DEFAULT_WALL_THICKNESS).toFixed(2);
    };

    this.editor.onSelectionChanged = showWall;

    const applyChanges = () => {
      const h = parseFloat(inputs.h.value);
      const t = parseFloat(inputs.t.value);

      if (!currentId) {
        // No selection — update drawing defaults
        if (!isNaN(h)) this.editor.defaultHeight    = h;
        if (!isNaN(t)) this.editor.defaultThickness = t;
        return;
      }

      const sx = parseFloat(inputs.sx.value);
      const sy = parseFloat(inputs.sy.value);
      const ex = parseFloat(inputs.ex.value);
      const ey = parseFloat(inputs.ey.value);
      if ([sx, sy, ex, ey, h, t].some(isNaN)) return;
      this.editor.updateWall(currentId, {
        label:     inputs.label.value.trim() || undefined,
        start:     { col: Math.round(sx / CELL_M), row: Math.round(sy / CELL_M) },
        end:       { col: Math.round(ex / CELL_M), row: Math.round(ey / CELL_M) },
        height:    h,
        thickness: t,
      });
      const updated = this.editor.getSelectedWall();
      if (updated) showWall(updated);
    };

    for (const input of Object.values(inputs)) {
      input.addEventListener('change', applyChanges);
    }
  }
}
