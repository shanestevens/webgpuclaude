/**
 * Lightweight GUI panel — no external deps, overlaid on each canvas container.
 * Usage: const gui = new SimpleGUI(container, 'Controls');
 *        gui.addToggle('Wireframe', false, v => setWireframe(v));
 *        gui.addSlider('Speed', 1, 0, 10, 0.1, v => speed = v);
 */
export class SimpleGUI {
  readonly panel: HTMLDivElement;
  private body: HTMLDivElement;
  private minimized = false;

  constructor(container: HTMLDivElement, title = 'Controls') {
    // Ensure container is positioned for absolute children
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'position:absolute', 'top:8px', 'right:8px',
      'min-width:176px', 'max-width:220px',
      'background:rgba(8,8,18,0.82)',
      'border:1px solid rgba(255,255,255,0.13)',
      'border-radius:7px',
      'font:11px/1.4 "SF Mono",Menlo,Consolas,monospace',
      'color:#d0d0e0',
      'z-index:100',
      'user-select:none',
      'pointer-events:auto',
      'overflow:hidden',
    ].join(';');
    container.appendChild(this.panel);

    // ── Header ──
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:5px 8px 4px',
      'background:rgba(255,255,255,0.05)',
      'border-bottom:1px solid rgba(255,255,255,0.08)',
      'cursor:pointer',
      'font-size:10px',
      'letter-spacing:0.5px',
      'text-transform:uppercase',
      'color:#888',
    ].join(';');
    header.textContent = title;

    const chevron = document.createElement('span');
    chevron.textContent = '▾';
    chevron.style.cssText = 'transition:transform 0.2s;font-size:9px;';
    header.appendChild(chevron);
    header.addEventListener('click', () => {
      this.minimized = !this.minimized;
      this.body.style.display = this.minimized ? 'none' : 'block';
      chevron.style.transform = this.minimized ? 'rotate(-90deg)' : '';
    });
    this.panel.appendChild(header);

    // ── Body ──
    this.body = document.createElement('div');
    this.body.style.cssText = 'padding:4px 0;';
    this.panel.appendChild(this.body);
  }

  private row(): HTMLDivElement {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 8px;';
    this.body.appendChild(r);
    return r;
  }

  private label(text: string): HTMLSpanElement {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = 'flex:1;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    return s;
  }

  addSeparator(text?: string): this {
    const div = document.createElement('div');
    div.style.cssText = [
      'margin:3px 8px 1px',
      'padding-top:4px',
      'border-top:1px solid rgba(255,255,255,0.08)',
      'font-size:9px',
      'color:#555',
      'letter-spacing:0.4px',
      'text-transform:uppercase',
    ].join(';');
    if (text) div.textContent = text;
    this.body.appendChild(div);
    return this;
  }

  addToggle(label: string, value: boolean, onChange: (v: boolean) => void): this {
    const row = this.row();
    row.appendChild(this.label(label));

    const btn = document.createElement('button');
    let current = value;
    const update = () => {
      btn.textContent = current ? 'ON' : 'OFF';
      btn.style.background = current ? '#1a6' : '#333';
      btn.style.borderColor = current ? '#2c9' : '#555';
      btn.style.color = current ? '#fff' : '#888';
    };
    btn.style.cssText = [
      'padding:2px 8px', 'border-radius:3px', 'border:1px solid',
      'cursor:pointer', 'font:10px/1 "SF Mono",monospace',
      'transition:background 0.15s,color 0.15s',
    ].join(';');
    update();
    btn.addEventListener('click', () => {
      current = !current;
      update();
      onChange(current);
    });
    row.appendChild(btn);
    return this;
  }

  addSlider(label: string, value: number, min: number, max: number, step: number,
            onChange: (v: number) => void): this {
    const row = this.row();
    row.style.flexWrap = 'wrap';
    row.style.gap = '2px';

    const labelEl = this.label(label);
    const valEl = document.createElement('span');
    valEl.style.cssText = 'color:#7af;font-size:10px;min-width:32px;text-align:right;';
    valEl.textContent = value.toFixed(step < 1 ? 2 : 0);

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;width:100%;justify-content:space-between;';
    headerRow.appendChild(labelEl);
    headerRow.appendChild(valEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.name = `gui-slider-${label.toLowerCase().replace(/\s+/g, '-')}`;
    slider.min = String(min); slider.max = String(max); slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = [
      'width:100%', 'height:3px', 'cursor:pointer',
      'accent-color:#4af',
    ].join(';');
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valEl.textContent = v.toFixed(step < 1 ? 2 : 0);
      onChange(v);
    });

    row.appendChild(headerRow);
    row.appendChild(slider);
    return this;
  }

  addSelect(label: string, options: string[], value: string,
            onChange: (v: string) => void): this {
    const row = this.row();
    row.appendChild(this.label(label));

    const sel = document.createElement('select');
    sel.name = `gui-select-${label.toLowerCase().replace(/\s+/g, '-')}`;
    sel.style.cssText = [
      'background:#1a1a2e', 'color:#ccc', 'border:1px solid #444',
      'border-radius:3px', 'padding:2px 4px', 'font:10px/1 monospace',
      'cursor:pointer', 'max-width:90px',
    ].join(';');
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
    return this;
  }

  addButton(label: string, onClick: () => void): this {
    const row = this.row();
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'flex:1', 'padding:3px 6px', 'background:#1a1a2e',
      'color:#adf', 'border:1px solid #336', 'border-radius:3px',
      'cursor:pointer', 'font:10px/1 monospace',
    ].join(';');
    btn.addEventListener('click', onClick);
    row.appendChild(btn);
    return this;
  }

  addColor(label: string, value: string, onChange: (v: string) => void): this {
    const row = this.row();
    row.appendChild(this.label(label));
    const inp = document.createElement('input');
    inp.type = 'color'; inp.name = `gui-color-${label.toLowerCase().replace(/\s+/g, '-')}`; inp.value = value;
    inp.style.cssText = 'width:28px;height:20px;border:none;cursor:pointer;background:none;';
    inp.addEventListener('input', () => onChange(inp.value));
    row.appendChild(inp);
    return this;
  }

  /** Display a read-only text value that updates each frame */
  addText(label: string): { set: (v: string) => void } {
    const row = this.row();
    row.appendChild(this.label(label));
    const val = document.createElement('span');
    val.style.cssText = 'color:#7af;font-size:10px;';
    row.appendChild(val);
    return { set: (v: string) => { val.textContent = v; } };
  }
}
