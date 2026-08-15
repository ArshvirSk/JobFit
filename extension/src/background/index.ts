let activeJD: any = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JD_DETECTED') {
    activeJD = message.payload;
    if (sender.tab?.id) {
      chrome.action.setBadgeText({ text: '1', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#2563EB', tabId: sender.tab.id });
    }
    // Forward to popup if open
    chrome.runtime.sendMessage({ type: 'JD_UPDATED', payload: activeJD }).catch(() => {});
  } else if (message.type === 'GET_ACTIVE_JD') {
    sendResponse(activeJD);
  } else if (message.type === 'CLEAR_ACTIVE_JD') {
    activeJD = null;
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

chrome.tabs.onActivated.addListener(() => {
  // Reset on tab switch, the content script will re-fire if it's still a job page
  activeJD = null;
});
