# Visual Interaction Patterns and Techniques

## Screenshot Analysis

### When to Take Screenshots
- Before coordinate-based clicking to identify targets
- To verify visual state (images loaded, colors correct)
- After interactions to confirm the result
- When element-based targeting fails

### Screenshot Best Practices
- Take a fresh screenshot before each coordinate action
- Don't reuse coordinates from old screenshots
- Report what's visible for the user's reference

## Coordinate-Based Clicking Strategy

1. Take screenshot of current viewport
2. Identify target element location
3. Calculate x,y coordinates
4. Click immediately after screenshot
5. Verify result with a new snapshot

### When to Use Coordinates vs Elements
- Prefer `browser_click` with element refs when possible
- Use coordinates only for:
  - Canvas elements
  - Image maps
  - Custom UI components not in accessibility tree
  - Overlapping elements where refs are ambiguous

## Drag and Drop Patterns

### Native Drag
```javascript
// Use browser_drag with source and target refs
// Works for: sortable lists, file uploads, kanban boards
```

### Custom Drag (JavaScript)
```javascript
// Some sites use custom drag implementations
// May require dispatching drag events manually
```

## Hover Interactions

### Common Hover Targets
- Dropdown menus (navigation bars)
- Tooltips and info icons
- Image galleries (thumbnail hover)
- Expandable content sections

### Hover Verification
After hovering, always take a snapshot to see what was revealed.

## Scroll Techniques

### Incremental Scroll
```javascript
// Scroll in small increments (300-500px)
// Check for new content after each scroll
// Stop when no new content appears
```

### Scroll to Element
- Use `scrollIntoView` behavior when clicking off-screen elements
- Verify element is visible before interacting

## Visual Verification Checklist
- [ ] Target element is visible in viewport
- [ ] No overlapping elements blocking interaction
- [ ] Page has finished loading (no spinners)
- [ ] Result of interaction matches expectation
- [ ] Report any visual anomalies to the user
