# Music System Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the music system into a tabbed, polyphonic panel with a two-column Soundtrack view.

**Architecture:**
- Use arrays in `song.tracks[name].notes[subIndex]` for polyphony.
- Implement `renderSoundtrackPanel` with a two-column flex layout.
- Implement `Song Editor` as a standard panel (`#song-editor-panel`) with a sidebar and header.
- Add an independent `requestAnimationFrame` loop or `setInterval` for the song preview.

**Tech Stack:** Vanilla JavaScript, HTML5 Canvas, Web Audio API.

---

### Task 1: Polyphonic Data Refactor

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Update `addSong` and `loadProject` for arrays**
Ensure `notes` in each track is initialized and handled as arrays.
```javascript
// In addSong
notes: {} // will store arrays like { "0": [0, 4, 7] }
```

- [ ] **Step 2: Update `triggerSongNote` to handle arrays**
Loop through the array of degrees and play each one.
```javascript
function triggerSongNote(song, trackName, subdivisionIndex, ctx = null, dest = null) {
    const degrees = song.tracks[trackName].notes[subdivisionIndex];
    if (!degrees || !Array.isArray(degrees)) return;
    degrees.forEach(degree => {
        // playSynth or playDrum logic
    });
}
```

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "refactor: update data model and trigger logic for polyphony"
```

---

### Task 2: Soundtrack Panel Refactor (Two-Column)

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: Update HTML structure for Soundtrack Panel**
Use a two-column flex layout.
```html
<div id="soundtrack-panel" class="hidden panel">
    <div class="panel-header">Soundtrack</div>
    <div class="soundtrack-layout">
        <div class="library-col"><h3>Library</h3><div id="song-library-list"></div><button id="add-song-btn">+</button></div>
        <div class="scenes-col"><h3>Scene Music</h3><div id="scene-music-list"></div></div>
    </div>
</div>
```

- [ ] **Step 2: Update `renderSoundtrackPanel` and CSS**
Implement the flex layout and styling.

- [ ] **Step 3: Commit**
```bash
git add index.html app.js style.css
git commit -m "feat: implement two-column layout for Soundtrack panel"
```

---

### Task 3: Song Editor Panel & Sidebar

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: Replace Overlay with Panel in HTML**
Remove `song-studio-overlay` and add `song-editor-panel` as a standard panel.
Add the sidebar with the 4 colorful buttons.

- [ ] **Step 2: Implement Sidebar Navigation in `app.js`**
Handle `state.ui.activeTrack` and redraw the grid when switching tabs.

- [ ] **Step 3: Styling for Sidebar Buttons**
Add colors (Blue, Magenta, Green, Yellow) and emoji labels.

- [ ] **Step 4: Commit**
```bash
git add index.html app.js style.css
git commit -m "feat: implement tabbed Song Editor panel with instrument sidebar"
```

---

### Task 4: Polyphonic Canvas Grid & Note Feedback

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Update `renderSongStudioGrid`**
Draw multiple notes in a single column if present in the array.
Only show notes for the `state.ui.activeTrack`.

- [ ] **Step 2: Update `canvas.onclick` for polyphony**
Add degree to array if missing, remove if present.
Immediately call `triggerSongNote` (passing a temp subIndex with the single note) for audio feedback.

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "feat: update grid rendering and interaction for polyphonic notes and audio feedback"
```

---

### Task 5: Independent Song Preview

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add Preview Controls to Header**
Add `[▶️]` and `[⏹️]` buttons to the `#song-editor-panel` header.

- [ ] **Step 2: Implement Preview Loop**
Use `setInterval` or a separate `requestAnimationFrame` loop.
Update `state.ui.previewFrame` and trigger notes.

- [ ] **Step 3: Commit**
```bash
git add index.html app.js
git commit -m "feat: implement independent song preview loop"
```
