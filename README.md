# Review Annotator

Draw and leave notes on any website during a site review. Your marks stay pinned to the page as you scroll.

![Review Annotator marking up a page: a circled heading, a highlight, a box with an arrow, and two notes, with the toolbar at the bottom](docs/screenshot.png)

## Install

**Chrome Web Store:** coming soon. Until it's listed, install it from source:

1. `npm install && npm run build`
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `dist/` folder.

This works in Chrome, Dia, Arc, Edge, Brave and other Chromium browsers.

## Use

Press **`Alt+Shift+A`** (`⌥⇧A` on Mac) or click the extension icon to turn it on or off.

- **Tools:** pen, highlighter, arrow, box, text note, eraser
- **Colors:** five, on keys `1`–`5`
- **Undo, redo, and clear**
- **Use the page** (`V` or `Esc`) keeps your marks visible while you click and scroll normally.
- Drawings stay attached to the content when you scroll or resize, and they're saved per URL in your browser.

Each tool has a single-letter key, shown in its tooltip. To change the toggle shortcut, open `chrome://extensions/shortcuts`.

## Develop

```sh
npm install
npm run build    # bundle into dist/
npm run watch    # rebuild on change
npm run lint     # ESLint + type check
npm test         # end-to-end tests with the real extension in headless Chromium
npm run zip      # build and package dist/ as review-annotator.zip
npm run demo     # serve the test page at http://localhost:5178
```

The tests need Playwright's Chromium (`npx playwright install chromium`). [How it works](docs/how-it-works.md) explains the anchoring, storage and known limits.

## Privacy

Everything stays in your browser. There's no tracking, no analytics and no network requests. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © 2026 Launch Studio
