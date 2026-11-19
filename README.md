# Review Annotator

A small browser extension for drawing on websites during site reviews. Turn it on, mark up the page, and keep scrolling: annotations stay pinned to the part of the site you drew on.

It uses standard Manifest V3 APIs only, so it runs in Dia and any other Chromium browser (Arc, Edge, Brave, Chrome).

## Tools

| Tool | Key | Notes |
| --- | --- | --- |
| Use the page | `V` | Annotations stay visible; clicks, text selection and scrolling go to the site. `Esc` also gets you here. |
| Pen | `P` | Freehand. |
| Highlighter | `H` | Wide, translucent stroke. |
| Arrow | `A` | Hold `Shift` to snap to 45°. |
| Rectangle | `R` | Hold `Shift` for a square. |
| Text note | `T` | Click to place a note, type, then press `Enter`. `Shift+Enter` adds a new line. With this tool selected, click an existing note to edit it. Empty notes are discarded. |
| Eraser | `E` | Click or drag across annotations. Each one fades as you hover it so you can see what will go. |
| Colors | `1` – `5` | Red, yellow, green, blue, black. |
| Undo / redo | `⌘Z` / `⇧⌘Z` (`Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y`) | |
| Clear page | toolbar | Removes every annotation on the page. You can undo it. |

Tool keys only work while the annotator is on, and never while you're typing in a field on the page or in a note.

The toolbar sits at the bottom centre of the window. Drag it by the dotted handle on its left; double-click the handle to send it back.

## Turning it on and off

- **Click the toolbar icon**, or
- press **`Alt+Shift+A`** (`⌥⇧A` on Mac).

When it's on, the floating toolbar is visible and the extension icon shows a blue **ON** badge. When it's off, the page goes back to normal and the annotations are hidden (not deleted). If a page has saved annotations, the icon shows a grey count.

`Alt+Shift+A` was chosen because sites and browsers rarely use it. To change it, open `chrome://extensions/shortcuts` (works in Dia too) and set a new shortcut for “Turn the annotator on or off”. If the browser or another extension already uses the keys, the page itself still listens for `Alt+Shift+A` as a fallback.

## Install in Dia (load unpacked)

1. Build the extension (see [Building](#building)). That creates the `dist/` folder.
2. In Dia, type `chrome://extensions` in the address bar and press Enter. Dia is built on Chromium, so it uses Chromium's extensions page.
3. Turn on **Developer mode** (the switch at the top right).
4. Click **Load unpacked** and choose the folder:
   `~/code/review-annotator/dist`
5. Pin the extension so its icon is easy to reach. Click the extensions (puzzle piece) button in the toolbar, then click the pin next to “Review Annotator”.
6. Open any website and press `Alt+Shift+A`.

After you rebuild, click the **reload** arrow on the extension's card in `chrome://extensions`, then reload any tabs you had open.

**Other Chromium browsers (Chrome, Edge, Arc, Brave):** the steps are the same. Open the browser's extensions page (`chrome://extensions`, `edge://extensions`, `brave://extensions`), turn on Developer mode, click **Load unpacked**, and choose `dist/`.

> I couldn't find official Dia documentation for loading unpacked extensions. These steps are the standard Chromium flow, which Dia follows. If Dia ever moves the extensions page, look for “Extensions” in Dia's menus.

## How annotations stay in place

The annotation layer is **not** a fixed overlay on the window. It lives in the page itself:

1. **Document coordinates.** A `<review-annotator>` element is attached to `<html>`, positioned at the document's top-left corner. Every stroke, shape and note is stored in document pixels (`clientX + scrollX`, `clientY + scrollY`) and drawn in an SVG/HTML layer inside that element. When you scroll, the browser moves the layer with the content natively, with no scroll listeners and no lag. Long pages work the same as short ones.
2. **Element anchors.** When you finish an annotation, the extension notes the page element under it (for example, the card you circled) and where that element was. If the element later moves, the annotation moves by the same amount. Elements move when the window is resized and the layout reflows, when browser zoom changes, when images or late content load above it, or when an inner scroll container scrolls. The extension rechecks positions on resize, DOM changes, font loads and inner scrolls, batched to one pass per animation frame.
3. **Shadow DOM isolation.** The layer and toolbar live in a shadow root, so the site's CSS can't restyle them and their CSS can't leak into the site.
4. **The page stays usable.** The layer ignores the pointer except while a drawing tool is selected. Then a transparent input surface catches the pointer, so drawing doesn't click links or select text, while the mouse wheel still scrolls the page. Switch to **Use the page** (`V` or `Esc`) to interact with the site normally, with annotations still showing.

Annotations are translated with their anchor, not scaled. If a card gets narrower on a small window, a rectangle drawn around it keeps its size and follows the card's top-left corner.

## Saving

Annotations are saved automatically in the extension's local storage, one set per page (origin + path + query string; the `#hash` is ignored). They come back when you reload the page and turn the annotator on. Single-page apps that change the URL without reloading are handled: each URL gets its own set.

To delete a page's annotations, use **Clear page**.

Known limits:

- Anchors are CSS paths (`#id` or `tag:nth-of-type` chains). On sites whose markup changes between loads (A/B tests, feeds, personalised content), an annotation may land on a different element or fall back to its original document position.
- Annotations drawn over `position: fixed` or `sticky` elements (sticky headers, chat bubbles) are pinned to the document, not the element, so they scroll away from the header like the rest of the page.
- Content inside iframes (embedded videos, some checkout forms) can't be annotated individually. Drawing over them still works.
- Browser-internal pages (`chrome://…`, the extension store, the built-in PDF viewer) can't run extensions. The icon flashes a dash there.
- Undo history lasts for the visit. After a reload, the saved annotations are there but earlier steps can't be undone.

## Building

Requires Node 20.11+.

```sh
npm install
npm run build     # bundles src/ into dist/ (load this folder unpacked)
npm run watch     # rebuilds on change; reload the extension afterwards
npm run lint      # ESLint + TypeScript type check
npm test          # builds, then runs the end-to-end tests in headless Chromium
npm run zip       # builds and writes review-annotator.zip from dist/
```

The tests use Playwright's Chromium. If it isn't installed yet, run `npx playwright install chromium` once.

## Demo page

`test/fixtures/demo.html` is a long, responsive test page with a sticky header, a card grid that reflows, an inner scrolling list, a form, a click counter, and a button that inserts content above everything. Serve it with:

```sh
npm run demo      # http://localhost:5178/
```

Things to try:

- Draw on a card, scroll away and back, and resize the window. The drawing stays on the card.
- Switch to **Use the page** and click **insert content above** in the notice at the top. Annotations below move down with the content.
- Circle an item in the opening-hours list, then scroll the list.
- Press **Add to cart** with the pen selected (it draws a dot, and the counter doesn't change), then press `V` and try again (the counter goes up).
- Reload the page and turn the annotator back on. Your annotations are still there.

The automated tests in `test/annotator.spec.ts` check these behaviours against this page with the real extension loaded.

## Project layout

```
public/            manifest.json and icons (copied into dist/)
src/background.ts  toolbar icon, keyboard command, badge
src/content/       everything that runs in the page
  annotator.ts     toolbar, tools, drawing, history, layout
  anchor.ts        element anchoring (how annotations follow the page)
  geometry.ts      paths, arrowheads, hit-testing
  storage.ts       per-page persistence and preferences
  styles.css       shadow-DOM styles
scripts/           build, demo server, icon renderer
test/              Playwright end-to-end tests and the demo page
```

Permissions: `storage` (saving), `activeTab` + `scripting` (to inject into tabs that were already open when the extension was installed), and a content script on `http(s)` pages. The extension makes no network requests.
