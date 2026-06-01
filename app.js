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
        isExporting: false,
        exportRecorder: null,
        exportDest: null,
        exportCanvas: null,
        exportCtx: null,
        exportFullMovie: true,
        lineDashOffset: 0,
        lastBoilUpdate: 0,
        movieStartSceneIndex: 0,
        currentFrame: 0,
        lastFrameTime: 0,
        timeAccumulator: 0,
        songFrameOffset: 0,
        selectedActorId: null, 
        micEnabled: false, pencilSize: 5,
        stageMargin: 500, 
        isResetting: false,
        undoStack: [], redoStack: [],
        activeSongId: null,
        activeTrack: 'lead',
        isPreviewPlaying: false,
        previewFrame: 0,
        lastPreviewTime: 0,
        previewAccumulator: 0,
        lastTriggeredSub: -1,
        cameraStream: null,
        cameraBackup: null,
        isGridDragging: false,
        gridDragMode: null, // 'paint' or 'erase'
        lastGridCell: null // { col, row }
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

const SPEED_PRESETS = [
    { label: 'Snail', bpm: 60 },
    { label: 'Slow', bpm: 90 },
    { label: 'Normal', bpm: 120 },
    { label: 'Fast', bpm: 150 },
    { label: 'Techno', bpm: 180 }
];

const LENGTH_PRESETS = [
    { label: 'Short', bars: 2 },
    { label: 'Medium', bars: 4 },
    { label: 'Long', bars: 8 },
    { label: 'Epic', bars: 16 }
];

const instruments = {
    piano: { name: "Piano", icon: "🎹", type: "triangle", attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.4 },
    synth: { name: "Synth", icon: "🔊", type: "sawtooth", attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.1 },
    flute: { name: "Flute", icon: "🌬️", type: "sine", attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.2 },
    bell: { name: "Bell", icon: "🔔", type: "square", attack: 0.002, decay: 0.1, sustain: 0.1, release: 1.5 },
    organ: { name: "Organ", icon: "🎹", type: "sawtooth", attack: 0.01, decay: 0.0, sustain: 1.0, release: 0.05 },
    strings: { name: "Strings", icon: "🎻", type: "sawtooth", attack: 0.1, decay: 0.2, sustain: 0.4, release: 1.5 },
    guitar: { name: "Guitar", icon: "🎸", type: "triangle", attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.8 }
};

const stage = document.getElementById('stage');
const editorCanvas = document.getElementById('editor-canvas');
const listPanel = document.getElementById('list-panel');
const filePanel = document.getElementById('file-panel');
const moviePanel = document.getElementById('movie-panel');
const musicPanel = document.getElementById('soundtrack-panel');
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
    
    if (state.ui.isPlaying || state.ui.isRecording) {
        if (rec && rec.frames) {
            if (rec.frames[frameIndex]) {
                const frameData = rec.frames[frameIndex];
                x = frameData.x; y = frameData.y; ci = frameData.costumeIndex;
            } else {
                // Find last available frame
                let lastIdx = -1;
                if (Array.isArray(rec.frames)) {
                    for (let i = frameIndex - 1; i >= 0; i--) {
                        if (rec.frames[i]) { lastIdx = i; break; }
                    }
                } else {
                    const keys = Object.keys(rec.frames).map(Number).filter(k => k < frameIndex);
                    if (keys.length > 0) lastIdx = Math.max(...keys);
                }
                
                if (lastIdx !== -1) {
                    const lastFrame = rec.frames[lastIdx];
                    x = lastFrame.x; y = lastFrame.y; ci = lastFrame.costumeIndex;
                }
            }
        }
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
        if (state.ui.isExporting && steps > 0) {
            console.log(`[RL-CLOCK] now=${now.toFixed(0)} frame=${state.ui.currentFrame} steps=${steps} accum=${state.ui.timeAccumulator.toFixed(1)}`);
        }
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
            currentStep++;

            if (state.ui.isExporting) {
                 console.log(`[RL-STEP] tick! currFrame=${state.ui.currentFrame} isTC=${state.ui.isTitleCardActive}`);
            }

            const titleCardDurationFrames = state.project.showTitleCard ? 120 : 0;
            if (state.ui.isTheaterMode && state.ui.isTitleCardActive && state.project.showTitleCard) {
                if (state.ui.currentFrame >= titleCardDurationFrames) {
                    console.log(`[RL-TC] Title card duration met. frame=${state.ui.currentFrame}. transition to simulation.`);
                    state.ui.isTitleCardActive = false;
                    state.ui.currentFrame = 0;
                    playAllAudio();
                }
            }

            if (!state.ui.isTitleCardActive) {
                const song = scene.songId ? state.project.songs.find(s => s.id === scene.songId) : null;
                if (song) {
                    const msPerSub = 30000 / song.bpm;
                    const totalElapsedMs = (state.ui.currentFrame + state.ui.songFrameOffset) * FRAME_DURATION;
                    const currentSub = Math.floor(totalElapsedMs / msPerSub);

                    if (currentSub !== state.ui.lastTriggeredSub) {
                        const loopSub = currentSub % (song.bars * 8);
                        if (state.ui.isExporting) console.log(`[MUSIC] Triggering notes for sub=${loopSub} (frame=${state.ui.currentFrame})`);
                        ['lead', 'chords', 'bass', 'drums'].forEach(t => triggerSongNote(song, t, loopSub));
                        state.ui.lastTriggeredSub = currentSub;
                    }
                }
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

            state.ui.currentFrame++;
            state.ui.timeAccumulator -= FRAME_DURATION;
        }    } else {
        state.ui.lastFrameTime = now;
        state.ui.timeAccumulator = 0;
    }

    const titleCardDurationFrames = state.project.showTitleCard ? 120 : 0;
    const maxFrames = getMaxFrames(scene) || 30;

    updateProgressBarUI(state.ui.currentFrame, maxFrames);

    if (state.ui.isTheaterMode && state.ui.isTitleCardActive && state.project.showTitleCard) {
        drawTitleCard(ctx, margin);
        if (state.ui.isExporting && state.ui.exportCtx) {
            const expCtx = state.ui.exportCtx;
            const tcBuf = document.createElement('canvas'); tcBuf.width = state.project.width; tcBuf.height = state.project.height;
            const tcBufCtx = tcBuf.getContext('2d'); tcBufCtx.imageSmoothingEnabled = false;
            drawTitleCard(tcBufCtx, 0);
            expCtx.imageSmoothingEnabled = false;
            expCtx.drawImage(tcBuf, 0, 0, state.ui.exportCanvas.width, state.ui.exportCanvas.height);
        }
        requestAnimationFrame(renderLoop);
        return;
    }
    
    if (!state.ui.isTheaterMode) {
        ctx.fillStyle = "white";
        ctx.fillRect(margin, margin, state.project.width, state.project.height);
    }

    const bd = scene.backdrop;

    if (state.ui.isPlaying && state.ui.currentFrame >= maxFrames) {
        if (state.project.currentSceneIndex < state.project.scenes.length - 1 && (!state.ui.isExporting || state.ui.exportFullMovie)) {
            const currentSongId = scene.songId;
            state.project.currentSceneIndex++;
            const nextScene = getCurrentScene();

            if (nextScene.songId === currentSongId && currentSongId !== null) {
                state.ui.songFrameOffset += maxFrames;
            } else {
                stopAllAudio();
                state.ui.songFrameOffset = 0;
                playAllAudio();
            }

            state.ui.currentFrame = 0;
            state.ui.lastFrameTime = performance.now();
            renderSceneList();
            renderActorList();
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

    if (state.ui.isPlaying && state.ui.currentFrame >= maxFrames && state.project.currentSceneIndex === state.project.scenes.length - 1) { ctx.fillStyle = "black"; ctx.font = "bold 20px Arial"; ctx.fillText("Fin.", margin + 10, margin + state.project.height - 15); }
    
    if (state.ui.isExporting && state.ui.exportCtx) {
        renderProjectFrame(state.ui.exportCtx, state.ui.currentFrame, state.ui.exportCanvas.width, state.ui.exportCanvas.height, 4, scene);
    }
    
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
    const scenes = state.project.scenes, durations = scenes.map((s, idx) => {
        let dur = getMaxFrames(s) || 30;
        if (state.ui.isRecording && idx === state.project.currentSceneIndex) {
            dur = Math.max(dur, currentFrame);
        }
        return dur;
    }), total = durations.reduce((a, b) => a + b, 0);
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
    [scene.backdrop, ...scene.actors].forEach(t => {
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
            state.ui.selectedActorId = 'backdrop';
        } else state.ui.selectedActorId = null;
    }
    renderActorList();
}
function onStageMouseMove(e) {
    const rect = stage.getBoundingClientRect(), sx = stage.width / rect.width, sy = stage.height / rect.height;
    const mx = (e.clientX - rect.left) * sx - state.ui.stageMargin, my = (e.clientY - rect.top) * sy - state.ui.stageMargin;
    const isHoverActive = state.ui.dragMode === 'hover' && (state.ui.isRecording || state.countdownTimer);
    if (isHoverActive && state.ui.selectedActorId && state.ui.selectedActorId !== 'backdrop') {
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

function onKeyDown(e) {
    if (e.code === 'Space') {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        e.preventDefault(); 
        if (state.ui.activePanel === 'songEditor') {
            toggleSongPreview();
            return;
        }
        if (state.ui.isRecording) stopRecording(); else togglePlayback(false, false); return;
    }
    const mod = e.ctrlKey || e.metaKey, scene = getCurrentScene();
    if (!scene) return;

    if (state.ui.activePanel === 'editor') {
 if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; } }
    const ki = "1234567890qwertyuiopasdfghjklzxcvbnm".indexOf(e.key.toLowerCase());
    if (ki !== -1 && !mod) {
        if (state.ui.activePanel === 'editor') { const t = state.ui.editingTarget; if (t && t.costumes[ki]) { state.ui.editingCostumeIndex = ki; state.ui.undoStack = []; state.ui.redoStack = []; updateUndoRedoButtons(); renderCostumeList(); loadCostumeToEditor(t.costumes[ki]); } return; }
        let t = (state.ui.selectedActorId === 'backdrop' ? scene.backdrop : scene.actors.find(a => a.id === state.ui.selectedActorId));
        if (t && t.costumes && t.costumes[ki]) {
            const rec = t.recordings[t.recordings.length - 1];
            const has = rec && (Array.isArray(rec.frames) ? rec.frames.length > 0 : Object.keys(rec.frames).length > 0);
            if (state.ui.isRecording || !has) { 
                t.currentCostume = ki; 
                if (state.ui.isRecording) { 
                    const frame = state.ui.currentFrame; 
                    if (t.id === 'backdrop') { 
                        rec.frames[frame] = { x: 0, y: 0, costumeIndex: ki }; 
                    } else { 
                        rec.frames[frame] = { x: t.x, y: t.y, costumeIndex: ki }; 
                    } 
                } 
            }
        }
    }
}

function setupPalette() { colorPalette.innerHTML = ''; colors.forEach(c => { const s = document.createElement('div'); s.className = 'color-swatch' + (c === 'transparent' ? ' transparent' : ''); if (c !== 'transparent') s.style.backgroundColor = c; if (c === state.ui.currentColor) s.classList.add('active'); s.onclick = () => { state.ui.currentColor = c; document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active')); s.classList.add('active'); }; colorPalette.appendChild(s); }); }
function createInitialState() { addScene(); }
function createEmptyScene(name) { return { id: 'scene_' + Date.now(), name, songId: null, backdrop: { id: 'backdrop', name: 'Backdrop', costumes: [createEmptyCostume(state.project.width, state.project.height, true)], currentCostume: 0, recordings: [] }, actors: [] }; }
function createEmptyCostume(w, h, isBD = false) { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); if (isBD) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h); } return { canvas: c, name: 'Costume' }; }

let isDrawing = false, startX, startY, snapshot, preStrokeState = null, brushPixels = [];

function bindEvents() {
    document.getElementById('file-btn').onclick = () => togglePanel('file');
    document.getElementById('scene-btn').onclick = () => togglePanel('movie');
    document.getElementById('instruments-btn').onclick = () => togglePanel('soundtrack');
    document.getElementById('add-scene-btn').onclick = addScene;
    document.getElementById('add-song-btn').onclick = addSong;
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
    document.getElementById('camera-btn').onclick = enterCameraMode;
    document.getElementById('camera-capture-btn').onclick = capturePhoto;
    document.getElementById('camera-cancel-btn').onclick = () => exitCameraMode(true);
    document.getElementById('show-title-card-checkbox').onchange = (e) => { state.project.showTitleCard = e.target.checked; saveProject(); };
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
    document.querySelectorAll('.inst-tab').forEach(btn => {
        btn.onclick = () => {
            state.ui.activeTrack = btn.dataset.track;
            document.querySelectorAll('.inst-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateInstrumentSelect();
            renderSongStudioGrid();
        };
    });
    document.getElementById('studio-preview-toggle-btn').onclick = () => {
        if (state.ui.isPreviewPlaying) stopSongPreview();
        else startSongPreview();
    };
    const canvas = document.getElementById('studio-grid-canvas');

    function handleStudioGridInput(e) {
        const songId = state.ui.activeSongId;
        if (!songId) return;
        const song = state.project.songs.find(s => s.id === songId);
        if (!song) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const colCount = song.bars * 8;
        const rowCount = 15;
        const cellW = canvas.width / colCount;
        const cellH = canvas.height / rowCount;

        const col = Math.floor(x / (rect.width / colCount));
        const row = Math.floor(y / (rect.height / rowCount));

        if (col >= 0 && col < colCount && row >= 0 && row < rowCount) {
            const degree = 14 - row;
            const track = song.tracks[state.ui.activeTrack];

            if (e.type === 'mousedown') {
                state.ui.isGridDragging = true;
                const idx = track.notes[col]?.indexOf(degree) ?? -1;
                state.ui.gridDragMode = (idx === -1) ? 'paint' : 'erase';
                state.ui.lastGridCell = { col, row };
                applyGridAction(track, col, degree, song);
            } else if (e.type === 'mousemove' && state.ui.isGridDragging) {
                if (state.ui.lastGridCell && state.ui.lastGridCell.col === col && state.ui.lastGridCell.row === row) return;
                state.ui.lastGridCell = { col, row };
                applyGridAction(track, col, degree, song);
            }
        }
    }

    function applyGridAction(track, col, degree, song) {
        if (!track.notes[col]) track.notes[col] = [];
        const idx = track.notes[col].indexOf(degree);
        const echo = !!track.echo;

        if (state.ui.gridDragMode === 'paint' && idx === -1) {
            track.notes[col].push(degree);
            // Preview note
            if (state.ui.activeTrack === 'drums') {
                playDrum(degree, null, null, echo);
            } else {
                const octaveOffset = state.ui.activeTrack === 'bass' ? -2 : (state.ui.activeTrack === 'lead' ? 1 : (state.ui.activeTrack === 'chords' ? -1 : 0));
                const freq = getFrequencyForDegree(degree, song.key, song.scale, octaveOffset);
                playSynth(freq, track.instrument, state.ui.activeTrack === 'chords', null, null, 0.3, echo);
            }
        } else if (state.ui.gridDragMode === 'erase' && idx !== -1) {
            track.notes[col].splice(idx, 1);
            if (track.notes[col].length === 0) delete track.notes[col];
        }

        renderSongStudioGrid();
        saveProject();
    }

    canvas.onmousedown = handleStudioGridInput;
    window.addEventListener('mousemove', handleStudioGridInput);
    window.addEventListener('mouseup', () => {
        state.ui.isGridDragging = false;
        state.ui.gridDragMode = null;
        state.ui.lastGridCell = null;
    });
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
    if (state.ui.activePanel !== 'editor' || state.ui.cameraMode) return;
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
    const t = (state.ui.selectedActorId === 'backdrop' ? getCurrentScene().backdrop : getCurrentScene().actors.find(a => a.id === state.ui.selectedActorId));
    if (!t) { alert("Select actor or backdrop!"); return; }
    const overlay = document.getElementById('countdown-overlay'); overlay.innerHTML = ''; overlay.classList.remove('hidden'); btn.textContent = '❌';
    let count = 3; overlay.textContent = count; state.countdownTimer = setInterval(() => { count--; if (count > 0) overlay.textContent = count; else { clearInterval(state.countdownTimer); state.countdownTimer = null; overlay.classList.add('hidden'); startRecording(t); } }, 1000);
}
async function startRecording(t) { 
    state.ui.isRecording = true; document.getElementById('record-btn').textContent = '⏹️'; 
    const newRec = { frames: [], audio: null }; 
    t.recordings.push(newRec); 
    state.ui.currentFrame = 0;
    state.ui.lastFrameTime = performance.now();
    state.ui.timeAccumulator = 0;
    newRec.frames[0] = { x: t.x, y: t.y, costumeIndex: t.currentCostume }; 
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
        
        if (state.ui.isExporting) {
            state.ui.isExporting = false;
            if (state.ui.exportRecorder) state.ui.exportRecorder.stop();
            state.ui.exportRecorder = null;
            state.ui.exportDest = null;
            state.ui.exportCanvas = null;
            state.ui.exportCtx = null;
        }
    } else {
        state.ui.movieStartSceneIndex = state.project.currentSceneIndex;
        if (asTheater) { state.ui.isTheaterMode = true; document.body.classList.add('theater-mode'); }
        if (startFromBeginning) { state.project.currentSceneIndex = 0; if (asTheater) state.ui.isTitleCardActive = true; }
        state.ui.isPlaying = true; state.ui.selectedActorId = null;
        document.getElementById('play-btn').textContent = '⏹️'; document.getElementById('play-group').classList.add('is-playing');
        state.ui.currentFrame = 0;
        state.ui.songFrameOffset = 0;
        state.ui.lastTriggeredSub = -1;
        state.ui.lastFrameTime = performance.now();
        state.ui.timeAccumulator = 0;
        if (!state.ui.isTitleCardActive) playAllAudio();
        renderActorList(); renderSceneList();
    }
}

function getFrequencyForDegree(degree, key, scale, octaveOffset) {
    const rootHz = { "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13, "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00, "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88 };
    const intervals = scales[scale] || [0, 2, 4, 5, 7, 9, 11];
    const scaleLen = intervals.length;
    const octave = Math.floor(degree / scaleLen) + octaveOffset;
    const interval = intervals[degree % scaleLen];
    return rootHz[key] * Math.pow(2, octave + interval / 12);
}

function triggerSongNote(song, trackName, subdivisionIndex, ctx = null, dest = null) {
    const track = song.tracks[trackName];
    const degrees = track.notes[subdivisionIndex];
    if (!degrees || !Array.isArray(degrees)) return;

    const duration = 30000 / song.bpm / 1000;
    const echo = !!track.echo;

    degrees.forEach(degree => {
        if (trackName === 'drums') {
            playDrum(degree, ctx, dest, echo);
        } else {
            const octaveOffset = trackName === 'bass' ? -2 : (trackName === 'lead' ? 1 : (trackName === 'chords' ? -1 : 0));
            const freq = getFrequencyForDegree(degree, song.key, song.scale, octaveOffset);
            playSynth(freq, track.instrument, trackName === 'chords', ctx, dest, duration, echo);
        }
    });
}

function playSynth(freq, instrumentName, isChord, ctx = null, dest = null, duration = 0.2, useEcho = false) {
    const activeCtx = ctx || audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
    if (activeCtx.state === 'suspended') activeCtx.resume();
    
    const inst = instruments[instrumentName] || instruments.synth;
    const freqs = isChord ? [freq, freq * Math.pow(2, 4/12), freq * Math.pow(2, 7/12)] : [freq];
    
    const maxGain = 0.2;
    const now = activeCtx.currentTime;
    const target = dest || activeCtx.destination;
    
    freqs.forEach(f => {
        const osc = activeCtx.createOscillator();
        const gain = activeCtx.createGain();
        osc.frequency.value = f;
        osc.type = inst.type || 'sawtooth';
        
        osc.connect(gain);
        gain.connect(target);
        
        if (useEcho) {
            const delay = activeCtx.createDelay();
            delay.delayTime.value = 0.3;
            const feedback = activeCtx.createGain();
            feedback.gain.value = 0.4;
            
            gain.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            feedback.connect(target);
        }

        if (!dest && musicDest) gain.connect(musicDest);
        if (state.ui.isRecording && state.ui.exportDest) gain.connect(state.ui.exportDest);
        if (state.ui.isExporting && state.ui.exportDest) gain.connect(state.ui.exportDest);
        
        // ADSR Envelope
        const attack = inst.attack || 0.05;
        const decay = inst.decay || 0.1;
        const sustain = inst.sustain || 0.5;
        const release = inst.release || 0.2;
        
        gain.gain.setValueAtTime(0, now);
        // Attack
        gain.gain.linearRampToValueAtTime(maxGain, now + attack);
        // Decay to Sustain
        gain.gain.linearRampToValueAtTime(maxGain * sustain, now + attack + decay);
        
        // Release starts after duration
        const releaseStart = now + Math.max(attack + decay, duration);
        gain.gain.setValueAtTime(maxGain * sustain, releaseStart);
        
        // Two-stage release: quick drop to 5%, then long tail
        const quickDropTime = releaseStart + (release * 0.1);
        gain.gain.exponentialRampToValueAtTime(maxGain * 0.05, quickDropTime);
        gain.gain.exponentialRampToValueAtTime(0.001, releaseStart + release);
        
        osc.start(now);
        osc.stop(releaseStart + release);
    });
}

function createNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    return buffer;
}

function playDrum(degree, ctx = null, dest = null, useEcho = false) {
    const activeCtx = ctx || audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)());
    if (activeCtx.state === 'suspended') activeCtx.resume();
    
    const now = activeCtx.currentTime;
    const target = dest || activeCtx.destination;
    
    const connectToOutput = (node) => {
        node.connect(target);
        
        if (useEcho) {
            const delay = activeCtx.createDelay();
            delay.delayTime.value = 0.3;
            const feedback = activeCtx.createGain();
            feedback.gain.value = 0.3;
            
            node.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            feedback.connect(target);
        }

        if (!dest && musicDest) node.connect(musicDest);
        if (state.ui.isRecording && state.ui.exportDest) node.connect(state.ui.exportDest);
        if (state.ui.isExporting && state.ui.exportDest) node.connect(state.ui.exportDest);
    };

    const playSineHit = (freq, sweep, decay, vol = 1.0) => {
        const osc = activeCtx.createOscillator();
        const gain = activeCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(sweep, now + decay);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        osc.connect(gain);
        connectToOutput(gain);
        osc.start(now);
        osc.stop(now + decay);
    };

    const playNoiseHit = (filterType, filterFreq, decay, vol = 0.5) => {
        const noise = activeCtx.createBufferSource();
        noise.buffer = createNoiseBuffer(activeCtx);
        const filter = activeCtx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = filterFreq;
        const gain = activeCtx.createGain();
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        noise.connect(filter);
        filter.connect(gain);
        connectToOutput(gain);
        noise.start(now);
        noise.stop(now + decay);
    };

    if (degree === 0) { // 808 Kick
        playSineHit(150, 40, 0.5, 1.0);
    } else if (degree === 1) { // 808 Snare
        playSineHit(180, 100, 0.1, 0.3);
        playNoiseHit('highpass', 1000, 0.2, 0.5);
    } else if (degree === 2) { // Closed Hat
        playNoiseHit('bandpass', 10000, 0.05, 0.2);
    } else if (degree === 3) { // Open Hat
        playNoiseHit('bandpass', 10000, 0.3, 0.2);
    } else if (degree === 4) { // Claves
        playSineHit(2500, 2400, 0.1, 0.4);
    } else if (degree === 5) { // Handclap
        for(let i=0; i<3; i++) {
            const delay = i * 0.01;
            const g = activeCtx.createGain();
            g.gain.setValueAtTime(0, now + delay);
            g.gain.linearRampToValueAtTime(0.3, now + delay + 0.001);
            g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.05);
            const noise = activeCtx.createBufferSource();
            noise.buffer = createNoiseBuffer(activeCtx);
            const f = activeCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200;
            noise.connect(f); f.connect(g); connectToOutput(g);
            noise.start(now + delay); noise.stop(now + delay + 0.05);
        }
    } else if (degree === 6) { // Cowbell
        [800, 540].forEach(f => {
            const osc = activeCtx.createOscillator();
            const gain = activeCtx.createGain();
            osc.type = 'square'; osc.frequency.value = f;
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain); connectToOutput(gain);
            osc.start(now); osc.stop(now + 0.3);
        });
    } else if (degree === 7) { // Maracas
        playNoiseHit('highpass', 5000, 0.05, 0.2);
    } else if (degree === 8) { // Cymbal
        playNoiseHit('highpass', 3000, 1.0, 0.2);
    } else if (degree === 9) { // Low Tom
        playSineHit(100, 60, 0.4, 0.6);
    } else if (degree === 10) { // Mid Tom
        playSineHit(150, 100, 0.4, 0.6);
    } else if (degree === 11) { // High Tom
        playSineHit(200, 140, 0.4, 0.6);
    } else if (degree === 12) { // Low Conga
        playSineHit(200, 180, 0.2, 0.5);
    } else if (degree === 13) { // Mid Conga
        playSineHit(300, 270, 0.2, 0.5);
    } else if (degree === 14) { // High Conga
        playSineHit(450, 420, 0.2, 0.5);
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
            if (state.ui.isExporting && state.ui.exportDest) panner.connect(state.ui.exportDest);
            audio.play(); activeAudioPlayers.push({ audio, panner, target: t, source }); 
            if (t.id !== 'backdrop') { 
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

function togglePanel(panel) { 
    if (state.ui.isPreviewPlaying) stopSongPreview();
    state.ui.activePanel = (state.ui.activePanel === panel) ? null : panel; 
    updatePanelVisibility(); 
}
function updatePanelVisibility() { 
    listPanel.classList.toggle('hidden', state.ui.activePanel !== 'list'); editorPanel.classList.toggle('hidden', state.ui.activePanel !== 'editor'); 
    filePanel.classList.toggle('hidden', state.ui.activePanel !== 'file'); moviePanel.classList.toggle('hidden', state.ui.activePanel !== 'movie'); 
    musicPanel.classList.toggle('hidden', state.ui.activePanel !== 'soundtrack');
    document.getElementById('song-editor-panel').classList.toggle('hidden', state.ui.activePanel !== 'songEditor');

    if (state.ui.activePanel === 'soundtrack') {
        renderSoundtrackPanel();
    }
    
    if (state.ui.activePanel === 'songEditor') {
        renderSongStudioGrid();
    }

    if (state.ui.activePanel === 'editor' && state.ui.editingTarget) {
 const isBD = state.ui.editingTarget.id === 'backdrop'; const cs = document.querySelector('.canvas-sizes'); if (cs) cs.classList.toggle('hidden', isBD); const trans = document.querySelector('.color-swatch.transparent'); if (trans) { trans.classList.toggle('hidden', isBD); if (isBD && state.ui.currentColor === 'transparent') { state.ui.currentColor = '#000000'; setupPalette(); } } }
    document.getElementById('file-btn').classList.toggle('active', state.ui.activePanel === 'file');
    document.getElementById('scene-btn').classList.toggle('active', state.ui.activePanel === 'movie');
    document.getElementById('instruments-btn').classList.toggle('active', state.ui.activePanel === 'soundtrack' || state.ui.activePanel === 'songEditor');
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

function renderSoundtrackPanel() {
    const sceneMusicList = document.getElementById('scene-music-list');
    const songLibraryList = document.getElementById('song-library-list');
    
    sceneMusicList.innerHTML = '';
    state.project.scenes.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        const { ci } = getActorDisplayState(s.backdrop, 0);
        const thumb = document.createElement('img'); 
        thumb.className = 'thumbnail transparent-pattern'; 
        thumb.src = s.backdrop.costumes[ci].canvas.toDataURL(); 
        div.appendChild(thumb);
        
        const name = document.createElement('span');
        name.textContent = s.name;
        div.appendChild(name);
        
        const select = document.createElement('select');
        select.style.width = '140px';
        select.style.marginLeft = 'auto';
        select.style.padding = '4px';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'None';
        select.appendChild(noneOpt);
        
        state.project.songs.forEach(song => {
            const opt = document.createElement('option');
            opt.value = song.id;
            opt.textContent = song.name;
            if (s.songId === song.id) opt.selected = true;
            select.appendChild(opt);
        });
        
        select.onchange = (e) => {
            s.songId = e.target.value || null;
            saveProject();
        };
        div.appendChild(select);
        sceneMusicList.appendChild(div);
    });
    
    songLibraryList.innerHTML = '';
    state.project.songs.forEach((song, i) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        const name = document.createElement('span');
        name.textContent = song.name;
        name.className = 'clickable-name';
        name.onclick = () => {
            const newName = prompt("Rename song:", song.name);
            if (newName) {
                song.name = newName;
                renderSoundtrackPanel();
                saveProject();
            }
        };
        div.appendChild(name);
        
        const acts = document.createElement('div');
        acts.style.marginLeft = 'auto';
        acts.style.display = 'flex';
        acts.style.gap = '2px';
        
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => openSongStudio(song);
        acts.appendChild(editBtn);
        
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => {
            if (confirm(`Delete song "${song.name}"?`)) {
                deleteSong(song.id);
            }
        };
        acts.appendChild(delBtn);
        
        div.appendChild(acts);
        songLibraryList.appendChild(div);
    });
}

function addSong() {
    const song = {
        id: 'song_' + Date.now(),
        name: 'Song ' + (state.project.songs.length + 1),
        bpm: 120,
        key: 'C',
        scale: 'major',
        bars: 4,
        tracks: {
            lead: { instrument: 'piano', notes: {}, echo: false },
            chords: { instrument: 'synth', notes: {}, echo: false },
            bass: { instrument: 'synth', notes: {}, echo: false },
            drums: { instrument: 'drum', notes: {}, echo: false }
        }
    };
    state.project.songs.push(song);
    renderSoundtrackPanel();
    saveProject();
}

function deleteSong(songId) {
    state.project.songs = state.project.songs.filter(s => s.id !== songId);
    state.project.scenes.forEach(s => {
        if (s.songId === songId) s.songId = null;
    });
    renderSoundtrackPanel();
    saveProject();
}

function startSongPreview() {
    if (state.ui.isPreviewPlaying) return;
    const songId = state.ui.activeSongId;
    if (!songId) return;
    const song = state.project.songs.find(s => s.id === songId);
    if (!song) return;

    state.ui.isPreviewPlaying = true;
    state.ui.previewFrame = 0;
    state.ui.lastPreviewTime = performance.now();
    state.ui.previewAccumulator = 0;
    const btn = document.getElementById('studio-preview-toggle-btn');
    btn.textContent = '⏹️';
    btn.classList.add('active');

    function previewLoop() {
        if (!state.ui.isPreviewPlaying) return;

        const now = performance.now();
        let deltaTime = now - state.ui.lastPreviewTime;
        if (deltaTime > 500) deltaTime = 500;
        state.ui.previewAccumulator += deltaTime;
        state.ui.lastPreviewTime = now;

        while (state.ui.previewAccumulator >= FRAME_DURATION) {
            const msPerSub = 30000 / song.bpm;
            const totalElapsedMs = state.ui.previewFrame * FRAME_DURATION;
            const currentSub = Math.floor(totalElapsedMs / msPerSub);
            const lastSub = state.ui.previewFrame === 0 ? -1 : Math.floor(((state.ui.previewFrame - 1) * FRAME_DURATION) / msPerSub);

            if (currentSub !== lastSub) {
                const loopSub = currentSub % (song.bars * 8);
                ['lead', 'chords', 'bass', 'drums'].forEach(t => triggerSongNote(song, t, loopSub));
                renderSongStudioGrid();
            }

            state.ui.previewFrame++;
            state.ui.previewAccumulator -= FRAME_DURATION;
        }
        requestAnimationFrame(previewLoop);
    }
    requestAnimationFrame(previewLoop);
}

function stopSongPreview() {
    state.ui.isPreviewPlaying = false;
    state.ui.previewFrame = 0;
    const btn = document.getElementById('studio-preview-toggle-btn');
    btn.textContent = '▶️';
    btn.classList.remove('active');
    renderSongStudioGrid();
}

function toggleSongPreview() {
    if (state.ui.isPreviewPlaying) stopSongPreview();
    else startSongPreview();
}

function updateSongEditorPanelWidth(bars) {
    const panel = document.getElementById('song-editor-panel');
    if (bars <= 4) {
        panel.style.width = '1020px';
    } else {
        panel.style.width = '95vw';
    }
}

function updateInstrumentSelect() {
    const songId = state.ui.activeSongId;
    if (!songId) return;
    const song = state.project.songs.find(s => s.id === songId);
    if (!song) return;

    const select = document.getElementById('studio-track-instrument');
    select.innerHTML = '';
    
    if (state.ui.activeTrack === 'drums') {
        const opt = document.createElement('option');
        opt.value = 'drums';
        opt.textContent = 'Standard Kit';
        select.appendChild(opt);
        select.disabled = true;
    } else {
        select.disabled = false;
        Object.entries(instruments).forEach(([id, inst]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${inst.icon} ${inst.name}`;
            if (song.tracks[state.ui.activeTrack].instrument === id) opt.selected = true;
            select.appendChild(opt);
        });
    }
    
    select.onchange = (e) => {
        song.tracks[state.ui.activeTrack].instrument = e.target.value;
        e.target.blur();
        saveProject();
    };

    const echoCheck = document.getElementById('studio-track-echo');
    echoCheck.checked = !!song.tracks[state.ui.activeTrack].echo;
    echoCheck.onchange = (e) => {
        song.tracks[state.ui.activeTrack].echo = e.target.checked;
        e.target.blur();
        saveProject();
    };
}

function openSongStudio(song) {
    if (state.ui.isPreviewPlaying) stopSongPreview();
    state.ui.activeSongId = song.id;
    state.ui.activePanel = 'songEditor';
    updatePanelVisibility();
    
    updateSongEditorPanelWidth(song.bars);
    updateInstrumentSelect();
    
    document.getElementById('studio-song-name').textContent = song.name;
    
    const bpmSelect = document.getElementById('studio-bpm');
    bpmSelect.innerHTML = '';
    SPEED_PRESETS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.bpm;
        opt.textContent = `${p.label}`;
        if (song.bpm === p.bpm) opt.selected = true;
        bpmSelect.appendChild(opt);
    });
    bpmSelect.onchange = (e) => { song.bpm = parseInt(e.target.value); e.target.blur(); saveProject(); };
    
    const keySelect = document.getElementById('studio-key');
    keySelect.innerHTML = '';
    keyFrequencies.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        if (song.key === k) opt.selected = true;
        keySelect.appendChild(opt);
    });
    keySelect.onchange = (e) => { song.key = e.target.value; e.target.blur(); saveProject(); };
    
    const scaleSelect = document.getElementById('studio-scale');
    scaleSelect.innerHTML = '';
    Object.keys(scales).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        if (song.scale === s) opt.selected = true;
        scaleSelect.appendChild(opt);
    });
    scaleSelect.onchange = (e) => { song.scale = e.target.value; e.target.blur(); saveProject(); };
    
    const barsSelect = document.getElementById('studio-bars');
    barsSelect.innerHTML = '';
    LENGTH_PRESETS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.bars;
        opt.textContent = `${p.label}`;
        if (song.bars === p.bars) opt.selected = true;
        barsSelect.appendChild(opt);
    });
    barsSelect.onchange = (e) => { 
        song.bars = parseInt(e.target.value); 
        updateSongEditorPanelWidth(song.bars);
        renderSongStudioGrid();
        e.target.blur();
        saveProject(); 
    };
    
    renderSongStudioGrid();
}

function renderSongStudioGrid() {
    const songId = state.ui.activeSongId;
    if (!songId) return;
    const song = state.project.songs.find(s => s.id === songId);
    if (!song) return;
    
    const canvas = document.getElementById('studio-grid-canvas');
    const wrap = canvas.parentElement;
    
    const colCount = song.bars * 8;
    const rowCount = 15;
    
    // Allow Long (8 bars) to fit the screen (slightly squished), 
    // but make anything longer (Epic) scroll at that same cell size.
    const scrollFactor = Math.max(1, song.bars / 8);
    canvas.width = wrap.clientWidth * scrollFactor;
    canvas.height = wrap.clientHeight;
    
    const ctx = canvas.getContext('2d');
    const cellW = canvas.width / colCount;
    const cellH = canvas.height / rowCount;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    for (let i = 0; i <= colCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, canvas.height);
        if (i % 8 === 0) {
            ctx.strokeStyle = '#000'; // Solid black for bars
            ctx.lineWidth = 1;
        } else {
            ctx.strokeStyle = '#eee'; // Light gray for beats
            ctx.lineWidth = 0.5;
        }
        ctx.stroke();
    }
    
    for (let i = 0; i <= rowCount; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellH);
        ctx.lineTo(canvas.width, i * cellH);
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    
    // Draw notes for active track
    const trackColors = { lead: '#4a90e2', chords: '#ff00ff', bass: '#7ed321', drums: '#ffff00' };
    const track = song.tracks[state.ui.activeTrack];
    
    Object.entries(track.notes).forEach(([col, degrees]) => {
        if (!Array.isArray(degrees)) return;
        degrees.forEach(degree => {
            const x = parseInt(col) * cellW;
            const y = (14 - degree) * cellH;
            
            // Fill
            ctx.fillStyle = trackColors[state.ui.activeTrack];
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
            
            // Outline
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        });
    });

    // Playhead (if previewing)
    if (state.ui.isPreviewPlaying) {
        const msPerSub = 30000 / song.bpm;
        const currentSub = Math.floor((state.ui.previewFrame * FRAME_DURATION) / msPerSub) % (song.bars * 8);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(currentSub * cellW, 0, cellW, canvas.height);
    }
}
function updatePlayMovieButton() { document.getElementById('play-group').classList.add('can-theater'); }
function updateMovieExportButtons() { const el = document.getElementById('movie-export-options'); if (el) el.classList.remove('hidden'); }

function addActor() { const a = { id: 'actor_' + Date.now(), name: 'Actor ' + (getCurrentScene().actors.length + 1), costumes: [createEmptyCostume(64, 64)], currentCostume: 0, x: state.project.width / 2, y: state.project.height / 2, recordings: [] }; getCurrentScene().actors.push(a); state.ui.selectedActorId = a.id; renderActorList(); saveProject(); }
function renderActorList() {
    actorList.innerHTML = ''; const scene = getCurrentScene(); if (!scene) return;
    actorList.appendChild(createListItem(scene.backdrop, false, -1));
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
    
    const { ci } = getActorDisplayState(t, 0);
    const img = document.createElement('img');
    img.src = t.costumes[ci].canvas.toDataURL();
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    thumbWrapper.appendChild(img);
    
    div.appendChild(thumbWrapper);
    const name = document.createElement('span'); name.textContent = t.name; if (t.id !== 'backdrop') { name.className = 'clickable-name'; name.onclick = (e) => { e.stopPropagation(); const nn = prompt("Rename:", t.name); if (nn) { t.name = nn; renderActorList(); saveProject(); } }; } div.appendChild(name);
    const rec = t.recordings[t.recordings.length - 1];
    if (rec && rec.frames?.length > 0) { 
        const i = document.createElement('span'); 
        i.textContent = ' 🎞'; 
        i.className = 'icon-btn clickable-icon'; 
        i.onclick = (e) => { e.stopPropagation(); if (confirm("Delete dragging?")) { const f0 = rec.frames[0]; if (f0 && t.id !== 'backdrop') { t.x = f0.x; t.y = f0.y; t.currentCostume = f0.costumeIndex; } rec.frames = []; saveProject(); renderActorList(); } }; 
        div.appendChild(i); 
    }
    
    if (rec && rec.audio) { const mic = document.createElement('span'); mic.textContent = ' 🎤'; mic.className = 'icon-btn clickable-icon'; mic.onclick = (e) => { e.stopPropagation(); if (confirm("Delete audio?")) { rec.audio = null; saveProject(); renderActorList(); } }; div.appendChild(mic); }
    const acts = document.createElement('div'); acts.style.marginLeft = 'auto'; acts.style.display = 'flex'; acts.style.gap = '2px';
    const edit = document.createElement('button'); edit.textContent = '✎'; edit.onclick = (e) => { e.stopPropagation(); openEditor(t); }; acts.appendChild(edit);
    if (canDel) { const del = document.createElement('button'); del.textContent = '🗑'; del.onclick = (e) => { e.stopPropagation(); if (confirm(`Delete actor "${t.name}"?`)) { const s = getCurrentScene(); s.actors = s.actors.filter(ac => ac.id !== t.id); renderActorList(); saveProject(); } }; acts.appendChild(del); }
    div.appendChild(acts); div.onclick = () => { state.ui.selectedActorId = t.id; renderActorList(); }; return div;
}

function openEditor(t) { state.ui.editingTarget = t; state.ui.editingCostumeIndex = t.currentCostume; state.ui.undoStack = []; state.ui.redoStack = []; updateUndoRedoButtons(); state.ui.activePanel = 'editor'; updatePanelVisibility(); renderCostumeList(); state.ui.currentTool = 'pencil'; document.querySelectorAll('.main-tools button[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'pencil')); loadCostumeToEditor(t.costumes[state.ui.editingCostumeIndex]); }

async function enterCameraMode() {
    const ctx = editorCanvas.getContext('2d');
    state.ui.cameraBackup = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
    
    try {
        state.ui.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        state.ui.cameraMode = true;
        
        document.querySelector('.main-tools').classList.add('hidden');
        document.getElementById('camera-tools').classList.remove('hidden');
        
        const video = document.createElement('video');
        video.srcObject = state.ui.cameraStream;
        video.play();
        
        cameraPreviewLoop(video);
    } catch (err) {
        alert("Camera access denied or unavailable.");
        exitCameraMode(false);
    }
}

function cameraPreviewLoop(video) {
    if (!state.ui.cameraMode) return;
    
    const ctx = editorCanvas.getContext('2d');
    const cw = editorCanvas.width;
    const ch = editorCanvas.height;
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw > 0 && vh > 0) {
        const videoRatio = vw / vh;
        const canvasRatio = cw / ch;
        let sx, sy, sw, sh;
        
        if (videoRatio > canvasRatio) {
            sw = vh * canvasRatio;
            sh = vh;
            sx = (vw - sw) / 2;
            sy = 0;
        } else {
            sw = vw;
            sh = vw / canvasRatio;
            sx = 0;
            sy = (vh - sh) / 2;
        }
        
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    }
    
    requestAnimationFrame(() => cameraPreviewLoop(video));
}

function capturePhoto() {
    if (!state.ui.cameraMode) return;
    
    const overlay = document.getElementById('countdown-overlay');
    overlay.classList.remove('hidden');
    
    let count = 3;
    overlay.textContent = count;

    state.countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
            overlay.textContent = count;
        } else {
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
            overlay.classList.add('hidden');

            // Finalize capture
            commitUndo(state.ui.cameraBackup);
            state.ui.cameraBackup = null; // Prevent restore in exitCameraMode
            saveCurrentCostume();
            updateLiveThumbnail();
            renderActorList();
            exitCameraMode(false);
            saveProject();
        }
    }, 1000);
}

function exitCameraMode(restoreBackup) {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        document.getElementById('countdown-overlay').classList.add('hidden');
    }

    if (state.ui.cameraStream) {
        state.ui.cameraStream.getTracks().forEach(track => track.stop());
        state.ui.cameraStream = null;
    }
    
    state.ui.cameraMode = false;
    
    if (restoreBackup && state.ui.cameraBackup) {
        const ctx = editorCanvas.getContext('2d');
        ctx.putImageData(state.ui.cameraBackup, 0, 0);
    }
    
    state.ui.cameraBackup = null;
    document.querySelector('.main-tools').classList.remove('hidden');
    document.getElementById('camera-tools').classList.add('hidden');
}

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
    state.project.songs = (p.songs || []).map(song => {
        if (song.tracks) {
            for (const trackName in song.tracks) {
                const track = song.tracks[trackName];
                if (track.notes) {
                    for (const col in track.notes) {
                        if (track.notes[col] !== undefined && !Array.isArray(track.notes[col])) {
                            track.notes[col] = [track.notes[col]];
                        }
                    }
                }
            }
        }
        return song;
    });
    state.project.scenes = await Promise.all(p.scenes.map(async s => ({ 
        name: s.name, 
        songId: s.songId || null,
        backdrop: await deserializeTarget(s.backdrop), 
        actors: await Promise.all(s.actors.map(deserializeTarget)) 
    }))); 
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
    if (state.ui.isExporting) return;
    const upScale = 4, expCanvas = document.createElement('canvas'); expCanvas.width = state.project.width * upScale; expCanvas.height = state.project.height * upScale;
    const expCtx = expCanvas.getContext('2d'); expCtx.imageSmoothingEnabled = false;
    const tcCanvas = document.createElement('canvas'); tcCanvas.width = state.project.width; tcCanvas.height = state.project.height;
    const tcCtx = tcCanvas.getContext('2d'); tcCtx.imageSmoothingEnabled = false;
    const scenesToExport = fullMovie ? [...state.project.scenes] : [getCurrentScene()];
    const durations = scenesToExport.map(s => getMaxFrames(s) || 30);
    const titleCardDurationFrames = (fullMovie && state.project.showTitleCard) ? 120 : 0;
    const totalFrames = durations.reduce((a, b) => a + b, 0) + titleCardDurationFrames;
    
    if (format === 'video') {
        state.ui.isExporting = true;
        state.ui.exportFullMovie = fullMovie;
        state.ui.exportCanvas = expCanvas;
        state.ui.exportCtx = expCtx;

        const stream = state.ui.exportCanvas.captureStream(FPS);
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume();
        state.ui.exportDest = audioContext.createMediaStreamDestination();
        
        // AUDIO STARVATION FIX: Inject continuous silence so MediaRecorder doesn't stall waiting for playAllAudio()
        const silentOsc = audioContext.createOscillator();
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0; // Pure silence
        silentOsc.connect(silentGain);
        silentGain.connect(state.ui.exportDest);
        silentOsc.start();
        
        const recorder = new MediaRecorder(new MediaStream([...stream.getVideoTracks(), ...state.ui.exportDest.stream.getAudioTracks()]), { mimeType: 'video/webm' });
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => { 
            const a = document.createElement('a'); 
            a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); 
            a.download = fullMovie ? 'movie.webm' : 'scene.webm'; 
            a.click(); 
        };
        state.ui.exportRecorder = recorder;
        recorder.start(); 
        
        togglePlayback(true, fullMovie);
    } else {
        togglePlayback(true, fullMovie);
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
