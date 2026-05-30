# Music System Polishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Soundtrack and Song Editor UI with the rest of the application, fix timing/sync issues, and improve keyboard interaction.

**Architecture:**
- Use the app's established `.list-item` and `.panel` styles for all music UI.
- Use `requestAnimationFrame` for song previews to ensure timing parity with the movie loop.
- Update `onKeyDown` to handle contextual space-bar behavior.
- Adjust note triggering to handle the initial frame (frame 0) correctly.

**Tech Stack:** Vanilla JavaScript, HTML5 Canvas, CSS.

---

### Task 1: UI Alignment (Soundtrack & Song Editor)

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`

- [ ] **Step 1: Standardize Soundtrack List items**
Update `renderSoundtrackPanel` in `app.js` to use the same nested structure as `createListItem` (Unified Thumbnail Container, clickable name, etc.).

- [ ] **Step 2: Restyle Song Editor Panel & Sidebar**
Update `style.css` to make the Song Editor panel larger (90% width/height).
Restyle `.inst-tab` to look like the drawing tool buttons (square, clean border, no gradient).

- [ ] **Step 3: Refine Song Editor Header**
Update HTML and CSS to align the name input and controls vertically.
Replace separate Play/Stop buttons with a single toggle button.

- [ ] **Step 4: Commit**
```bash
git add index.html style.css app.js
git commit -m "style: align music panels with project aesthetic and standardize lists"
```

---

### Task 2: Logic & Timing Fixes

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Fix First Beat Bug**
Update the note triggering logic in `renderLoop` to handle the transition from frame -1 (or undefined) to 0.
```javascript
// Ensure currentSub logic doesn't skip frame 0
const currentSub = Math.floor(songFrame / framesPerSub);
const lastSub = state.ui.currentFrame === 0 ? -1 : Math.floor((songFrame - 1) / framesPerSub);
```

- [ ] **Step 2: Sync Preview Speed**
Replace `setInterval` in `startSongPreview` with a `requestAnimationFrame` loop that uses the same `FRAME_DURATION` logic as the main `renderLoop`.

- [ ] **Step 3: Implement Contextual Space Bar**
Update `onKeyDown` in `app.js`.
```javascript
if (e.code === 'Space') {
    if (state.ui.activePanel === 'songEditor') {
        toggleSongPreview(); // Need to implement this wrapper
        return;
    }
}
```

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "fix: synchronize preview timing, fix first-beat bug, and add contextual keyboard support"
```

---

### Task 3: Final Polish & Interaction

**Files:**
- Modify: `app.js`
- Modify: `index.html`

- [ ] **Step 1: Implement `toggleSongPreview`**
Add the wrapper function that switches between `start` and `stop` and updates the play button icon.

- [ ] **Step 2: Clean up HTML IDs**
Ensure all IDs used in the new logic match the updated HTML.

- [ ] **Step 3: Commit**
```bash
git add app.js index.html
git commit -m "feat: implement song preview toggle and finalize keyboard interaction"
```
