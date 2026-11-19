// 24×24 stroke icons, drawn to sit together at 18px with a 1.6 stroke.
const paths = {
  interact: '<path d="M5.5 3.8 18.6 10a.6.6 0 0 1-.06 1.1l-5.2 1.6a1.5 1.5 0 0 0-1 1l-1.6 5.2a.6.6 0 0 1-1.1.07L3.8 5.5a1.3 1.3 0 0 1 1.7-1.7Z"/>',
  pen: '<path d="M15.2 5.2a2.3 2.3 0 0 1 3.3 3.3L8.6 18.4 4.5 19.5l1.1-4.1 9.6-10.2Z"/><path d="m13.5 7 3.3 3.3"/>',
  highlighter: '<path d="m9 11-5.5 5.5V20h7.2l2.8-2.8"/><path d="m20.5 11.5-4.4 4.4a1.8 1.8 0 0 1-2.6 0l-4.9-4.9a1.8 1.8 0 0 1 0-2.6l4.4-4.4"/>',
  arrow: '<path d="M5.5 18.5 18.5 5.5"/><path d="M9.5 5.5h9v9"/>',
  rect: '<rect x="4" y="5.5" width="16" height="13" rx="2.2"/>',
  text: '<path d="M5 7.5V5h14v2.5"/><path d="M12 5v14"/><path d="M9.5 19h5"/>',
  eraser: '<path d="m7.5 19.5-3.3-3.3a1.8 1.8 0 0 1 0-2.6l8.9-8.9a1.8 1.8 0 0 1 2.6 0l4.1 4.1a1.8 1.8 0 0 1 0 2.6l-8.1 8.1"/><path d="M20 19.5H7.5"/><path d="m9 10.5 5.8 5.8"/>',
  undo: '<path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9h10a5 5 0 0 1 0 10H11"/>',
  redo: '<path d="m15 13.5 4.5-4.5L15 4.5"/><path d="M19.5 9h-10a5 5 0 0 0 0 10H13"/>',
  clear: '<path d="M4.5 7h15"/><path d="M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7"/><path d="M6.5 7l.8 11.3c.1 1 .9 1.7 1.8 1.7h5.8c1 0 1.7-.7 1.8-1.7L17.5 7"/>',
  close: '<path d="M7 7l10 10"/><path d="M17 7 7 17"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export const grip =
  '<svg viewBox="0 0 8 14" width="8" height="14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.1"/><circle cx="6" cy="2" r="1.1"/><circle cx="2" cy="7" r="1.1"/><circle cx="6" cy="7" r="1.1"/><circle cx="2" cy="12" r="1.1"/><circle cx="6" cy="12" r="1.1"/></svg>';
