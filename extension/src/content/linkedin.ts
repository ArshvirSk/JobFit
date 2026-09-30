let lastDetectedUrl = '';

function detectContext() {
  const currentUrl = window.location.href;
  
  // 1. Determine page type from URL (most resilient)
  const isJobPage = currentUrl.includes('/jobs/') || currentUrl.includes('currentJobId=');
  const isCompanyPage = currentUrl.includes('/company/');

  if (isJobPage) {
    const titleElement = document.querySelector('.job-details-jobs-unified-top-card__job-title, h1.t-24.t-bold, h1.job-title, h2.t-24, .top-card-layout__title');
    const container = document.querySelector('#job-details, .jobs-description-content__text, .jobs-description__container, .jobs-description, .description__text, article') || document.body;
    
    const text = (container as HTMLElement).innerText;
    const companyElement = document.querySelector('.job-details-jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a, .topcard__org-name-link, .job-details-jobs-unified-top-card__primary-description span');
    
    const title = titleElement ? (titleElement as HTMLElement).innerText.trim() : 'Unknown Role';
    const company = companyElement ? (companyElement as HTMLElement).innerText.trim() : 'Unknown Company';

    // Avoid spamming if same job
    const jobKey = currentUrl.split('?')[0] + title;
    if (lastDetectedUrl === jobKey) return;
    lastDetectedUrl = jobKey;

    chrome.runtime.sendMessage({
      type: 'CONTEXT_DETECTED',
      payload: {
        type: 'job',
        text,
        title,
        company,
        url: currentUrl,
        source: 'linkedin'
      }
    });
    return;
  }

  // Company Page Detection
  if (isCompanyPage) {
    // Attempt to get company name from title tag or DOM
    let company = document.title.split('|')[0].trim();
    const companyHeader = document.querySelector('.org-top-card-summary__title, h1.t-24');
    if (companyHeader) {
      company = (companyHeader as HTMLElement).innerText.trim();
    }
    
    // Clean up title like "Google: Overview | LinkedIn"
    company = company.replace(/(: Overview|\| LinkedIn)/gi, '').trim();

    if (lastDetectedUrl === currentUrl) return;
    lastDetectedUrl = currentUrl;

    chrome.runtime.sendMessage({
      type: 'CONTEXT_DETECTED',
      payload: {
        type: 'company',
        company,
        url: currentUrl,
        source: 'linkedin'
      }
    });
  }
}

// LinkedIn is a SPA, so we need to observe DOM changes
let timeout: any = null;
const observer = new MutationObserver(() => {
  // Debounce to avoid performance hits during heavy DOM mutations
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => {
    detectContext();
  }, 1000);
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check
detectContext();
