---
name: web-navigation
description: Expert at navigating web pages, handling redirects, waiting for page loads, and managing browser tabs
category: navigation
---

# Web Navigation Skill

## When to use
- User asks to go to a specific URL
- User needs to navigate between pages
- Multi-page workflows requiring tab management
- Handling redirects and page load waits

## Instructions

1. **Always start with browser_snapshot** to understand the current page state before navigating.

2. **Use browser_navigate for direct URL navigation**:
   - Always use full URLs with protocol (https://...)
   - If the user provides a partial URL, infer the full URL from context
   - Wait for the page to fully load after navigation

3. **Use browser_wait after navigation** when the page takes time to load or redirects:
   - Default wait: 2-3 seconds
   - For SPAs (Single Page Applications): wait until dynamic content appears

4. **Manage tabs with browser_tabs**:
   - Only open new tabs when explicitly needed
   - Close unnecessary tabs to keep context clean
   - Track which tab has the relevant content

5. **Handle redirects gracefully**:
   - If a URL redirects, verify the final destination is correct
   - Report any unexpected redirect chains

6. **Error handling for navigation**:
   - If a URL is unreachable, try the HTTP version before reporting failure
   - Check for common typos in the provided URL

## Best Practices
- After navigating, ALWAYS take a snapshot to confirm the page loaded correctly
- Report the final URL and page title after navigation
- If navigation fails, try alternative approaches (search for the site, use a different URL format)
