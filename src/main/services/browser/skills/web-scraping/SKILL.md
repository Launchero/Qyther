---
name: web-scraping
description: Expert at scraping data from multiple pages, handling pagination, infinite scroll, and dynamic content loading
category: scraping
---

# Web Scraping Skill

## When to use
- User asks to scrape data from multiple pages
- Crawl a website for structured data
- Handle pagination to collect all results
- Deal with infinite scroll or "load more" buttons
- Collect data across multiple search results pages

## Instructions

1. **Start with browser_snapshot** on the first page to understand the data structure and pagination mechanism.

2. **Identify the pagination pattern**:
   - Look for numbered page links, "Next" buttons, or "Load More" triggers
   - For infinite scroll, use `browser_scroll` repeatedly until no new content appears

3. **Extract data per page**:
   - Extract all relevant data from the current page
   - Track which items have been extracted to avoid duplicates

4. **Navigate through pages**:
   - Click "Next" or page number links
   - Wait for content to load after each navigation
   - Verify each new page loaded correctly via snapshot

5. **Handle rate limits and anti-bot measures**:
   - Add small delays between page requests (1-2 seconds)
   - If blocked, report the issue and stop
   - Never bypass CAPTCHAs or authentication walls

6. **Aggregate and deduplicate results**:
   - Combine data from all pages
   - Remove duplicate entries
   - Report the total count and any scraping issues

## Best Practices
- Be respectful: don't hammer servers with rapid requests
- Report progress: "Page 3 of 12, extracted 45 items so far"
- Set reasonable limits: stop after 20 pages or 500 items unless the user requests more
- Always include source URLs for scraped data items
