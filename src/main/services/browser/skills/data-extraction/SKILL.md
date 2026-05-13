---
name: data-extraction
description: Expert at extracting structured data from web pages including tables, lists, text content, and metadata
category: extraction
---

# Data Extraction Skill

## When to use
- User asks to extract data from a webpage
- Scrape specific values (prices, names, dates, stats)
- Extract table data or list items
- Get metadata from the page (title, description, Open Graph data)
- Extract links or URLs from a page

## Instructions

1. **Always start with browser_snapshot** to understand the page structure and locate the data.

2. **For simple text extraction**:
   - Use the snapshot to identify the target element
   - If the data is visible in the snapshot, extract it directly from the snapshot text

3. **For complex extraction using browser_evaluate**:
   - Use JavaScript to query the DOM when snapshot is insufficient
   - Common patterns:
     - Extract all links: `Array.from(document.querySelectorAll('a[href]')).map(a => a.href)`
     - Extract table data: `Array.from(document.querySelectorAll('table tr')).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()))`
     - Extract specific text: `document.querySelector('selector').textContent`

4. **For structured data extraction**:
   - Look for JSON-LD, microdata, or Open Graph meta tags
   - Use `browser_evaluate` to extract structured data from meta tags
   - Format the output as clean, structured text

5. **For multi-page extraction**:
   - Extract data page by page
   - Navigate to the next page and repeat
   - Aggregate results at the end

6. **Data validation**:
   - Verify extracted data looks reasonable
   - Report the count and sample of extracted items

## Best Practices
- Prefer snapshot-based extraction when possible (faster, more reliable)
- Use browser_evaluate only when the snapshot doesn't contain the needed data
- Format extracted data clearly with labels and structure
- Report the source URL with extracted data for traceability
