# Privacy

_Last updated: November 19, 2026_

Review Annotator doesn't collect, send or sell any data.

## What it stores

- **Your annotations:** strokes, shapes and note text, saved with the address of the page you drew on so they come back when you return to it.
- **Your toolbar settings:** the last tool, the last color and where you dragged the toolbar.

All of this is kept in the browser's extension storage (`chrome.storage.local`) on your device. It never leaves your browser. Removing the extension deletes it. **Clear page** deletes the annotations for that page.

## What it doesn't do

- No analytics, tracking or telemetry.
- No network requests. The extension doesn't contact any server, including ours.
- No accounts, cookies or ads.
- No reading of page content beyond what it needs to keep your drawings in place. It looks up the position of the element you drew on, on your device only.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `storage` | Saves your annotations and toolbar settings on your device. |
| `activeTab` | Lets the extension start on the tab you're looking at when you click its icon or press the shortcut. This covers tabs that were already open before you installed it. |
| `scripting` | Used with `activeTab` to load the annotator into that tab. |
| Content script on `http://*/*` and `https://*/*` | The annotator has to run inside the page to draw on it, and site reviews can happen on any website. It stays idle and invisible until you turn it on. |

## Contact

Questions or concerns: open an issue at https://github.com/Launch-Studio-Labs/review-annotator/issues.
