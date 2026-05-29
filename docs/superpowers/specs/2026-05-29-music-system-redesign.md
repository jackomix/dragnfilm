# Music System Redesign Spec

**Goal:** Replace the legacy "musician" recording system with a centralized, bar-based "Song Studio" for composing music using a scale-degree piano roll.

## 1. Architecture & Data Model

### Global Song Library
The project state will host a `songs` array. Each song is a structured object.

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
            lead: { instrument: "piano", notes: {} },   // notes: { "0": 7, "2": 5 } where key is subdivision index, value is degree
            chords: { instrument: "synth", notes: {} },
            bass: { instrument: "synth", notes: {} },
            drums: { instrument: "drum", notes: {} }
        }
    }
];
```

### Scene Association
Scenes will now reference a song by ID instead of holding their own recordings.
```javascript
state.project.scenes[i].songId = "song_123";
```

## 2. UI Components

### Soundtrack Panel
Replaces the existing "Music" panel.
- **Scene List:** Shows all scenes with a dropdown to select a Song ID or "None".
- **Song List:** Shows all created songs with "Edit" and "Delete" buttons.
- **Add Song:** Button to create a new song.

### Song Studio (Overlay)
A large (90% width/height) overlay for editing a single song.
- **Header:** Editable name, BPM, Key, Scale, and Bar Length.
- **Piano Roll Grid:**
    - 4 rows (one per track).
    - Horizontal: Divided into Bars -> Beats -> 8th notes.
    - Vertical: 14 scale degrees (2 octaves).
    - Responsive: The grid stretches/compresses to fit the screen width.
- **Interaction:** Click a cell to set the note for that 8th-note slot. Click again to clear. (Monophonic per track).

## 3. Audio Engine

### Scale Degree Logic
Notes are calculated based on the selected Key and Scale.
- **Lead/Bass:** Plays the specific frequency for the degree.
- **Chords:** Plays a triad (or appropriate chord) based on the degree.
- **Drums:** Maps degrees to specific percussion sounds (Kick, Snare, etc.).

### Seamless Playback
- Playback timing is global.
- If `scene[i].songId === scene[i+1].songId`, the audio context timing continues uninterrupted.
- If the song changes, the previous audio is stopped and the new one starts from the beginning of its loop.

## 4. Implementation Phases
1. **Data Migration:** Update state structure and clear legacy musician data.
2. **Soundtrack UI:** Build the panel and scene association logic.
3. **Song Studio UI:** Build the responsive grid and note editing.
4. **Playback Integration:** Update the `renderLoop` and audio triggers to use the new song model.
