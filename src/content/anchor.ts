import type { Anchor, Point } from '../types';

/**
 * Anchoring: every annotation is stored in document coordinates (CSS px from
 * the top-left of the page), which already makes it scroll with the page.
 * On top of that, each annotation remembers the element it was drawn on.
 * When that element moves — the window is resized and the layout reflows,
 * an image loads above it, an inner scroll container scrolls — the annotation
 * is shifted by the same delta, so it stays attached to that part of the site.
 */

const INLINE = /^inline(?!-(block|flex|grid|table))/;

export function docRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  return new DOMRect(r.left + window.scrollX, r.top + window.scrollY, r.width, r.height);
}

function isPinnedToViewport(el: Element): boolean {
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const pos = getComputedStyle(node).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

function cssPath(el: Element): string | null {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const id = node.id;
    if (id && /^[A-Za-z][\w-]*$/.test(id) && !/\d{4,}/.test(id) && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(id)}`);
      return parts.join(' > ');
    }
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    const tag = node.localName;
    const same = Array.from(parent.children).filter((c) => c.localName === tag);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    node = parent;
  }
  if (node !== document.body) return null;
  parts.unshift('body');
  return parts.join(' > ');
}

/**
 * Pick an element under a document-space point to pin an annotation to.
 * Returns undefined when the best answer is "the document itself".
 */
export function findAnchor(points: Point[], ignore: Element): Anchor | undefined {
  for (const [x, y] of points) {
    const cx = x - window.scrollX;
    const cy = y - window.scrollY;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
    let el = document.elementsFromPoint(cx, cy).find((e) => e !== ignore && !ignore.contains(e)) ?? null;
    // Inline boxes rewrap on resize; their block container is a steadier reference.
    while (el && el !== document.body && INLINE.test(getComputedStyle(el).display)) el = el.parentElement;
    if (!el || el === document.body || el === document.documentElement) return undefined;
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement) && el.ownerSVGElement) el = el.ownerSVGElement;
    if (isPinnedToViewport(el)) return undefined;
    const sel = cssPath(el);
    if (!sel) return undefined;
    const r = docRect(el);
    return { sel, x: r.x, y: r.y };
  }
  return undefined;
}

/** Resolves anchors to elements, caching lookups between layout passes. */
export class AnchorResolver {
  private cache = new Map<string, Element | null>();

  /** How far the anchored element has moved since the annotation was drawn. */
  offset(anchor: Anchor | undefined): Point {
    if (!anchor) return [0, 0];
    let el = this.cache.get(anchor.sel);
    if (el === undefined || (el && !el.isConnected)) {
      try {
        el = document.querySelector(anchor.sel);
      } catch {
        el = null;
      }
      this.cache.set(anchor.sel, el);
    }
    if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    // A hidden anchor (display: none, collapsed) has no useful position; keep the drawn spot.
    if (r.width === 0 && r.height === 0) return [0, 0];
    return [r.left + window.scrollX - anchor.x, r.top + window.scrollY - anchor.y];
  }

  /** Forget cached lookups, e.g. after the DOM changes. */
  reset(): void {
    this.cache.clear();
  }
}
