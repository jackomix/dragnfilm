# Song Editor Panel UI Adjustment

## Purpose
Resize the song editor panel to approximately half-size and reposition it from a fixed, centered overlay to the bottom-left UI container.

## Design
- **CSS Changes:**
  - Remove absolute/fixed positioning and sizing overrides from `#song-editor-panel` in `style.css`.
  - Allow `#song-editor-panel` to inherit layout properties from the base `.panel` class.
  - Define custom width (`width: 600px`) and height (`max-height: 400px`) constraints to ensure it remains smaller than the current full-screen implementation.
- **Positioning:**
  - By removing the fixed positioning, the panel will naturally follow the flow of the `#ui-bottom-left` flex container, appearing in the bottom-left relative to other UI panels.
