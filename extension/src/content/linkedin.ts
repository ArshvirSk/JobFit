function extractJobDescription() {
  const container = document.querySelector('.jobs-description-content__text');
  if (container) {
    const text = (container as HTMLElement).innerText;
    const titleElement = document.querySelector('.job-details-jobs-unified-top-card__job-title');
    const companyElement = document.querySelector('.job-details-jobs-unified-top-card__company-name');
    
    const title = titleElement ? (titleElement as HTMLElement).innerText.trim() : 'Unknown Role';
    const company = companyElement ? (companyElement as HTMLElement).innerText.trim() : 'Unknown Company';

    chrome.runtime.sendMessage({
      type: 'JD_DETECTED',
      payload: {
        text,
        title,
        company,
        url: window.location.href,
        source: 'linkedin'
      }
    });
  }
}

// LinkedIn is a SPA, so we need to observe DOM changes
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      const jd = document.querySelector('.jobs-description-content__text');
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
