// Renders public/icons/*.png from the SVG mark below. Run: node scripts/icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(out, { recursive: true });

const mark = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect x="1" y="1" width="30" height="30" rx="8" fill="#1C1C1F"/>
  <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
  <path d="M8.5 21.5c3-1 4.6-7.8 7.6-8.6 2.4-.6 2 4.4 4.4 4 1.6-.3 2.2-2 3-3.4" fill="none" stroke="#fff" stroke-width="${size <= 16 ? 2.6 : 2.2}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="23.6" cy="11.6" r="${size <= 16 ? 3 : 2.6}" fill="#E5484D"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${mark(size)}`);
  await page.locator('svg').screenshot({ path: `${out}/icon-${size}.png`, omitBackground: true });
}
await browser.close();
console.log('Icons written to public/icons');
