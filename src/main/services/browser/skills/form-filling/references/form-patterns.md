# Form Filling Patterns and Best Practices

## Input Field Types and Handling

### Text Inputs
```javascript
// Standard text field
<input type="text" id="username" name="username">
// Use browser_fill with the field ref or name

// Email field with validation
<input type="email" id="email" name="email" required>
// Ensure format: user@domain.com

// Password field (masked)
<input type="password" id="password" name="password">
// Use browser_fill, content will be masked
// NEVER echo password in responses
```

### Dropdowns and Selects
```html
<!-- Native select -->
<select id="country" name="country">
  <option value="">Select country</option>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
<!-- Use browser_select_option with the option value -->

<!-- Custom dropdown (div-based) -->
<div class="dropdown" role="button" aria-haspopup="listbox">
  <span>Select option</span>
</div>
<!-- Click to open, then click the desired option -->
```

### Checkboxes and Radio Buttons
```html
<!-- Checkbox -->
<input type="checkbox" id="terms" name="terms">
<label for="terms">I agree to the terms</label>
<!-- Click to toggle; check state before clicking -->

<!-- Radio button group -->
<input type="radio" name="size" value="small"> Small
<input type="radio" name="size" value="medium"> Medium
<input type="radio" name="size" value="large"> Large
<!-- Click the desired radio button; it auto-deselects others -->
```

### Multi-step Form Patterns
1. **Step 1: Personal Info** → Click "Next"
2. **Step 2: Address** → Click "Next"
3. **Step 3: Payment** → Click "Submit"

After each step:
- Take a snapshot to verify the next step loaded
- Check for error messages before proceeding
- If validation fails, fix the error and retry

## Common Form Validation Errors

| Error Type | Detection | Resolution |
|------------|-----------|------------|
| Required field | "This field is required" | Fill the empty field |
| Invalid email | "Please enter a valid email" | Fix email format |
| Password too short | "Minimum 8 characters" | Use longer password |
| Invalid format | "Format: MM/DD/YYYY" | Use correct date format |
| Mismatch | "Passwords do not match" | Ensure both fields match |

## Security Guidelines
- NEVER store or log passwords
- Use placeholder text for sensitive data in responses
- Clear form data after submission if possible
- Report successful form submission without echoing submitted values
