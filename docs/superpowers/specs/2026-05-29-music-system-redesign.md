# Music System Redesign Spec v2

**Goal:** Implement a centralized, bar-based "Song Editor" panel with polyphonic support and a tabbed "DAW-style" interface.

## 1. Architecture & Data Model

### Global Song Library
The project state will host a `songs` array. Each song is polyphonic.

```javascript
state.project.songs = [
    {
        id: "song_123",
        name: "Main Theme",
        bpm: 120,
        key: "C",
        scale: "major",
        bars: 4,
        tracks: {
            lead: { instrument: "piano", notes: {} },   // notes: { "0": [7], "2": [5, 7] } - arrays for polyphony
            chords: { instrument: "synth", notes: {} },
            bass: { instrument: "synth", notes: {} },
            drums: { instrument: "drum", notes: {} }
        }
    }
];
```

### UI State
```javascript
state.ui.activeSongId = null; // Song being edited
state.ui.activeTrack = 'lead'; // 'lead', 'chords', 'bass', 'drums'
state.ui.isPreviewPlaying = false;
state.ui.previewFrame = 0;
```

## 2. UI Components

### Soundtrack Panel
- **Two-Column Layout:**
    - **Left Column (Library):** Manage songs (Add, Edit, Delete).
    - **Right Column (Scenes):** Assign songs to scenes via dropdowns.
- **Styling:** White background, consistent with the app's theme.

### Song Editor Panel
- **Layout:** "DAW-style" sidebar-main interface.
- **Sidebar (Left):** 4 instrument tabs:
    - 🎸 **Lead** (Blue)
    - 🎹 **Chords** (Magenta)
    - 🎸 **Bass** (Green)
    - 🥁 **Drums** (Yellow)
- **Main Area:** Piano roll grid for the *selected* instrument only.
- **Header:**
    - Editable Name, BPM, Key, Scale, Bars.
    - Preview Controls: `[▶️]` and `[⏹️]` buttons.
- **Responsive Grid:** Stretches/compresses to fit the screen width.

## 3. Interactions & Feedback

### Note Editing
- **Toggle:** Click to add/remove a degree from the array at that 8th-note slot.
- **Audio Feedback:** Play the frequency of the degree immediately upon placement.
- **Polyphony:** Multiple notes can exist at the same horizontal position.

### Song Preview
- Independent loop playhead.
- Does not trigger animation frames; only triggers `triggerSongNote` using its own `previewFrame` counter.

## 4. Audio Engine
- **triggerSongNote:** Updated to loop through the array of degrees at a given slot.
- **getFrequencyForDegree:** (Same as v1).

## 5. Implementation Phases
1. **Refactor Data Model:** Transition `notes: {}` from values to arrays.
2. **Soundtrack Panel Layout:** Implement the two-column management view.
3. **Song Editor Panel UI:** Build the tabbed panel and sidebar.
4. **Polyphonic Grid:** Update the canvas rendering and click logic for arrays.
5. **Independent Preview:** Implement the preview loop and controls.
