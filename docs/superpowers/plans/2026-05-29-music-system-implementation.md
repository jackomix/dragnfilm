# Music System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy "musician" recording system with a centralized, bar-based "Song Studio" for composing music using a scale-degree piano roll.

**Architecture:** 
- Centralize songs in `state.project.songs`.
- Update `state.project.scenes` to reference `songId`.
- Implement a 4-track piano roll (Lead, Chords, Bass, Drums) with 8th-note resolution.
- Use `renderLoop` to trigger notes based on current frame and song BPM.

**Tech Stack:** Vanilla JavaScript, HTML5 Canvas (for grid), Web Audio API.

---

### Task 1: State Migration and Data Model

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Update `state.project` structure**
Add `songs` array to `state.project` and `songId` to `createEmptyScene`.
```javascript
// In state.project definition
        showTitleCard: true,
        songs: []
// In createEmptyScene function
function createEmptyScene(name) { return { id: 'scene_' + Date.now(), name, songId: null, ... }; }
```

- [ ] **Step 2: Update `init` function to handle migration**
Reset version to '3.0-music' to clear old musician data.
```javascript
async function init() {
    if (localStorage.getItem('drag-n-film-version') !== '3.0-music') {
        localStorage.clear();
        localStorage.setItem('drag-n-film-version', '3.0-music');
    }
    // ...
}
```

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "feat: migrate state to support global songs and scene association"
```

---

### Task 2: Soundtrack Panel UI

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: Update HTML for Soundtrack Panel**
Rename `instruments-panel` to `soundtrack-panel` and update content.
```html
<div id="soundtrack-panel" class="hidden panel">
    <div class="panel-header">Soundtrack</div>
    <div class="panel-content">
        <div class="file-section">
            <h3>Scene Music</h3>
            <div id="scene-music-list" class="list-container"></div>
        </div>
        <div class="file-section">
            <h3>Library</h3>
            <div id="song-library-list" class="list-container"></div>
            <button id="add-song-btn" class="plus-btn">+</button>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Implement `renderSoundtrackPanel` in `app.js`**
Handle scene-to-song dropdowns and song list.
```javascript
function renderSoundtrackPanel() {
    // ... logic to render scenes with song dropdowns and library with edit/delete ...
}
```

- [ ] **Step 3: Commit**
```bash
git add index.html app.js style.css
git commit -m "feat: implement soundtrack panel UI for song management"
```

---

### Task 3: Song Studio Overlay UI

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `style.css`

- [ ] **Step 1: Create Song Studio Overlay in HTML**
Add a high-z-index overlay.
```html
<div id="song-studio-overlay" class="hidden overlay">
    <div class="studio-container">
        <!-- Header, BPM, Key, Scale, Bars -->
        <!-- Responsive Grid Canvas -->
        <!-- Close Button -->
    </div>
</div>
```

- [ ] **Step 2: Implement responsive grid rendering in `app.js`**
Calculate cell widths based on `bars` and `8` (8th notes).
```javascript
function renderSongStudioGrid(song) {
    const canvas = document.getElementById('studio-grid-canvas');
    // ... draw 4 tracks, 14 degree rows each ...
}
```

- [ ] **Step 3: Implement note toggling logic**
Map click coordinates to `track` and `subdivisionIndex`.
```javascript
canvas.onclick = (e) => {
    // ... update song.tracks[track].notes[index] = degree ...
}
```

- [ ] **Step 4: Commit**
```bash
git add index.html app.js style.css
git commit -m "feat: implement song studio overlay with responsive grid"
```

---

### Task 4: Audio Engine Integration

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Implement `getFrequencyForDegree`**
Calculate Hz based on root key and scale.
```javascript
function getFrequencyForDegree(degree, key, scale, octave) {
    // ... major/minor scale intervals ...
}
```

- [ ] **Step 2: Implement `triggerSongNote`**
Play synth for Lead/Bass/Chords and samples/percussion for Drums.
```javascript
function triggerSongNote(song, trackName, subdivisionIndex) {
    const degree = song.tracks[trackName].notes[subdivisionIndex];
    if (degree === undefined) return;
    // ... playNote logic updated for song tracks ...
}
```

- [ ] **Step 3: Update `renderLoop` to sync with Song BPM**
Calculate current subdivision based on `currentFrame` and `BPM`.
```javascript
// Inside renderLoop
if (isPlaying && currentSong) {
    const framesPerSubdivision = (60 * FPS) / (song.bpm * 2); // 8th notes
    const currentSub = Math.floor(state.ui.currentFrame / framesPerSubdivision) % (song.bars * 8);
    // ... trigger notes if sub changed ...
}
```

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "feat: integrate new audio engine with song-based playback"
```

---

### Task 5: Seamless Transitions and Cleanup

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Update `playAllAudio` and `stopAllAudio`**
Handle song switching logic (don't stop if same songId).
```javascript
function playAllAudio() {
    const scene = getCurrentScene();
    if (scene.songId === lastPlayedSongId) return; // Seamless
    // ... start new song ...
}
```

- [ ] **Step 2: Remove legacy musician code**
Clean up `musician` properties from scene creation and event handlers.

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "refactor: implement seamless transitions and cleanup legacy music code"
```
