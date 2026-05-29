const state = {
    project: {
        width: 320,
        height: 240,
        scenes: [],
        currentSceneIndex: 0,
        movieTitle: "My Movie",
        creatorName: "Me",
        fontStyle: "Arial",
        titleBgColor: "#ffffff",
        titleTextColor: "#000000",
        showTitleCard: true,
        songs: []
    },
    ui: {
        activePanel: null, editingTarget: null, editingCostumeIndex: 0, 
        currentTool: 'pencil', currentColor: '#000000',
        dragMode: 'drag', 
        clipboard: null,
        isRecording: false, isPlaying: false, isTheaterMode: false,
        isTitleCardActive: false,
        lineDashOffset: 0,
        lastBoilUpdate: 0,
        movieStartSceneIndex: 0,
        currentFrame: 0,
        lastFrameTime: 0,
        timeAccumulator: 0,
        selectedActorId: null, 
        micEnabled: false, pencilSize: 5,
        stageMargin: 500, 
        isResetting: false,
        undoStack: [], redoStack: []
    },
    countdownTimer: null
};

const colors = [
    'transparent', '#000000', '#808080', '#c0c0c0', '#ffffff', '#800000', '#ff0000', '#808000', '#ffff00', 
    '#008000', '#00ff00', '#008080', '#00ffff', '#000080', '#0000ff', '#800080', '#ff00ff', '#808040', 
    '#ffff80', '#004040', '#00ff80', '#0080ff', '#80ffff', '#004080', '#8080ff', '#8000ff', '#ff0080', 
    '#804000', '#ff8040'
];

const FPS = 60;
const FRAME_DURATION = 1000 / FPS;

const instruments = {
    piano: { name: "Piano", icon: "🎹", type: "triangle" },
    synth: { name: "Synth", icon: "🔊", type: "sawtooth" },
    flute: { name: "Flute", icon: "🌬️", type: "sine" },
    bell: { name: "Bell", icon: "🔔", type: "square" }
};

const stage = document.getElementById('stage');
const editorCanvas = document.getElementById('editor-canvas');
const listPanel = document.getElementById('list-panel');
const filePanel = document.getElementById('file-panel');
const moviePanel = document.getElementById('movie-panel');
const musicPanel = document.getElementById('instrument-panel');
const editorPanel = document.getElementById('editor-panel');
const actorList = document.getElementById('actor-list');
const sceneList = document.getElementById('scene-list');
const costumeList = document.getElementById('costume-list');
const colorPalette = document.getElementById('color-palette');
const progressContainer = document.getElementById('progress-container');

let micStream = null, audioContext = null, musicRecorder = null, musicChunks = [], musicDest = null, mediaRecorder = null, audioChunks = [], activeAudioPlayers = [];

async function init() {
    if (localStorage.getItem('drag-n-film-version') !== '3.0-music') {
        localStorage.removeItem('drag-n-film-project');
        localStorage.setItem('drag-n-film-version', '3.0-music');
    }
    setupStage(); setupPalette(); bindEvents();
    if (sessionStorage.getItem('drag-n-film-reset') === 'true') { sessionStorage.removeItem('drag-n-film-reset'); localStorage.removeItem('drag-n-film-project'); }
    else await loadProject();
    if (state.project.scenes.length === 0) createInitialState();
    updatePlayMovieButton();
    updateMovieExportButtons();
    updateMicButton();
    syncMovieInputs();
    renderActorList();
    renderSceneList();
    
    window.addEventListener('mousedown', (e) => {
        const ui = document.getElementById('ui-bottom-left');
        if (!stage.contains(e.target) && !ui.contains(e.target)) { state.ui.selectedActorId = null; renderActorList(); }
    });
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveProject(); });
}

function syncMovieInputs() {
    document.getElementById('movie-title-input').value = state.project.movieTitle;
    document.getElementById('movie-creator-input').value = state.project.creatorName;
    document.getElementById('movie-font-select').value = state.project.fontStyle;
    document.getElementById('movie-bg-color').value = state.project.titleBgColor;
    document.getElementById('movie-text-color').value = state.project.titleTextColor;
    document.getElementById('show-title-card-checkbox').checked = state.project.showTitleCard;
}

let draggedActor = null, dragOffsetX = 0, dragOffsetY = 0, dragSrcIndex = -1;

function setupStage() {
    const m = state.ui.stageMargin;
    stage.width = state.project.width + m * 2;
    stage.height = state.project.height + m * 2;
    stage.style.width = (stage.width * 2) + 'px';
    stage.style.height = (stage.height * 2) + 'px';
    stage.onmousedown = onStageMouseDown;
    window.addEventListener('mousemove', onStageMouseMove);
    window.addEventListener('mouseup', onStageMouseUp);
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(renderLoop);
}

function getActorDisplayState(actor, frameIndex) {
    if (!actor) return { x: 0, y: 0, ci: 0 };
    let x = actor.x, y = actor.y, ci = actor.currentCostume;
    const rec = actor.recordings[actor.recordings.length - 1];
    const frameData = rec && rec.frames ? rec.frames[frameIndex] : null;
    
    if (state.ui.isPlaying || state.ui.isRecording) {
        if (frameData) { x = frameData.x; y = frameData.y; ci = frameData.costumeIndex; }
    } else if (rec && rec.frames?.length > 0) {
        const first = rec.frames[0];
        if (first) { x = first.x; y = first.y; ci = first.costumeIndex; }
    }
    
    const isDragging = draggedActor && draggedActor.id === actor.id;
    if (isDragging) { x = actor.x; y = actor.y; ci = actor.currentCostume; }
    
    return { x, y, ci };
}

function getCurrentScene() { return state.project.scenes[state.project.currentSceneIndex]; }

function renderLoop() {
    const ctx = stage.getContext('2d'); ctx.imageSmoothingEnabled = false; 
    ctx.fillStyle = state.ui.isTheaterMode ? "black" : "white";
    ctx.fillRect(0, 0, stage.width, stage.height);
    const margin = state.ui.stageMargin, scene = getCurrentScene();
    if (!scene) { requestAnimationFrame(renderLoop); return; }
    
    const now = performance.now();
    const isPlayingOrRecording = state.ui.isPlaying || state.ui.isRecording;

    if (isPlayingOrRecording) {
        let deltaTime = now - state.ui.lastFrameTime;
        if (deltaTime > 500) deltaTime = 500;
        state.ui.timeAccumulator += deltaTime;
        state.ui.lastFrameTime = now;

        const steps = Math.floor(state.ui.timeAccumulator / FRAME_DURATION);
        let currentStep = 0;

        const startPositions = new Map();
        if (state.ui.isRecording && steps > 0) {
            scene.actors.forEach(actor => {
                const rec = actor.recordings[actor.recordings.length - 1];
                if (rec && rec.frames) {
                    const prev = rec.frames[state.ui.currentFrame];
                    if (prev) startPositions.set(actor.id, { x: prev.x, y: prev.y });
                }
            });
        }

        while (state.ui.timeAccumulator >= FRAME_DURATION) {
            state.ui.currentFrame++;
            state.ui.timeAccumulator -= FRAME_DURATION;
            currentStep++;
            
            if (!state.ui.isTitleCardActive) {
                triggerMusicEvents(scene, state.ui.currentFrame);
            }

            if (state.ui.isRecording) {
                const t = currentStep / (steps || 1);
                scene.actors.forEach(actor => {
                    const isSelected = state.ui.selectedActorId === actor.id;
                    const isHoverRec = state.ui.dragMode === 'hover' && isSelected;
                    const isDragRec = draggedActor && draggedActor.id === actor.id;
                    if (isHoverRec || isDragRec) {
                        const rec = actor.recordings[actor.recordings.length - 1];
                        const start = startPositions.get(actor.id);
                        if (start) {
                            rec.frames[state.ui.currentFrame] = {
                                x: start.x + (actor.x - start.x) * t,
                                y: start.y + (actor.y - start.y) * t,
                                costumeIndex: actor.currentCostume
                            };
                        } else {
                            rec.frames[state.ui.currentFrame] = { x: actor.x, y: actor.y, costumeIndex: actor.currentCostume };
                        }
                    }
                });
                
                if (state.ui.selectedActorId === 'backdrop') {
                    const rec = scene.backdrop.recordings[scene.backdrop.recordings.length - 1];
                    rec.frames[state.ui.currentFrame] = { x: 0, y: 0, costumeIndex: scene.backdrop.currentCostume };
                }
            }
        }
    } else {
        state.ui.lastFrameTime = now;
        state.ui.timeAccumulator = 0;
    }

    const titleCardDurationFrames = state.project.showTitleCard ? 120 : 0;
    const maxFrames = getMaxFrames(scene) || 30;

    updateProgressBarUI(state.ui.currentFrame, maxFrames);

    if (state.ui.isTheaterMode && state.ui.isTitleCardActive && state.project.showTitleCard) {
        if (state.ui.currentFrame < titleCardDurationFrames) {
            drawTitleCard(ctx, margin);
            requestAnimationFrame(renderLoop);
            return;
        } else {
            state.ui.isTitleCardActive = false;
            state.ui.currentFrame = 0;
            state.ui.lastFrameTime = performance.now();
            playAllAudio();
        }
    }
    
    if (!state.ui.isTheaterMode) {
        ctx.fillStyle = "white";
        ctx.fillRect(margin, margin, state.project.width, state.project.height);
    }

    const bd = scene.backdrop;

    if (state.ui.isPlaying && state.ui.currentFrame >= maxFrames) {
        if (state.project.currentSceneIndex < state.project.scenes.length - 1) {
            stopAllAudio();
            state.project.currentSceneIndex++;
            state.ui.currentFrame = 0;
            state.ui.lastFrameTime = performance.now();
            playAllAudio();
            renderActorList();
            renderSceneList();
        } else {
            togglePlayback();
        }
    }

    let bdCostumeIndex = bd.currentCostume;
    const bdRec = bd.recordings[bd.recordings.length - 1];
    if (state.ui.isPlaying || state.ui.isRecording) {
        if (bdRec) { const frame = bdRec.frames[state.ui.currentFrame]; if (frame) bdCostumeIndex = frame.costumeIndex; }
    } else if (bdRec && bdRec.frames?.length > 0) { bdCostumeIndex = bdRec.frames[0].costumeIndex; }
    if (bd.costumes[bdCostumeIndex]) ctx.drawImage(bd.costumes[bdCostumeIndex].canvas, margin, margin);
    
    if (!state.ui.isTheaterMode) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, stage.width, stage.height); ctx.rect(margin, margin, state.project.width, state.project.height); ctx.clip('evenodd');
        for (let i = scene.actors.length - 1; i >= 0; i--) {
            const actor = scene.actors[i];
            const { x, y, ci } = getActorDisplayState(actor, state.ui.currentFrame);
            const costume = actor.costumes[ci];
            if (costume) {
                const dx = margin + x - costume.canvas.width / 2, dy = margin + y - costume.canvas.height / 2;
                ctx.save(); ctx.globalAlpha = 0.1; ctx.filter = 'brightness(0)'; 
                ctx.drawImage(costume.canvas, Math.round(dx) - 1, Math.round(dy) - 1);
                ctx.drawImage(costume.canvas, Math.round(dx) + 3, Math.round(dy) + 3); ctx.restore();
            }
        }
        ctx.restore();
    }

    for (let i = scene.actors.length - 1; i >= 0; i--) {
        const actor = scene.actors[i];
        const { x, y, ci } = getActorDisplayState(actor, state.ui.currentFrame);
        const isSelected = state.ui.selectedActorId === actor.id;
        const costume = actor.costumes[ci];
        if (costume) {
            const dx = margin + x - costume.canvas.width / 2, dy = margin + y - costume.canvas.height / 2;
            ctx.drawImage(costume.canvas, Math.round(dx), Math.round(dy));
            if (!state.ui.isTheaterMode && !state.ui.isPlaying && isSelected) drawSelectionOutline(ctx, Math.round(dx), Math.round(dy), costume.canvas.width, costume.canvas.height);
        }
    }

    if (!state.ui.isTheaterMode) {
        ctx.strokeStyle = "black"; ctx.lineWidth = 1; ctx.strokeRect(margin - 0.5, margin - 0.5, state.project.width + 1, state.project.height + 1);
    } else {
        ctx.fillStyle = "black"; ctx.fillRect(0, 0, stage.width, margin); ctx.fillRect(0, margin + state.project.height, stage.width, margin); ctx.fillRect(0, 0, margin, stage.height); ctx.fillRect(margin + state.project.width, 0, margin, stage.height);
    }

    if (!state.ui.isTheaterMode && !state.ui.isPlaying && state.ui.selectedActorId === 'backdrop') drawSelectionOutline(ctx, margin, margin, state.project.width, state.project.height);
    if (!state.ui.isTheaterMode && !state.ui.isPlaying && state.ui.selectedActorId === 'musician') {
        ctx.strokeStyle = '#00f'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.strokeRect(margin+2, margin+2, state.project.width-4, state.project.height-4); ctx.setLineDash([]);
    }

    if (state.ui.isPlaying && state.ui.currentFrame >= maxFrames && state.project.currentSceneIndex === state.project.scenes.length - 1) { ctx.fillStyle = "black"; ctx.font = "bold 20px Arial"; ctx.fillText("Fin.", margin + 10, margin + state.project.height - 15); }
    requestAnimationFrame(renderLoop);
}

function drawTitleCard(ctx, margin) {
    const p = state.project;
    ctx.fillStyle = p.titleBgColor;
    ctx.fillRect(margin, margin, p.width, p.height);
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.font = `bold 24px "${p.fontStyle}"`;
    drawBoilingText(ctx, p.movieTitle, margin + p.width/2, margin + p.height/2 - 20, p.titleTextColor);
    ctx.font = `italic 14px "${p.fontStyle}"`;
    drawBoilingText(ctx, "by " + p.creatorName, margin + p.width/2, margin + p.height/2 + 20, p.titleTextColor);
}

function drawBoilingText(ctx, text, x, y, color) {
    ctx.fillStyle = color;
    const now = Date.now();
    if (now - state.ui.lastBoilUpdate > 150) { state.ui.boilSeed = Math.random(); state.ui.lastBoilUpdate = now; }
    const extraSpacing = state.project.fontStyle === 'Impact' ? 1 : 0;
    const fullWidth = ctx.measureText(text).width + (text.length - 1) * extraSpacing;
    let startX = x - fullWidth / 2;
    const originalAlign = ctx.textAlign;
    ctx.textAlign = "left";
    const chars = text.split('');
    chars.forEach((char, i) => {
        const seed = (state.ui.boilSeed || 0) + i;
        const ox = (Math.sin(seed * 123.45) * 0.5), oy = (Math.cos(seed * 678.90) * 0.5);
        const offset = ctx.measureText(text.substring(0, i)).width + (i * extraSpacing);
        ctx.fillText(char, startX + offset + ox, y + oy);
    });
    ctx.textAlign = originalAlign;
}

function updateProgressBarUI(currentFrame, maxFrames) {
    const scenes = state.project.scenes, durations = scenes.map(s => getMaxFrames(s) || 30), total = durations.reduce((a, b) => a + b, 0);
    progressContainer.innerHTML = '';
    durations.forEach((dur, i) => {
        const wp = (dur / total) * 100, seg = document.createElement('div'); seg.className = 'movie-progress-segment'; seg.style.width = wp + '%';
        const hue = 240 - (i / (scenes.length - 1 || 1) * 240), color = `hsl(${hue}, 80%, 50%)`;
        seg.style.borderTop = `1px solid ${color}`; seg.style.borderBottom = `1px solid ${color}`;
        if (i === 0) seg.style.borderLeft = `1px solid ${color}`;
        if (i === durations.length - 1) seg.style.borderRight = `1px solid ${color}`;
        const fill = document.createElement('div'); fill.className = 'movie-progress-fill'; fill.style.backgroundColor = color;
        if (state.ui.isTitleCardActive) fill.style.width = '0%';
        else if (i < state.project.currentSceneIndex) fill.style.width = '100%';
        else if (i === state.project.currentSceneIndex) {
            const isActive = state.ui.isPlaying || state.ui.isRecording;
            fill.style.width = isActive ? Math.min(100, (currentFrame / dur * 100)) + '%' : '0%';
        } else fill.style.width = '0%';
        seg.appendChild(fill); progressContainer.appendChild(seg);
    });
}

function drawSelectionOutline(ctx, x, y, w, h) {
    state.ui.lineDashOffset = (state.ui.lineDashOffset + 0.05) % 8;
    ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); 
    ctx.strokeStyle = 'yellow'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -state.ui.lineDashOffset;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

function getMaxFrames(scene) {
    let max = 0; if (!scene) return 0;
    [scene.backdrop, scene.musician, ...scene.actors].forEach(t => {
        const rec = t.recordings[t.recordings.length - 1];
        if (rec && rec.frames) {
            const keys = Object.keys(rec.frames).map(Number);
            const count = Array.isArray(rec.frames) ? rec.frames.length : (keys.length > 0 ? Math.max(...keys) + 1 : 0);
            if (count > max) max = count;
        }
    });
    return max;
}

function onStageMouseDown(e) {
    if (state.ui.activePanel === 'editor' || state.ui.isPlaying) return;
    const rect = stage.getBoundingClientRect(), sx = stage.width / rect.width, sy = stage.height / rect.height;
    const mx = (e.clientX - rect.left) * sx - state.ui.stageMargin, my = (e.clientY - rect.top) * sy - state.ui.stageMargin;
    let hit = false, scene = getCurrentScene(), frameIndex = state.ui.currentFrame;
    for (let i = 0; i < scene.actors.length; i++) {
        const a = scene.actors[i], { x, y, ci } = getActorDisplayState(a, frameIndex), c = a.costumes[ci], ax = x - c.canvas.width / 2, ay = y - c.canvas.height / 2;
        if (mx >= ax && mx <= ax + c.canvas.width && my >= ay && my <= ay + c.canvas.height) {
            const px = Math.floor(mx - ax), py = Math.floor(my - ay);
            if (px >= 0 && px < c.canvas.width && py >= 0 && py < c.canvas.height) {
                if (c.canvas.getContext('2d').getImageData(px, py, 1, 1).data[3] > 10) { state.ui.selectedActorId = a.id; const rec = a.recordings[a.recordings.length - 1]; if (state.ui.isRecording || !rec || rec.frames?.length === 0) { draggedActor = a; dragOffsetX = mx - x; dragOffsetY = my - y; } hit = true; break; }
            }
        }
    }
    if (!hit) {
        if (mx >= 0 && mx <= state.project.width && my >= 0 && my <= state.project.height) {
            state.ui.selectedActorId = (e.shiftKey) ? 'musician' : 'backdrop';
        } else state.ui.selectedActorId = null;
    }
    renderActorList();
}
function onStageMouseMove(e) {
    const rect = stage.getBoundingClientRect(), sx = stage.width / rect.width, sy = stage.height / rect.height;
    const mx = (e.clientX - rect.left) * sx - state.ui.stageMargin, my = (e.clientY - rect.top) * sy - state.ui.stageMargin;
    const isHoverActive = state.ui.dragMode === 'hover' && (state.ui.isRecording || state.countdownTimer);
    if (isHoverActive && state.ui.selectedActorId && !['backdrop', 'musician'].includes(state.ui.selectedActorId)) {
        const actor = getCurrentScene().actors.find(a => a.id === state.ui.selectedActorId);
        if (actor) { actor.x = mx; actor.y = my; }
    } else if (draggedActor) { draggedActor.x = mx - dragOffsetX; draggedActor.y = my - dragOffsetY; }
}
function onStageMouseUp() { draggedActor = null; saveProject(); }

const scales = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    blues: [0, 3, 5, 6, 7, 10]
};
const keyFrequencies = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function playNote(scene, noteIndex, isChord) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const mu = scene.musician;
    const inst = instruments[mu.instrument];
    const baseFreq = 261.63 * Math.pow(2, keyFrequencies.indexOf(mu.key) / 12);
    const scale = scales[mu.scale];
    const octave = mu.octaveOffset || 0;
    
    const notes = isChord ? [noteIndex, (noteIndex + 2), (noteIndex + 4)] : [noteIndex];
    
    notes.forEach(ni => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const noteShift = scale[ni % scale.length] + Math.floor(ni / scale.length) * 12 + (octave * 12);
        osc.frequency.value = baseFreq * Math.pow(2, noteShift / 12);
        osc.type = inst.type;
        
        // Connect to BOTH the monitor and the recorder destination
        osc.connect(gain);
        gain.connect(audioContext.destination);
        if (musicDest) gain.connect(musicDest);
        
        const now = audioContext.currentTime;
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(); osc.stop(now + 0.5);
    });
}

function onKeyDown(e) {
    if (e.code === 'Space') {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        e.preventDefault(); if (state.ui.isRecording) stopRecording(); else togglePlayback(false, false); return;
    }
    const mod = e.ctrlKey || e.metaKey, scene = getCurrentScene();
    if (!scene) return;

    // Music Keys (Live in menu OR recording)
    const isMusicianActive = state.ui.selectedActorId === 'musician';
    const isMusicMenuOpen = state.ui.activePanel === 'music';
    if (!mod && (isMusicMenuOpen || (isMusicianActive && (state.ui.isRecording || !state.ui.isPlaying)))) {
        const val = e.key === '0' ? 0 : parseInt(e.key);
        if (!isNaN(val)) {
            if (val >= 1 && val <= 7) { 
                const noteIndex = val - 1;
                const octave = scene.musician.octaveOffset || 0;
                playNote(scene, noteIndex, scene.musician.chordMode, octave); 
                if (state.ui.isRecording && isMusicianActive) {
                    const rec = scene.musician.recordings[scene.musician.recordings.length - 1];
                    const frame = state.ui.currentFrame;
                    if (!rec.frames[frame]) rec.frames[frame] = [];
                    rec.frames[frame].push({ note: noteIndex, chord: scene.musician.chordMode, octave: octave });
                }
                return; 
            }
            if (val === 8) { scene.musician.octaveOffset = Math.max(-2, (scene.musician.octaveOffset || 0) - 1); return; }
            if (val === 9) { scene.musician.octaveOffset = Math.min(2, (scene.musician.octaveOffset || 0) + 1); return; }
            if (val === 0) { scene.musician.chordMode = !scene.musician.chordMode; return; }
        }
    }

    if (state.ui.activePanel === 'editor') { if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; } }
    const ki = "1234567890qwertyuiopasdfghjklzxcvbnm".indexOf(e.key.toLowerCase());
    if (ki !== -1 && !mod) {
        if (state.ui.activePanel === 'editor') { const t = state.ui.editingTarget; if (t && t.costumes[ki]) { state.ui.editingCostumeIndex = ki; state.ui.undoStack = []; state.ui.redoStack = []; updateUndoRedoButtons(); renderCostumeList(); loadCostumeToEditor(t.costumes[ki]); } return; }
        let t = (state.ui.selectedActorId === 'backdrop' ? scene.backdrop : (state.ui.selectedActorId === 'musician' ? scene.musician : scene.actors.find(a => a.id === state.ui.selectedActorId)));
        if (t && t.costumes && t.costumes[ki]) {
            const rec = t.recordings[t.recordings.length - 1];
            const has = rec && (Array.isArray(rec.frames) ? rec.frames.length > 0 : Object.keys(rec.frames).length > 0);
            if (state.ui.isRecording || !has) { 
                t.currentCostume = ki; 
                if (state.ui.isRecording) { 
                    const frame = state.ui.currentFrame; 
                    if (t.id === 'backdrop') { 
                        rec.frames[frame] = { x: 0, y: 0, costumeIndex: ki }; 
                    } else if (t.id !== 'musician') { 
                        rec.frames[frame] = { x: t.x, y: t.y, costumeIndex: ki }; 
                    } 
                } 
            }
        }
    }
}

function setupPalette() { colorPalette.innerHTML = ''; colors.forEach(c => { const s = document.createElement('div'); s.className = 'color-swatch' + (c === 'transparent' ? ' transparent' : ''); if (c !== 'transparent') s.style.backgroundColor = c; if (c === state.ui.currentColor) s.classList.add('active'); s.onclick = () => { state.ui.currentColor = c; document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active')); s.classList.add('active'); }; colorPalette.appendChild(s); }); }
function createInitialState() { addScene(); }
function createEmptyScene(name) { return { id: 'scene_' + Date.now(), name, songId: null, backdrop: { id: 'backdrop', name: 'Backdrop', costumes: [createEmptyCostume(state.project.width, state.project.height, true)], currentCostume: 0, recordings: [] }, musician: { id: 'musician', name: 'Piano', instrument: 'piano', key: 'C', scale: 'major', octaveOffset: 0, chordMode: false, recordings: [] }, actors: [] }; }
function createEmptyCostume(w, h, isBD = false) { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); if (isBD) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h); } return { canvas: c, name: 'Costume' }; }

let isDrawing = false, startX, startY, snapshot, preStrokeState = null, brushPixels = [];

function bindEvents() {
    document.getElementById('file-btn').onclick = () => togglePanel('file');
    document.getElementById('scene-btn').onclick = () => togglePanel('movie');
    document.getElementById('add-scene-btn').onclick = addScene;
    document.getElementById('new-btn').onclick = newProject;
    document.getElementById('export-scene-video-btn').onclick = () => exportMovie(false, 'video');
    document.getElementById('export-scene-gif-btn').onclick = () => exportMovie(false, 'gif');
    document.getElementById('export-movie-video-btn').onclick = () => exportMovie(true, 'video');
    document.getElementById('export-movie-gif-btn').onclick = () => exportMovie(true, 'gif');
    document.getElementById('export-drag-btn').onclick = exportDragFile;
    document.getElementById('import-drag-btn').onclick = () => document.getElementById('import-drag-input').click();
    document.getElementById('import-drag-input').onchange = importDragFile;
    document.getElementById('list-toggle-btn').onclick = () => togglePanel('list');
    document.getElementById('add-actor-btn').onclick = addActor;
    document.getElementById('add-costume-btn').onclick = addCostume;
    document.getElementById('record-btn').onclick = startRecordingProcess;
    document.getElementById('play-btn').onclick = () => togglePlayback(false, false);
    document.getElementById('theater-btn').onclick = () => togglePlayback(true, true);
    document.getElementById('mic-toggle-btn').onclick = toggleMic;
    document.getElementById('drag-mode-btn').onclick = toggleDragMode;
    document.getElementById('undo-btn').onclick = undo;
    document.getElementById('redo-btn').onclick = redo;
    document.getElementById('copy-btn').onclick = copyCanvas;
    document.getElementById('paste-btn').onclick = pasteCanvas;
    document.getElementById('costume-copy-btn').onclick = copyCostume;
    document.getElementById('costume-paste-btn').onclick = pasteCostume;
    document.getElementById('show-title-card-checkbox').onchange = (e) => { state.project.showTitleCard = e.target.checked; saveProject(); };
    document.getElementById('music-instrument-select').onchange = (e) => { const mu = getCurrentScene().musician; mu.instrument = e.target.value; mu.name = instruments[mu.instrument].name; renderActorList(); saveProject(); };
    document.getElementById('music-key-select').onchange = (e) => { getCurrentScene().musician.key = e.target.value; saveProject(); };
    document.getElementById('music-scale-select').onchange = (e) => { getCurrentScene().musician.scale = e.target.value; saveProject(); };
    const pencilSlider = document.getElementById('pencil-size');
    pencilSlider.onmousedown = () => { updateBrushPreview(); document.getElementById('brush-size-overlay').classList.remove('hidden'); };
    window.addEventListener('mouseup', () => { document.getElementById('brush-size-overlay').classList.add('hidden'); });
    pencilSlider.oninput = (e) => { state.ui.pencilSize = parseInt(e.target.value); updateBrush(); updateBrushPreview(); };
    document.querySelectorAll('#editor-tools .main-tools button[data-tool]').forEach(btn => { btn.onclick = () => { state.ui.currentTool = btn.dataset.tool; document.querySelectorAll('#editor-tools .main-tools button[data-tool]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }; if (btn.dataset.tool === state.ui.currentTool) btn.classList.add('active'); });
    document.querySelectorAll('.canvas-sizes button').forEach(btn => { btn.onclick = () => resizeCurrentCostume(parseInt(btn.dataset.size), parseInt(btn.dataset.size)); });
    editorCanvas.onmousedown = startDraw; window.addEventListener('mousemove', draw); window.addEventListener('mouseup', stopDraw);
    document.getElementById('movie-title-input').oninput = (e) => { state.project.movieTitle = e.target.value; saveProject(); };
    document.getElementById('movie-creator-input').oninput = (e) => { state.project.creatorName = e.target.value; saveProject(); };
    document.getElementById('movie-font-select').onchange = (e) => { state.project.fontStyle = e.target.value; saveProject(); };
    document.getElementById('movie-bg-color').oninput = (e) => { state.project.titleBgColor = e.target.value; saveProject(); };
    document.getElementById('movie-text-color').oninput = (e) => { state.project.titleTextColor = e.target.value; saveProject(); };
    updateBrush();
}

function updateBrush() {
    const s = state.ui.pencilSize; if (s <= 1) { brushPixels = [{dx:0, dy:0}]; return; }
    const r = s / 2, r2 = r * r, pixels = [], off = Math.floor(s / 2), adj = (s % 2 === 0) ? 0.5 : 0;
    for (let dy = -off; dy <= off; dy++) { for (let dx = -off; dx <= off; dx++) { if ((dx + adj) ** 2 + (dy + adj) ** 2 <= r2 + 0.1) pixels.push({ dx, dy }); } }
    brushPixels = pixels;
}
function updateBrushPreview() {
    const overlay = document.getElementById('brush-size-overlay'); overlay.width = editorCanvas.width; overlay.height = editorCanvas.height;
    const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height);
    const cx = Math.floor(overlay.width / 2), cy = Math.floor(overlay.height / 2);
    ctx.fillStyle = 'black';
    const offsets = [[0,-1],[0,1],[-1,0],[1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    brushPixels.forEach(p => { offsets.forEach(([ox, oy]) => ctx.fillRect(cx + p.dx + ox, cy + p.dy + oy, 1, 1)); });
    ctx.fillStyle = 'white'; brushPixels.forEach(p => ctx.fillRect(cx + p.dx, cy + p.dy, 1, 1));
}

function updateUndoRedoButtons() { document.getElementById('undo-btn').disabled = state.ui.undoStack.length === 0; document.getElementById('redo-btn').disabled = state.ui.redoStack.length === 0; }
function commitUndo(s) { if (!s) return; state.ui.undoStack.push(s); if (state.ui.undoStack.length > 50) state.ui.undoStack.shift(); state.ui.redoStack = []; updateUndoRedoButtons(); }
function undo() { if (state.ui.undoStack.length === 0) return; const ctx = editorCanvas.getContext('2d'); state.ui.redoStack.push({ width: editorCanvas.width, height: editorCanvas.height, data: ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height) }); const s = state.ui.undoStack.pop(); applyEditorState(s); updateUndoRedoButtons(); }
function redo() { if (state.ui.redoStack.length === 0) return; const ctx = editorCanvas.getContext('2d'); state.ui.undoStack.push({ width: editorCanvas.width, height: editorCanvas.height, data: ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height) }); const s = state.ui.redoStack.pop(); applyEditorState(s); updateUndoRedoButtons(); }
function applyEditorState(s) { editorCanvas.width = s.width; editorCanvas.height = s.height; const dw = 400, dh = dw * (s.height / s.width); editorCanvas.style.width = dw + 'px'; editorCanvas.style.height = dh + 'px'; const ctx = editorCanvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.putImageData(s.data, 0, 0); saveCurrentCostume(); updateLiveThumbnail(); }

function startDraw(e) {
    if (state.ui.activePanel !== 'editor') return;
    const ctx = editorCanvas.getContext('2d'); preStrokeState = { width: editorCanvas.width, height: editorCanvas.height, data: ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height) }; isDrawing = true;
    const rect = editorCanvas.getBoundingClientRect(), sx = editorCanvas.width / rect.width, sy = editorCanvas.height / rect.height;
    startX = Math.floor((e.clientX - rect.left) * sx); startY = Math.floor((e.clientY - rect.top) * sy);
    snapshot = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
    if (state.ui.currentTool === 'fill') { commitUndo(preStrokeState); floodFill(startX, startY, state.ui.currentColor); saveCurrentCostume(); updateLiveThumbnail(); renderActorList(); isDrawing = false; } else if (state.ui.currentTool === 'pencil') plotPixel(startX, startY);
}
function draw(e) {
    if (!isDrawing) return;
    const rect = editorCanvas.getBoundingClientRect(), sx = editorCanvas.width / rect.width, sy = editorCanvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * sx), y = Math.floor((e.clientY - rect.top) * sy);
    const ctx = editorCanvas.getContext('2d');
    if (state.ui.currentTool === 'pencil') { plotLine(startX, startY, x, y); startX = x; startY = y; } else {
        ctx.putImageData(snapshot, 0, 0);
        if (state.ui.currentTool === 'line') plotLine(startX, startY, x, y); else if (state.ui.currentTool === 'square') plotRect(startX, startY, x, y); else if (state.ui.currentTool === 'circle') plotCircle(startX, startY, x, y);
    }
    updateLiveThumbnail();
}
function stopDraw() { if (isDrawing) { commitUndo(preStrokeState); isDrawing = false; saveCurrentCostume(); renderActorList(); } }
function plotPixel(x, y) {
    const ctx = editorCanvas.getContext('2d'), color = state.ui.currentColor;
    if (color === 'transparent') ctx.globalCompositeOperation = 'destination-out'; else { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; }
    brushPixels.forEach(p => ctx.fillRect(x + p.dx, y + p.dy, 1, 1)); ctx.globalCompositeOperation = 'source-over';
}
function plotLine(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy; while (true) { plotPixel(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
}
function plotRect(x0, y0, x1, y1) { const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); for (let x = l; x <= l + w; x++) { plotPixel(x, t); plotPixel(x, t + h); } for (let y = t; y <= t + h; y++) { plotPixel(l, y); plotPixel(l + w, y); } }
function plotCircle(x0, y0, x1, y1) {
    const r = Math.floor(Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2)));
    let x = r, y = 0, err = 0; while (x >= y) {
        plotPixel(x0 + x, y0 + y); plotPixel(x0 + y, y0 + x); plotPixel(x0 - y, y0 + x); plotPixel(x0 - x, y0 + y); plotPixel(x0 - x, y0 - y); plotPixel(x0 - y, y0 - x); plotPixel(x0 + y, y0 - x); plotPixel(x0 + x, y0 - y);
        if (err <= 0) { y += 1; err += 2 * y + 1; } if (err > 0) { x -= 1; err -= 2 * x + 1; }
    }
}
function updateLiveThumbnail() { const target = state.ui.editingTarget, ci = state.ui.editingCostumeIndex, item = costumeList.children[ci]; if (item) { const thumb = item.querySelector('.thumbnail'); if (thumb) thumb.src = editorCanvas.toDataURL(); } }
function saveCurrentCostume() { const t = state.ui.editingTarget, c = t.costumes[state.ui.editingCostumeIndex]; if (!c) return; c.canvas.width = editorCanvas.width; c.canvas.height = editorCanvas.height; c.canvas.getContext('2d').drawImage(editorCanvas, 0, 0); }

function copyCanvas() { const ctx = editorCanvas.getContext('2d'); state.ui.clipboard = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height); }
function pasteCanvas() {
    if (!state.ui.clipboard) return; const ctx = editorCanvas.getContext('2d');
    commitUndo({ width: editorCanvas.width, height: editorCanvas.height, data: ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height) });
    if (editorCanvas.width !== state.ui.clipboard.width || editorCanvas.height !== state.ui.clipboard.height) { editorCanvas.width = state.ui.clipboard.width; editorCanvas.height = state.ui.clipboard.height; const dw = 400, dh = dw * (editorCanvas.height / editorCanvas.width); editorCanvas.style.width = dw + 'px'; editorCanvas.style.height = dh + 'px'; }
    ctx.putImageData(state.ui.clipboard, 0, 0); saveCurrentCostume(); updateLiveThumbnail();
}
function copyCostume() { const t = state.ui.editingTarget; if (!t) return; state.ui.clipboard = t.costumes.map(c => { const canvas = document.createElement('canvas'); canvas.width = c.canvas.width; canvas.height = c.canvas.height; canvas.getContext('2d').drawImage(c.canvas, 0, 0); return { name: c.name, canvas }; }); }
function pasteCostume() {
    const t = state.ui.editingTarget; if (!t || !Array.isArray(state.ui.clipboard)) return;
    if (t.costumes.length === 1) { const c = t.costumes[0], ctx = c.canvas.getContext('2d'), data = ctx.getImageData(0, 0, c.canvas.width, c.canvas.height).data; let isBlank = true; for (let i = 3; i < data.length; i += 4) { if (data[i] > 0) { isBlank = false; break; } } if (isBlank) t.costumes = []; }
    state.ui.clipboard.forEach(c => { const canvas = document.createElement('canvas'); canvas.width = c.canvas.width; canvas.height = c.canvas.height; canvas.getContext('2d').drawImage(c.canvas, 0, 0); t.costumes.push({ name: c.name, canvas }); });
    state.ui.editingCostumeIndex = 0; loadCostumeToEditor(t.costumes[0]); renderCostumeList(); saveProject();
}

async function toggleMic() { state.ui.micEnabled = !state.ui.micEnabled; if (state.ui.micEnabled && !micStream) { try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } }); } catch (e) { console.warn("Mic denied"); state.ui.micEnabled = false; } } updateMicButton(); }
function updateMicButton() { const btn = document.getElementById('mic-toggle-btn'); btn.style.filter = state.ui.micEnabled ? 'none' : 'grayscale(1) opacity(0.5)'; }
function toggleDragMode() { state.ui.dragMode = (state.ui.dragMode === 'drag') ? 'hover' : 'drag'; document.getElementById('drag-mode-btn').textContent = (state.ui.dragMode === 'drag') ? '🖱️' : '🚁'; }
function startRecordingProcess() {
    const btn = document.getElementById('record-btn'); if (state.ui.isRecording) { stopRecording(); return; }
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; document.getElementById('countdown-overlay').classList.add('hidden'); btn.textContent = '🔴'; return; }
    const t = (state.ui.selectedActorId === 'backdrop' ? getCurrentScene().backdrop : (state.ui.selectedActorId === 'musician' ? getCurrentScene().musician : getCurrentScene().actors.find(a => a.id === state.ui.selectedActorId)));
    if (!t) { alert("Select actor/musician/backdrop!"); return; }
    const overlay = document.getElementById('countdown-overlay'); overlay.innerHTML = ''; overlay.classList.remove('hidden'); btn.textContent = '❌';
    let count = 3; overlay.textContent = count; state.countdownTimer = setInterval(() => { count--; if (count > 0) overlay.textContent = count; else { clearInterval(state.countdownTimer); state.countdownTimer = null; overlay.classList.add('hidden'); startRecording(t); } }, 1000);
}
async function startRecording(t) { 
    state.ui.isRecording = true; document.getElementById('record-btn').textContent = '⏹️'; 
    const isMusician = t.id === 'musician';
    const newRec = { frames: isMusician ? {} : [], audio: null }; 
    t.recordings.push(newRec); 
    state.ui.currentFrame = 0;
    state.ui.lastFrameTime = performance.now();
    state.ui.timeAccumulator = 0;
    if (!isMusician) newRec.frames[0] = { x: t.x, y: t.y, costumeIndex: t.currentCostume }; 
    playAllAudio();
    if (state.ui.micEnabled && micStream) { mediaRecorder = new MediaRecorder(micStream); audioChunks = []; mediaRecorder.ondataavailable = e => audioChunks.push(e.data); mediaRecorder.onstop = () => { const blob = new Blob(audioChunks, { type: 'audio/webm' }); t.recordings[t.recordings.length - 1].audio = URL.createObjectURL(blob); renderActorList(); }; mediaRecorder.start(); }
}
function stopRecording() { 
    state.ui.isRecording = false; 
    document.getElementById('record-btn').textContent = '🔴'; 
    if (mediaRecorder) mediaRecorder.stop(); 
    stopAllAudio(); saveProject(); renderActorList(); 
}

function togglePlayback(asTheater, startFromBeginning) {
    if (state.ui.isPlaying) {
        state.ui.isPlaying = false; state.ui.isTheaterMode = false; state.ui.isTitleCardActive = false;
        document.getElementById('play-btn').textContent = '▶️'; document.body.classList.remove('theater-mode');
        document.getElementById('play-group').classList.remove('is-playing');
        stopAllAudio(); state.project.currentSceneIndex = state.ui.movieStartSceneIndex;
        renderActorList(); renderSceneList();
    } else {
        state.ui.movieStartSceneIndex = state.project.currentSceneIndex;
        if (asTheater) { state.ui.isTheaterMode = true; document.body.classList.add('theater-mode'); }
        if (startFromBeginning) { state.project.currentSceneIndex = 0; if (asTheater) state.ui.isTitleCardActive = true; }
        state.ui.isPlaying = true; state.ui.selectedActorId = null;
        document.getElementById('play-btn').textContent = '⏹️'; document.getElementById('play-group').classList.add('is-playing');
        state.ui.currentFrame = 0;
        state.ui.lastFrameTime = performance.now();
        state.ui.timeAccumulator = 0;
        if (!state.ui.isTitleCardActive) playAllAudio();
        renderActorList(); renderSceneList();
    }
}

function playNote(scene, noteIndex, isChord, octaveOffset = 0, ctx = null, dest = null) {
    const activeCtx = ctx || audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
    if (activeCtx.state === 'suspended') activeCtx.resume();

    const mu = scene.musician;
    const inst = instruments[mu.instrument];
    const baseFreq = 261.63 * Math.pow(2, keyFrequencies.indexOf(mu.key) / 12);
    const scale = scales[mu.scale];

    const notes = isChord ? [noteIndex, (noteIndex + 2), (noteIndex + 4)] : [noteIndex];

    notes.forEach(ni => {
        const osc = activeCtx.createOscillator();
        const gain = activeCtx.createGain();
        const noteShift = scale[ni % scale.length] + Math.floor(ni / scale.length) * 12 + (octaveOffset * 12);
        osc.frequency.value = baseFreq * Math.pow(2, noteShift / 12);
        osc.type = inst.type;

        osc.connect(gain);
        // Connect to provided destination node or fallback to main output
        const target = dest || activeCtx.destination;
        gain.connect(target);

        const now = activeCtx.currentTime;
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(); osc.stop(now + 0.5);
    });
}

function triggerMusicEvents(scene, frameIndex, ctx = null, dest = null) {
    const rec = scene.musician.recordings[scene.musician.recordings.length - 1];
    if (!rec || !rec.frames) return;

    const events = rec.frames[frameIndex];
    if (events && Array.isArray(events)) {
        events.forEach(f => {
            playNote(scene, f.note, f.chord, f.octave || 0, ctx, dest);
        });
    }
}

function playAllAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const scene = getCurrentScene(); 
    [scene.backdrop, ...scene.actors].forEach(t => { 
        const rec = t.recordings[t.recordings.length - 1]; 
        if (rec && rec.audio) {
            const audio = new Audio(rec.audio), source = audioContext.createMediaElementSource(audio), panner = audioContext.createStereoPanner(); 
            source.connect(panner); panner.connect(audioContext.destination); 
            audio.play(); activeAudioPlayers.push({ audio, panner, target: t, source }); 
            if (!['backdrop', 'musician'].includes(t.id)) { 
                const iv = setInterval(() => { 
                    if (audio.paused) { clearInterval(iv); return; } 
                    const { x } = getActorDisplayState(t, state.ui.currentFrame); 
                    panner.pan.value = ((x / state.project.width) * 2 - 1) * 0.5; 
                }, 50); 
            } 
        } 
    });
}
function stopAllAudio() { activeAudioPlayers.forEach(p => { p.audio.pause(); p.source.disconnect(); }); activeAudioPlayers = []; }

function togglePanel(panel) { state.ui.activePanel = (state.ui.activePanel === panel) ? null : panel; updatePanelVisibility(); }
function updatePanelVisibility() { 
    listPanel.classList.toggle('hidden', state.ui.activePanel !== 'list'); editorPanel.classList.toggle('hidden', state.ui.activePanel !== 'editor'); 
    filePanel.classList.toggle('hidden', state.ui.activePanel !== 'file'); moviePanel.classList.toggle('hidden', state.ui.activePanel !== 'movie'); 
    musicPanel.classList.toggle('hidden', state.ui.activePanel !== 'music');

    if (state.ui.activePanel === 'music') {
        const mu = getCurrentScene().musician;
        document.getElementById('music-instrument-select').value = mu.instrument;
        document.getElementById('music-key-select').value = mu.key;
        document.getElementById('music-scale-select').value = mu.scale;
    }

    if (state.ui.activePanel === 'editor' && state.ui.editingTarget) {
 const isBD = state.ui.editingTarget.id === 'backdrop'; const cs = document.querySelector('.canvas-sizes'); if (cs) cs.classList.toggle('hidden', isBD); const trans = document.querySelector('.color-swatch.transparent'); if (trans) { trans.classList.toggle('hidden', isBD); if (isBD && state.ui.currentColor === 'transparent') { state.ui.currentColor = '#000000'; setupPalette(); } } }
    document.getElementById('file-btn').classList.toggle('active', state.ui.activePanel === 'file');
    document.getElementById('scene-btn').classList.toggle('active', state.ui.activePanel === 'movie');
    document.getElementById('list-toggle-btn').classList.toggle('active', state.ui.activePanel === 'list' || state.ui.activePanel === 'editor');
}

function addScene() { const s = createEmptyScene('Scene ' + (state.project.scenes.length + 1)); state.project.scenes.push(s); state.project.currentSceneIndex = state.project.scenes.length - 1; updatePlayMovieButton(); updateMovieExportButtons(); renderSceneList(); renderActorList(); saveProject(); }
function stopAllPlayback() { if (state.ui.isPlaying) togglePlayback(); }
function renderSceneList() {
    sceneList.innerHTML = ''; state.project.scenes.forEach((s, i) => {
        const div = document.createElement('div'); div.className = 'list-item' + (i === state.project.currentSceneIndex ? ' active' : '');
        div.draggable = true; div.ondragstart = (e) => { dragSrcIndex = i; div.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
        div.ondragend = () => { div.classList.remove('dragging'); document.querySelectorAll('.list-item').forEach(el => el.classList.remove('drag-over')); };
        div.ondragover = (e) => { e.preventDefault(); div.classList.add('drag-over'); };
        div.ondrop = (e) => { e.preventDefault(); if (dragSrcIndex !== -1 && dragSrcIndex !== i) { const moved = state.project.scenes.splice(dragSrcIndex, 1)[0]; state.project.scenes.splice(i, 0, moved); if (state.project.currentSceneIndex === dragSrcIndex) state.project.currentSceneIndex = i; else if (state.project.currentSceneIndex > dragSrcIndex && state.project.currentSceneIndex <= i) state.project.currentSceneIndex--; else if (state.project.currentSceneIndex < dragSrcIndex && state.project.currentSceneIndex >= i) state.project.currentSceneIndex++; renderSceneList(); renderActorList(); saveProject(); } };
        const { ci } = getActorDisplayState(s.backdrop, 0), thumb = document.createElement('img'); thumb.className = 'thumbnail transparent-pattern'; thumb.src = s.backdrop.costumes[ci].canvas.toDataURL(); div.appendChild(thumb);
        const name = document.createElement('span'); name.textContent = s.name; name.className = 'clickable-name'; name.onclick = (e) => { e.stopPropagation(); const nn = prompt("Rename scene:", s.name); if (nn) { s.name = nn; renderSceneList(); saveProject(); } }; div.appendChild(name);
        const acts = document.createElement('div'); acts.style.marginLeft = 'auto'; acts.style.display = 'flex'; acts.style.gap = '2px';
        if (state.project.scenes.length > 1) { const del = document.createElement('button'); del.textContent = '🗑'; del.onclick = (e) => { e.stopPropagation(); if (confirm(`Delete scene "${s.name}"?`)) { state.project.scenes.splice(i, 1); if (state.project.currentSceneIndex >= state.project.scenes.length) state.project.currentSceneIndex = state.project.scenes.length - 1; updatePlayMovieButton(); updateMovieExportButtons(); renderSceneList(); renderActorList(); saveProject(); } }; acts.appendChild(del); }
        div.appendChild(acts); div.onclick = () => { if (state.project.currentSceneIndex !== i) { stopAllPlayback(); state.project.currentSceneIndex = i; renderSceneList(); renderActorList(); state.ui.selectedActorId = null; } }; sceneList.appendChild(div);
    });
}
function updatePlayMovieButton() { document.getElementById('play-group').classList.add('can-theater'); }
function updateMovieExportButtons() { const el = document.getElementById('movie-export-options'); if (el) el.classList.remove('hidden'); }

function addActor() { const a = { id: 'actor_' + Date.now(), name: 'Actor ' + (getCurrentScene().actors.length + 1), costumes: [createEmptyCostume(64, 64)], currentCostume: 0, x: state.project.width / 2, y: state.project.height / 2, recordings: [] }; getCurrentScene().actors.push(a); state.ui.selectedActorId = a.id; renderActorList(); saveProject(); }
function renderActorList() {
    actorList.innerHTML = ''; const scene = getCurrentScene(); if (!scene) return;
    actorList.appendChild(createListItem(scene.backdrop, false, -1));
    actorList.appendChild(createListItem(scene.musician, false, -2));
    const sep = document.createElement('div'); sep.className = 'backdrop-separator'; actorList.appendChild(sep);
    scene.actors.forEach((a, i) => {
        const item = createListItem(a, true, i); item.draggable = true;
        item.ondragstart = (e) => { if (e.target.classList.contains('clickable-name') || e.target.classList.contains('clickable-icon')) { e.preventDefault(); return; } dragSrcIndex = i; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
        item.ondragend = () => { item.classList.remove('dragging'); document.querySelectorAll('.list-item').forEach(el => el.classList.remove('drag-over')); };
        item.ondragover = (e) => { e.preventDefault(); item.classList.add('drag-over'); };
        item.ondrop = (e) => { e.preventDefault(); if (dragSrcIndex !== -1 && dragSrcIndex !== i) { const moved = scene.actors.splice(dragSrcIndex, 1)[0]; scene.actors.splice(i, 0, moved); renderActorList(); saveProject(); } };
        actorList.appendChild(item);
    });
}
function createListItem(t, canDel, index) {
    const div = document.createElement('div'); div.className = 'list-item' + (state.ui.selectedActorId === t.id ? ' active' : '');
    
    // Unified Thumbnail Container
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'thumbnail transparent-pattern';
    thumbWrapper.style.display = 'flex';
    thumbWrapper.style.alignItems = 'center';
    thumbWrapper.style.justifyContent = 'center';
    
    if (t.id === 'musician') {
        const emoji = document.createElement('span');
        emoji.style.fontSize = '18px';
        emoji.textContent = instruments[t.instrument].icon;
        thumbWrapper.appendChild(emoji);
    } else {
        const { ci } = getActorDisplayState(t, 0);
        const img = document.createElement('img');
        img.src = t.costumes[ci].canvas.toDataURL();
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        thumbWrapper.appendChild(img);
    }
    div.appendChild(thumbWrapper);
    const name = document.createElement('span'); name.textContent = t.name; if (t.id !== 'backdrop') { name.className = 'clickable-name'; name.onclick = (e) => { e.stopPropagation(); const nn = prompt("Rename:", t.name); if (nn) { t.name = nn; renderActorList(); saveProject(); } }; } div.appendChild(name);
    const rec = t.recordings[t.recordings.length - 1];
    if (rec && rec.frames?.length > 0 && t.id !== 'musician') { 
        const i = document.createElement('span'); 
        i.textContent = ' 🎞'; 
        i.className = 'icon-btn clickable-icon'; 
        i.onclick = (e) => { e.stopPropagation(); if (confirm("Delete dragging?")) { const f0 = rec.frames[0]; if (f0 && !['backdrop', 'musician'].includes(t.id)) { t.x = f0.x; t.y = f0.y; t.currentCostume = f0.costumeIndex; } rec.frames = []; saveProject(); renderActorList(); } }; 
        div.appendChild(i); 
    }
    
    // For musician, "frames" means note events, not dragging, but we still want a way to delete music performance
    if (rec && rec.frames?.length > 0 && t.id === 'musician') {
        const i = document.createElement('span'); 
        i.textContent = ' 🎵'; 
        i.className = 'icon-btn clickable-icon'; 
        i.title = "Delete music performance";
        i.onclick = (e) => { e.stopPropagation(); if (confirm("Delete music performance?")) { rec.frames = []; saveProject(); renderActorList(); } }; 
        div.appendChild(i); 
    }
    if (rec && rec.audio) { const mic = document.createElement('span'); mic.textContent = ' 🎤'; mic.className = 'icon-btn clickable-icon'; mic.onclick = (e) => { e.stopPropagation(); if (confirm("Delete audio?")) { rec.audio = null; saveProject(); renderActorList(); } }; div.appendChild(mic); }
    const acts = document.createElement('div'); acts.style.marginLeft = 'auto'; acts.style.display = 'flex'; acts.style.gap = '2px';
    const edit = document.createElement('button'); edit.textContent = '✎'; edit.onclick = (e) => { e.stopPropagation(); if (t.id === 'musician') togglePanel('music'); else openEditor(t); }; acts.appendChild(edit);
    if (canDel) { const del = document.createElement('button'); del.textContent = '🗑'; del.onclick = (e) => { e.stopPropagation(); if (confirm(`Delete actor "${t.name}"?`)) { const s = getCurrentScene(); s.actors = s.actors.filter(ac => ac.id !== t.id); renderActorList(); saveProject(); } }; acts.appendChild(del); }
    div.appendChild(acts); div.onclick = () => { state.ui.selectedActorId = t.id; renderActorList(); }; return div;
}

function openEditor(t) { state.ui.editingTarget = t; state.ui.editingCostumeIndex = t.currentCostume; state.ui.undoStack = []; state.ui.redoStack = []; updateUndoRedoButtons(); state.ui.activePanel = 'editor'; updatePanelVisibility(); renderCostumeList(); state.ui.currentTool = 'pencil'; document.querySelectorAll('.main-tools button[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'pencil')); loadCostumeToEditor(t.costumes[state.ui.editingCostumeIndex]); }
function renderCostumeList() {
    costumeList.innerHTML = ''; const t = state.ui.editingTarget; t.costumes.forEach((c, i) => {
        const div = document.createElement('div'); div.className = 'list-item' + (i === state.ui.editingCostumeIndex ? ' active' : '');
        div.draggable = true; div.ondragstart = (e) => { dragSrcIndex = i; div.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
        div.ondragend = () => { div.classList.remove('dragging'); document.querySelectorAll('.list-item').forEach(el => el.classList.remove('drag-over')); };
        div.ondragover = (e) => { e.preventDefault(); div.classList.add('drag-over'); };
        div.ondrop = (e) => { e.preventDefault(); if (dragSrcIndex !== -1 && dragSrcIndex !== i) { const moved = t.costumes.splice(dragSrcIndex, 1)[0]; t.costumes.splice(i, 0, moved); state.ui.editingCostumeIndex = i; renderCostumeList(); saveProject(); } };
        const badge = document.createElement('span'); badge.className = 'key-badge'; badge.textContent = "1234567890qwertyuiopasdfghjklzxcvbnm"[i] || '?'; div.appendChild(badge);
        const thumb = document.createElement('img'); thumb.className = 'thumbnail transparent-pattern'; thumb.src = c.canvas.toDataURL(); div.appendChild(thumb);
        if (t.costumes.length > 1) { const del = document.createElement('button'); del.textContent = '🗑'; del.style.marginLeft = 'auto'; del.onclick = (e) => { e.stopPropagation(); if (confirm("Delete this costume?")) { t.costumes.splice(i, 1); if (state.ui.editingCostumeIndex >= t.costumes.length) state.ui.editingCostumeIndex = t.costumes.length-1; renderCostumeList(); loadCostumeToEditor(t.costumes[state.ui.editingCostumeIndex]); } }; div.appendChild(del); }
        div.onclick = () => { state.ui.editingCostumeIndex = i; state.ui.undoStack = []; state.ui.redoStack = []; updateUndoRedoButtons(); renderCostumeList(); loadCostumeToEditor(c); }; costumeList.appendChild(div);
    });
}
function addCostume() { const t = state.ui.editingTarget, last = t.costumes[t.costumes.length - 1], nc = createEmptyCostume(last.canvas.width, last.canvas.height, t.id === 'backdrop'); t.costumes.push(nc); state.ui.editingCostumeIndex = t.costumes.length - 1; state.ui.undoStack = []; state.ui.redoStack = []; updateUndoRedoButtons(); renderCostumeList(); loadCostumeToEditor(nc); }
function loadCostumeToEditor(c) { editorCanvas.width = c.canvas.width; editorCanvas.height = c.canvas.height; const dw = 400, dh = dw * (c.canvas.height / c.canvas.width); editorCanvas.style.width = dw + 'px'; editorCanvas.style.height = dh + 'px'; const ctx = editorCanvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(c.canvas, 0, 0); }
function resizeCurrentCostume(w, h) { if (editorCanvas.width === w && editorCanvas.height === h) return; const ctx = editorCanvas.getContext('2d'); commitUndo({ width: editorCanvas.width, height: editorCanvas.height, data: ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height) }); const t = state.ui.editingTarget, c = t.costumes[state.ui.editingCostumeIndex], temp = document.createElement('canvas'); temp.width = c.canvas.width; temp.height = c.canvas.height; temp.getContext('2d').drawImage(c.canvas, 0, 0); c.canvas.width = w; c.canvas.height = h; const ctx2 = c.canvas.getContext('2d'); ctx2.clearRect(0, 0, w, h); ctx2.imageSmoothingEnabled = false; ctx2.drawImage(temp, (w - temp.width)/2, (h - temp.height)/2); loadCostumeToEditor(c); }
function floodFill(sx, sy, color) { const ctx = editorCanvas.getContext('2d'), img = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height), d = img.data, w = img.width, h = img.height, idx = (sy * w + sx) * 4, sR = d[idx], sG = d[idx+1], sB = d[idx+2], sA = d[idx+3], fill = color === 'transparent' ? { r:0, g:0, b:0, a:0 } : hexToRgb(color); if (color !== 'transparent') fill.a = 255; if (sR === fill.r && sG === fill.g && sB === fill.b && sA === fill.a) return; const q = [[sx, sy]]; while (q.length) { const [x, y] = q.pop(), i = (y * w + x) * 4; if (x < 0 || x >= w || y < 0 || y >= h || d[i] !== sR || d[i+1] !== sG || d[i+2] !== sB || d[i+3] !== sA) continue; d[i] = fill.r; d[i+1] = fill.g; d[i+2] = fill.b; d[i+3] = fill.a; q.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]); } ctx.putImageData(img, 0, 0); }
function hexToRgb(hex) { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 0, g: 0, b: 0 }; }

async function saveProject() { 
    if (state.ui.isResetting) return; 
    const scenes = await Promise.all(state.project.scenes.map(async s => ({ 
        name: s.name, 
        songId: s.songId,
        backdrop: await serializeTarget(s.backdrop), 
        musician: { ...s.musician, recordings: await Promise.all(s.musician.recordings.map(serializeRecording)) }, 
        actors: await Promise.all(s.actors.map(serializeTarget)) 
    }))); 
    localStorage.setItem('drag-n-film-project', JSON.stringify({ 
        width: state.project.width, 
        height: state.project.height, 
        currentSceneIndex: state.project.currentSceneIndex, 
        movieTitle: state.project.movieTitle, 
        creatorName: state.project.creatorName, 
        fontStyle: state.project.fontStyle, 
        titleBgColor: state.project.titleBgColor, 
        titleTextColor: state.project.titleTextColor, 
        showTitleCard: state.project.showTitleCard, 
        songs: state.project.songs,
        scenes 
    })); 
}
async function serializeRecording(r) { 
    let audioData = null; 
    if (r.audio) { 
        try { 
            const response = await fetch(r.audio); 
            const blob = await response.blob(); 
            audioData = await blobToDataURL(blob); 
        } catch(e) { console.error(e); } 
    } 
    return { frames: r.frames || [], audioData }; 
}
async function serializeTarget(t) { return { id: t.id, name: t.name, currentCostume: t.currentCostume, x: t.x, y: t.y, costumes: t.costumes.map(c => ({ name: c.name, data: c.canvas.toDataURL() })), recordings: await Promise.all(t.recordings.map(serializeRecording)) }; }
function blobToDataURL(blob) { return new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(blob); }); }
async function loadProject() { 
    const data = localStorage.getItem('drag-n-film-project'); 
    if (!data) return; 
    const p = JSON.parse(data); 
    state.project.width = p.width; 
    state.project.height = p.height; 
    state.project.currentSceneIndex = p.currentSceneIndex || 0; 
    state.project.movieTitle = p.movieTitle || "My Movie"; 
    state.project.creatorName = p.creatorName || "Me"; 
    state.project.fontStyle = p.fontStyle || "Arial"; 
    state.project.titleBgColor = p.titleBgColor || "#ffffff"; 
    state.project.titleTextColor = p.titleTextColor || "#000000"; 
    state.project.showTitleCard = p.showTitleCard !== undefined ? p.showTitleCard : true; 
    state.project.songs = p.songs || [];
    state.project.scenes = await Promise.all(p.scenes.map(async s => ({ 
        name: s.name, 
        songId: s.songId || null,
        backdrop: await deserializeTarget(s.backdrop), 
        musician: await deserializeMusician(s.musician), 
        actors: await Promise.all(s.actors.map(deserializeTarget)) 
    }))); 
}
async function deserializeMusician(m) { 
    if (!m) return { id: 'musician', name: 'Piano', instrument: 'piano', key: 'C', scale: 'major', octaveOffset: 0, chordMode: false, recordings: [] };
    const res = { ...m }; 
    if (res.octaveOffset === undefined) res.octaveOffset = 0;
    res.recordings = await Promise.all((m.recordings || []).map(deserializeRecording)); 
    return res; 
}
async function deserializeRecording(r) { 
    let audio = null; 
    if (r.audioData) { 
        const parts = r.audioData.split(','), byteString = atob(parts[1]), mimeString = parts[0].split(':')[1].split(';')[0], ab = new ArrayBuffer(byteString.length), ia = new Uint8Array(ab); 
        for (let i=0; i<byteString.length; i++) ia[i] = byteString.charCodeAt(i); 
        audio = URL.createObjectURL(new Blob([ab], {type: mimeString})); 
    } 
    return { frames: r.frames || [], audio }; 
}
async function deserializeTarget(t) { const target = { ...t }; target.costumes = await Promise.all(t.costumes.map(async c => { const canvas = document.createElement('canvas'), img = new Image(); img.src = c.data; await new Promise(r => img.onload = r); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0); return { name: c.name, canvas }; })); target.recordings = await Promise.all((t.recordings || []).map(deserializeRecording)); return target; }

function renderProjectFrame(ctx, frameIndex, width, height, scale, scene) { 
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, height); 
    const bd = scene.backdrop, bdRec = bd.recordings[bd.recordings.length - 1]; 
    let bdCI = bd.currentCostume; 
    if (bdRec) { const f = bdRec.frames[frameIndex]; if (f) bdCI = f.costumeIndex; } 
    if (bd.costumes[bdCI]) ctx.drawImage(bd.costumes[bdCI].canvas, 0, 0, width, height); 
    for (let i = scene.actors.length - 1; i >= 0; i--) { 
        const a = scene.actors[i], { x, y, ci } = getActorDisplayState(a, frameIndex), c = a.costumes[ci]; 
        if (c) ctx.drawImage(c.canvas, (x - c.canvas.width/2) * scale, (y - c.canvas.height/2) * scale, c.canvas.width * scale, c.canvas.height * scale); 
    } 
}

function importDragFile(e) {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = async (ev) => {
        try {
            const p = JSON.parse(ev.target.result); 
            state.project.width = p.width; 
            state.project.height = p.height; 
            state.project.currentSceneIndex = 0;
            state.project.movieTitle = p.movieTitle || "My Movie"; 
            state.project.creatorName = p.creatorName || "Me"; 
            state.project.fontStyle = p.fontStyle || "Arial";
            state.project.titleBgColor = p.titleBgColor || "#ffffff"; 
            state.project.titleTextColor = p.titleTextColor || "#000000"; 
            state.project.showTitleCard = p.showTitleCard !== undefined ? p.showTitleCard : true;
            state.project.songs = p.songs || [];
            state.project.scenes = await Promise.all(p.scenes.map(async s => ({ 
                name: s.name, 
                songId: s.songId || null,
                backdrop: await deserializeTarget(s.backdrop), 
                musician: await deserializeMusician(s.musician), 
                actors: await Promise.all(s.actors.map(deserializeTarget)) 
            })));
            updatePlayMovieButton(); updateMovieExportButtons(); syncMovieInputs(); renderSceneList(); renderActorList(); saveProject(); togglePanel(null);
        } catch (e) { alert("Invalid .drag file"); }
    }; r.readAsText(f);
}

async function exportDragFile() {
    const scenes = await Promise.all(state.project.scenes.map(async s => ({ 
        name: s.name, 
        songId: s.songId,
        backdrop: await serializeTarget(s.backdrop), 
        musician: { ...s.musician, recordings: await Promise.all(s.musician.recordings.map(serializeRecording)) }, 
        actors: await Promise.all(s.actors.map(serializeTarget)) 
    })));
    const blob = new Blob([JSON.stringify({ 
        width: state.project.width, 
        height: state.project.height, 
        scenes, 
        movieTitle: state.project.movieTitle, 
        creatorName: state.project.creatorName, 
        fontStyle: state.project.fontStyle, 
        titleBgColor: state.project.titleBgColor, 
        titleTextColor: state.project.titleTextColor, 
        showTitleCard: state.project.showTitleCard,
        songs: state.project.songs
    })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'project.drag'; a.click();
}

async function exportMovie(fullMovie, format) {
    const upScale = 4, expCanvas = document.createElement('canvas'); expCanvas.width = state.project.width * upScale; expCanvas.height = state.project.height * upScale;
    const expCtx = expCanvas.getContext('2d'); expCtx.imageSmoothingEnabled = false;
    const tcCanvas = document.createElement('canvas'); tcCanvas.width = state.project.width; tcCanvas.height = state.project.height;
    const tcCtx = tcCanvas.getContext('2d'); tcCtx.imageSmoothingEnabled = false;
    const scenesToExport = fullMovie ? state.project.scenes : [getCurrentScene()];
    const durations = scenesToExport.map(s => getMaxFrames(s) || 30);
    const titleCardDurationFrames = (fullMovie && state.project.showTitleCard) ? 120 : 0;
    const totalFrames = durations.reduce((a, b) => a + b, titleCardDurationFrames);
    togglePlayback(true, fullMovie);
    if (format === 'video') {
        const stream = expCanvas.captureStream(30), audioCtx = new AudioContext(), dest = audioCtx.createMediaStreamDestination();
        const exportPlayers = [];
        let frameOffset = titleCardDurationFrames;
        scenesToExport.forEach((scene, si) => {
            [scene.backdrop, ...scene.actors].forEach(t => {
                const rec = t.recordings[t.recordings.length - 1]; if (rec && rec.audio) {
                    const audio = new Audio(rec.audio), source = audioCtx.createMediaElementSource(audio), panner = audioCtx.createStereoPanner();
                    source.connect(panner); panner.connect(dest); 
                    exportPlayers.push({ audio, panner, target: t, startFrame: frameOffset, durationFrames: durations[si] });
                }
            }); frameOffset += durations[si];
        });
        const recorder = new MediaRecorder(exportPlayers.length > 0 ? new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]) : stream, { mimeType: 'video/webm' }), chunks = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = fullMovie ? 'movie.webm' : 'scene.webm'; a.click(); exportPlayers.forEach(p => p.audio.pause()); audioCtx.close(); };
        recorder.start(); 
        
        let currentFrame = 0;
        let lastExportSI = -1;

        const interval = setInterval(() => {
            if (!state.ui.isPlaying || currentFrame >= totalFrames) { if (state.ui.isPlaying) togglePlayback(); recorder.stop(); clearInterval(interval); return; }
            if (currentFrame < titleCardDurationFrames) { tcCtx.clearRect(0,0,tcCanvas.width, tcCanvas.height); drawTitleCard(tcCtx, 0); expCtx.drawImage(tcCanvas, 0, 0, expCanvas.width, expCanvas.height); }
            else {
                let remaining = currentFrame - titleCardDurationFrames, currentSI = 0; while (remaining >= durations[currentSI] && currentSI < scenesToExport.length - 1) { remaining -= durations[currentSI]; currentSI++; }
                if (currentSI !== lastExportSI) { lastExportSI = currentSI; }
                
                renderProjectFrame(expCtx, remaining, expCanvas.width, expCanvas.height, upScale, scenesToExport[currentSI]);
                triggerMusicEvents(scenesToExport[currentSI], remaining, audioCtx, dest);

                exportPlayers.forEach(p => {
                    if (currentFrame >= p.startFrame && currentFrame < p.startFrame + p.durationFrames) {
                        if (p.audio.paused) {
                            p.audio.currentTime = (currentFrame - p.startFrame) * FRAME_DURATION / 1000;
                            p.audio.play();
                        }
                        if (p.target.id !== 'backdrop' && p.target.id !== 'musician') {
                            const { x } = getActorDisplayState(p.target, currentFrame - p.startFrame);
                            p.panner.pan.value = ((x / state.project.width) * 2 - 1) * 0.5;
                        }
                    } else if (!p.audio.paused) { p.audio.pause(); }
                });
            }
            currentFrame++;
        }, 1000/60);
    } else {
        const { GIFEncoder, quantize, applyPalette } = await import('https://unpkg.com/gifenc?module');
        const fps = 15, framesPerGifFrame = 60 / fps, delay = 1000 / fps, gif = GIFEncoder();
        for (let f = 0; f < totalFrames; f += framesPerGifFrame) {
            const currentFrame = Math.floor(f);
            if (currentFrame < titleCardDurationFrames) { tcCtx.clearRect(0,0,tcCanvas.width, tcCanvas.height); drawTitleCard(tcCtx, 0); expCtx.drawImage(tcCanvas, 0, 0, expCanvas.width, expCanvas.height); }
            else {
                let remaining = currentFrame - titleCardDurationFrames, currentSI = 0; while (remaining >= durations[currentSI] && currentSI < scenesToExport.length - 1) { remaining -= durations[currentSI]; currentSI++; }
                renderProjectFrame(expCtx, remaining, expCanvas.width, expCanvas.height, upScale, scenesToExport[currentSI]);
            }
            const { data, width, height } = expCtx.getImageData(0, 0, expCanvas.width, expCanvas.height), palette = quantize(data, 256), index = applyPalette(data, palette);
            gif.writeFrame(index, width, height, { palette, delay });
        }
        if (state.ui.isPlaying) togglePlayback();
        gif.finish(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gif.bytes()], { type: 'image/gif' })); a.download = fullMovie ? 'movie.gif' : 'scene.gif'; a.click();
    }
}
function newProject() { if (confirm("Start a new project? All unsaved changes will be lost.")) { state.ui.isResetting = true; sessionStorage.setItem('drag-n-film-reset', 'true'); location.reload(); } }
init();
