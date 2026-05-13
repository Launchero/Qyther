# Web Navigation Best Practices

## URL Resolution Patterns
- Always prepend `https://` if no protocol is specified
- If `www.` is missing, try with and without it
- Common domain suffixes: `.com`, `.org`, `.net`, `.io`, `.co`

## Page Load Indicators
- Check for `document.readyState === 'complete'` before interacting
- For SPAs (React, Vue, Angular): wait for specific elements, not just page load
- Look for loading spinners: `.spinner`, `.loading`, `[aria-busy="true"]`

## Common Redirect Chains
- HTTP → HTTPS (301 permanent redirect)
- `example.com` → `www.example.com` (canonical redirect)
- Login redirects: `/` → `/login` → `/dashboard`

## Error Page Detection
Common error page indicators:
- Title contains "Error", "404", "500", "Not Found"
- Body contains "Page not found", "Server error", "Something went wrong"
- Status codes: 4xx (client errors), 5xx (server errors)

## Tab Management Rules
- Maximum 3 open tabs at any time
- Close tabs that are no longer needed
- Track which tab contains the target content
- Use `browser_tabs` to list all open tabs before opening new ones

## Performance Guidelines
- Set reasonable timeouts: 30s for navigation, 10s for interactions
- Don't retry failed navigations more than 2 times
- Report the final URL and page title after every navigation
