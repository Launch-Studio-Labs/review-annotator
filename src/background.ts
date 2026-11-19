import type { ToBackground, ToContent, ToggleSource } from './types';

const ON_COLOR = '#3E63DD';
const IDLE_COLOR = '#6F6F78';

async function toggle(tab: chrome.tabs.Tab | undefined, source: ToggleSource): Promise<void> {
  const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (tabId === undefined) return;
  const message: ToContent = { type: 'toggle', source };
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The tab was open before the extension was installed or reloaded, so the
    // declared content script isn't there yet. Inject it now (activeTab grants
    // access because the user just clicked the icon or pressed the shortcut).
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Browser-internal pages (chrome://, the web store, PDF viewer) can't be scripted.
      flashUnavailable(tabId);
    }
  }
}

function flashUnavailable(tabId: number): void {
  void chrome.action.setBadgeBackgroundColor({ tabId, color: IDLE_COLOR });
  void chrome.action.setBadgeText({ tabId, text: '–' });
  void chrome.action.setTitle({ tabId, title: "Review Annotator can't run on this page" });
  setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 1800);
}

chrome.action.onClicked.addListener((tab) => void toggle(tab, 'action'));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-annotator') void toggle(tab, 'command');
});

chrome.runtime.onMessage.addListener((message: ToBackground, sender) => {
  const tabId = sender.tab?.id;
  if (message?.type !== 'state' || tabId === undefined) return;
  const { active, count } = message;
  const text = active ? 'ON' : count > 0 ? String(Math.min(count, 99)) : '';
  void chrome.action.setBadgeBackgroundColor({ tabId, color: active ? ON_COLOR : IDLE_COLOR });
  void chrome.action.setBadgeText({ tabId, text });
  void chrome.action.setTitle({
    tabId,
    title: active
      ? 'Review Annotator is on (Alt+Shift+A to turn off)'
      : count > 0
        ? `Review Annotator: ${count} saved on this page (Alt+Shift+A to show)`
        : 'Review Annotator (Alt+Shift+A)',
  });
});

// Exposed for the automated tests, which can't click the toolbar icon.
(globalThis as Record<string, unknown>).__reviewAnnotatorToggle = toggle;
