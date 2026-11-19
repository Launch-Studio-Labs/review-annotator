# Chrome Web Store listing: Review Annotator

Copy for the Chrome Web Store developer dashboard. The listing isn't live yet, so there's no store URL.

## Name

Review Annotator

## Short description (manifest `description`, 104 of 132 characters max)

Draw and leave notes on any page during site reviews. Annotations stay pinned to the page as you scroll.

## Category

Tools. Productivity → Tools in the current store taxonomy; Workflow & Planning is the second choice.

## Language

English

## Detailed description

Review Annotator lets you mark up any website while you review it. Circle a heading, highlight a line, box a section, point with an arrow, or drop a short note, right on the live page.

Your marks stay attached to the content. Scroll and they move with the page. Resize the window and they follow the element you drew on. Come back later and they're still there, saved per page in your browser.

Tools
• Pen and highlighter
• Arrow and box
• Text notes you can edit later
• Eraser
• Five colors
• Undo, redo and clear page

Built to stay out of the way
• Turn it on and off with Alt+Shift+A or the toolbar icon
• A small toolbar you can drag anywhere
• "Use the page" mode keeps your marks visible while you click, select and scroll normally
• Single-key shortcuts for every tool

Private by design
• Everything is stored on your device
• No accounts, no analytics, no network requests

Works in Chrome and other Chromium browsers. Open source under the MIT license.

## Single purpose

Review Annotator has one purpose: drawing and placing notes on top of web pages so people can review and give feedback on websites. Every feature (drawing tools, notes, undo, saving annotations per page) serves that purpose.

## Permission justifications

**storage**
Saves the user's annotations (keyed by page URL) and toolbar preferences in `chrome.storage.local` so they come back when the user revisits the page. Nothing is synced or sent anywhere.

**activeTab**
When the user clicks the toolbar icon or presses the keyboard shortcut, the extension needs access to the current tab to show the annotator there. This covers tabs that were open before the extension was installed or updated, where the content script isn't loaded yet.

**scripting**
Used with activeTab to inject the extension's own bundled content script (`content.js`) into the current tab on demand, for the case above. No remote code is injected.

**Host permissions (content script on `http://*/*` and `https://*/*`)**
The annotator draws inside the page, so it needs a content script on whatever site the user is reviewing, and that can be any website. The script does nothing visible until the user turns it on. It only reads element positions so annotations stay attached to the content when the page scrolls or reflows. It doesn't read or send page content.

## Remote code

No. All code is bundled in the package. The extension makes no network requests.

## Data usage (privacy practices form)

- Collected data: none. Check no boxes.
- Annotations and preferences are stored only on the user's device and are never transmitted.
- Certify: no selling or transferring of user data to third parties; no use or transfer for purposes unrelated to the single purpose; no use for creditworthiness or lending.

Privacy policy URL: https://github.com/Launch-Studio-Labs/review-annotator/blob/main/PRIVACY.md (live once the repo is public).

## Assets in this folder

| File | Use |
| --- | --- |
| `screenshot-1-review.png` | Screenshot 1 (1280×800): a card grid mid-review with a loop, highlight, box, arrow and two notes |
| `screenshot-2-closeup.png` | Screenshot 2 (1280×800): close-up of a hero section with a note and arrow |
| `screenshot-3-notes.png` | Screenshot 3 (1280×800): notes in several colors on a form, with a toolbar tooltip |
| `promo-small-440x280.png` | Small promo tile (440×280) |
| `../public/icons/icon-128.png` | Store icon (128×128) |

The upload package is `review-annotator.zip` at the repo root (`npm run zip`).

Screenshots and the promo tile are generated from the demo page with the real extension loaded: `npm run screenshots`.
