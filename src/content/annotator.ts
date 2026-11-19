import css from './styles.css';
import { AnchorResolver, docRect, findAnchor } from './anchor';
import {
  arrowPath,
  hitTest,
  rectFrom,
  shapeBounds,
  shouldAddPoint,
  snapAngle,
  strokePath,
  type Box,
} from './geometry';
import { grip, icon, type IconName } from './icons';
import { loadPrefs, loadShapes, pageKey, savePrefs, saveShapes, type Prefs } from './storage';
import type { Point, Shape, TextShape, Tool, ToggleSource } from '../types';

export const COLORS = [
  { name: 'Red', value: '#E5484D' },
  { name: 'Yellow', value: '#FFC53D' },
  { name: 'Green', value: '#30A46C' },
  { name: 'Blue', value: '#0090FF' },
  { name: 'Black', value: '#1C1C1F' },
] as const;

const WIDTH = { pen: 3, highlighter: 18, arrow: 3, rect: 2.5 } as const;
const HISTORY_LIMIT = 200;
const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAW_TOOLS: Tool[] = ['pen', 'highlighter', 'arrow', 'rect', 'text', 'eraser'];

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
export const TOGGLE_LABEL = IS_MAC ? '⌥⇧A' : 'Alt+Shift+A';

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'interact', icon: 'interact', label: 'Use the page', key: 'V' },
  { tool: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
  { tool: 'highlighter', icon: 'highlighter', label: 'Highlighter', key: 'H' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'text', icon: 'text', label: 'Text note', key: 'T' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
];

const DEFAULT_PREFS: Prefs = { tool: 'pen', color: COLORS[0].value, position: null };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const round = (n: number) => Math.round(n * 10) / 10;
const docPoint = (e: { clientX: number; clientY: number }): Point => [
  round(e.clientX + window.scrollX),
  round(e.clientY + window.scrollY),
];

/** Readable text on a note: dark ink on light swatches, white on the rest. */
function noteInk(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#1C1C1F' : '#FFFFFF';
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

function cursorFor(tool: Tool, color: string): string | null {
  const url = (svg: string, size: number) =>
    `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${size / 2} ${size / 2}`;
  if (tool === 'pen') {
    return `${url(`<svg xmlns="${SVG_NS}" width="16" height="16"><circle cx="8" cy="8" r="4.6" fill="none" stroke="rgba(0,0,0,.28)" stroke-width=".8"/><circle cx="8" cy="8" r="3" fill="${color}" stroke="#fff" stroke-width="1.4"/></svg>`, 16)}, crosshair`;
  }
  if (tool === 'highlighter') {
    return `${url(`<svg xmlns="${SVG_NS}" width="22" height="22"><circle cx="11" cy="11" r="9" fill="${color}" fill-opacity=".35" stroke="${color}" stroke-width="1"/></svg>`, 22)}, crosshair`;
  }
  if (tool === 'eraser') {
    return `${url(`<svg xmlns="${SVG_NS}" width="20" height="20"><circle cx="10" cy="10" r="7.5" fill="rgba(255,255,255,.85)" stroke="#1C1C1F" stroke-width="1.2"/></svg>`, 20)}, crosshair`;
  }
  return null;
}

interface Rendered {
  shape: Shape;
  el: SVGElement | HTMLElement;
}

interface Draft {
  pointerId: number;
  start: Point;
  shape: Shape;
  el: SVGElement;
}

interface Editing {
  el: HTMLElement;
  at: Point;
  existing?: TextShape;
  done: boolean;
}

export class Annotator {
  active = false;
  shapes: Shape[] = [];

  private key = pageKey();
  private prefs: Prefs = { ...DEFAULT_PREFS };
  private past: Shape[][] = [];
  private future: Shape[][] = [];

  private host!: HTMLElement;
  private root!: ShadowRoot;
  private svg!: SVGSVGElement;
  private notes!: HTMLElement;
  private capture!: HTMLElement;
  private bar!: HTMLElement;
  private tip!: HTMLElement;
  private built = false;

  private rendered = new Map<string, Rendered>();
  private offsets = new Map<string, Point>();
  private resolver = new AnchorResolver();
  private draft: Draft | null = null;
  private erasing: { pointerId: number; ids: Set<string> } | null = null;
  private hovered: string | null = null;
  private editing: Editing | null = null;

  private layoutFrame = 0;
  private saveTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  constructor(private onState: (active: boolean, count: number) => void) {}

  async init(): Promise<void> {
    const [prefs, shapes] = await Promise.all([loadPrefs(DEFAULT_PREFS), loadShapes(this.key)]);
    this.prefs = prefs;
    if (!DRAW_TOOLS.includes(this.prefs.tool) && this.prefs.tool !== 'interact') this.prefs.tool = 'pen';
    this.shapes = shapes;
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('pagehide', () => this.flushSave());
    document.addEventListener('visibilitychange', () => document.hidden && this.flushSave());
    this.report();
  }

  // ---------------------------------------------------------------- lifecycle

  toggle(source: ToggleSource): void {
    this.setActive(!this.active, source);
  }

  setActive(on: boolean, source: ToggleSource = 'action'): void {
    if (on === this.active) return;
    if (on) {
      this.build();
      if (!this.host.isConnected) document.documentElement.append(this.host);
      this.active = true;
      this.host.style.setProperty('display', 'block', 'important');
      this.setTool(this.prefs.tool, false);
      // Keyboard toggles happen dozens of times a session: show the bar instantly.
      // A click on the toolbar icon gets a short entrance so the eye finds it.
      this.bar.classList.toggle('enter', source === 'action');
      this.placeBar();
      this.observe(true);
      this.render();
      this.layoutNow();
    } else {
      this.finishEditing();
      this.cancelDraft();
      this.hideTip();
      this.active = false;
      this.observe(false);
      this.host.style.setProperty('display', 'none', 'important');
      this.flushSave();
    }
    this.report();
  }

  /** SPA navigation: swap to the annotations saved for the new URL. */
  async changePage(): Promise<void> {
    const next = pageKey();
    if (next === this.key) return;
    this.finishEditing();
    this.cancelDraft();
    this.flushSave();
    this.key = next;
    this.past = [];
    this.future = [];
    this.shapes = await loadShapes(next);
    this.resolver.reset();
    if (this.built) this.render();
    this.layoutNow();
    this.report();
  }

  private report(): void {
    this.onState(this.active, this.shapes.length);
    if (this.built) this.syncButtons();
  }

  // ---------------------------------------------------------------- DOM

  private build(): void {
    if (this.built) return;
    this.built = true;

    const host = document.createElement('review-annotator');
    const s = host.style;
    for (const [prop, value] of Object.entries({
      all: 'initial',
      position: 'absolute',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      overflow: 'visible',
      'z-index': '2147483647',
      'pointer-events': 'none',
      display: 'none',
      contain: 'style',
    })) {
      s.setProperty(prop, value, 'important');
    }
    this.host = host;
    this.root = host.attachShadow({ mode: 'open' });

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      this.root.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = css;
      this.root.append(style);
    }

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('layer');
    this.svg.setAttribute('aria-hidden', 'true');

    this.notes = document.createElement('div');
    this.notes.className = 'notes';

    this.capture = document.createElement('div');
    this.capture.className = 'capture';
    this.capture.addEventListener('pointerdown', this.onPointerDown);
    this.capture.addEventListener('pointermove', this.onPointerMove);
    this.capture.addEventListener('pointerup', this.onPointerUp);
    this.capture.addEventListener('pointercancel', this.onPointerUp);
    this.capture.addEventListener('pointerleave', () => this.setHovered(null));
    this.capture.addEventListener('contextmenu', (e) => this.draft && e.preventDefault());

    this.notes.addEventListener('pointerdown', (e) => {
      if (this.prefs.tool !== 'text') return;
      const id = (e.target as HTMLElement).closest<HTMLElement>('.note')?.dataset.id;
      const shape = this.shapes.find((sh): sh is TextShape => sh.id === id && sh.kind === 'text');
      if (!shape || this.editing?.existing?.id === shape.id) return;
      e.preventDefault();
      this.finishEditing();
      this.startEditing(shape);
    });

    this.bar = this.buildBar();
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    this.tip.setAttribute('role', 'tooltip');

    this.root.append(this.svg, this.capture, this.notes, this.bar, this.tip);
  }

  private buildBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Annotation tools');
    bar.addEventListener('animationend', () => bar.classList.remove('enter'));
    // Keep page-level handlers (and text selection) from reacting to toolbar clicks.
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('mousedown', (e) => e.preventDefault());

    const gripEl = document.createElement('div');
    gripEl.className = 'grip';
    gripEl.innerHTML = grip;
    gripEl.title = '';
    this.makeDraggable(gripEl, bar);
    bar.append(gripEl);

    const button = (name: IconName, label: string, kbd: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.innerHTML = icon(name);
      b.dataset.tip = label;
      b.dataset.kbd = kbd;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', onClick);
      this.withTip(b);
      return b;
    };
    const sep = () => {
      const d = document.createElement('div');
      d.className = 'sep';
      return d;
    };

    for (const t of TOOLS) {
      const b = button(t.icon, t.label, t.key, () => this.setTool(t.tool));
      b.dataset.tool = t.tool;
      b.setAttribute('aria-pressed', 'false');
      bar.append(b);
    }

    bar.append(sep());
    const colors = document.createElement('div');
    colors.setAttribute('role', 'radiogroup');
    colors.setAttribute('aria-label', 'Color');
    colors.style.display = 'flex';
    COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c.name);
      b.dataset.color = c.value;
      b.dataset.tip = c.name;
      b.dataset.kbd = String(i + 1);
      b.style.setProperty('--c', c.value);
      b.innerHTML = '<span class="dot"></span>';
      b.addEventListener('click', () => this.setColor(c.value));
      this.withTip(b);
      colors.append(b);
    });
    bar.append(colors);

    bar.append(sep());
    const undo = button('undo', 'Undo', `${MOD}Z`, () => this.undo());
    undo.dataset.action = 'undo';
    const redo = button('redo', 'Redo', IS_MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z', () => this.redo());
    redo.dataset.action = 'redo';
    const clear = button('clear', 'Clear page', '', () => this.clear());
    clear.dataset.action = 'clear';
    bar.append(undo, redo, clear);

    bar.append(sep());
    const close = button('close', 'Turn off', TOGGLE_LABEL, () => this.setActive(false));
    close.dataset.action = 'close';
    bar.append(close);
    return bar;
  }

  private syncButtons(): void {
    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === this.prefs.tool));
    }
    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-color]')) {
      b.setAttribute('aria-checked', String(b.dataset.color === this.prefs.color));
    }
    const q = (a: string) => this.bar.querySelector<HTMLButtonElement>(`[data-action="${a}"]`)!;
    q('undo').disabled = this.past.length === 0;
    q('redo').disabled = this.future.length === 0;
    q('clear').disabled = this.shapes.length === 0;
  }

  // ---------------------------------------------------------------- tooltips

  private tipTimer = 0;
  private tipHiddenAt = 0;
  private tipOpen = false;

  private withTip(el: HTMLElement): void {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(this.tipTimer);
      // First tooltip waits; neighbours open instantly while the user scans the bar.
      const warm = this.tipOpen || performance.now() - this.tipHiddenAt < 400;
      if (warm) this.showTip(el, true);
      else this.tipTimer = window.setTimeout(() => this.showTip(el, false), 450);
    });
    el.addEventListener('pointerleave', () => this.hideTip());
    el.addEventListener('pointerdown', () => this.hideTip());
    el.addEventListener('focus', () => el.matches(':focus-visible') && this.showTip(el, true));
    el.addEventListener('blur', () => this.hideTip());
  }

  private showTip(el: HTMLElement, instant: boolean): void {
    const { tip } = this;
    tip.textContent = el.dataset.tip ?? '';
    if (el.dataset.kbd) {
      const k = document.createElement('kbd');
      k.textContent = el.dataset.kbd;
      tip.append(k);
    }
    tip.classList.toggle('instant', instant);
    tip.classList.remove('show');
    const b = el.getBoundingClientRect();
    const bar = this.bar.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, b.left + b.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    const above = bar.top - t.height - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${above > 8 ? above : bar.bottom + 8}px`;
    void tip.offsetWidth;
    tip.classList.add('show');
    this.tipOpen = true;
  }

  private hideTip(): void {
    clearTimeout(this.tipTimer);
    if (!this.tipOpen) return;
    this.tipOpen = false;
    this.tipHiddenAt = performance.now();
    this.tip.classList.add('instant');
    this.tip.classList.remove('show');
  }

  // ---------------------------------------------------------------- toolbar drag

  private makeDraggable(handle: HTMLElement, bar: HTMLElement): void {
    let start: { x: number; y: number; left: number; top: number; id: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if (start || e.button !== 0) return;
      const r = bar.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, id: e.pointerId };
      handle.setPointerCapture(e.pointerId);
      bar.classList.add('dragging');
      this.hideTip();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      this.prefs.position = { x: start.left + e.clientX - start.x, y: start.top + e.clientY - start.y };
      this.placeBar();
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      bar.classList.remove('dragging');
      savePrefs(this.prefs);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // Double-click the grip to send the bar home.
    handle.addEventListener('dblclick', () => {
      this.prefs.position = null;
      this.placeBar();
      savePrefs(this.prefs);
    });
  }

  private placeBar(): void {
    const pos = this.prefs.position;
    const bar = this.bar;
    if (!pos) {
      bar.classList.remove('placed');
      bar.style.left = bar.style.top = '';
      return;
    }
    bar.classList.add('placed');
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    const x = Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - w - 8));
    const y = Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - h - 8));
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
  }

  // ---------------------------------------------------------------- tools & history

  setTool(tool: Tool, persist = true): void {
    if (tool !== 'text') this.finishEditing();
    this.cancelDraft();
    this.setHovered(null);
    this.prefs.tool = tool;
    this.host.dataset.tool = tool;
    this.updateCursor();
    this.syncButtons();
    if (persist) savePrefs(this.prefs);
  }

  setColor(color: string): void {
    this.prefs.color = color;
    this.updateCursor();
    this.syncButtons();
    savePrefs(this.prefs);
  }

  private updateCursor(): void {
    this.capture.style.cursor = cursorFor(this.prefs.tool, this.prefs.color) ?? '';
  }

  private commit(next: Shape[]): void {
    this.past.push(this.shapes);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.apply(next);
  }

  private apply(next: Shape[]): void {
    this.shapes = next;
    this.render();
    this.layoutNow();
    this.scheduleSave();
    this.report();
  }

  undo(): void {
    this.finishEditing();
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.shapes);
    this.apply(prev);
  }

  redo(): void {
    this.finishEditing();
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.shapes);
    this.apply(next);
  }

  clear(): void {
    this.finishEditing();
    if (this.shapes.length) this.commit([]);
  }

  // ---------------------------------------------------------------- persistence

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flushSave(), 250);
  }

  private flushSave(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    void saveShapes(this.key, this.shapes);
  }

  // ---------------------------------------------------------------- rendering

  private createElement(shape: Shape): SVGElement | HTMLElement {
    if (shape.kind === 'text') {
      const el = document.createElement('div');
      el.className = 'note';
      el.dataset.id = shape.id;
      el.textContent = shape.text;
      el.style.left = `${shape.x}px`;
      el.style.top = `${shape.y}px`;
      el.style.setProperty('--note-bg', shape.color);
      el.style.setProperty('--note-fg', noteInk(shape.color));
      return el;
    }
    const el = document.createElementNS(SVG_NS, shape.kind === 'rect' ? 'rect' : 'path');
    el.setAttribute('stroke', shape.color);
    el.setAttribute('stroke-width', String(shape.width));
    el.dataset.id = shape.id;
    this.updateGeometry(el, shape);
    if (shape.kind === 'highlighter') el.classList.add('highlighter');
    return el;
  }

  private updateGeometry(el: SVGElement, shape: Shape): void {
    switch (shape.kind) {
      case 'pen':
      case 'highlighter':
        el.setAttribute('d', strokePath(shape.points));
        break;
      case 'arrow':
        el.setAttribute('d', arrowPath(shape.from, shape.to, shape.width));
        break;
      case 'rect':
        el.setAttribute('x', String(shape.x));
        el.setAttribute('y', String(shape.y));
        el.setAttribute('width', String(shape.w));
        el.setAttribute('height', String(shape.h));
        el.setAttribute('rx', '3');
        break;
      case 'text':
        break;
    }
  }

  /** Sync DOM nodes with `this.shapes`: create new, drop removed, keep z-order. */
  private render(): void {
    if (!this.built) return;
    const keep = new Set<string>();
    for (const shape of this.shapes) {
      keep.add(shape.id);
      if (this.editing?.existing?.id === shape.id) continue;
      const existing = this.rendered.get(shape.id);
      if (existing && existing.shape === shape) {
        existing.el.parentNode!.append(existing.el); // re-append keeps stacking order after undo
        continue;
      }
      existing?.el.remove();
      const el = this.createElement(shape);
      (shape.kind === 'text' ? this.notes : this.svg).append(el);
      this.rendered.set(shape.id, { shape, el });
    }
    for (const [id, r] of this.rendered) {
      if (!keep.has(id)) {
        r.el.remove();
        this.rendered.delete(id);
      }
    }
    if (this.draft) this.svg.append(this.draft.el);
  }

  // ---------------------------------------------------------------- anchoring / layout

  private observe(on: boolean): void {
    if (on) {
      window.addEventListener('resize', this.onResize);
      document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
      window.addEventListener('load', this.scheduleLayout);
      this.resizeObserver = new ResizeObserver(this.scheduleLayout);
      this.resizeObserver.observe(document.documentElement);
      if (document.body) this.resizeObserver.observe(document.body);
      this.mutationObserver = new MutationObserver(this.onMutation);
      this.mutationObserver.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
      void document.fonts?.ready.then(this.scheduleLayout);
    } else {
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('scroll', this.onScroll, { capture: true });
      window.removeEventListener('load', this.scheduleLayout);
      this.resizeObserver?.disconnect();
      this.mutationObserver?.disconnect();
      this.resizeObserver = this.mutationObserver = null;
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = 0;
    }
  }

  private onResize = () => {
    if (this.prefs.position) this.placeBar();
    this.scheduleLayout();
  };

  private onScroll = (e: Event) => {
    // Document scrolling needs no work: the layer is in document space and moves
    // with the page natively. Inner scroll containers move their contents, so
    // anything anchored inside them has to follow.
    if (e.target !== document && e.target !== document.documentElement) this.scheduleLayout();
  };

  private onMutation = (records: MutationRecord[]) => {
    if (records.every((r) => r.target === this.host || this.host.contains(r.target))) return;
    this.resolver.reset();
    this.scheduleLayout();
    // Some frameworks replace <html> children wholesale; put the layer back.
    if (!this.host.isConnected) document.documentElement.append(this.host);
  };

  private scheduleLayout = () => {
    if (!this.active || this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.layoutNow();
    });
  };

  private layoutNow(): void {
    if (!this.active || !this.built) return;
    // The host sits at the document origin, but a page can offset it (margin on
    // <html>, position: relative). Cancel that out so document coords map 1:1.
    const h = this.host.getBoundingClientRect();
    const hx = h.left + window.scrollX;
    const hy = h.top + window.scrollY;
    const base = hx || hy ? `translate(${-hx}px, ${-hy}px)` : '';
    this.svg.style.transform = base;
    this.notes.style.transform = base;

    for (const shape of this.shapes) {
      const [dx, dy] = this.resolver.offset(shape.anchor);
      this.offsets.set(shape.id, [dx, dy]);
      const r = this.rendered.get(shape.id);
      if (!r) continue;
      const t = dx || dy ? `translate(${round(dx)}px, ${round(dy)}px)` : '';
      if (r.el.style.transform !== t) r.el.style.transform = t;
    }
  }

  private offsetOf(id: string): Point {
    return this.offsets.get(id) ?? [0, 0];
  }

  // ---------------------------------------------------------------- drawing

  private onPointerDown = (e: PointerEvent) => {
    const tool = this.prefs.tool;
    if (e.button !== 0 || this.draft || this.erasing) return;
    e.preventDefault();
    const p = docPoint(e);

    if (tool === 'text') {
      if (this.editing) this.finishEditing();
      else this.startEditing(undefined, p);
      return;
    }

    this.capture.setPointerCapture(e.pointerId);

    if (tool === 'eraser') {
      this.erasing = { pointerId: e.pointerId, ids: new Set() };
      this.eraseAt(p);
      return;
    }

    const color = this.prefs.color;
    const id = uid();
    let shape: Shape;
    if (tool === 'pen' || tool === 'highlighter') {
      shape = { id, kind: tool, color, width: WIDTH[tool], points: [p] };
    } else if (tool === 'arrow') {
      shape = { id, kind: 'arrow', color, width: WIDTH.arrow, from: p, to: p };
    } else if (tool === 'rect') {
      shape = { id, kind: 'rect', color, width: WIDTH.rect, x: p[0], y: p[1], w: 0, h: 0 };
    } else {
      return;
    }
    const el = this.createElement(shape) as SVGElement;
    this.svg.append(el);
    this.draft = { pointerId: e.pointerId, start: p, shape, el };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.erasing && e.pointerId === this.erasing.pointerId) {
      for (const ev of e.getCoalescedEvents?.() ?? [e]) this.eraseAt(docPoint(ev));
      return;
    }
    if (!this.draft) {
      if (this.prefs.tool === 'eraser') this.setHovered(this.shapeAt(docPoint(e)));
      return;
    }
    if (e.pointerId !== this.draft.pointerId) return;
    const { shape, start, el } = this.draft;
    const p = docPoint(e);
    if (shape.kind === 'pen' || shape.kind === 'highlighter') {
      for (const ev of e.getCoalescedEvents?.() ?? [e]) {
        const q = docPoint(ev);
        if (shouldAddPoint(shape.points, q)) shape.points.push(q);
      }
    } else if (shape.kind === 'arrow') {
      const to = e.shiftKey ? snapAngle(start, p) : p;
      shape.to = [round(to[0]), round(to[1])];
    } else if (shape.kind === 'rect') {
      Object.assign(shape, rectFrom(start, p, e.shiftKey));
    }
    this.updateGeometry(el, shape);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.erasing && e.pointerId === this.erasing.pointerId) {
      const { ids } = this.erasing;
      this.erasing = null;
      if (ids.size) this.commit(this.shapes.filter((s) => !ids.has(s.id)));
      this.setHovered(this.shapeAt(docPoint(e)));
      return;
    }
    const draft = this.draft;
    if (!draft || e.pointerId !== draft.pointerId) return;
    this.draft = null;
    draft.el.remove();
    const { shape } = draft;
    if (e.type === 'pointercancel') return;

    const valid =
      shape.kind === 'pen' || shape.kind === 'highlighter'
        ? shape.points.length > 0
        : shape.kind === 'arrow'
          ? Math.hypot(shape.to[0] - shape.from[0], shape.to[1] - shape.from[1]) >= 6
          : shape.kind === 'rect'
            ? shape.w >= 4 && shape.h >= 4
            : false;
    if (!valid) return;
    if (shape.kind === 'pen' || shape.kind === 'highlighter') {
      shape.points = shape.points.map(([x, y]) => [round(x), round(y)]);
    }
    shape.anchor = this.anchorFor(shape);
    this.commit([...this.shapes, shape]);
  };

  private cancelDraft(): void {
    this.draft?.el.remove();
    this.draft = null;
    if (this.erasing) {
      for (const id of this.erasing.ids) this.rendered.get(id)?.el.classList.remove('doomed');
      this.erasing = null;
    }
  }

  private anchorFor(shape: Shape, box?: Box) {
    const b = shapeBounds(shape, box);
    const center: Point = [b.x + b.w / 2, b.y + b.h / 2];
    const first: Point =
      shape.kind === 'pen' || shape.kind === 'highlighter'
        ? shape.points[0]
        : shape.kind === 'arrow'
          ? shape.to
          : [b.x + 4, b.y + 4];
    return findAnchor([center, first], this.host);
  }

  // ---------------------------------------------------------------- eraser

  private textBox(id: string): Box | undefined {
    const el = this.rendered.get(id)?.el;
    if (!el || !(el instanceof HTMLElement)) return undefined;
    const r = docRect(el);
    const [dx, dy] = this.offsetOf(id);
    return { x: r.x - dx, y: r.y - dy, w: r.width, h: r.height };
  }

  /** Topmost shape under a document point, or null. */
  private shapeAt(p: Point): string | null {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (this.erasing?.ids.has(s.id)) continue;
      const [dx, dy] = this.offsetOf(s.id);
      const local: Point = [p[0] - dx, p[1] - dy];
      if (hitTest(s, local, 6, s.kind === 'text' ? this.textBox(s.id) : undefined)) return s.id;
    }
    return null;
  }

  private eraseAt(p: Point): void {
    const id = this.shapeAt(p);
    if (!id || !this.erasing) return;
    this.erasing.ids.add(id);
    this.rendered.get(id)?.el.classList.add('doomed');
  }

  private setHovered(id: string | null): void {
    if (id === this.hovered) return;
    if (this.hovered && !this.erasing?.ids.has(this.hovered)) {
      this.rendered.get(this.hovered)?.el.classList.remove('doomed');
    }
    this.hovered = id;
    if (id) this.rendered.get(id)?.el.classList.add('doomed');
  }

  // ---------------------------------------------------------------- text notes

  private startEditing(existing?: TextShape, at?: Point): void {
    let el: HTMLElement;
    let pos: Point;
    if (existing) {
      el = this.rendered.get(existing.id)!.el as HTMLElement;
      pos = [existing.x, existing.y];
    } else {
      pos = [at![0] - 4, at![1] - 14];
      el = this.createElement({ id: 'draft', kind: 'text', color: this.prefs.color, x: pos[0], y: pos[1], text: '' }) as HTMLElement;
      this.notes.append(el);
    }
    const editing: Editing = { el, at: pos, existing, done: false };
    this.editing = editing;
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = true;
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', 'Note');

    el.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Don't let the page (or our tool shortcuts) see typing.
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.isComposing)) {
        e.preventDefault();
        this.finishEditing();
      }
    });
    for (const type of ['keyup', 'keypress', 'input', 'beforeinput'] as const) {
      el.addEventListener(type, (e) => e.stopPropagation());
    }
    el.addEventListener('blur', () => {
      // Clicking a toolbar button blurs the note; commit it.
      if (this.editing === editing) this.finishEditing();
    });

    // Focus synchronously so the first keystrokes after the click land in the note.
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private finishEditing(): void {
    const editing = this.editing;
    if (!editing || editing.done) return;
    editing.done = true;
    this.editing = null;
    const { el, existing, at } = editing;
    const text = el.innerText.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    el.removeAttribute('contenteditable');
    el.removeAttribute('role');
    el.blur();

    if (existing) {
      if (!text) {
        this.commit(this.shapes.filter((s) => s.id !== existing.id));
      } else if (text !== existing.text) {
        const updated: TextShape = { ...existing, text };
        this.commit(this.shapes.map((s) => (s.id === existing.id ? updated : s)));
      } else {
        el.textContent = existing.text;
      }
      return;
    }

    const box = docRect(el);
    el.remove();
    if (!text) return;
    const shape: TextShape = { id: uid(), kind: 'text', color: this.prefs.color, x: at[0], y: at[1], text };
    shape.anchor = this.anchorFor(shape, { x: box.x, y: box.y, w: box.width, h: box.height });
    this.commit([...this.shapes, shape]);
  }

  // ---------------------------------------------------------------- keyboard

  private onKeyDown = (e: KeyboardEvent) => {
    // Fallback for the toggle shortcut when the browser hasn't bound the
    // extension command (another extension or the browser took the keys).
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyA' && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.toggle('keyboard');
      return;
    }
    if (!this.active || this.editing || e.isComposing) return;
    if (isEditable(e.composedPath()[0] ?? e.target)) return;

    const key = e.key.toLowerCase();
    let handled = true;
    if (e.metaKey || e.ctrlKey) {
      if (e.altKey) handled = false;
      else if (key === 'z' && e.shiftKey) this.redo();
      else if (key === 'z') this.undo();
      else if (key === 'y' && !IS_MAC) this.redo();
      else handled = false;
    } else if (e.altKey) {
      handled = false;
    } else if (key === 'escape') {
      if (this.draft || this.erasing) this.cancelDraft();
      else if (this.prefs.tool !== 'interact') this.setTool('interact');
      else handled = false;
    } else {
      const tool = !e.shiftKey && TOOLS.find((t) => t.key.toLowerCase() === key)?.tool;
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (tool) this.setTool(tool);
      else if (digit && !e.shiftKey && COLORS[Number(digit[1]) - 1]) this.setColor(COLORS[Number(digit[1]) - 1].value);
      else handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
}
