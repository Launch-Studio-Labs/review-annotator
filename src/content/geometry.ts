import type { Point, Shape } from '../types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Smooth SVG path through freehand points (quadratic curves via midpoints). */
export function strokePath(points: Point[]): string {
  if (points.length === 0) return '';
  const [x0, y0] = points[0];
  if (points.length === 1) return `M${r1(x0)} ${r1(y0)}l0.01 0`;
  if (points.length === 2) return `M${r1(x0)} ${r1(y0)}L${r1(points[1][0])} ${r1(points[1][1])}`;
  let d = `M${r1(x0)} ${r1(y0)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${r1(x)} ${r1(y)} ${r1((x + nx) / 2)} ${r1((y + ny) / 2)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d}L${r1(lx)} ${r1(ly)}`;
}

export function arrowHead(from: Point, to: Point, width: number): [Point, Point] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const size = Math.min(Math.max(10, width * 4.2), length * 0.6);
  const spread = Math.PI / 7;
  return [
    [to[0] - size * Math.cos(angle - spread), to[1] - size * Math.sin(angle - spread)],
    [to[0] - size * Math.cos(angle + spread), to[1] - size * Math.sin(angle + spread)],
  ];
}

export function arrowPath(from: Point, to: Point, width: number): string {
  const [a, b] = arrowHead(from, to, width);
  const p = (pt: Point) => `${r1(pt[0])} ${r1(pt[1])}`;
  return `M${p(from)}L${p(to)}M${p(a)}L${p(to)}L${p(b)}`;
}

/** Snap an endpoint to 45° increments (Shift while drawing an arrow). */
export function snapAngle(from: Point, to: Point): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const length = Math.hypot(dx, dy);
  return [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length];
}

/** Normalised rectangle from two corners; Shift makes it a square. */
export function rectFrom(a: Point, b: Point, square: boolean) {
  let w = b[0] - a[0];
  let h = b[1] - a[1];
  if (square) {
    const s = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * s;
    h = Math.sign(h || 1) * s;
  }
  return { x: Math.min(a[0], a[0] + w), y: Math.min(a[1], a[1] + h), w: Math.abs(w), h: Math.abs(h) };
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Drop points closer than `min` px to the previous one. Keeps strokes light to store. */
export function shouldAddPoint(points: Point[], p: Point, min = 1.5): boolean {
  const last = points[points.length - 1];
  return !last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= min;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Document-space bounds of a shape, ignoring its anchor offset. Text needs its rendered size. */
export function shapeBounds(shape: Shape, textBox?: Box): Box {
  switch (shape.kind) {
    case 'pen':
    case 'highlighter': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of shape.points) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'arrow': {
      const x = Math.min(shape.from[0], shape.to[0]);
      const y = Math.min(shape.from[1], shape.to[1]);
      return { x, y, w: Math.abs(shape.to[0] - shape.from[0]), h: Math.abs(shape.to[1] - shape.from[1]) };
    }
    case 'rect':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'text':
      return textBox ?? { x: shape.x, y: shape.y, w: 0, h: 0 };
  }
}

/**
 * Is point `p` (already in the shape's own coordinate space) on the shape?
 * `slop` is the extra tolerance in px around the stroke.
 */
export function hitTest(shape: Shape, p: Point, slop: number, textBox?: Box): boolean {
  switch (shape.kind) {
    case 'pen':
    case 'highlighter': {
      const reach = shape.width / 2 + slop;
      const pts = shape.points;
      if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= reach;
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= reach) return true;
      return false;
    }
    case 'arrow': {
      const reach = shape.width / 2 + slop;
      const [a, b] = arrowHead(shape.from, shape.to, shape.width);
      return (
        distToSegment(p, shape.from, shape.to) <= reach ||
        distToSegment(p, a, shape.to) <= reach ||
        distToSegment(p, b, shape.to) <= reach
      );
    }
    case 'rect': {
      const reach = shape.width / 2 + slop;
      const { x, y, w, h } = shape;
      const c: Point[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      return c.some((pt, i) => distToSegment(p, pt, c[(i + 1) % 4]) <= reach);
    }
    case 'text': {
      const b = textBox;
      if (!b) return false;
      return p[0] >= b.x - slop && p[0] <= b.x + b.w + slop && p[1] >= b.y - slop && p[1] <= b.y + b.h + slop;
    }
  }
}
