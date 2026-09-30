// Enable side panel on click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting side panel behavior:", error));

let activeContext: any = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTEXT_DETECTED') {
    activeContext = message.payload;
    if (sender.tab?.id) {
      chrome.action.setBadgeText({ text: '1', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#2563EB', tabId: sender.tab.id });
    }
  } else if (message.type === 'GET_ACTIVE_CONTEXT') {
    sendResponse(activeContext);
  } else if (message.type === 'CLEAR_ACTIVE_CONTEXT') {
    activeContext = null;
    sendResponse({ success: true });
  } else if (message.type === 'JOBFIT_AUTH') {
    chrome.storage.local.set({ jobfit_auth_token: message.payload });
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

chrome.tabs.onActivated.addListener(() => {
  // Reset on tab switch, the content script will re-fire if it's still a job page
  activeContext = null;
});
