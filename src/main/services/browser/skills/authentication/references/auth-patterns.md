# Authentication Flow Patterns

## Standard Login Flow
1. Navigate to login page (usually `/login`, `/signin`, `/auth`)
2. Snapshot to locate email/username and password fields
3. Fill credentials using `browser_fill`
4. Click submit button
5. Verify success (redirect to dashboard, welcome message, etc.)

## Common Login Providers

### Google OAuth
- Redirect to accounts.google.com
- User may need to select an account
- Look for "Sign in with Google" button

### GitHub OAuth
- Redirect to github.com/login/oauth
- Look for "Authorize" button
- May require 2FA if enabled

### Microsoft OAuth
- Redirect to login.microsoftonline.com
- May require organization selection
- Follow the redirect chain back to original site

## Session Management

### Cookie-Based Sessions
- Session stored in cookies (usually `session_id`, `auth_token`)
- Check for auth cookies before accessing protected pages
- If session expires, re-authenticate

### Token-Based Sessions
- JWT in localStorage or cookies
- Check for token in browser storage
- Refresh token if expired

## 2FA/MFA Handling

### TOTP (Time-based)
- User must provide 6-digit code
- Common apps: Google Authenticator, Authy
- Code expires every 30 seconds

### SMS/Email Verification
- Code sent to phone or email
- User must provide the code
- Look for input fields labeled "Verification code"

### Hardware Keys
- YubiKey or similar
- Cannot be automated - report to user

## Error Detection
- "Invalid credentials" → wrong username/password
- "Account locked" → too many attempts
- "Verification required" → 2FA needed
- "Session expired" → re-login required

## Security Checklist
- [ ] Never store or log credentials
- [ ] Clear sensitive fields after use
- [ ] Verify the site is legitimate (check URL)
- [ ] Report 2FA requirements to user
- [ ] Log out when task is complete (if appropriate)
