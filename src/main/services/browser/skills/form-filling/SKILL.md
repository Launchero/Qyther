---
name: form-filling
description: Expert at filling out web forms, handling dropdowns, checkboxes, multi-step forms, and form validation errors
category: interaction
---

# Form Filling Skill

## When to use
- User asks to fill out a web form
- Login/signup flows
- Multi-step checkout or registration
- Configuration forms with multiple fields
- Any task requiring text input into form fields

## Instructions

1. **Always use browser_snapshot before interacting** to see all available form fields and their current state.

2. **Text fields**:
   - Use `browser_fill` to replace existing content (preferred for most fields)
   - Use `browser_type` only when you need to trigger typing handlers or append to existing content
   - For sensitive fields (passwords), confirm with the user before filling

3. **Dropdowns and selects**:
   - Use `browser_select_option` for native select elements
   - For custom dropdowns, use `browser_click` to open the dropdown, then `browser_click` to select the option

4. **Checkboxes and radio buttons**:
   - Use `browser_click` to toggle checkboxes
   - Check the snapshot to see current state before clicking

5. **Multi-step forms**:
   - Complete each step fully before moving to the next
   - After each step, verify the next step loaded correctly via snapshot
   - Handle validation errors: if a field is rejected, fix it before proceeding

6. **Submit buttons**:
   - Use `browser_click` on the submit button
   - After submission, verify the result page is correct

7. **Error handling**:
   - If a field is not fillable (read-only, disabled), report it and skip
   - If form submission fails, try the alternative submission method (Enter key vs click)

## Best Practices
- Always confirm what was filled and the result after submission
- For login forms, NEVER store credentials in memory or logs
- Handle CAPTCHAs gracefully: if detected, report to user and stop
