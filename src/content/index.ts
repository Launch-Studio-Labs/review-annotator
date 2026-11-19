import { Annotator } from './annotator';
import type { ToBackground, ToContent } from '../types';

declare global {
  interface Window {
    __reviewAnnotator?: Annotator;
  }
}

function sendState(active: boolean, count: number): void {
  const message: ToBackground = { type: 'state', active, count };
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension was reloaded; this copy of the script is orphaned.
  }
}

// The script can be injected twice (declared + on-demand). Only boot once.
if (!window.__reviewAnnotator && document.documentElement instanceof HTMLHtmlElement) {
  const annotator = new Annotator(sendState);
  window.__reviewAnnotator = annotator;
  const ready = annotator.init();

  chrome.runtime.onMessage.addListener((message: ToContent, _sender, respond) => {
    if (message?.type !== 'toggle') return;
    void ready.then(() => {
      annotator.toggle(message.source);
      respond({ active: annotator.active });
    });
    return true;
  });

  // Single-page apps change URL without reloading; swap to that page's annotations.
  let href = location.href;
  const checkUrl = () => {
    if (location.href === href) return;
    href = location.href;
    void annotator.changePage();
  };
  setInterval(checkUrl, 800);
  window.addEventListener('popstate', checkUrl);
  window.addEventListener('hashchange', checkUrl);
}
