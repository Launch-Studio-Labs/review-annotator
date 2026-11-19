import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
// @ts-expect-error plain JS helper shared with `npm run demo`
import { serve } from '../scripts/serve.mjs';

const extensionPath = resolve(import.meta.dirname, '../dist');

type Fixtures = { context: BrowserContext; worker: Worker; page: Page; baseURL: string };

let server: Server | undefined;

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    server ??= (await serve(0)) as Server;
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  },
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  page: async ({ context, baseURL }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${baseURL}/demo.html`);
    await use(page);
  },
});

test.afterAll(() => {
  server?.close();
  server = undefined;
});

export { expect } from '@playwright/test';

/** Same path as clicking the toolbar icon: background → content script message. */
export async function clickToolbarIcon(worker: Worker, page: Page): Promise<void> {
  await page.bringToFront();
  await worker.evaluate(async () => {
    // Without the "tabs" permission tab.url is hidden, so target the active tab like a click would.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const toggle = (globalThis as unknown as { __reviewAnnotatorToggle: (t: unknown, s: string) => Promise<void> })
      .__reviewAnnotatorToggle;
    await toggle(tab, 'action');
  });
}

export async function draw(page: Page, points: [number, number][]): Promise<void> {
  const [first, ...rest] = points;
  await page.mouse.move(first[0], first[1]);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
}

export const host = (page: Page) => page.locator('review-annotator');
export const bar = (page: Page) => page.locator('review-annotator .bar');
export const shapes = (page: Page) => page.locator('review-annotator svg.layer > *');
export const notes = (page: Page) => page.locator('review-annotator .notes > .note');

/** Viewport rect of a locator. */
export async function rect(page: Page, selector: string, index = 0) {
  return page.evaluate(
    ([sel, i]) => {
      const root = document.querySelector('review-annotator')?.shadowRoot;
      const el = (sel.startsWith('::shadow ') ? root?.querySelectorAll(sel.slice(9)) : document.querySelectorAll(sel))?.[i as number];
      if (!el) throw new Error(`No element for ${sel}`);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    [selector, index] as const,
  );
}

/** Let rAF-scheduled layout passes run. */
export const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
