import { GridPoint, Wall, Tool } from './types';

const CELL_PX = 20;   // pixels per grid cell at zoom=1
export const CELL_M = 0.20; // metres per grid cell (20 cm)

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function gridLengthCm(a: GridPoint, b: GridPoint): number {
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  return Math.round(Math.sqrt(dc * dc + dr * dr) * CELL_M * 100);
}

function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export class FloorPlanEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  walls: Wall[] = [];
  /** Defaults applied to every manually-drawn wall. Editable via the properties panel. */
  defaultHeight    = 2.8;
  defaultThickness = 0.18;
  private tool: Tool = 'draw';
  private drawStart: GridPoint | null = null;
  private hoverGrid: GridPoint | null = null;
  private selectedId: string | null = null;
  private undoStack: Wall[][] = [];
  private wallCounter = 0;

  // View transform
  private zoom = 1.0;
  private panX = 60;
  private panY = 60;

  // Pan state
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panBase  = { x: 0, y: 0 };

  // Drag state — whole-wall or whole-polygon move (select mode)
  // Each entry stores the wall id plus its position at drag-start so we can
  // translate by delta without accumulating rounding errors.
  private dragGroup: Array<{ id: string; origStart: GridPoint; origEnd: GridPoint }> = [];
  private dragStartPx: { x: number; y: number } | null = null;
  private dragMoved = false;

  // Drag state — endpoint resize (select mode)
  // All endpoints sharing the dragged corner position move together.
  private resizeGroup: Array<{ id: string; which: 'start' | 'end' }> = [];

  // Drag state — midpoint handle (select mode)
  // Pushes the wall by moving both endpoint groups; connected walls stretch to follow.
  private midDragGroup: Array<{ id: string; which: 'start' | 'end'; origPos: GridPoint }> = [];
  private midDragStartPx: { x: number; y: number } | null = null;
  private midDragMoved = false;

  // Hover highlight — all endpoints sharing the hovered corner
  private hoverEpGroup: Array<{ id: string; which: 'start' | 'end' }> = [];
  private hoverEp: { id: string; which: 'start' | 'end' } | null = null;
  private hoverMidId: string | null = null;

  // Snap-to-endpoint target when in draw mode
  private snapTarget: GridPoint | null = null;

  onWallsChanged?:     (walls: Wall[]) => void;
  onSelectionChanged?: (wall: Wall | null) => void;
  onDrawChainChanged?: (active: boolean) => void;
  onToolChanged?:      (tool: Tool) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    this.listen();
    this.render();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setTool(t: Tool) {
    this.tool = t;
    this.setDrawStart(null);
    this.canvas.style.cursor = t === 'draw' ? 'crosshair' : 'default';
    this.onToolChanged?.(t);
    this.render();
  }

  getTool(): Tool { return this.tool; }

  undo() {
    if (this.undoStack.length === 0) return;
    this.walls = this.undoStack.pop()!;
    const wall = this.selectedId ? (this.walls.find(w => w.id === this.selectedId) ?? null) : null;
    if (!wall) this.selectedId = null;
    this.onSelectionChanged?.(wall);
    this.emit();
    this.render();
  }

  clear() {
    if (this.walls.length === 0) return;
    this.push();
    this.walls = [];
    this.selectedId = null;
    this.setDrawStart(null);
    this.onSelectionChanged?.(null);
    this.emit();
    this.render();
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this.push();
    this.walls = this.walls.filter(w => w.id !== this.selectedId);
    this.selectedId = null;
    this.onSelectionChanged?.(null);
    this.emit();
    this.render();
  }

  fitView() {
    if (this.walls.length === 0) {
      this.zoom = 1; this.panX = 60; this.panY = 60;
      this.render(); return;
    }
    const cols = this.walls.flatMap(w => [w.start.col, w.end.col]);
    const rows = this.walls.flatMap(w => [w.start.row, w.end.row]);
    const minC = Math.min(...cols) - 3, maxC = Math.max(...cols) + 3;
    const minR = Math.min(...rows) - 3, maxR = Math.max(...rows) + 3;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.zoom = Math.min(W / ((maxC - minC) * CELL_PX), H / ((maxR - minR) * CELL_PX), 5);
    this.panX = (W - (minC + maxC) * CELL_PX * this.zoom) / 2;
    this.panY = (H - (minR + maxR) * CELL_PX * this.zoom) / 2;
    this.render();
  }

  getViewCenter(): GridPoint {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    return {
      col: Math.round((W / 2 - this.panX) / (CELL_PX * this.zoom)),
      row: Math.round((H / 2 - this.panY) / (CELL_PX * this.zoom)),
    };
  }

  /** Add a batch of walls (e.g. a room preset). Labels are auto-assigned. */
  addWalls(newWalls: Array<{ start: GridPoint; end: GridPoint }>, color?: string, roomName?: string) {
    this.push();
    for (const w of newWalls) {
      this.walls.push({ id: genId(), start: w.start, end: w.end, label: `Wall ${++this.wallCounter}`, color, roomName });
    }
    this.emit();
    this.render();
  }

  /** Update mutable properties of an existing wall without changing selection. */
  updateWall(id: string, changes: Partial<Pick<Wall, 'start' | 'end' | 'label' | 'height' | 'thickness'>>) {
    const wall = this.walls.find(w => w.id === id);
    if (!wall) return;
    this.push();
    Object.assign(wall, changes);
    this.emit();
    this.render();
  }

  getSelectedWall(): Wall | null {
    return this.selectedId ? (this.walls.find(w => w.id === this.selectedId) ?? null) : null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private push() { this.undoStack.push(this.walls.map(w => ({ ...w, start: { ...w.start }, end: { ...w.end } }))); }
  private emit() { this.onWallsChanged?.(this.walls); }

  private setDrawStart(pt: GridPoint | null) {
    const was = this.drawStart !== null;
    this.drawStart = pt;
    const now = pt !== null;
    if (was !== now) this.onDrawChainChanged?.(now);
  }

  private toGrid(cx: number, cy: number): GridPoint {
    return {
      col: Math.round((cx - this.panX) / (CELL_PX * this.zoom)),
      row: Math.round((cy - this.panY) / (CELL_PX * this.zoom)),
    };
  }

  private fromGrid(col: number, row: number) {
    return { x: col * CELL_PX * this.zoom + this.panX, y: row * CELL_PX * this.zoom + this.panY };
  }

  private hitTest(cx: number, cy: number): string | null {
    for (const w of this.walls) {
      const a = this.fromGrid(w.start.col, w.start.row);
      const b = this.fromGrid(w.end.col, w.end.row);
      if (ptSegDist(cx, cy, a.x, a.y, b.x, b.y) < 9) return w.id;
    }
    return null;
  }

  /** BFS — all walls reachable from wallId via shared endpoints. */
  private findConnectedComponent(wallId: string): Wall[] {
    const visited = new Set<string>([wallId]);
    const queue   = [wallId];
    while (queue.length > 0) {
      const id   = queue.shift()!;
      const wall = this.walls.find(w => w.id === id)!;
      for (const which of ['start', 'end'] as const) {
        const pt = wall[which];
        for (const other of this.walls) {
          if (visited.has(other.id)) continue;
          if ((other.start.col === pt.col && other.start.row === pt.row) ||
              (other.end.col   === pt.col && other.end.row   === pt.row)) {
            visited.add(other.id);
            queue.push(other.id);
          }
        }
      }
    }
    return this.walls.filter(w => visited.has(w.id));
  }

  /** A component is a closed polygon when every endpoint has at least one
   *  other wall in the same component sharing that position (no dangling ends). */
  private isClosedPolygon(walls: Wall[]): boolean {
    for (const wall of walls) {
      for (const which of ['start', 'end'] as const) {
        const pt = wall[which];
        const shared = walls.some(w =>
          w.id !== wall.id &&
          ((w.start.col === pt.col && w.start.row === pt.row) ||
           (w.end.col   === pt.col && w.end.row   === pt.row))
        );
        if (!shared) return false;
      }
    }
    return true;
  }

  /** All endpoints (across every wall) that share the given grid position. */
  private connectedEndpoints(col: number, row: number): Array<{ id: string; which: 'start' | 'end' }> {
    const out: Array<{ id: string; which: 'start' | 'end' }> = [];
    for (const w of this.walls) {
      if (w.start.col === col && w.start.row === row) out.push({ id: w.id, which: 'start' });
      if (w.end.col   === col && w.end.row   === row) out.push({ id: w.id, which: 'end'   });
    }
    return out;
  }

  /** Returns the nearest wall endpoint within grab radius, endpoint first so
   *  it takes priority over the wall body in hit-testing. */
  private hitTestEndpoint(cx: number, cy: number): { id: string; which: 'start' | 'end' } | null {
    const GRAB = 11; // px — slightly larger than the rendered dot radius
    for (const w of this.walls) {
      const a = this.fromGrid(w.start.col, w.start.row);
      const b = this.fromGrid(w.end.col,   w.end.row);
      if (Math.hypot(cx - a.x, cy - a.y) < GRAB) return { id: w.id, which: 'start' };
      if (Math.hypot(cx - b.x, cy - b.y) < GRAB) return { id: w.id, which: 'end'   };
    }
    return null;
  }

  /** Returns the wall id whose midpoint is within grab radius of (cx, cy). */
  private hitTestMidpoint(cx: number, cy: number): string | null {
    const GRAB = 10;
    for (const w of this.walls) {
      const a = this.fromGrid(w.start.col, w.start.row);
      const b = this.fromGrid(w.end.col,   w.end.row);
      if (Math.hypot(cx - (a.x + b.x) / 2, cy - (a.y + b.y) / 2) < GRAB) return w.id;
    }
    return null;
  }

  /** When drawing, returns the nearest existing wall endpoint within snap radius,
   *  so the user can connect walls precisely without relying on grid alignment. */
  private findSnapTarget(cx: number, cy: number): GridPoint | null {
    const SNAP_PX = 18;
    let best: GridPoint | null = null;
    let bestDist = Infinity;
    for (const w of this.walls) {
      for (const pt of [w.start, w.end]) {
        const p = this.fromGrid(pt.col, pt.row);
        const d = Math.hypot(cx - p.x, cy - p.y);
        if (d < SNAP_PX && d < bestDist) { bestDist = d; best = pt; }
      }
    }
    return best ? { ...best } : null;
  }

  private setSelection(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    const wall = id ? (this.walls.find(w => w.id === id) ?? null) : null;
    this.onSelectionChanged?.(wall);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private resize() {
    const ro = new ResizeObserver(() => {
      this.canvas.width  = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
      this.render();
    });
    ro.observe(this.canvas);
    this.canvas.width  = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  private listen() {
    const el = this.canvas;

    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.setDrawStart(null);
      this.render();
    });

    el.addEventListener('mousedown', e => {
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this.isPanning = true;
        this.panStart = { x: cx, y: cy };
        this.panBase  = { x: this.panX, y: this.panY };
        e.preventDefault(); return;
      }
      if (e.button !== 0) return;

      // In draw mode prefer the snap target over raw grid position
      const gp = (this.tool === 'draw' && this.snapTarget) ? this.snapTarget : this.toGrid(cx, cy);
      if (this.tool === 'draw') {
        if (!this.drawStart) {
          this.setDrawStart(gp);
        } else {
          if (gp.col !== this.drawStart.col || gp.row !== this.drawStart.row) {
            this.push();
            this.walls.push({ id: genId(), start: { ...this.drawStart }, end: gp, label: `Wall ${++this.wallCounter}`, height: this.defaultHeight, thickness: this.defaultThickness });
            this.emit();
          }
          this.setDrawStart({ ...gp });
        }
      } else {
        // Endpoint resize takes priority over whole-wall drag
        const ep = this.hitTestEndpoint(cx, cy);
        if (ep) {
          this.setSelection(ep.id);
          // Collect every endpoint sitting at the same corner so connected
          // walls resize together (e.g. all four corners of a room rectangle).
          const wall = this.walls.find(w => w.id === ep.id)!;
          const anchor = wall[ep.which];
          this.resizeGroup = this.connectedEndpoints(anchor.col, anchor.row);
          this.dragMoved   = false;
        } else {
          const midId = this.hitTestMidpoint(cx, cy);
          if (midId) {
            this.setSelection(midId);
            const wall = this.walls.find(w => w.id === midId)!;
            // Collect all endpoints at both corners so connected walls stretch
            const sg = this.connectedEndpoints(wall.start.col, wall.start.row);
            const eg = this.connectedEndpoints(wall.end.col,   wall.end.row);
            this.midDragGroup    = [...sg, ...eg].map(e => {
              const w = this.walls.find(w => w.id === e.id)!;
              return { id: e.id, which: e.which, origPos: { ...w[e.which] } };
            });
            this.midDragStartPx = { x: cx, y: cy };
            this.midDragMoved   = false;
          } else {
            const hitId = this.hitTest(cx, cy);
            this.setSelection(hitId);
            if (hitId) {
              const component = this.findConnectedComponent(hitId);
              const toMove    = this.isClosedPolygon(component) ? component : [this.walls.find(w => w.id === hitId)!];
              this.dragGroup   = toMove.map(w => ({ id: w.id, origStart: { ...w.start }, origEnd: { ...w.end } }));
              this.dragStartPx = { x: cx, y: cy };
              this.dragMoved   = false;
            }
          }
        }
      }
      this.render();
    });

    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;

      if (this.isPanning) {
        this.panX = this.panBase.x + cx - this.panStart.x;
        this.panY = this.panBase.y + cy - this.panStart.y;
        this.render(); return;
      }

      // ── Endpoint / corner resize drag ────────────────────────────────────
      if (this.resizeGroup.length > 0) {
        const gp = this.toGrid(cx, cy);
        if (!this.dragMoved) { this.push(); this.dragMoved = true; }
        for (const ep of this.resizeGroup) {
          const w = this.walls.find(w => w.id === ep.id);
          if (w) w[ep.which] = { col: gp.col, row: gp.row };
        }
        const sel = this.walls.find(w => w.id === this.selectedId) ?? null;
        this.onSelectionChanged?.(sel);
        this.emit();
        this.render();
        return;
      }

      // ── Midpoint push/pull drag ──────────────────────────────────────────
      if (this.midDragGroup.length > 0 && this.midDragStartPx) {
        const dcol = Math.round((cx - this.midDragStartPx.x) / (CELL_PX * this.zoom));
        const drow = Math.round((cy - this.midDragStartPx.y) / (CELL_PX * this.zoom));
        if (dcol !== 0 || drow !== 0 || this.midDragMoved) {
          if (!this.midDragMoved) { this.push(); this.midDragMoved = true; }
          for (const entry of this.midDragGroup) {
            const w = this.walls.find(w => w.id === entry.id);
            if (w) w[entry.which] = { col: entry.origPos.col + dcol, row: entry.origPos.row + drow };
          }
          const sel = this.walls.find(w => w.id === this.selectedId) ?? null;
          this.onSelectionChanged?.(sel);
          this.emit();
          this.render();
        }
        return;
      }

      // ── Whole-wall / whole-polygon move drag ─────────────────────────────
      if (this.dragGroup.length > 0 && this.dragStartPx) {
        const dcol = Math.round((cx - this.dragStartPx.x) / (CELL_PX * this.zoom));
        const drow = Math.round((cy - this.dragStartPx.y) / (CELL_PX * this.zoom));
        if (dcol !== 0 || drow !== 0 || this.dragMoved) {
          if (!this.dragMoved) { this.push(); this.dragMoved = true; }
          for (const entry of this.dragGroup) {
            const w = this.walls.find(w => w.id === entry.id);
            if (w) {
              w.start = { col: entry.origStart.col + dcol, row: entry.origStart.row + drow };
              w.end   = { col: entry.origEnd.col   + dcol, row: entry.origEnd.row   + drow };
            }
          }
          const sel = this.walls.find(w => w.id === this.selectedId) ?? null;
          this.onSelectionChanged?.(sel);
          this.emit();
          this.render();
        }
        return;
      }

      // ── Hover state + cursor (no drag active) ─────────────────────────────
      if (this.tool === 'select') {
        const ep     = this.hitTestEndpoint(cx, cy);
        const prevEp  = this.hoverEp;
        const prevMid = this.hoverMidId;
        this.hoverEp = ep;
        if (ep) {
          const wall   = this.walls.find(w => w.id === ep.id)!;
          const anchor = wall[ep.which];
          this.hoverEpGroup = this.connectedEndpoints(anchor.col, anchor.row);
          this.hoverMidId   = null;
          el.style.cursor   = 'crosshair';
        } else {
          this.hoverEpGroup = [];
          const mid = this.hitTestMidpoint(cx, cy);
          this.hoverMidId = mid;
          el.style.cursor = mid ? 'grab' : (this.hitTest(cx, cy) ? 'move' : 'default');
        }
        if (ep?.id !== prevEp?.id || ep?.which !== prevEp?.which || this.hoverMidId !== prevMid) this.render();
        this.hoverGrid = this.toGrid(cx, cy);
        return;
      }

      // ── Draw mode: compute snap target, then update hover ────────────────
      this.snapTarget = this.findSnapTarget(cx, cy);
      this.hoverGrid  = this.snapTarget ?? this.toGrid(cx, cy);
      this.render();
    });

    el.addEventListener('mouseup', () => {
      this.isPanning      = false;
      this.dragGroup      = [];
      this.dragStartPx    = null;
      this.resizeGroup    = [];
      this.midDragGroup   = [];
      this.midDragStartPx = null;
    });

    el.addEventListener('mouseleave', () => {
      this.hoverGrid      = null;
      this.hoverEp        = null;
      this.hoverEpGroup   = [];
      this.hoverMidId     = null;
      this.snapTarget     = null;
      this.isPanning      = false;
      this.dragGroup      = [];
      this.dragStartPx    = null;
      this.resizeGroup    = [];
      this.midDragGroup   = [];
      this.midDragStartPx = null;
      this.render();
    });

    el.addEventListener('wheel', e => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nz = Math.max(0.2, Math.min(10, this.zoom * f));
      this.panX = cx - (cx - this.panX) * (nz / this.zoom);
      this.panY = cy - (cy - this.panY) * (nz / this.zoom);
      this.zoom = nz;
      this.render();
    }, { passive: false });

    window.addEventListener('keydown', e => {
      const tab = document.getElementById('tab-designer');
      if (!tab || tab.style.display === 'none') return;
      if (e.key === 'Escape') {
        this.setTool('select'); // stops chain, switches mode, fires onToolChanged
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.tool === 'select') this.deleteSelected();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  render() {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, W, H);

    this.drawGrid(W, H);
    this.drawRoomFills();

    for (const w of this.walls) this.drawWall(w, w.id === this.selectedId);

    if (this.tool === 'draw' && this.drawStart && this.hoverGrid) {
      this.drawPreview(this.drawStart, this.hoverGrid);
    }

    if (this.hoverGrid) {
      const p = this.fromGrid(this.hoverGrid.col, this.hoverGrid.row);
      if (this.snapTarget && this.tool === 'draw') {
        // Snap indicator: green ring + filled dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#44ee88';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#44ee88';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.tool === 'draw' ? '#2255cc' : '#888888';
        ctx.fill();
      }
    }

    if (this.drawStart) {
      const p = this.fromGrid(this.drawStart.col, this.drawStart.row);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#2255cc';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(34,85,204,0.25)';
      ctx.fill();
    }
  }

  /** Fill closed same-color wall components with a semi-transparent tint. */
  private drawRoomFills() {
    const colorGroups = new Map<string, Wall[]>();
    for (const w of this.walls) {
      if (!w.color) continue;
      if (!colorGroups.has(w.color)) colorGroups.set(w.color, []);
      colorGroups.get(w.color)!.push(w);
    }

    for (const [color, walls] of colorGroups) {
      // BFS within same-color walls to find connected closed components
      const visited = new Set<string>();
      for (const startWall of walls) {
        if (visited.has(startWall.id)) continue;
        const component: Wall[] = [];
        const queue    = [startWall.id];
        const seen     = new Set<string>([startWall.id]);
        while (queue.length > 0) {
          const id   = queue.shift()!;
          const wall = walls.find(w => w.id === id)!;
          component.push(wall);
          visited.add(id);
          for (const which of ['start', 'end'] as const) {
            const pt = wall[which];
            for (const other of walls) {
              if (seen.has(other.id)) continue;
              if ((other.start.col === pt.col && other.start.row === pt.row) ||
                  (other.end.col   === pt.col && other.end.row   === pt.row)) {
                seen.add(other.id);
                queue.push(other.id);
              }
            }
          }
        }
        if (!this.isClosedPolygon(component)) continue;
        const pts = this.tracePolygon(component);
        if (!pts) continue;

        const ctx = this.ctx;
        ctx.beginPath();
        const first = this.fromGrid(pts[0].col, pts[0].row);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const p = this.fromGrid(pts[i].col, pts[i].row);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = color + '33'; // ~20% opacity tint
        ctx.fill();

        // ── Room label + area ─────────────────────────────────────────────
        const area     = this.polygonArea(pts);
        const areaStr  = area >= 1 ? `${area.toFixed(1)} m²` : `${(area * 10000).toFixed(0)} cm²`;
        const roomName = component.find(w => w.roomName)?.roomName ?? '';
        const centroid = this.polygonCentroid(pts);
        const cp       = this.fromGrid(centroid.col, centroid.row);

        // Only render if polygon is big enough on screen to show text clearly
        const screenArea = area / (CELL_M * CELL_M) * (CELL_PX * this.zoom) ** 2;
        if (screenArea < 1800) continue;

        const fontSize  = Math.max(11, Math.min(15, this.zoom * 13));
        const smallSize = Math.max(10, Math.min(13, this.zoom * 11));
        const yOffset   = roomName ? fontSize * 0.7 : 0;

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        if (roomName) {
          ctx.font      = `700 ${fontSize}px system-ui,sans-serif`;
          ctx.fillStyle = color + 'cc';
          ctx.fillText(roomName, cp.x, cp.y - yOffset);
        }
        ctx.font      = `${smallSize}px system-ui,sans-serif`;
        ctx.fillStyle = color + '99';
        ctx.fillText(areaStr, cp.x, cp.y + yOffset);
        ctx.restore();
      }
    }
  }

  private polygonCentroid(pts: GridPoint[]): { col: number; row: number } {
    return {
      col: pts.reduce((s, p) => s + p.col, 0) / pts.length,
      row: pts.reduce((s, p) => s + p.row, 0) / pts.length,
    };
  }

  /** Shoelace formula — returns area in m². */
  private polygonArea(pts: GridPoint[]): number {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].col * pts[j].row;
      area -= pts[j].col * pts[i].row;
    }
    return Math.abs(area) / 2 * CELL_M * CELL_M;
  }

  /** Trace an ordered vertex list from an unordered set of walls forming a polygon. */
  private tracePolygon(walls: Wall[]): GridPoint[] | null {
    if (walls.length === 0) return null;
    const remaining = [...walls];
    const pts: GridPoint[] = [];
    let current = remaining.shift()!;
    pts.push({ ...current.start });
    let nextPt = current.end;
    while (remaining.length > 0) {
      const idx = remaining.findIndex(w =>
        (w.start.col === nextPt.col && w.start.row === nextPt.row) ||
        (w.end.col   === nextPt.col && w.end.row   === nextPt.row)
      );
      if (idx === -1) return null;
      const wall = remaining.splice(idx, 1)[0];
      if (wall.start.col === nextPt.col && wall.start.row === nextPt.row) {
        pts.push({ ...wall.start });
        nextPt = wall.end;
      } else {
        pts.push({ ...wall.end });
        nextPt = wall.start;
      }
    }
    return pts;
  }

  private drawGrid(W: number, H: number) {
    const ctx = this.ctx;
    const step = CELL_PX * this.zoom;
    const sC = Math.floor(-this.panX / step) - 1;
    const sR = Math.floor(-this.panY / step) - 1;
    const eC = Math.ceil((W - this.panX) / step) + 1;
    const eR = Math.ceil((H - this.panY) / step) + 1;

    // Minor lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 0.5;
    for (let c = sC; c <= eC; c++) { const x = c * step + this.panX; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let r = sR; r <= eR; r++) { const y = r * step + this.panY; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Major lines (every 5 cells = 1 m)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let c = sC; c <= eC; c++) {
      if (c % 5 !== 0) continue;
      const x = c * step + this.panX; ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let r = sR; r <= eR; r++) {
      if (r % 5 !== 0) continue;
      const y = r * step + this.panY; ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();

    // Meter labels at major intersections when zoomed in enough
    if (this.zoom >= 0.8) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = `${Math.min(10, this.zoom * 9)}px system-ui,sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let c = sC; c <= eC; c += 5) {
        if (c === 0) continue;
        const x = c * step + this.panX;
        const y = this.panY + 2;
        ctx.fillText(`${(c * CELL_M).toFixed(1)}m`, x + 2, y);
      }
    }
  }

  private drawWall(w: Wall, selected: boolean) {
    const ctx = this.ctx;
    const a = this.fromGrid(w.start.col, w.start.row);
    const b = this.fromGrid(w.end.col,   w.end.row);

    const wallColor = w.color ?? '#111111';
    const dotColor  = w.color ?? '#444444';

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = selected ? '#2255cc' : wallColor;
    ctx.lineWidth   = selected ? 6 : 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 45) {
      const cm  = gridLengthCm(w.start, w.end);
      const lbl = cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm} cm`;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const flip = ang > Math.PI / 2 || ang < -Math.PI / 2;
      const nx = -Math.sin(ang) * 14, ny = Math.cos(ang) * 14;

      ctx.save();
      ctx.translate(mx + nx, my + ny);
      ctx.rotate(flip ? ang + Math.PI : ang);
      ctx.font = `${Math.max(9, Math.min(12, this.zoom * 10))}px system-ui,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(lbl).width + 6;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-tw / 2, -8, tw, 16);
      ctx.fillStyle = selected ? '#2255cc' : '#333333';
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    }

    for (const [pt, which] of [[a, 'start'], [b, 'end']] as const) {
      const isHoveredEp = this.hoverEpGroup.some(e => e.id === w.id && e.which === which);
      const isResizing  = this.resizeGroup.some( e => e.id === w.id && e.which === which);
      const highlight   = isHoveredEp || isResizing;
      const radius      = highlight ? 7 : (selected ? 4.5 : 3.5);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = highlight ? '#ff8844' : (selected ? '#2255cc' : dotColor);
      ctx.fill();
      if (highlight) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,136,68,0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // ── Midpoint handle (diamond) ─────────────────────────────────────────
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const isMidHover  = this.hoverMidId === w.id;
    const isMidDrag   = this.midDragGroup.some(e => e.id === w.id);
    if (selected || isMidHover || isMidDrag) {
      const s = isMidHover || isMidDrag ? 7 : 5;
      ctx.beginPath();
      ctx.moveTo(mx,     my - s);
      ctx.lineTo(mx + s, my    );
      ctx.lineTo(mx,     my + s);
      ctx.lineTo(mx - s, my    );
      ctx.closePath();
      ctx.fillStyle = isMidHover || isMidDrag ? '#ff8844' : '#2255cc';
      ctx.fill();
      if (isMidHover || isMidDrag) {
        ctx.strokeStyle = 'rgba(255,136,68,0.45)';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }
  }

  private drawPreview(start: GridPoint, end: GridPoint) {
    const ctx = this.ctx;
    const a = this.fromGrid(start.col, start.row);
    const b = this.fromGrid(end.col,   end.row);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(34,85,204,0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 7]);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);

    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 30) {
      const cm  = gridLengthCm(start, end);
      const lbl = cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm} cm`;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const flip = ang > Math.PI / 2 || ang < -Math.PI / 2;
      const nx = -Math.sin(ang) * 14, ny = Math.cos(ang) * 14;

      ctx.save();
      ctx.translate(mx + nx, my + ny);
      ctx.rotate(flip ? ang + Math.PI : ang);
      ctx.font = '10px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(34,85,204,0.85)';
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    }
  }
}
