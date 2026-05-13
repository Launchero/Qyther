// Extract paginated data - get items from current page
() => {
  const items = Array.from(document.querySelectorAll('.item, .product, .card, li'));
  return items.map(item => ({
    title: item.querySelector('h1, h2, h3, h4, .title')?.innerText?.trim() || '',
    link: item.querySelector('a')?.href || '',
    description: item.querySelector('.description, p')?.innerText?.trim() || '',
    price: item.querySelector('.price, .cost, [class*="price"]')?.innerText?.trim() || '',
  })).filter(item => item.title || item.link);
}

---

// Find pagination controls
() => {
  const paginationSelectors = [
    '.pagination',
    '.pager',
    '[role="navigation"]',
    'nav[aria-label*="pagination"]',
    'nav[aria-label*="page"]',
  ];
  for (const selector of paginationSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const links = Array.from(el.querySelectorAll('a'));
      return links.map(a => ({
        text: a.innerText.trim(),
        href: a.href,
        isNext: /next|›|»|>/i.test(a.innerText),
        isPrev: /prev|‹|«|</i.test(a.innerText),
      }));
    }
  }
  return null;
}

---

// Handle infinite scroll - scroll and check for new content
() => {
  const initialHeight = document.body.scrollHeight;
  window.scrollTo(0, initialHeight);
  return {
    initialHeight,
    currentHeight: document.body.scrollHeight,
    hasMore: document.body.scrollHeight > initialHeight,
  };
}

---

// Detect anti-bot measures
() => {
  const indicators = [
    document.querySelector('.cf-challenge, .cf-verif, [class*="captcha"]'),
    document.querySelector('[id*="captcha"]'),
    document.querySelector('form[action*="challenge"]'),
    document.title.includes('Just a moment') || document.title.includes('Security Check'),
    document.body.innerText.includes('verify you are a human'),
  ];
  return indicators.some(Boolean);
}

---

// Wait for dynamic content to load
async () => {
  const maxWait = 10000;
  const interval = 500;
  let elapsed = 0;
  let previousHeight = document.body.scrollHeight;
  
  while (elapsed < maxWait) {
    await new Promise(r => setTimeout(r, interval));
    elapsed += interval;
    const currentHeight = document.body.scrollHeight;
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
  }
  
  return {
    waited: elapsed,
    finalHeight: document.body.scrollHeight,
  };
}
