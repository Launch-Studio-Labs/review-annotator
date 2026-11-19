export type Point = [x: number, y: number];

export type Tool = 'interact' | 'pen' | 'highlighter' | 'arrow' | 'rect' | 'text' | 'eraser';

/**
 * Where an annotation was pinned. `x`/`y` are the anchor element's document-space
 * origin at the moment the annotation was drawn. If the element later moves
 * (reflow on resize, content loading above it, an inner scroller), the
 * annotation is translated by the same amount.
 */
export interface Anchor {
  sel: string;
  x: number;
  y: number;
}

interface ShapeBase {
  id: string;
  color: string;
  anchor?: Anchor;
}

export interface StrokeShape extends ShapeBase {
  kind: 'pen' | 'highlighter';
  points: Point[];
  width: number;
}

export interface ArrowShape extends ShapeBase {
  kind: 'arrow';
  from: Point;
  to: Point;
  width: number;
}

export interface RectShape extends ShapeBase {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  width: number;
}

export interface TextShape extends ShapeBase {
  kind: 'text';
  x: number;
  y: number;
  text: string;
}

export type Shape = StrokeShape | ArrowShape | RectShape | TextShape;

export type ToggleSource = 'action' | 'command' | 'keyboard';

export type ToContent = { type: 'toggle'; source: ToggleSource };

export type ToBackground = { type: 'state'; active: boolean; count: number };
