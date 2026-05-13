---
name: visual-interaction
description: Expert at visual verification, screenshots, coordinate-based clicking, and interactions requiring visual confirmation
category: visual
---

# Visual Interaction Skill

## When to use
- User asks to take a screenshot of a page
- Visual verification that something appears correctly
- Coordinate-based clicking when element targeting fails
- Checking visual state (colors, layouts, images loading)
- Drag and drop operations
- Hover interactions to reveal tooltips or menus

## Instructions

1. **Screenshots**:
   - Use `browser_take_screenshot` to capture the current viewport
   - For full-page screenshots, scroll and take multiple screenshots if needed
   - Describe what's visible in the screenshot for the user

2. **Coordinate-based clicking** (when element targeting fails):
   - Use `browser_take_screenshot` to get the current viewport
   - Identify the coordinates of the target element from the screenshot
   - Use `browser_mouse_click_xy` with the determined coordinates
   - Verify the result with a follow-up snapshot

3. **Hover interactions**:
   - Use `browser_hover` to reveal tooltips, dropdowns, or hidden content
   - After hovering, take a snapshot to see what was revealed
   - Use this for menus, expandable sections, and hover-triggered content

4. **Drag and drop**:
   - Use `browser_drag` with source and target coordinates or element refs
   - Verify the drag completed successfully via snapshot

5. **Scroll interactions**:
   - Use `browser_scroll` to reveal off-screen content
   - Scroll incrementally (not all at once) for better control
   - Verify content appeared after scrolling

6. **Visual verification**:
   - Compare expected visual state with actual snapshot
   - For pixel-level verification, use screenshots and describe differences

## Best Practices
- Prefer element-based interactions (browser_click, browser_fill) over coordinate-based
- Use coordinate-based clicking only as a fallback
- Always verify the result of visual interactions
- Report screenshots descriptively since the user may not see the image directly
