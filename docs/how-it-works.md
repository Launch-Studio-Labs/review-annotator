# How Review Annotator works

Details for contributors and the curious. For install and usage, see the [README](../README.md).

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

The automated tests in [`test/annotator.spec.ts`](../test/annotator.spec.ts) check these behaviours against this page with the real extension loaded.

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
