let lastDetectedUrl = '';

function detectContext() {
  const currentUrl = window.location.href;
  
  const container = document.querySelector('#jobDescriptionText');
  if (container) {
    const text = (container as HTMLElement).innerText;
    const titleElement = document.querySelector('.jobsearch-JobInfoHeader-title');
    const companyElement = document.querySelector('[data-company-name="true"]');
    
    const title = titleElement ? (titleElement as HTMLElement).innerText.trim() : 'Unknown Role';
    const company = companyElement ? (companyElement as HTMLElement).innerText.trim() : 'Unknown Company';

    if (lastDetectedUrl === currentUrl) return;
    lastDetectedUrl = currentUrl;

    chrome.runtime.sendMessage({
      type: 'CONTEXT_DETECTED',
      payload: {
        type: 'job',
        text,
        title,
        company,
        url: currentUrl,
        source: 'indeed'
      }
    });
    return;
  }
  
  // Basic Indeed company page detection
  if (currentUrl.includes('/cmp/')) {
    const companyHeader = document.querySelector('[itemprop="name"]');
    if (companyHeader) {
      const company = (companyHeader as HTMLElement).innerText.trim();
      
      if (lastDetectedUrl === currentUrl) return;
      lastDetectedUrl = currentUrl;

      chrome.runtime.sendMessage({
        type: 'CONTEXT_DETECTED',
        payload: {
          type: 'company',
          company,
          url: currentUrl,
          source: 'indeed'
        }
      });
    }
  }
}

let timeout: any = null;
const observer = new MutationObserver(() => {
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => {
    detectContext();
  }, 1000);
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check
detectContext();
