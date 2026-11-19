import { bar, clickToolbarIcon, draw, expect, host, notes, rect, settle, shapes, test } from './fixtures';
import type { Page } from '@playwright/test';

/** Distance between an annotation and the page element it was drawn on. */
async function gap(page: Page, shapeIndex: number, target: string) {
  const s = await rect(page, '::shadow svg.layer > *', shapeIndex);
  const t = await rect(page, target);
  return { dx: s.x - t.x, dy: s.y - t.y };
}

async function scrollTo(page: Page, selector: string) {
  await page.evaluate((sel) => document.querySelector(sel)!.scrollIntoView({ block: 'center' }), selector);
  await settle(page);
}

function closeTo(a: { dx: number; dy: number }, b: { dx: number; dy: number }, tolerance = 1.5) {
  expect(Math.abs(a.dx - b.dx), `dx ${a.dx} vs ${b.dx}`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(a.dy - b.dy), `dy ${a.dy} vs ${b.dy}`).toBeLessThanOrEqual(tolerance);
}

test('toolbar icon and keyboard shortcut toggle the annotator', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await expect(bar(page)).toBeVisible();
  await expect(page.locator('review-annotator [data-tool="pen"]')).toHaveAttribute('aria-pressed', 'true');

  const badge = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
  expect(badge).toBe('ON');

  await page.keyboard.press('Alt+Shift+A');
  await expect(bar(page)).toBeHidden();
  await page.keyboard.press('Alt+Shift+A');
  await expect(bar(page)).toBeVisible();

  await page.locator('review-annotator [data-action="close"]').click();
  await expect(host(page)).toBeHidden();
});

test('pen strokes are pinned to the page while scrolling', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await scrollTo(page, '#card-3');
  const card = await rect(page, '#card-3');
  await draw(page, [
    [card.x + 20, card.y + 30],
    [card.x + 80, card.y + 60],
    [card.x + 140, card.y + 40],
  ]);
  await expect(shapes(page)).toHaveCount(1);
  const before = await gap(page, 0, '#card-3');
  const viewBefore = await rect(page, '::shadow svg.layer > *');

  await page.mouse.wheel(0, 700);
  await page.waitForFunction(() => window.scrollY > 0);
  await settle(page);
  const scrolled = await page.evaluate(() => window.scrollY);
  const viewAfter = await rect(page, '::shadow svg.layer > *');
  expect(viewAfter.y).toBeLessThan(viewBefore.y - 100); // it moved with the content…
  closeTo(await gap(page, 0, '#card-3'), before); // …and stayed on the card.

  // Long page: draw near the bottom, scroll back to the top and down again.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle(page);
  const marker = await rect(page, '#bottom-marker');
  await draw(page, [[marker.x, marker.y - 40], [marker.x + 200, marker.y - 40]]);
  await expect(shapes(page)).toHaveCount(2);
  const bottomGap = await gap(page, 1, '#bottom-marker');
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await page.evaluate((y) => window.scrollTo(0, y), scrolled);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle(page);
  closeTo(await gap(page, 1, '#bottom-marker'), bottomGap);
});

test('annotations follow their element through resize and inserted content', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await page.keyboard.press('r');
  await scrollTo(page, '#card-5');
  const card = await rect(page, '#card-5');
  await draw(page, [[card.x - 6, card.y - 6], [card.x + card.w + 6, card.y + card.h + 6]]);
  await expect(shapes(page)).toHaveCount(1);
  const before = await gap(page, 0, '#card-5');

  // Narrow window: the grid reflows from 3 columns to 1, the card moves a lot.
  await page.setViewportSize({ width: 620, height: 800 });
  await settle(page);
  await scrollTo(page, '#card-5');
  const moved = await rect(page, '#card-5');
  expect(Math.abs(moved.x - card.x) + Math.abs(moved.y - card.y)).toBeGreaterThan(40);
  closeTo(await gap(page, 0, '#card-5'), before);

  // Back to wide.
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
  closeTo(await gap(page, 0, '#card-5'), before);

  // Content inserted above (switch to "use the page" so the click reaches the site).
  await page.keyboard.press('v');
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await page.locator('#insert').click();
  await settle(page);
  await scrollTo(page, '#card-5');
  closeTo(await gap(page, 0, '#card-5'), before);
});

test('annotations inside an inner scroll container follow it', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await page.keyboard.press('a');
  await scrollTo(page, '#saturday'); // scrolls the page and the inner list
  const row = await rect(page, '#saturday');
  await draw(page, [[row.x + 160, row.y - 30], [row.x + 100, row.y + 10]]);
  await expect(shapes(page)).toHaveCount(1);
  const before = await gap(page, 0, '#saturday');
  await page.evaluate(() => document.querySelector('#scroller')!.scrollBy(0, 60));
  await settle(page);
  closeTo(await gap(page, 0, '#saturday'), before);
});

test('undo, redo and clear, from keys and toolbar', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  const undo = page.locator('review-annotator [data-action="undo"]');
  const redo = page.locator('review-annotator [data-action="redo"]');
  const clear = page.locator('review-annotator [data-action="clear"]');
  await expect(undo).toBeDisabled();
  await expect(clear).toBeDisabled();

  await draw(page, [[200, 300], [300, 340]]);
  await page.keyboard.press('h');
  await draw(page, [[200, 400], [500, 400]]);
  await expect(shapes(page)).toHaveCount(2);
  await expect(page.locator('review-annotator svg.layer > .highlighter')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(shapes(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(shapes(page)).toHaveCount(2);

  await undo.click();
  await expect(shapes(page)).toHaveCount(1);
  await redo.click();
  await expect(shapes(page)).toHaveCount(2);

  await clear.click();
  await expect(shapes(page)).toHaveCount(0);
  await expect(clear).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(shapes(page)).toHaveCount(2);
});

test('eraser removes what it touches', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await draw(page, [[200, 300], [400, 300]]);
  await draw(page, [[200, 500], [400, 500]]);
  await expect(shapes(page)).toHaveCount(2);
  await page.keyboard.press('e');
  await draw(page, [[300, 280], [300, 320]]);
  await expect(shapes(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(shapes(page)).toHaveCount(2);
});

test('text notes can be added, edited and erased', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await page.keyboard.press('t');
  await page.mouse.click(400, 300);
  await page.keyboard.type('Tighten this heading');
  await page.keyboard.press('Enter');
  await expect(notes(page)).toHaveCount(1);
  await expect(notes(page).first()).toHaveText('Tighten this heading');

  // Typing in a note never triggers tool shortcuts (the "t", "h", "e" above).
  await expect(page.locator('review-annotator [data-tool="text"]')).toHaveAttribute('aria-pressed', 'true');

  await notes(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Escape');
  await expect(notes(page).first()).toHaveText('Tighten this heading!');

  // Empty notes are discarded.
  await page.mouse.click(600, 500);
  await page.keyboard.press('Enter');
  await expect(notes(page)).toHaveCount(1);

  await page.keyboard.press('e');
  const n = await notes(page).first().boundingBox();
  await page.mouse.click(n!.x + 10, n!.y + n!.height / 2);
  await expect(notes(page)).toHaveCount(0);
});

test('page stays usable in "use the page" mode; drawing mode captures the pointer', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await scrollTo(page, '#cta');
  await page.locator('#cta').click({ force: true });
  await expect(page.locator('#count')).toHaveText('0'); // pen tool: the click drew a dot instead
  await expect(shapes(page)).toHaveCount(1);

  await page.keyboard.press('Escape'); // Escape drops back to "use the page"
  await expect(page.locator('review-annotator [data-tool="interact"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#cta').click();
  await expect(page.locator('#count')).toHaveText('1');
  await page.locator('#name').fill('Adam');
  await page.keyboard.press('p'); // typing in page inputs isn't hijacked
  await expect(page.locator('#name')).toHaveValue('Adamp');
});

test('colors and tool shortcuts', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await page.keyboard.press('4');
  await expect(page.locator('review-annotator [data-color="#0090FF"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('r');
  await draw(page, [[200, 300], [320, 380]]);
  await expect(shapes(page).first()).toHaveAttribute('stroke', '#0090FF');
  await page.locator('review-annotator [data-color="#E5484D"]').click();
  await page.locator('review-annotator [data-tool="arrow"]').click();
  await draw(page, [[500, 300], [620, 380]]);
  await expect(shapes(page).nth(1)).toHaveAttribute('stroke', '#E5484D');
});

test('annotations persist per page across reloads', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await draw(page, [[200, 300], [400, 360]]);
  await expect(shapes(page)).toHaveCount(1);
  await page.waitForTimeout(400); // debounced save
  await page.reload();
  await page.waitForLoadState('load');
  await clickToolbarIcon(worker, page);
  await expect(shapes(page)).toHaveCount(1);

  await page.locator('review-annotator [data-action="clear"]').click();
  await page.waitForTimeout(400);
  await page.reload();
  await clickToolbarIcon(worker, page);
  await expect(bar(page)).toBeVisible();
  await expect(shapes(page)).toHaveCount(0);
});

test('single-page-app navigation swaps to that URL’s annotations', async ({ page, worker }) => {
  await clickToolbarIcon(worker, page);
  await draw(page, [[200, 300], [400, 360]]);
  await expect(shapes(page)).toHaveCount(1);
  await page.evaluate(() => history.pushState({}, '', '/demo.html?step=2'));
  await expect(shapes(page)).toHaveCount(0, { timeout: 3000 });
  await draw(page, [[200, 500], [400, 560]]);
  await draw(page, [[200, 600], [400, 660]]);
  await expect(shapes(page)).toHaveCount(2);
  await page.goBack();
  await expect(shapes(page)).toHaveCount(1, { timeout: 3000 });
});
