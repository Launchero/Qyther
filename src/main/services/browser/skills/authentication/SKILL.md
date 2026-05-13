---
name: authentication
description: Expert at handling login flows, 2FA, session management, and authenticated browsing with security best practices
category: authentication
---

# Authentication Skill

## When to use
- User asks to log into a website
- Access authenticated content (dashboard, account settings)
- Handle multi-factor authentication flows
- Maintain session state across tasks

## Instructions

1. **IMPORTANT: Security First**
   - NEVER store, log, or echo passwords
   - NEVER display credentials in the response
   - Use placeholder text like "[credentials provided]" instead of actual values
   - If the user provides credentials, use them immediately and do not repeat them

2. **Standard login flow**:
   - Navigate to the login page
   - Use browser_snapshot to locate username/email and password fields
   - Use browser_fill for the username field
   - Use browser_fill for the password field (the input will be masked)
   - Click the login/submit button
   - Verify login success by checking for dashboard or account page content

3. **Handle 2FA/MFA gracefully**:
   - If a 2FA prompt appears, report to the user and request the code
   - Do NOT attempt to bypass 2FA
   - If the user cannot provide a 2FA code, stop and report

4. **Session management**:
   - Once logged in, maintain the session for subsequent tasks
   - Check session validity before accessing protected pages
   - If the session expires, report to the user

5. **Error handling**:
   - If login fails due to wrong credentials, report the error without echoing them
   - If the site uses SSO (Single Sign-On), follow the redirect flow
   - If blocked by rate limiting, wait and retry once

## Best Practices
- Always confirm successful login by verifying the expected page state
- Log out when the task is complete (if appropriate)
- For OAuth flows, follow the redirect chain and confirm the final state
- If a site requires JavaScript-heavy authentication (e.g., passwordless), use appropriate browser tools
