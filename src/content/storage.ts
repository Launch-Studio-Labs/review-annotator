import type { Shape, Tool } from '../types';

export interface Prefs {
  tool: Tool;
  color: string;
  /** Toolbar position (viewport px) once the user has dragged it. */
  position: { x: number; y: number } | null;
}

const PREFS_KEY = 'prefs';
const VERSION = 1;

/** Annotations are keyed per page: origin + path + query. The #hash is ignored. */
export function pageKey(href = location.href): string {
  const url = new URL(href);
  return `page:${url.origin}${url.pathname}${url.search}`;
}

function available(): boolean {
  // After the extension is reloaded, orphaned content scripts lose chrome.runtime.
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
}

export async function loadShapes(key: string): Promise<Shape[]> {
  if (!available()) return [];
  try {
    const data = await chrome.storage.local.get(key);
    const entry = data[key] as { v: number; shapes: Shape[] } | undefined;
    return entry?.v === VERSION && Array.isArray(entry.shapes) ? entry.shapes : [];
  } catch {
    return [];
  }
}

export async function saveShapes(key: string, shapes: Shape[]): Promise<void> {
  if (!available()) return;
  try {
    if (shapes.length === 0) await chrome.storage.local.remove(key);
    else await chrome.storage.local.set({ [key]: { v: VERSION, url: location.href, updated: Date.now(), shapes } });
  } catch {
    // Quota or context invalidated: keep working in memory.
  }
}

export async function loadPrefs(defaults: Prefs): Promise<Prefs> {
  if (!available()) return defaults;
  try {
    const data = await chrome.storage.local.get(PREFS_KEY);
    return { ...defaults, ...(data[PREFS_KEY] as Partial<Prefs> | undefined) };
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs: Prefs): void {
  if (!available()) return;
  chrome.storage.local.set({ [PREFS_KEY]: prefs }).catch(() => {});
}
