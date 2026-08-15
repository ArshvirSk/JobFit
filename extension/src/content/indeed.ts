function extractJobDescription() {
  const container = document.querySelector('#jobDescriptionText');
  if (container) {
    const text = (container as HTMLElement).innerText;
    const titleElement = document.querySelector('.jobsearch-JobInfoHeader-title');
    const companyElement = document.querySelector('[data-company-name="true"]');
    
    const title = titleElement ? (titleElement as HTMLElement).innerText.trim() : 'Unknown Role';
    const company = companyElement ? (companyElement as HTMLElement).innerText.trim() : 'Unknown Company';

    chrome.runtime.sendMessage({
      type: 'JD_DETECTED',
      payload: {
        text,
        title,
        company,
        url: window.location.href,
        source: 'indeed'
      }
    });
  }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      const jd = document.querySelector('#jobDescriptionText');
      if (jd && !jd.getAttribute('data-jobfit-parsed')) {
        jd.setAttribute('data-jobfit-parsed', 'true');
        extractJobDescription();
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check
extractJobDescription();
