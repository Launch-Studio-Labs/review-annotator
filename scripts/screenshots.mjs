// Captures docs/screenshot.png and store-assets/* from the demo page with the
// real extension loaded. Run: npm run build && node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const out = (p) => resolve(root, p);

const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/demo.html`;

async function open({ width = 1280, height = 800, scale = 1 } = {}) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width, height },
    deviceScaleFactor: scale,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(base);
  // The dashed "this is a test page" notice is for manual testing; keep it out of product shots.
  await page.addStyleTag({ content: '#notice { display: none !important; }' });
  await page.evaluate(() => {
    document.querySelector('#order .two > p').textContent =
      'Beans ship Monday and Thursday, roasted no more than two days before. Free delivery within forty miles of the pier.';
    document.querySelector('#lede').textContent =
      'We roast twice a week in a converted boathouse and deliver within forty miles. Every bag is dated, and every roast is cupped before it ships.';
    document.querySelector('#long h2').textContent = 'From the roastery';
    document.querySelector('#long h2 + p').textContent =
      'Notes on sourcing, roast profiles, and what we are drinking this month.';
  });
  await page.evaluate(() => document.fonts.ready);
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await globalThis.__reviewAnnotatorToggle(tab, 'action');
  });
  await page.locator('review-annotator .bar').waitFor();
  await page.waitForTimeout(300); // let the entrance animation finish
  return { context, page };
}

const tick = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const rect = (page, sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
  }, sel);

/** Viewport box of the actual text (not the block) — optionally just a substring of it. */
const textRect = (page, sel, sub) =>
  page.evaluate(
    ([s, part]) => {
      const el = document.querySelector(s);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while ((node = walker.nextNode())) {
        const i = part ? node.data.indexOf(part) : 0;
        if (i < 0) continue;
        range.setStart(node, i);
        range.setEnd(node, part ? i + part.length : node.data.length);
        break;
      }
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
    },
    [sel, sub],
  );

async function stroke(page, pts) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 });
  await page.mouse.up();
}

/** A hand-drawn loop: an ellipse with a little wobble and an overshoot. */
function loop(box, padX = 14, padY = 10) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2 + padX;
  const ry = box.h / 2 + padY;
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = -0.5 + (i / 64) * (Math.PI * 2 + 0.5);
    const wobble = 1 + Math.sin(t * 3) * 0.03;
    pts.push([cx + Math.cos(t) * rx * wobble, cy + Math.sin(t) * ry * wobble + i * 0.08]);
  }
  return pts;
}

/** A slightly uneven hand-drawn underline. */
const underline = (box, gap = 5) => [
  [box.x - 3, box.b + gap],
  [box.x + box.w * 0.35, box.b + gap + 1.5],
  [box.x + box.w * 0.7, box.b + gap + 0.5],
  [box.r + 4, box.b + gap - 1],
];

const key = (page, k) => page.keyboard.press(k);

async function note(page, x, y, text) {
  await key(page, 't');
  await page.mouse.click(x, y);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

async function scrollTo(page, y) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await tick(page);
}

const docTop = (page, sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

async function park(page, tool = 'p') {
  // Leave a drawing tool selected and move the pointer off the toolbar.
  await key(page, tool);
  await page.mouse.move(1, 1);
  await tick(page);
}

/** The main shot: a card grid mid-review. Used for docs/ (2×) and the store (1×). */
async function cardsReview(page) {
  await scrollTo(page, (await docTop(page, '#menu')) - 70);

  await key(page, 'p');
  await stroke(page, underline(await textRect(page, '#menu h2')));

  const fog = await textRect(page, '#card-3 h3');
  await stroke(page, loop(fog, 16, 9));
  const card3 = await rect(page, '#card-3');
  await note(page, card3.x + 20, card3.b - 42, 'Rename? “Fog Bank” reads as decaf');

  await key(page, 'h');
  await key(page, '2');
  const low = await textRect(page, '#card-2 p', 'Colombian decaf.');
  await stroke(page, [[low.x - 2, low.y + low.h / 2], [low.r + 2, low.y + low.h / 2]]);

  await key(page, '4');
  await key(page, 'r');
  const c5 = await rect(page, '#card-5');
  await stroke(page, [[c5.x - 7, c5.y - 7], [c5.r + 7, c5.b + 7]]);
  const c6 = await rect(page, '#card-6');
  await note(page, c6.x + 34, c6.b + 44, 'Same height as the top row?');
  await key(page, 'a');
  await stroke(page, [[c6.x + 30, c6.b + 34], [c5.r + 14, c5.b - 14]]);

  await key(page, '1');
}

// ---------- docs/screenshot.png (2× for sharpness) ----------
{
  const { context, page } = await open({ scale: 2 });
  await cardsReview(page);
  await park(page);
  await page.screenshot({ path: out('docs/screenshot.png') });
  await context.close();
}

// Store screenshots must be exactly 1280×800.
{
  const { context, page } = await open();
  await cardsReview(page);
  await park(page);
  await page.screenshot({ path: out('store-assets/screenshot-1-review.png') });
  await context.close();
}

// ---------- Close-up of the hero: 853×533 CSS px at 1.5× = 1280×800 ----------
{
  const { context, page } = await open({ width: 853, height: 533, scale: 1.5 });
  await scrollTo(page, 30);
  await key(page, 'p');
  const pier = await textRect(page, '#hero h1', 'on the pier.');
  await stroke(page, loop(pier, 18, 8));
  await key(page, 'a');
  await stroke(page, [[pier.r + 150, pier.y - 30], [pier.r + 30, pier.y + 10]]);
  await note(page, pier.r + 96, pier.y - 66, 'Can this sit on one line?');
  await key(page, 'h');
  await key(page, '2');
  const lede = await textRect(page, '#lede', 'converted boathouse');
  await stroke(page, [[lede.x - 2, lede.y + lede.h / 2], [lede.r + 2, lede.y + lede.h / 2]]);
  await key(page, '1');
  await park(page, 'a');
  await page.screenshot({ path: out('store-assets/screenshot-2-closeup.png') });
  await context.close();
}

// ---------- Notes in several colours on the order form ----------
{
  const { context, page } = await open();
  await scrollTo(page, (await docTop(page, '#order')) - 140);
  const cta = await rect(page, '#cta');
  const name = await rect(page, '#name');
  const notes = await rect(page, '#notes');
  const aside = await rect(page, '#order .two > p');

  await key(page, '3');
  await key(page, 'r');
  await stroke(page, [[cta.x - 7, cta.y - 7], [cta.r + 7, cta.b + 7]]);
  await note(page, aside.x + 70, cta.b + 40, 'Nice: the count updates instantly');
  await key(page, 'a');
  await stroke(page, [[aside.x + 60, cta.b + 44], [cta.r + 16, cta.y + cta.h / 2 + 4]]);

  await key(page, '1');
  await key(page, 'p');
  // Circle the placeholder text inside the field.
  await stroke(page, loop({ x: name.x + 12, y: name.y + 12, w: 80, h: name.h - 24 }, 14, 8));
  await note(page, name.x + 300, name.y + 12, 'Needs a visible label');

  await key(page, '5');
  await note(page, notes.x + 230, notes.y + notes.h - 36, 'Copy: “How should we grind it?”');

  await key(page, '4');
  await park(page, 'p');
  // Show a toolbar tooltip so the shot explains the shortcuts.
  await page.locator('review-annotator [data-color="#0090FF"]').hover();
  await page.waitForTimeout(700);
  await page.screenshot({ path: out('store-assets/screenshot-3-notes.png') });
  await context.close();
}

// ---------- Small promo tile (440×280) ----------
{
  const { context, page } = await open({ scale: 2 });
  const bar = await page.locator('review-annotator .bar').screenshot({ omitBackground: true });
  await context.close();

  const icon = readFileSync(out('public/icons/icon-128.png')).toString('base64');
  const browser = await chromium.launch();
  const tile = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await tile.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
    body {
      background: #F4F4F2;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      position: relative;
    }
    .head { position: absolute; left: 36px; top: 44px; display: flex; align-items: center; gap: 14px; }
    .head img { width: 52px; height: 52px; }
    h1 { margin: 0; font-size: 28px; line-height: 32px; font-weight: 650; letter-spacing: -0.02em; color: #1C1C1F; }
    p { position: absolute; left: 36px; top: 118px; margin: 0; width: 360px; font-size: 16px; line-height: 23px; color: #55555C; }
    .bar { position: absolute; left: 36px; bottom: 40px; width: 368px; }
  </style></head><body>
    <div class="head"><img src="data:image/png;base64,${icon}" alt=""><h1>Review Annotator</h1></div>
    <p>Draw and leave notes on any website. Marks stay pinned as you scroll.</p>
    <img class="bar" src="data:image/png;base64,${bar.toString('base64')}" alt="">
  </body></html>`);
  await tile.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await tile.screenshot({ path: out('store-assets/promo-small-440x280.png') });
  await browser.close();
}

server.close();
console.log('Screenshots written to docs/ and store-assets/');
