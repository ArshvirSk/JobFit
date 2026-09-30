function extractAndSendAuth() {
  const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  if (key) {
    try {
      const tokenData = JSON.parse(localStorage.getItem(key) || '{}');
      const accessToken = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token;
      
      if (accessToken) {
        // Only send if it changed to avoid spamming the background script
        if ((window as any)._lastSentToken !== accessToken) {
          console.log("[jobfit.ts] Extracted new access token from localStorage, sending to background.");
          chrome.runtime.sendMessage({ type: 'JOBFIT_AUTH', payload: accessToken });
          (window as any)._lastSentToken = accessToken;
        }
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Extension context invalidated')) {
        clearInterval(intervalId);
      } else {
        console.error("Failed to parse or send auth token", e);
      }
    }
  }
}

extractAndSendAuth();

// Run every 2 seconds in case they log in while the page is open
const intervalId = setInterval(extractAndSendAuth, 2000);
