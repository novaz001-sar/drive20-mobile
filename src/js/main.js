import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { TILE_SIZE, WALL_HEIGHT, MOVE_SPEED, TURN_SPEED, LUCKY_CAT } from './constants.js';
import { translations } from './i18n.js';
import { levels } from './levels.js';
import { createGrandTouringCarAsset } from './assets/grandTouringCar.js?v=20260623-minimal-tech';

// ====================================================================
// 全局变量和状态机 (Global Variables & State Machine)
// ====================================================================

let scene, camera, renderer, clock, fontLoader;
let starField;
// Added playerCarModel (v10.0)
let player, playerCarModel, mazeGroup, landmarksGroup, goalMarker, sceneryGroup, steeringWheel;
let waypointsGroup, highlightFloorsGroup;
let minimap, minimapCtx;
// NEW: Minimap rotation mode (v10.1)
let minimapBgCanvas, minimapBgCtx;
let minimapBgDirty = true;
let lastMinimapRenderKey = '';
let activeLampLights = [];
let activeTechWallEffects = [];
let minimapOrientationMode = 'NORTH_UP'; // 'NORTH_UP' | 'HEADING_UP'
try {
    const savedMinimapMode = localStorage.getItem('minimap_orientation_mode_v1');
    if (savedMinimapMode === 'HEADING_UP' || savedMinimapMode === 'NORTH_UP') {
        minimapOrientationMode = savedMinimapMode;
    }
} catch (e) {
    // localStorage may be unavailable in some environments
}

let gameState = 'STARTUP_MODAL';
let viewMode = '1P'; // '1P' (First Person) or '3P' (Third Person) (v10.0)
// NEW: Per-view yellow arrow hints
let arrowHintsEnabled = { '1P': true, '3P': false };
let currentLevelIndex = 0;
let playerInfo = { nickname: 'Driver', gender: 'other' };

// NEW: Third person camera control state
let thirdPersonControls = {
    zoom: 2.5, // Corresponds to slider initial value
    angle: 45, // Corresponds to slider initial value
    carScale: 1.0 // NEW: Add car scale control
};

let currentLevelState = {
    playerChoices: 0,
    isWaypointMode: false,
    totalWaypoints: 0,
    nextWaypoint: 1,
    touchedFreeWaypoints: new Set(),
    touchedHighlightFloors: new Set()
};
let activeFireworks = [];
let activeGoalHeartBursts = [];
let activeLevelCelebrations = [];
let levelCompleteTimeout = null;
let goalHeartGeometryCache = null;
let celebrationStarGeometryCache = null;
const goalHeartMaterialsCache = { classic: null, tech: null };
const celebrationMaterialsCache = { classic: null, tech: null };
const goalHeartTempMatrix = new THREE.Matrix4();
const goalHeartTempPosition = new THREE.Vector3();
const goalHeartTempScale = new THREE.Vector3();
const goalHeartTempQuaternion = new THREE.Quaternion();
const goalHeartSpinQuaternion = new THREE.Quaternion();
const GOAL_HEART_SPIN_AXIS = new THREE.Vector3(0, 0, 1);

let targetPosition = new THREE.Vector3();
let targetRotation = new THREE.Euler();
let previousGameState = '';
let previousGridPos = null;

const keyState = { 'a': false, 'd': false, 'e': false, 'w': false, 'escape': false };
let keyDebounce = false;
const gestureState = {
    pointerId: null,
    startX: 0,
    startY: 0,
    active: false
};
const GESTURE_MIN_DISTANCE = 34;

let wallMaterialN, wallMaterialS, wallMaterialE, wallMaterialW, floorMaterial, landmarkMaterial, goalWallMaterial;
let hemisphereLight, dirLight;

let customLevels = [];
let luckyCatArm, luckyCatWrist, floatingHeart;
let helveticaFont = null;

let currentLanguage = 'en';
let promptTimeout;
let hintTimeout;
let currentEditorMode = 'custom';
const DEFAULT_FLOOR_TEXTURE_URL = './src/assets/floor-cell-mobile-512.webp?v=20260620-4';
const FALLBACK_FLOOR_TEXTURE_URL = './src/assets/floor-cell.png?v=20260620-4';
const GOAL_MARKER_BASE_Y = WALL_HEIGHT / 2 - 1.5;
const WAYPOINT_GOAL_ASSET_HEIGHT = 4.6;
const WAYPOINT_GOAL_FLOOR_CLEARANCE = 0.26;
const WAYPOINT_MANEKI_NEKO_URL = './src/assets/models/optimized/waypoint-maneki-neko.glb?v=20260624-maneki-cat-only';
const FREE_WAYPOINT_MARKER_URL = './src/assets/models/optimized/free-waypoint-marker.glb?v=20260624-free-waypoint';
const FREE_WAYPOINT_MARKER_HEIGHT = 2.35;
const FREE_WAYPOINT_MARKER_FLOOR_CLEARANCE = 0.16;
let defaultFloorTexturePromise = null;
let waypointGoalCatPromise = null;
let freeWaypointMarkerPromise = null;
const tripoGoalBox = new THREE.Box3();
const tripoGoalSize = new THREE.Vector3();
const tripoGoalCenter = new THREE.Vector3();
const AUDIO_MASTER_GAIN_MULTIPLIER = 2;
const SOUND_ENABLED_STORAGE_KEY = 'drive_sound_enabled_v1';
const SOUND_VOLUME_STORAGE_KEY = 'drive_sound_volume_v2';

THREE.Cache.enabled = true;

// Texture customization variables
let textureURLs = { floor: null, wallN: null, wallS: null, wallE: null, wallW: null };
let textureScales = { floor: 1, wall: 1 };
const audioSettings = {
    enabled: true,
    volume: 1
};
let audioContext = null;
let audioMasterGain = null;
let audioNoiseBuffer = null;
let audioUnlockPromise = null;
let lastWaypointSoundToken = null;
try {
    const savedSoundEnabled = localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
    const savedSoundVolume = parseFloat(localStorage.getItem(SOUND_VOLUME_STORAGE_KEY));
    if (savedSoundEnabled === 'off') audioSettings.enabled = false;
    if (Number.isFinite(savedSoundVolume)) audioSettings.volume = Math.min(1, Math.max(0, savedSoundVolume));
} catch (e) {
    // Sound settings are optional when storage is unavailable.
}

// ====================================================================
// 初始化函数 (Initialization)
// ====================================================================

function prefersMobilePerformance() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;
}

function isPortraitTouchScreen() {
    return window.innerWidth <= 800 && window.innerHeight > window.innerWidth;
}

function getAppViewportSize() {
    const viewport = window.visualViewport;
    const rawWidth = Math.max(
        viewport?.width || 0,
        window.innerWidth || 0,
        document.documentElement.clientWidth || 0,
        1
    );
    const rawHeight = Math.max(
        viewport?.height || 0,
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0,
        1
    );
    return {
        width: Math.max(1, Math.round(rawWidth)),
        height: Math.max(1, Math.round(rawHeight))
    };
}

function syncAppViewportSize() {
    const { width, height } = getAppViewportSize();
    document.documentElement.style.setProperty('--app-width', `${width}px`);
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    return { width, height };
}

function syncRendererToViewport() {
    const { width, height } = syncAppViewportSize();
    if (!camera || !renderer) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(getRendererPixelRatio());
    renderer.setSize(width, height);
}

function scheduleInitialViewportSync() {
    const sync = () => syncRendererToViewport();
    requestAnimationFrame(sync);
    requestAnimationFrame(() => requestAnimationFrame(sync));
    [80, 220, 520, 900].forEach(delay => setTimeout(sync, delay));
}

function getRendererPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1;
    return Math.min(deviceRatio, prefersMobilePerformance() ? 1.55 : 1.85);
}

function setupSkyBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#4fb8e8');
    gradient.addColorStop(0.42, '#9edced');
    gradient.addColorStop(0.72, '#e7d3ac');
    gradient.addColorStop(1, '#f4c27f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(0, 82, canvas.width, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(0, 118, canvas.width, 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    scene.background = texture;
    scene.userData.skyFogColor = new THREE.Color(0xd7e6df);
}

async function init() {
    scene = new THREE.Scene();

    const viewportSize = syncAppViewportSize();
    setupSkyBackground();
    scene.fog = new THREE.Fog(scene.userData.skyFogColor, TILE_SIZE * 12, TILE_SIZE * 36);
    camera = new THREE.PerspectiveCamera(75, viewportSize.width / viewportSize.height, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        precision: 'highp',
        stencil: false
    });
    renderer.setPixelRatio(getRendererPixelRatio());
    renderer.setSize(viewportSize.width, viewportSize.height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Initialize clear color based on fog, might be overwritten by setupSkyBackground
    if (scene.fog) {
         renderer.setClearColor(scene.fog.color, 1);
    }

    clock = new THREE.Clock();
    
    fontLoader = new FontLoader();
    try {
        const font = await fontLoader.loadAsync('./src/assets/vendor/three/examples/fonts/helvetiker_regular.typeface.json?v=20260624-apk');
        helveticaFont = font;
        console.log("Font loaded successfully.");
    } catch (error) {
        console.error("Could not load font for 3D text.", error);
    }

    hemisphereLight = new THREE.HemisphereLight(0xf8fbff, 0x59616d, 1.9);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);

    dirLight = new THREE.DirectionalLight(0xffffff, 2.35);
    dirLight.position.set(-0.8, 1.8, 0.9).multiplyScalar(30);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xbfd7ff, 0.85);
    rimLight.position.set(1.4, 1.2, -0.9).multiplyScalar(24);
    scene.add(rimLight);

    const softFillLight = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(softFillLight);

    player = new THREE.Object3D();
    scene.add(player);
    
    // Initialize Player Car Model for 3P view (v10.0)
    playerCarModel = createGrandTouringCarAsset({ tileSize: TILE_SIZE });
    player.add(playerCarModel);
    
    // Camera setup (Parented to player) (v10.0)
    player.add(camera);
    
    // Set initial view mode (1P) (v10.0)
    setViewMode('1P');

    const headLight = new THREE.SpotLight(0xffffff, 10, 8 * TILE_SIZE, Math.PI / 4, 0.5, 1.5);
    headLight.position.set(0, 0, 1);
    // Keep headlight on the camera as it simulates the player's view light in 1P.
    camera.add(headLight);

    mazeGroup = new THREE.Group();
    sceneryGroup = new THREE.Group();
    waypointsGroup = new THREE.Group();
    highlightFloorsGroup = new THREE.Group();
    scene.add(mazeGroup, sceneryGroup, waypointsGroup, highlightFloorsGroup);
    
    landmarksGroup = new THREE.Group();
    camera.add(landmarksGroup);
    
    steeringWheel = createSteeringWheel();
    camera.add(steeringWheel);
    
    minimap = document.getElementById('minimap-canvas');
    minimapCtx = minimap.getContext('2d');

    // Offscreen canvas for rotated minimap rendering (v10.1)
    minimapBgCanvas = document.createElement('canvas');
    minimapBgCtx = minimapBgCanvas.getContext('2d');

    requestDefaultFloorTexture();
    createMaterials();
    loadCustomLevels();
    warmGoalHeartBurstResources();

    window.addEventListener('resize', onWindowResize, false);
    window.visualViewport?.addEventListener('resize', onWindowResize, false);
    window.visualViewport?.addEventListener('scroll', onWindowResize, false);
    scheduleInitialViewportSync();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    setupUI();
    updateUIText();
    createStarField();
    animate();
}

// New function to handle view mode switching (v10.0)
function setViewMode(mode) {
    viewMode = mode;
    const btn1P = document.getElementById('view-1p-btn');
    const btn3P = document.getElementById('view-3p-btn');
    const controls = document.getElementById('third-person-controls');

    if (mode === '1P') {
        // First Person View
        if (controls) controls.style.display = 'none';
        camera.position.set(0, WALL_HEIGHT * 0.4, 0);
        camera.rotation.x = THREE.MathUtils.degToRad(-8);
        camera.rotation.y = 0; camera.rotation.z = 0; // Reset local rotation
        if (playerCarModel) playerCarModel.visible = false;
        if (steeringWheel) steeringWheel.visible = true;
        if (btn1P) btn1P.classList.add('active');
        if (btn3P) btn3P.classList.remove('active');
    } else if (mode === '3P') {
        // Third Person View
        if (controls) controls.style.display = 'flex';
        updateThirdPersonCamera(); // NEW: Set camera based on sliders
        if (playerCarModel) playerCarModel.visible = true;
        if (steeringWheel) steeringWheel.visible = false;
        if (btn1P) btn1P.classList.remove('active');
        if (btn3P) btn3P.classList.add('active');
    }
    // If we switch views during an intersection, update the helper arrows visibility
    if (gameState === 'AT_INTERSECTION') {
        checkForTurns();
    }
}

// NEW: Function to update 3P camera based on controls
function updateThirdPersonCamera() {
    if (viewMode !== '3P') return;

    const zoom = thirdPersonControls.zoom; // This is a multiplier for TILE_SIZE
    const angleDeg = thirdPersonControls.angle; // This is the downward angle in degrees

    const distance = TILE_SIZE * zoom;
    const angleRad = THREE.MathUtils.degToRad(angleDeg);

    // Calculate local position for the camera relative to the player
    // Camera should be behind and above the player
    const camX = 0;
    const camY = distance * Math.sin(angleRad); // Height
    const camZ = distance * Math.cos(angleRad); // How far back

    camera.position.set(camX, camY, camZ);
    
    // The rotation should be pointing down towards the player's origin.
    camera.rotation.x = -angleRad;
    camera.rotation.y = 0; // Local rotations are 0
    camera.rotation.z = 0;
}

function startDrivingFromBigMap() {
    const minimapContainer = document.getElementById('minimap-container');
    const minimapControls = document.getElementById('minimap-controls');
    if (!minimapContainer.classList.contains('big-map') || gameState !== 'BIG_MAP') return;

    document.getElementById('big-map-view-modal').style.display = 'none';
    document.getElementById('view-toggle-container').style.display = 'flex';
    document.getElementById('third-person-controls').style.display = viewMode === '3P' ? 'flex' : 'none';
    document.body.appendChild(minimapContainer);
    if (minimapControls) {
        document.body.appendChild(minimapControls);
        minimapControls.style.display = 'flex';
    }
    minimapContainer.classList.remove('big-map');
    minimapContainer.classList.add('small-map');
    gameState = 'AT_INTERSECTION';
    checkForTurns();
    showIngameHint('hint_driving_start');
    syncMobileDriveControls();
}

function triggerGentleHaptic() {
    if (navigator.vibrate) navigator.vibrate(18);
}

function saveAudioSettings() {
    try {
        localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, audioSettings.enabled ? 'on' : 'off');
        localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(audioSettings.volume));
    } catch (e) {
        // Ignore storage failures; the current session still uses the selected values.
    }
}

function updateSoundSettingsUI() {
    const soundToggle = document.getElementById('sound-toggle');
    const volumeSlider = document.getElementById('sound-volume-slider');
    const volumeValue = document.getElementById('sound-volume-value');
    if (soundToggle) soundToggle.value = audioSettings.enabled ? 'on' : 'off';
    if (volumeSlider) volumeSlider.value = String(audioSettings.volume);
    if (volumeValue) volumeValue.textContent = `${Math.round(audioSettings.volume * 100)}%`;
}

function openSettingsPanel() {
    updateSoundSettingsUI();
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) settingsPanel.style.display = 'flex';
}

function closeSettingsPanel() {
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) settingsPanel.style.display = 'none';
}

function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) {
        audioContext = new AudioContextClass();
        audioMasterGain = audioContext.createGain();
        audioMasterGain.gain.value = audioSettings.enabled ? audioSettings.volume * AUDIO_MASTER_GAIN_MULTIPLIER : 0;
        audioMasterGain.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
    return audioContext;
}

function playSilentAudioUnlockPulse(ctx) {
    if (!ctx || !audioMasterGain) return;
    try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        source.connect(gain);
        gain.connect(audioMasterGain);
        source.start(ctx.currentTime);
        source.stop(ctx.currentTime + 0.01);
    } catch (e) {
        // Some mobile browsers are picky while the context is still suspended.
    }
}

function unlockAudioForUserGesture() {
    if (!audioSettings.enabled || audioSettings.volume <= 0) return null;
    const ctx = ensureAudioContext();
    if (!ctx) return null;

    playSilentAudioUnlockPulse(ctx);
    if (ctx.state === 'running') {
        updateAudioMasterGain();
        return ctx;
    }

    if (!audioUnlockPromise) {
        audioUnlockPromise = ctx.resume()
            .then(() => {
                playSilentAudioUnlockPulse(ctx);
                updateAudioMasterGain();
                return ctx;
            })
            .catch(() => null)
            .finally(() => {
                audioUnlockPromise = null;
            });
    }
    return ctx;
}

function updateAudioMasterGain() {
    if (!audioMasterGain || !audioContext) return;
    const now = audioContext.currentTime;
    audioMasterGain.gain.cancelScheduledValues(now);
    audioMasterGain.gain.setTargetAtTime(audioSettings.enabled ? audioSettings.volume * AUDIO_MASTER_GAIN_MULTIPLIER : 0, now, 0.025);
}

function getAudioNoiseBuffer(ctx) {
    if (audioNoiseBuffer && audioNoiseBuffer.sampleRate === ctx.sampleRate) return audioNoiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.45);
    audioNoiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = audioNoiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    return audioNoiseBuffer;
}

function createSoundGain(ctx, startTime, duration, peak = 0.5, attack = 0.012, release = 0.12) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(attack + 0.02, duration - release));
    gain.gain.setValueAtTime(0.0001, startTime + duration);
    gain.connect(audioMasterGain);
    return gain;
}

function playTone({ frequency, endFrequency, duration, type = 'sine', peak = 0.35, startOffset = 0, pan = 0 }) {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== 'running' || !audioMasterGain || !audioSettings.enabled || audioSettings.volume <= 0) return;
    const start = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = createSoundGain(ctx, start, duration, peak);
    let destination = gain;
    if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, start);
        panner.connect(gain);
        destination = panner;
    }
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    osc.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
}

function playNoiseBurst({ duration, peak = 0.25, startOffset = 0, filterFrequency = 900, pan = 0 }) {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== 'running' || !audioMasterGain || !audioSettings.enabled || audioSettings.volume <= 0) return;
    const start = ctx.currentTime + startOffset;
    const source = ctx.createBufferSource();
    source.buffer = getAudioNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrequency, start);
    const gain = createSoundGain(ctx, start, duration, peak, 0.006, duration * 0.5);
    let destination = filter;
    if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, start);
        panner.connect(filter);
        destination = panner;
    }
    source.connect(destination);
    filter.connect(gain);
    source.start(start);
    source.stop(start + duration);
}

function playDriveSound(kind) {
    if (!audioSettings.enabled || audioSettings.volume <= 0) return;
    const ctx = unlockAudioForUserGesture();
    if (!ctx) return;
    if (ctx.state !== 'running') {
        audioUnlockPromise?.then((unlockedCtx) => {
            if (unlockedCtx?.state === 'running') playDriveSound(kind);
        });
        return;
    }
    switch (kind) {
        case 'forward':
            playTone({ frequency: 196, endFrequency: 294, duration: 0.20, type: 'triangle', peak: 0.12 });
            playTone({ frequency: 523.25, endFrequency: 783.99, duration: 0.16, type: 'sine', peak: 0.085, startOffset: 0.018 });
            playTone({ frequency: 1046.5, endFrequency: 1174.66, duration: 0.08, type: 'triangle', peak: 0.035, startOffset: 0.11 });
            playNoiseBurst({ duration: 0.09, peak: 0.025, filterFrequency: 2600, startOffset: 0.02 });
            break;
        case 'back':
            playTone({ frequency: 260, endFrequency: 210, duration: 0.12, type: 'square', peak: 0.10 });
            playTone({ frequency: 260, endFrequency: 210, duration: 0.12, type: 'square', peak: 0.10, startOffset: 0.17 });
            playTone({ frequency: 92, endFrequency: 78, duration: 0.32, type: 'sine', peak: 0.12 });
            break;
        case 'left':
            playTone({ frequency: 430, endFrequency: 350, duration: 0.17, type: 'triangle', peak: 0.14, pan: -0.65 });
            playTone({ frequency: 220, endFrequency: 185, duration: 0.22, type: 'sine', peak: 0.08, pan: -0.45 });
            break;
        case 'right':
            playTone({ frequency: 350, endFrequency: 430, duration: 0.17, type: 'triangle', peak: 0.14, pan: 0.65 });
            playTone({ frequency: 185, endFrequency: 220, duration: 0.22, type: 'sine', peak: 0.08, pan: 0.45 });
            break;
        case 'wall':
            playTone({ frequency: 92, endFrequency: 42, duration: 0.28, type: 'sine', peak: 0.36 });
            playNoiseBurst({ duration: 0.20, peak: 0.26, filterFrequency: 520 });
            playTone({ frequency: 170, endFrequency: 118, duration: 0.11, type: 'square', peak: 0.08, startOffset: 0.03 });
            break;
        case 'waypoint':
            playTone({ frequency: 659.25, endFrequency: 880, duration: 0.13, type: 'sine', peak: 0.16 });
            playTone({ frequency: 1318.51, endFrequency: 1760, duration: 0.12, type: 'triangle', peak: 0.075, startOffset: 0.05 });
            playNoiseBurst({ duration: 0.08, peak: 0.035, filterFrequency: 3200, startOffset: 0.02 });
            break;
        case 'victory':
            playTone({ frequency: 523.25, duration: 0.16, type: 'triangle', peak: 0.16 });
            playTone({ frequency: 659.25, duration: 0.16, type: 'triangle', peak: 0.15, startOffset: 0.14 });
            playTone({ frequency: 783.99, duration: 0.18, type: 'triangle', peak: 0.16, startOffset: 0.28 });
            playTone({ frequency: 1046.5, duration: 0.34, type: 'sine', peak: 0.18, startOffset: 0.44 });
            playTone({ frequency: 1318.51, duration: 0.24, type: 'sine', peak: 0.10, startOffset: 0.58 });
            playNoiseBurst({ duration: 0.18, peak: 0.045, filterFrequency: 3600, startOffset: 0.42 });
            break;
    }
}

function playWaypointFoundSound(waypointIndex = currentLevelState.nextWaypoint) {
    const token = `${currentLevelIndex}:${selectedCustomMapIndex}:numbered:${waypointIndex}`;
    if (lastWaypointSoundToken === token) return;
    lastWaypointSoundToken = token;
    playDriveSound('waypoint');
}

function playFreeWaypointFoundSound(waypointIndex) {
    const token = `${currentLevelIndex}:${selectedCustomMapIndex}:free:${waypointIndex}`;
    if (lastWaypointSoundToken === token) return;
    lastWaypointSoundToken = token;
    playDriveSound('waypoint');
}

function handleDriveAction(action) {
    if (action === 'pause') {
        togglePauseMenu();
        return;
    }

    if (gameState !== 'AT_INTERSECTION' || keyDebounce) return;

    keyDebounce = true;
    setTimeout(() => { keyDebounce = false; }, 140);
    triggerGentleHaptic();

    if (action === 'right') {
        targetRotation.y -= Math.PI / 2;
        gameState = 'TURNING';
        playDriveSound('right');
    } else if (action === 'left') {
        targetRotation.y += Math.PI / 2;
        gameState = 'TURNING';
        playDriveSound('left');
    } else if (action === 'forward') {
        setupMove(1);
    } else if (action === 'back') {
        setupMove(-1);
    }

    syncMobileDriveControls();
}

function syncMobileDriveControls() {
    const controls = document.getElementById('mobile-drive-controls');
    if (!controls) return;

    const visible = ['AT_INTERSECTION', 'DRIVING', 'TURNING'].includes(gameState);
    const syncKey = `${visible}:${gameState}`;
    if (controls.dataset.syncKey === syncKey) return;
    controls.dataset.syncKey = syncKey;

    controls.classList.toggle('visible', visible);
    document.body.classList.toggle('driving-compact-ui', visible);
    controls.querySelectorAll('[data-action]').forEach(button => {
        const action = button.dataset.action;
        button.disabled = visible && action !== 'pause' && gameState !== 'AT_INTERSECTION';
    });
}

function isDrivingGestureEnabled() {
    return ['AT_INTERSECTION', 'DRIVING', 'TURNING'].includes(gameState);
}

function isGestureBlockedTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest([
        'button',
        'input',
        'select',
        'textarea',
        'label',
        'a',
        '.modal-overlay',
        '#minimap-container',
        '#show-minimap-btn',
        '#settings-button',
        '#view-toggle-container',
        '#third-person-controls',
        '#mobile-drive-controls',
        '#dev-panel'
    ].join(',')));
}

function resetGestureState() {
    gestureState.pointerId = null;
    gestureState.startX = 0;
    gestureState.startY = 0;
    gestureState.active = false;
}

function setupAudioUnlockListeners() {
    const unlock = () => unlockAudioForUserGesture();
    const pointerOptions = { capture: true, passive: true };
    document.addEventListener('pointerdown', unlock, pointerOptions);
    document.addEventListener('touchstart', unlock, pointerOptions);
    document.addEventListener('click', unlock, pointerOptions);
    document.addEventListener('keydown', unlock, true);
}

function setupGestureControls() {
    document.addEventListener('pointerdown', (event) => {
        if (!isDrivingGestureEnabled() || gestureState.pointerId !== null || isGestureBlockedTarget(event.target)) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        gestureState.pointerId = event.pointerId;
        gestureState.startX = event.clientX;
        gestureState.startY = event.clientY;
        gestureState.active = true;
        event.preventDefault();
    }, { passive: false });

    document.addEventListener('pointermove', (event) => {
        if (!gestureState.active || event.pointerId !== gestureState.pointerId) return;
        event.preventDefault();
    }, { passive: false });

    const finishGesture = (event) => {
        if (!gestureState.active || event.pointerId !== gestureState.pointerId) return;
        event.preventDefault();

        const dx = event.clientX - gestureState.startX;
        const dy = event.clientY - gestureState.startY;
        resetGestureState();

        if (Math.hypot(dx, dy) < GESTURE_MIN_DISTANCE) return;

        const action = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'back' : 'forward');
        handleDriveAction(action);
    };

    document.addEventListener('pointerup', finishGesture, { passive: false });
    document.addEventListener('pointercancel', resetGestureState);
}

function setupUI() {
    setupAudioUnlockListeners();
    document.getElementById('settings-button')?.addEventListener('click', openSettingsPanel);
    document.getElementById('close-settings-btn')?.addEventListener('click', closeSettingsPanel);

    document.getElementById('initial-language-select').addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        updateUIText();
    });

    document.getElementById('start-game-btn').addEventListener('click', () => {
        currentLanguage = document.getElementById('initial-language-select').value;
        document.getElementById('language-select').value = currentLanguage;
        const nickname = document.getElementById('nickname-input').value.trim();
        playerInfo.nickname = nickname || (currentLanguage === 'zh' ? '司机' : 'Driver');
        playerInfo.gender = document.getElementById('gender-select').value;
        document.getElementById('startup-modal').style.display = 'none';
        document.getElementById('main-menu-modal').style.display = 'flex';
        updateUIText();
        gameState = 'MAIN_MENU';
    });

    // View Toggle Setup (v10.0)
    document.getElementById('view-1p-btn').addEventListener('click', () => setViewMode('1P'));
    document.getElementById('view-3p-btn').addEventListener('click', () => setViewMode('3P'));

    // NEW: Setup 3P control listeners
    const zoomSlider = document.getElementById('zoom-slider');
    const angleSlider = document.getElementById('angle-slider');
    const carSizeSlider = document.getElementById('car-size-slider'); // NEW

    zoomSlider.addEventListener('input', (e) => {
        thirdPersonControls.zoom = parseFloat(e.target.value);
        updateThirdPersonCamera();
    });
    angleSlider.addEventListener('input', (e) => {
        thirdPersonControls.angle = parseFloat(e.target.value);
        updateThirdPersonCamera();
    });
    // NEW: Car size control listener
    carSizeSlider.addEventListener('input', (e) => {
        thirdPersonControls.carScale = parseFloat(e.target.value);
        if (playerCarModel) {
            playerCarModel.scale.set(thirdPersonControls.carScale, thirdPersonControls.carScale, thirdPersonControls.carScale);
        }
    });

    const setupMenuInfo = (buttonId, infoBoxId, descriptionKey) => {
        const button = document.getElementById(buttonId);
        const infoBox = document.getElementById(infoBoxId);
        if (button && infoBox) {
            const showInfo = () => {
                infoBox.innerHTML = `<p>${translations[currentLanguage][descriptionKey]}</p>`;
            };
            const hideInfo = () => { infoBox.innerHTML = ''; };
            button.addEventListener('mouseover', showInfo);
            button.addEventListener('focus', showInfo);
            button.addEventListener('mouseout', hideInfo);
            button.addEventListener('blur', hideInfo);
        }
    };
    setupMenuInfo('free-mode-btn', 'main-menu-info-box', 'desc_free');
    setupMenuInfo('custom-mode-btn', 'main-menu-info-box', 'desc_custom');
    setupMenuInfo('editor-mode-btn', 'main-menu-info-box', 'desc_editor');

    document.getElementById('free-mode-btn').addEventListener('click', showFreeModeLevelSelect);
    document.getElementById('manual-btn').addEventListener('click', () => {
        document.getElementById('main-menu-info-box').innerHTML = '';
        document.getElementById('manual-modal').style.display = 'flex';
    });
    document.getElementById('close-manual-btn').addEventListener('click', () => {
        document.getElementById('manual-modal').style.display = 'none';
    });
    
    document.getElementById('editor-mode-btn').addEventListener('click', () => showEditor());
    document.getElementById('custom-mode-btn').addEventListener('click', () => {
        if (customLevels.some(level => level !== null)) {
            showCustomMapsModal();
        }
    });
    
    document.getElementById('main-menu-btn').addEventListener('click', () => {
        document.getElementById('level-complete-modal').style.display = 'none';
        showMainMenu();
    });

    const minimapContainer = document.getElementById('minimap-container');
    const minimapControls = document.getElementById('minimap-controls');
    const showMinimapBtn = document.getElementById('show-minimap-btn');

    // Minimap orientation toggle lives outside the canvas so it never covers the map.
    const minimapOrientationBtn = document.getElementById('minimap-orientation-btn');
    if (minimapOrientationBtn) {
        minimapOrientationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimapOrientationMode();
        });
    }
    updateMinimapOrientationButton();

    minimapContainer.addEventListener('click', () => {
        // Big map click starts the driving session
        if (minimapContainer.classList.contains('big-map') && gameState === 'BIG_MAP') {
            startDrivingFromBigMap();
        } 
        // Small map click hides it and shows the toggle button
        else if (minimapContainer.classList.contains('small-map')) {
            minimapContainer.style.display = 'none';
            if (minimapControls) minimapControls.style.display = 'none';
            showMinimapBtn.style.display = 'flex';
        }
    });

    // Toggle button click shows the small map again
    showMinimapBtn.addEventListener('click', () => {
        showMinimapBtn.style.display = 'none';
        minimapContainer.style.display = 'block';
        if (minimapControls) minimapControls.style.display = 'flex';
        updateMinimapPlayer();
    });

    document.getElementById('start-driving-btn')?.addEventListener('click', startDrivingFromBigMap);
    document.querySelectorAll('#mobile-drive-controls [data-action]').forEach(button => {
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            handleDriveAction(button.dataset.action);
        });
    });
    setupGestureControls();


    
// --- NEW: Arrow hints toggles (per view) ---
const arrow1pToggle = document.getElementById('arrow-1p-toggle');
const arrow3pToggle = document.getElementById('arrow-3p-toggle');
if (arrow1pToggle) arrow1pToggle.value = arrowHintsEnabled['1P'] ? 'on' : 'off';
if (arrow3pToggle) arrow3pToggle.value = arrowHintsEnabled['3P'] ? 'on' : 'off';
arrow1pToggle?.addEventListener('change', (e) => {
    arrowHintsEnabled['1P'] = (e.target.value === 'on');
    if (gameState === 'AT_INTERSECTION') checkForTurns();
});
arrow3pToggle?.addEventListener('change', (e) => {
    arrowHintsEnabled['3P'] = (e.target.value === 'on');
    if (gameState === 'AT_INTERSECTION') checkForTurns();
});

const soundToggle = document.getElementById('sound-toggle');
const soundVolumeSlider = document.getElementById('sound-volume-slider');
updateSoundSettingsUI();
soundToggle?.addEventListener('change', (e) => {
    audioSettings.enabled = e.target.value === 'on';
    if (audioSettings.enabled) unlockAudioForUserGesture();
    updateAudioMasterGain();
    saveAudioSettings();
    updateSoundSettingsUI();
});
soundVolumeSlider?.addEventListener('input', (e) => {
    audioSettings.volume = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
    if (audioSettings.enabled && audioSettings.volume > 0) unlockAudioForUserGesture();
    updateAudioMasterGain();
    saveAudioSettings();
    updateSoundSettingsUI();
});

    document.getElementById('font-size-slider').addEventListener('input', (e) => {
        document.body.style.fontSize = `calc(${getComputedStyle(document.body).getPropertyValue('--font-size-normal')} * ${e.target.value})`;
    });
    document.getElementById('minimap-size-slider').addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--minimap-scale', e.target.value);
    });
    document.getElementById('language-select').addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        document.getElementById('initial-language-select').value = currentLanguage;
        updateUIText();
    });
    
    document.getElementById('resume-game-btn').addEventListener('click', togglePauseMenu);
    document.getElementById('pause-to-main-menu-btn').addEventListener('click', () => {
        togglePauseMenu();
        showMainMenu();
    });
    document.getElementById('level-select-btn').addEventListener('click', showLevelSelectModal);
     document.getElementById('free-mode-level-select-back-btn').addEventListener('click', () => {
        document.getElementById('free-mode-level-select-modal').style.display = 'none';
        showMainMenu();
    });
    document.getElementById('reset-game-btn').addEventListener('click', () => {
        document.getElementById('confirm-reset-modal').style.display = 'flex';
    });
    document.getElementById('confirm-reset-btn').addEventListener('click', () => {
        document.getElementById('confirm-reset-modal').style.display = 'none';
        resetGame();
    });
    document.getElementById('cancel-reset-btn').addEventListener('click', () => {
        document.getElementById('confirm-reset-modal').style.display = 'none';
    });
    document.getElementById('close-level-select-btn').addEventListener('click', () => {
        document.getElementById('level-select-modal').style.display = 'none';
        document.getElementById('pause-menu-modal').style.display = 'flex';
    });

    // Texture settings listeners
    const textureLoader = new THREE.TextureLoader();
    const handleTextureUpload = (file, material, urlStorage, previewElement) => {
        if (urlStorage) URL.revokeObjectURL(urlStorage);

        const newURL = URL.createObjectURL(file);
        previewElement.style.backgroundImage = `url(${newURL})`;

        textureLoader.load(
            newURL,
            (texture) => {
                configureRepeatingTexture(texture);
                material.map = texture;
                material.color.set(0xffffff); // Set to white to show full texture color
                material.needsUpdate = true;
                updateTextureScales();
            },
            undefined,
            (error) => console.warn(`Texture failed to load: ${newURL}`, error)
        );
        
        return newURL;
    };

    document.getElementById('floor-texture-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            textureURLs.floor = handleTextureUpload(e.target.files[0], floorMaterial, textureURLs.floor, document.getElementById('floor-texture-preview'));
            updateTextureScales();
        }
    });
    document.getElementById('wall-n-texture-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            textureURLs.wallN = handleTextureUpload(e.target.files[0], wallMaterialN, textureURLs.wallN, document.getElementById('wall-n-texture-preview'));
            updateTextureScales();
        }
    });
     document.getElementById('wall-s-texture-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            textureURLs.wallS = handleTextureUpload(e.target.files[0], wallMaterialS, textureURLs.wallS, document.getElementById('wall-s-texture-preview'));
            updateTextureScales();
        }
    });
    document.getElementById('wall-e-texture-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            textureURLs.wallE = handleTextureUpload(e.target.files[0], wallMaterialE, textureURLs.wallE, document.getElementById('wall-e-texture-preview'));
            updateTextureScales();
        }
    });
     document.getElementById('wall-w-texture-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            textureURLs.wallW = handleTextureUpload(e.target.files[0], wallMaterialW, textureURLs.wallW, document.getElementById('wall-w-texture-preview'));
            updateTextureScales();
        }
    });

    document.getElementById('floor-scale-slider').addEventListener('input', (e) => {
        textureScales.floor = parseInt(e.target.value);
        updateTextureScales();
    });
    document.getElementById('wall-scale-slider').addEventListener('input', (e) => {
        textureScales.wall = parseInt(e.target.value);
        updateTextureScales();
    });
    
    document.getElementById('reset-textures-btn').addEventListener('click', () => {
        Object.keys(textureURLs).forEach(key => {
            if (textureURLs[key]) URL.revokeObjectURL(textureURLs[key]);
            textureURLs[key] = null;
        });
        
        document.querySelectorAll('.texture-preview').forEach(el => el.style.backgroundImage = 'none');
        document.querySelectorAll('.texture-input-row input[type="file"]').forEach(el => el.value = '');
        
        document.getElementById('floor-scale-slider').value = 1;
        document.getElementById('wall-scale-slider').value = 1;
        textureScales.floor = 1;
        textureScales.wall = 1;

        createMaterials(); // Recreate materials with default colors
        
        // Reload maze to apply new materials
        if (gameState !== 'MAIN_MENU' && gameState !== 'STARTUP_MODAL') {
            const currentLevelData = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
            loadLevel(currentLevelData);
        }
    });
}

function updateTextureScales() {
    if (floorMaterial.map) {
        const baseRepeat = floorMaterial.userData?.baseRepeat || { x: 1, y: 1 };
        floorMaterial.map.repeat.set(
            baseRepeat.x * textureScales.floor,
            baseRepeat.y * textureScales.floor
        );
    }
    [wallMaterialN, wallMaterialS, wallMaterialE, wallMaterialW].forEach(mat => {
         if (mat.map) {
            mat.map.repeat.set(textureScales.wall, textureScales.wall);
         }
    });
}


function setupDevPanel() {
    const select = document.getElementById('level-select');
    select.innerHTML = '';
    levels.forEach((_, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${translations[currentLanguage].level} ${index + 1}`;
        select.appendChild(option);
    });
    select.addEventListener('change', (e) => {
        loadLevel(parseInt(e.target.value));
    });
    select.value = String(currentLevelIndex);
}

function showMainMenu() {
    gameState = 'MAIN_MENU';
    if (levelCompleteTimeout) {
        clearTimeout(levelCompleteTimeout);
        levelCompleteTimeout = null;
    }
    document.getElementById('main-menu-modal').style.display = 'flex';
    document.getElementById('custom-mode-btn').disabled = !customLevels.some(level => level !== null);
    document.getElementById('main-menu-info-box').innerHTML = '';
    
    [mazeGroup, landmarksGroup, sceneryGroup, waypointsGroup, highlightFloorsGroup].forEach(group => {
        while(group.children.length > 0){ group.remove(group.children[0]); }
    });
    activeLampLights = [];
    activeTechWallEffects = [];
    clearGoalHeartBursts();
    clearLevelCelebrations();
    minimapBgDirty = true;
    lastMinimapRenderKey = '';
    if(goalMarker) {
        scene.remove(goalMarker);
        goalMarker = null;
    }

    // Hide gameplay UI elements (v10.0)
    document.getElementById('view-toggle-container').style.display = 'none';
    document.getElementById('third-person-controls').style.display = 'none'; // NEW: Hide 3P controls
    document.getElementById('minimap-container').style.display = 'none';
    const minimapControls = document.getElementById('minimap-controls');
    if (minimapControls) minimapControls.style.display = 'none';
    document.getElementById('show-minimap-btn').style.display = 'none';
    document.getElementById('big-map-prompt').style.display = 'none';
    document.getElementById('waypoint-hud').style.display = 'none';
    document.getElementById('ingame-hint').style.display = 'none';
    clearTimeout(hintTimeout);
}

// ====================================================================
// 游戏核心逻辑 (Core Game Logic)
// ====================================================================

function loadLevel(levelData) {
    if (levelCompleteTimeout) {
        clearTimeout(levelCompleteTimeout);
        levelCompleteTimeout = null;
    }
    let level;
    if (typeof levelData === 'number') {
        if (levelData >= levels.length) {
            console.error(`Level index ${levelData} out of bounds!`);
            showMainMenu();
            return;
        }
        currentLevelIndex = levelData;
        level = levels[levelData];
    } else {
        level = levelData;
        currentLevelIndex = -1;
    }
    
    clearTimeout(hintTimeout);
    document.getElementById('ingame-hint').style.display = 'none';
    hideChoicePrompt();
    previousGridPos = null;

    // Reset groups
    [mazeGroup, landmarksGroup, sceneryGroup, waypointsGroup, highlightFloorsGroup].forEach(group => {
        while(group.children.length > 0){ group.remove(group.children[0]); }
    });
    activeLampLights = [];
    activeTechWallEffects = [];
    clearGoalHeartBursts();
    clearLevelCelebrations();
    minimapBgDirty = true;
    lastMinimapRenderKey = '';
    if(goalMarker) {
        scene.remove(goalMarker);
        goalMarker = null;
    }

    // Reset level state
    currentLevelState = {
        playerChoices: 0,
        isWaypointMode: level.isWaypointMode || false,
        totalWaypoints: level.waypoints ? level.waypoints.length : 0,
        nextWaypoint: 1,
        touchedFreeWaypoints: new Set(),
        touchedHighlightFloors: new Set()
    };
    lastWaypointSoundToken = null;

    createMazeMesh(level.grid, level.goal);
    placeRoadsideObjects(level.grid);
    createGoalMarker(level.goal);
    if (level.waypoints && level.waypoints.length > 0) {
        level.waypoints.forEach((wp, index) => {
            const waypointMesh = createWaypointMesh(index + 1, wp.color);
            waypointMesh.userData.kind = 'numberedWaypoint';
            waypointMesh.userData.waypointIndex = index;
            const wpPos = gridToWorld(wp.x, wp.z, level.grid);
            waypointMesh.position.set(wpPos.x, 0, wpPos.z);
            waypointsGroup.add(waypointMesh);
        });
    }
    if (currentLevelState.isWaypointMode && level.freeWaypoints && level.freeWaypoints.length > 0) {
        level.freeWaypoints.forEach((wp, index) => {
            const freeWaypointMesh = createFreeWaypointMarker(index);
            const wpPos = gridToWorld(wp.x, wp.z, level.grid);
            freeWaypointMesh.position.set(wpPos.x, 0, wpPos.z);
            waypointsGroup.add(freeWaypointMesh);
        });
    }
    if (level.highlightFloors && level.highlightFloors.length > 0) {
        level.highlightFloors.forEach(hf => {
            const hfPos = gridToWorld(hf.x, hf.z, level.grid);
            const hfMesh = createHighlightFloorMesh(hfPos);
            highlightFloorsGroup.add(hfMesh);
        });
    }
    
    const startPos = gridToWorld(level.start.x, level.start.z, level.grid);
    player.position.set(startPos.x, 0, startPos.z);
    player.rotation.y = dirToAngle(level.start.dir);
    targetRotation.y = player.rotation.y;

    if (currentLevelIndex >= 0 && document.getElementById('dev-panel').style.display === 'block') {
        document.getElementById('level-select').value = String(currentLevelIndex);
    }
    
    updateMinimapOrientationButton();
    updateHUD();
    
    updateMinimapPlayer();

    // Show view toggle (v10.0)
    document.getElementById('view-toggle-container').style.display = 'flex';
    
    gameState = 'BIG_MAP';
    
    const bigMapViewModal = document.getElementById('big-map-view-modal');
    const bigMapWrapper = document.getElementById('big-map-container-wrapper');
    const minimapContainer = document.getElementById('minimap-container');
    const minimapControls = document.getElementById('minimap-controls');
    bigMapWrapper.appendChild(minimapContainer);
    if (minimapControls) {
        bigMapWrapper.appendChild(minimapControls);
        minimapControls.style.display = 'flex';
    }
    minimapContainer.style.display = 'block';
    minimapContainer.classList.remove('small-map');
    minimapContainer.classList.add('big-map');
    
    updateUIText();
    
    bigMapViewModal.style.display = 'flex';
    document.getElementById('big-map-prompt').style.display = 'none'; 
}

function gridToWorld(x, z, grid) {
    const gridWidth = grid[0].length;
    const gridHeight = grid.length;
    return new THREE.Vector3(
        (x - gridWidth / 2 + 0.5) * TILE_SIZE,
        0,
        (z - gridHeight / 2 + 0.5) * TILE_SIZE
    );
}

function worldToGrid(position) {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    if (!level || !level.grid) return {x:0, z:0};
    const gridWidth = level.grid[0].length;
    const gridHeight = level.grid.length;
    return {
        x: Math.round(position.x / TILE_SIZE + gridWidth / 2 - 0.5),
        z: Math.round(position.z / TILE_SIZE + gridHeight / 2 - 0.5)
    };
}

function dirToAngle(dir) {
    switch (dir) {
        case 'N': return Math.PI; case 'E': return -Math.PI / 2;
        case 'S': return 0;       case 'W': return Math.PI / 2;
    }
    return 0;
}

function afterMoveChecks() {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    const gridPos = worldToGrid(player.position);

    // Waypoint check (v10.0 Fixes applied)
    if (currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints) {
        const nextWpData = level.waypoints[currentLevelState.nextWaypoint - 1];
        if (gridPos.x === nextWpData.x && gridPos.z === nextWpData.z) {
            const collectedWaypointMesh = waypointsGroup.children.find((child) =>
                child.userData.kind === 'numberedWaypoint' &&
                child.userData.waypointIndex === currentLevelState.nextWaypoint - 1
            );
            if (collectedWaypointMesh && !collectedWaypointMesh.userData.collected) {
                collectedWaypointMesh.userData.collected = true;

                // Trigger enhanced firework effect
                createFireworkEffect(collectedWaypointMesh.position, nextWpData.color);
                playWaypointFoundSound(currentLevelState.nextWaypoint);
                
                // Change appearance instead of hiding
                const gem = collectedWaypointMesh.getObjectByName('waypoint_gem');
                const textWrapper = collectedWaypointMesh.children.find(c => c.onBeforeRender);
                const light = collectedWaypointMesh.getObjectByProperty('isPointLight', true);

                if (gem) {
                    gem.material.emissiveIntensity = 0;
                    gem.material.opacity = 0.25;
                }
                if (textWrapper) {
                    textWrapper.visible = false;
                }
                if(light) {
                    light.intensity = 0;
                }
                
                currentLevelState.nextWaypoint++;
                updateMinimapOrientationButton();
                updateHUD();
                // Explicitly update the minimap to guarantee the star appears.
                minimapBgDirty = true;
                lastMinimapRenderKey = '';
                updateMinimapPlayer(); 
            }
        }
    }

    // Free waypoint check: touch once, no required order, no effect on the numbered route.
    if (currentLevelState.isWaypointMode && Array.isArray(level.freeWaypoints)) {
        level.freeWaypoints.forEach((wp, index) => {
            const waypointKey = `${index}:${wp.x},${wp.z}`;
            if (currentLevelState.touchedFreeWaypoints.has(waypointKey)) return;
            if (gridPos.x !== wp.x || gridPos.z !== wp.z) return;

            currentLevelState.touchedFreeWaypoints.add(waypointKey);
            const freeWaypointMesh = waypointsGroup.children.find((child) =>
                child.userData.kind === 'freeWaypoint' &&
                child.userData.waypointIndex === index
            );
            if (freeWaypointMesh) {
                freeWaypointMesh.userData.collected = true;
                freeWaypointMesh.visible = false;
                createFireworkEffect(freeWaypointMesh.position, '#00c2ff');
            } else {
                createFireworkEffect(player.position, '#00c2ff');
            }
            playFreeWaypointFoundSound(index + 1);
            minimapBgDirty = true;
            lastMinimapRenderKey = '';
            updateMinimapPlayer();
        });
    }
    
    // Highlight Floor check
    const floorKey = `${gridPos.x},${gridPos.z}`;
    if (!currentLevelState.touchedHighlightFloors.has(floorKey)) {
        if (level.highlightFloors && level.highlightFloors.some(f => f.x === gridPos.x && f.z === gridPos.z)) {
            const floorIndex = level.highlightFloors.findIndex(f => f.x === gridPos.x && f.z === gridPos.z);
            const floorMesh = highlightFloorsGroup.children[floorIndex];
            if (floorMesh) {
                floorMesh.material.color.set(0x007bff); // Blue
            }
            currentLevelState.touchedHighlightFloors.add(floorKey);
            minimapBgDirty = true;
            lastMinimapRenderKey = '';
        }
    }

    // Goal check
    if (gridPos.x === level.goal.x && gridPos.z === level.goal.z) {
         if (currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints) {
            showTemporaryMessage(translations[currentLanguage].prompt_goal_locked);
            checkForTurns({ showPrompt: false });
        } else {
            gameState = 'LEVEL_COMPLETE';
            playDriveSound('victory');
            const celebrationPosition = goalMarker ? goalMarker.position : player.position;
            const isTechGoal = Boolean(goalMarker?.userData?.techGoal);
            createLevelCelebrationEffect(celebrationPosition, isTechGoal);
            createGoalHeartBurst(celebrationPosition, isTechGoal);
            levelCompleteTimeout = setTimeout(() => {
                levelCompleteTimeout = null;
                if (gameState === 'LEVEL_COMPLETE') showLevelComplete();
            }, 650);
        }
        return;
    }
    
    checkForTurns();
}

function checkForTurns({ showPrompt = true } = {}) {
    const availableTurns = createDirectionalHelpers();
    gameState = 'AT_INTERSECTION';
    if (showPrompt) updateChoicePrompt(availableTurns);
}

function cameraShake() {
    // Only apply shake in 1P view for better immersion (v10.0)
    if (viewMode !== '1P') return;

    const shakeIntensity = 0.05;
    let shakeDuration = 200;
    const startTime = Date.now();
    // Store original position relative to the player for 1P view
    // Since setViewMode sets the base position, we use that as the reference.
    const originalPos = new THREE.Vector3(0, WALL_HEIGHT * 0.4, 0);

    function shake() {
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > shakeDuration) {
            // Ensure camera returns exactly to the 1P position
            camera.position.copy(originalPos);
            return;
        }
        const progress = elapsedTime / shakeDuration;
        const shakeAmount = shakeIntensity * (1 - progress);
        camera.position.set(
            originalPos.x + (Math.random()-0.5)*shakeAmount, 
            originalPos.y + (Math.random()-0.5)*shakeAmount, 
            originalPos.z
        );
        requestAnimationFrame(shake);
    }
    shake();
}

function hideChoicePrompt() {
    const prompt = document.getElementById('choice-prompt');
    if (!prompt) return;
    clearTimeout(promptTimeout);
    prompt.classList.remove('visible');
    promptTimeout = setTimeout(() => {
        if (!prompt.classList.contains('visible')) prompt.style.display = 'none';
    }, 220);
}

function showTemporaryMessage(message, duration = 2200) {
    const prompt = document.getElementById('choice-prompt');
    if (!prompt) return;
    prompt.textContent = message;
    prompt.style.display = 'block';
    requestAnimationFrame(() => prompt.classList.add('visible'));
    clearTimeout(promptTimeout);
    promptTimeout = setTimeout(hideChoicePrompt, duration);
}

function updateChoicePrompt(availableTurns) {
    const prompt = document.getElementById('choice-prompt');
    const helperToggle = document.getElementById('helper-text-toggle').value;
    const lang = translations[currentLanguage];

    if (gameState !== 'AT_INTERSECTION' || helperToggle === 'off') {
        hideChoicePrompt();
        return;
    }

    const options = [];
    if (availableTurns.forward) options.push(lang.forward);
    if (availableTurns.left) options.push(lang.turnLeft);
    if (availableTurns.right) options.push(lang.turnRight);

    let message;
    if (!availableTurns.forward && !availableTurns.left && !availableTurns.right) {
        message = lang.prompt_dead_end;
    } else if (options.length > 0) {
        message = lang.prompt_options(options);
    } else {
        message = lang.turnAround;
    }
    showTemporaryMessage(message, 2600);
}


function setupMove(dir = 1) {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    const gridPos = worldToGrid(player.position);
    const moveVector = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation).multiplyScalar(dir);
    const nextGridX = gridPos.x + Math.round(moveVector.x);
    const nextGridZ = gridPos.z + Math.round(moveVector.z);

    const isGoalNext = (nextGridX === level.goal.x && nextGridZ === level.goal.z);
    const isGoalLocked = currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints;
    const nextWaypointData = currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints
        ? level.waypoints[currentLevelState.nextWaypoint - 1]
        : null;
    const isWaypointNext = nextWaypointData && nextGridX === nextWaypointData.x && nextGridZ === nextWaypointData.z;

    if (isGoalNext && !isGoalLocked) {
showTemporaryMessage(translations[currentLanguage].prompt_near_goal, 2500);
    }

    if (nextGridZ < 0 || nextGridZ >= level.grid.length || nextGridX < 0 || nextGridX >= level.grid[0].length || level.grid[nextGridZ][nextGridX] === 0) {
cameraShake();
playDriveSound('wall');
showTemporaryMessage(translations[currentLanguage].prompt_wall);
    } else {
previousGridPos = gridPos;
currentLevelState.playerChoices++;
hideChoicePrompt();
while (landmarksGroup.children.length > 0) {
    landmarksGroup.remove(landmarksGroup.children[0]);
}
targetPosition.copy(gridToWorld(nextGridX, nextGridZ, level.grid));
gameState = 'DRIVING';
if (isWaypointNext) {
    playWaypointFoundSound(currentLevelState.nextWaypoint);
} else {
    playDriveSound(dir === 1 ? 'forward' : 'back');
}
    }
}


function showLevelComplete() {
    const modal = document.getElementById('level-complete-modal');
    const lang = translations[currentLanguage];
    
    document.getElementById('results-title').textContent = lang.levelComplete;
    modal.style.display = 'flex';
}

// ====================================================================
// 渲染和动画 (Rendering & Animation)
// ====================================================================

function animate() {
    requestAnimationFrame(animate);
    syncMobileDriveControls();
    if(gameState === 'PAUSED') return;
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    
    // Day/Night Cycle (Visuals update)
    const dayNightCycle = (Math.sin(elapsedTime * (0.1 / 3)) + 1) / 2;
    const skyDay = new THREE.Color(0xd7e6df);
    const skyNight = new THREE.Color(0x7aa6bd);
    const visualColor = skyNight.clone().lerp(skyDay, 0.58 + dayNightCycle * 0.42);

    if (scene.fog) scene.fog.color.copy(visualColor);
    // Only update background color if a texture isn't used
    if (!scene.background || !scene.background.isTexture) {
         scene.background = visualColor;
         renderer.setClearColor(visualColor, 1);
    }

    hemisphereLight.intensity = dayNightCycle * 0.65 + 1.25;
    dirLight.intensity = dayNightCycle * 0.95 + 1.25;

    const nightIntensity = Math.max(0, 1 - dayNightCycle * 3);
    activeLampLights.forEach(light => { light.intensity = nightIntensity * 5.5; });
    activeTechWallEffects.forEach(effect => {
        const pulse = (Math.sin(elapsedTime * 4.8 + effect.phase * 8) + 1) / 2;
        const floatOffset = Math.sin(elapsedTime * effect.floatSpeed + effect.phase) * effect.floatHeight;
        effect.gem.position.y = effect.gemBaseY + floatOffset;
        effect.gem.rotation.y += delta * effect.spinSpeed;
        effect.gem.rotation.x = effect.baseRotationX + Math.sin(elapsedTime * 2.2 + effect.phase) * 0.12;
        effect.aura.position.y = effect.auraBaseY + floatOffset * 0.45;
        effect.halo.position.y = effect.haloBaseY + floatOffset * 0.62;
        effect.auraMaterial.opacity = 0.18 + pulse * 0.26;
        effect.haloMaterial.opacity = 0.34 + pulse * 0.34;
        effect.gemMaterial.emissiveIntensity = 1.35 + pulse * 1.15;
        if (effect.light) {
            effect.light.position.y = effect.lightBaseY + floatOffset;
            effect.light.intensity = 0.7 + pulse * 1.35;
        }
    });

    // Object animations (Lucky Cat, Heart, Waypoints)
    if (goalMarker) {
        goalMarker.position.y = GOAL_MARKER_BASE_Y + Math.sin(elapsedTime) * 0.2;
        goalMarker.rotation.y += delta * 0.4;
        if (luckyCatArm) {
            const toRad = THREE.MathUtils.degToRad;
            luckyCatArm.rotation.x = toRad(LUCKY_CAT.WAVE_CENTER_DEG) + Math.sin(elapsedTime * LUCKY_CAT.WAVE_SPEED) * toRad(LUCKY_CAT.WAVE_AMPL_DEG);
            if (luckyCatWrist) luckyCatWrist.rotation.x = Math.sin(elapsedTime * LUCKY_CAT.WRIST_SPEED) * toRad(LUCKY_CAT.WRIST_AMPL_DEG);
        }
    }
    if (floatingHeart) {
        const t = elapsedTime * 1.5;
        floatingHeart.position.y = floatingHeart.userData.baseY + Math.sin(t) * 0.18;
        const s = 1.0 + Math.sin(t * 2.0) * 0.06;
        floatingHeart.scale.set(s, s, s);
        floatingHeart.rotation.y += delta * 0.6;
    }

    waypointsGroup.children.forEach(wp => {
        wp.rotation.y += delta * 0.5;
        const gem = wp.getObjectByName('waypoint_gem');
        if (gem) gem.rotation.y += delta * 1.5;
    });

    // Animate fireworks (Enhanced v10.0)
    const gravity = 9.8 * 0.5; // Reduced gravity for better visual effect
    for (let i = activeFireworks.length - 1; i >= 0; i--) {
        const firework = activeFireworks[i];
        let allParticlesDead = true;

        firework.particles.forEach(p => {
            if (p.userData.lifespan > 0) {
                allParticlesDead = false;
                p.userData.velocity.y -= gravity * delta;
                p.position.add(p.userData.velocity.clone().multiplyScalar(delta));
                p.userData.lifespan -= delta;

                // Fade out effect (using per-particle materials)
                if (p.material.transparent) {
                   const lifeRatio = p.userData.lifespan / p.userData.maxLifespan;
                   // Fade out rapidly near the end of life (e.g., quadratic fade)
                   p.material.opacity = Math.pow(lifeRatio, 2); 
                }

            } else {
                p.visible = false;
            }
        });

        if (allParticlesDead) {
            // Cleanup: Dispose shared geometry and individual materials
            if (firework.geometry) firework.geometry.dispose(); 
            firework.particles.forEach(p => {
                if (p.material && p.material.dispose) p.material.dispose();
            });
            scene.remove(firework.group);
            activeFireworks.splice(i, 1);
        }
    }

    for (let i = activeGoalHeartBursts.length - 1; i >= 0; i--) {
        const burst = activeGoalHeartBursts[i];
        let allHeartsGone = true;
        burst.hearts.forEach(heart => {
            const mesh = burst.meshes[heart.meshIndex];
            if (heart.lifespan > 0) {
                allHeartsGone = false;
                heart.vy -= delta * 0.55;
                heart.x += heart.vx * delta;
                heart.y += heart.vy * delta;
                heart.z += heart.vz * delta;
                heart.rotation += heart.spin * delta;
                heart.lifespan -= delta;
                const lifeRatio = Math.max(0, heart.lifespan / heart.maxLifespan);
                const scale = heart.baseScale * (0.75 + (1 - lifeRatio) * 0.9);
                goalHeartTempPosition.set(heart.x, heart.y, heart.z);
                goalHeartTempScale.set(scale, scale, scale);
                if (camera) {
                    goalHeartTempQuaternion.copy(camera.quaternion);
                    goalHeartSpinQuaternion.setFromAxisAngle(GOAL_HEART_SPIN_AXIS, heart.rotation);
                    goalHeartTempQuaternion.multiply(goalHeartSpinQuaternion);
                } else {
                    goalHeartTempQuaternion.identity();
                }
                goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
            } else {
                goalHeartTempPosition.set(0, 0, 0);
                goalHeartTempScale.set(0.0001, 0.0001, 0.0001);
                goalHeartTempQuaternion.identity();
                goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
            }
            mesh.setMatrixAt(heart.instanceIndex, goalHeartTempMatrix);
        });
        burst.meshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
            const burstLifeRatio = Math.max(0, burst.lifespan / burst.maxLifespan);
            mesh.material.opacity = Math.pow(burstLifeRatio, 0.75) * burst.baseOpacity;
        });
        burst.lifespan -= delta;
        if (burst.light) {
            burst.light.intensity = Math.max(0, burst.light.intensity - delta * 1.8);
        }
        if (allHeartsGone) {
            burst.meshes.forEach(mesh => {
                if (mesh.dispose) mesh.dispose();
            });
            scene.remove(burst.group);
            activeGoalHeartBursts.splice(i, 1);
        }
    }

    for (let i = activeLevelCelebrations.length - 1; i >= 0; i--) {
        const celebration = activeLevelCelebrations[i];
        let allStarsGone = true;
        celebration.elapsed += delta;

        celebration.rings.forEach((ring, index) => {
            const ringLife = Math.max(0, 1 - celebration.elapsed / ring.userData.duration);
            const grow = 1 + celebration.elapsed * ring.userData.growSpeed;
            ring.scale.setScalar(grow);
            ring.rotation.z += delta * (index % 2 === 0 ? 0.55 : -0.42);
            ring.material.opacity = ring.userData.baseOpacity * Math.pow(ringLife, 1.35);
        });

        celebration.stars.forEach(star => {
            const mesh = celebration.meshes[star.meshIndex];
            if (star.lifespan > 0) {
                allStarsGone = false;
                star.vy -= delta * 0.42;
                star.x += star.vx * delta;
                star.y += star.vy * delta;
                star.z += star.vz * delta;
                star.rotation += star.spin * delta;
                star.lifespan -= delta;
                const lifeRatio = Math.max(0, star.lifespan / star.maxLifespan);
                const scale = star.baseScale * (0.8 + (1 - lifeRatio) * 0.85);
                goalHeartTempPosition.set(star.x, star.y, star.z);
                goalHeartTempScale.set(scale, scale, scale);
                if (camera) {
                    goalHeartTempQuaternion.copy(camera.quaternion);
                    goalHeartSpinQuaternion.setFromAxisAngle(GOAL_HEART_SPIN_AXIS, star.rotation);
                    goalHeartTempQuaternion.multiply(goalHeartSpinQuaternion);
                } else {
                    goalHeartTempQuaternion.identity();
                }
                goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
            } else {
                goalHeartTempPosition.set(0, 0, 0);
                goalHeartTempScale.set(0.0001, 0.0001, 0.0001);
                goalHeartTempQuaternion.identity();
                goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
            }
            mesh.setMatrixAt(star.instanceIndex, goalHeartTempMatrix);
        });

        celebration.meshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
            const lifeRatio = Math.max(0, celebration.lifespan / celebration.maxLifespan);
            mesh.material.opacity = celebration.baseOpacity * Math.pow(lifeRatio, 0.65);
        });
        if (celebration.light) {
            celebration.light.intensity = Math.max(0, celebration.light.intensity - delta * 2.6);
        }
        celebration.lifespan -= delta;
        if (allStarsGone && celebration.lifespan <= 0) {
            celebration.rings.forEach(ring => {
                if (ring.geometry) ring.geometry.dispose();
                if (ring.material) ring.material.dispose();
            });
            scene.remove(celebration.group);
            activeLevelCelebrations.splice(i, 1);
        }
    }

    // Player movement handling
    if (gameState === 'TURNING') {
        let angleDiff = targetRotation.y - player.rotation.y;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (Math.abs(angleDiff) > 0.01) {
            const turnStep = Math.sign(angleDiff) * TURN_SPEED * delta;
            player.rotation.y += (Math.abs(turnStep) >= Math.abs(angleDiff)) ? angleDiff : turnStep;
        } else {
            player.rotation.y = targetRotation.y;
            gameState = 'AT_INTERSECTION';
            checkForTurns();
        }
    }
    if (gameState === 'DRIVING') {
        const distanceToTarget = player.position.distanceTo(targetPosition);
        if (distanceToTarget > 0.01) {
            const moveVector = targetPosition.clone().sub(player.position).normalize();
            const moveAmount = Math.min(distanceToTarget, MOVE_SPEED * delta);
            player.position.add(moveVector.multiplyScalar(moveAmount));
            
            // Animate wheels in 3P view (v10.0)
            if (viewMode === '3P' && playerCarModel) {
                playerCarModel.children.forEach(child => {
                    if (child.name === 'wheelGroup') {
                        const wheelRadius = child.userData.radius || TILE_SIZE * 0.08;
                        child.rotation.x += (MOVE_SPEED / wheelRadius) * delta;
                    }
                });
            }

        } else {
            player.position.copy(targetPosition);
            afterMoveChecks();
        }
    }
    
    if (steeringWheel) steeringWheel.rotation.z = (player.rotation.y - targetRotation.y) * 2;
    
    if (['DRIVING', 'TURNING', 'AT_INTERSECTION', 'BIG_MAP'].includes(gameState)) updateMinimapPlayer();

    landmarksGroup.traverse(child => {
        if (child.name === 'arrowGlow') child.material.opacity = (Math.sin(elapsedTime * 6 + child.userData.phase) + 1) / 2 * 0.6 + 0.1; 
    });

    if (starField && starField.material) {
        const nightFactor = Math.max(0, 1 - dayNightCycle * 1.15);
        starField.material.opacity = Math.min(1.0, Math.pow(nightFactor, 0.6) * 1.2);
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    syncRendererToViewport();
    if (isPortraitTouchScreen()) {
        const hintEl = document.getElementById('ingame-hint');
        if (hintEl) hintEl.style.display = 'none';
    }
}

// ====================================================================
// 输入处理 (Input Handling)
// ====================================================================


function onKeyDown(event) {
    if (!event || !event.key) return;
    const key = event.key.toLowerCase();
    if (keyState[key]) return;
    keyState[key] = true;

    if (key === 'escape') { togglePauseMenu(); return; }

    // Prevent page scroll on arrow keys
    if (['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
if (event.preventDefault) event.preventDefault();
    }

    if (key === 'd' || key === 'arrowright') {
        handleDriveAction('right');
    } else if (key === 'a' || key === 'arrowleft') {
        handleDriveAction('left');
    } else if (key === 'w' || key === 'arrowup') {
        handleDriveAction('forward');
    } else if (key === 's' || key === 'arrowdown') {
        handleDriveAction('back');
    }
}


function onKeyUp(event) {
    if (!event || !event.key) return;
    keyState[event.key.toLowerCase()] = false;
}

// ====================================================================
// 3D迷宫与视觉生成 (3D Maze & Visuals Generation)
// ====================================================================

function createInstancedWallBatch(geometry, material, transforms) {
    if (transforms.length === 0) return;
    const batch = new THREE.InstancedMesh(geometry, material, transforms.length);
    batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy = new THREE.Object3D();
    transforms.forEach((transform, index) => {
        dummy.position.set(transform.x, WALL_HEIGHT / 2, transform.z);
        dummy.rotation.set(0, transform.rotationY, 0);
        dummy.updateMatrix();
        batch.setMatrixAt(index, dummy.matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.frustumCulled = false;
    mazeGroup.add(batch);
}

function createTechWallEffect(transform, index, usePointLight) {
    const group = new THREE.Group();
    group.position.set(transform.x, WALL_HEIGHT + 0.32, transform.z);
    group.rotation.y = transform.rotationY;

    const primaryColor = index % 2 === 0 ? 0x00e5ff : 0xff2fd6;
    const secondaryColor = index % 2 === 0 ? 0x8b5cf6 : 0x22d3ee;
    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.28,
        metalness: 0.82,
        emissive: new THREE.Color(primaryColor).multiplyScalar(0.08)
    });
    const gemMaterial = new THREE.MeshStandardMaterial({
        color: primaryColor,
        emissive: primaryColor,
        emissiveIntensity: 1.7,
        roughness: 0.18,
        metalness: 0.22,
        transparent: true,
        opacity: 0.96
    });
    const auraMaterial = new THREE.MeshBasicMaterial({
        color: primaryColor,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const haloMaterial = new THREE.MeshBasicMaterial({
        color: secondaryColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const aura = new THREE.Mesh(new THREE.CircleGeometry(0.56, 32), auraMaterial);
    aura.position.set(0, 0.02, 0.22);
    aura.scale.set(1.25, 0.72, 1);
    aura.name = 'floatingGemAura';
    group.add(aura);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.14, 6), metalMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.set(0, -0.18, 0.13);
    base.name = 'floatingGemSocket';
    group.add(base);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 42), haloMaterial);
    halo.position.set(0, 0.13, 0.25);
    halo.name = 'floatingGemHalo';
    group.add(halo);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), gemMaterial);
    gem.position.set(0, 0.16, 0.3);
    gem.rotation.set(0.46, Math.PI / 4, 0.14);
    gem.name = 'floatingGemLight';
    group.add(gem);

    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    shine.position.set(-0.08, 0.27, 0.43);
    shine.name = 'floatingGemSpark';
    group.add(shine);

    let light = null;
    if (usePointLight) {
        light = new THREE.PointLight(primaryColor, 1.6, TILE_SIZE * 1.9, 1.55);
        light.position.set(0, 0.16, 0.44);
        group.add(light);
    }

    sceneryGroup.add(group);
    activeTechWallEffects.push({
        group,
        gem,
        gemMaterial,
        gemBaseY: gem.position.y,
        baseRotationX: gem.rotation.x,
        aura,
        auraMaterial,
        auraBaseY: aura.position.y,
        halo,
        haloMaterial,
        haloBaseY: halo.position.y,
        light,
        lightBaseY: light ? light.position.y : 0,
        phase: index * 0.19,
        floatHeight: 0.11 + (index % 3) * 0.025,
        floatSpeed: 1.7 + (index % 5) * 0.16,
        spinSpeed: 0.85 + (index % 4) * 0.18
    });
}

function addTechWallLighting(wallBatches, gridWidth, gridHeight) {
    const allWalls = Object.entries(wallBatches)
        .flatMap(([type, transforms]) => transforms.map((transform, index) => ({ type, transform, index })));
    if (allWalls.length === 0) return;

    const cellCount = gridWidth * gridHeight;
    const maxEffects = cellCount > 900 ? 12 : cellCount > 500 ? 16 : 22;
    const spacing = cellCount > 900 ? 9 : cellCount > 500 ? 7 : 5;
    const selected = [];

    allWalls.forEach((item) => {
        const seed = Math.abs(Math.round(item.transform.x * 17 + item.transform.z * 31 + item.index * 13));
        const isGoalAccent = item.type === 'goal' && seed % 2 === 0;
        if (selected.length < maxEffects && (isGoalAccent || seed % spacing === 0)) {
            selected.push(item.transform);
        }
    });

    if (selected.length < Math.min(8, allWalls.length)) {
        allWalls
            .slice()
            .sort((a, b) => {
                const seedA = Math.abs(Math.round(a.transform.x * 19 + a.transform.z * 23));
                const seedB = Math.abs(Math.round(b.transform.x * 19 + b.transform.z * 23));
                return seedA - seedB;
            })
            .some((item) => {
                if (!selected.includes(item.transform)) selected.push(item.transform);
                return selected.length >= Math.min(maxEffects, 8, allWalls.length);
            });
    }

    selected.slice(0, maxEffects).forEach((transform, index) => createTechWallEffect(transform, index, index < 8));
}

function createMazeMesh(grid, goal) {
    const gridWidth = grid[0].length;
    const gridHeight = grid.length;
    const floorPlane = new THREE.PlaneGeometry(gridWidth * TILE_SIZE, gridHeight * TILE_SIZE);
    const floor = new THREE.Mesh(floorPlane, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    mazeGroup.add(floor);
    floorMaterial.userData.baseRepeat = { x: gridWidth, y: gridHeight };
    updateTextureScales();

    const wallGeo = new THREE.PlaneGeometry(TILE_SIZE, WALL_HEIGHT);
    const wallBatches = {
        north: [],
        south: [],
        east: [],
        west: [],
        goal: []
    };
    const addWall = (batchName, x, z, rotationY) => {
        wallBatches[batchName].push({ x, z, rotationY });
    };

    for (let z = 0; z < gridHeight; z++) {
        for (let x = 0; x < gridWidth; x++) {
            if (grid[z][x] === 1) {
                const worldPos = gridToWorld(x, z, grid);
                const isNearGoal = Math.abs(x - goal.x) <= 1 && Math.abs(z - goal.z) <= 1 && !(x === goal.x && z === goal.z);
                
                // South-facing wall (of cell z-1)
                if (z > 0 && grid[z - 1][x] === 0) {
                     addWall(isNearGoal && z - 1 === goal.z ? 'goal' : 'south', worldPos.x, worldPos.z - TILE_SIZE / 2, 0);
                }
                // North-facing wall (of cell z+1)
                if (z < gridHeight - 1 && grid[z + 1][x] === 0) {
                     addWall(isNearGoal && z + 1 === goal.z ? 'goal' : 'north', worldPos.x, worldPos.z + TILE_SIZE / 2, Math.PI);
                }
                // West-facing wall (of cell x-1)
                if (x > 0 && grid[z][x - 1] === 0) {
                     addWall(isNearGoal && x - 1 === goal.x ? 'goal' : 'west', worldPos.x - TILE_SIZE / 2, worldPos.z, Math.PI / 2);
                }
                // East-facing wall (of cell x+1)
                if (x < gridWidth - 1 && grid[z][x + 1] === 0) {
                     addWall(isNearGoal && x + 1 === goal.x ? 'goal' : 'east', worldPos.x + TILE_SIZE / 2, worldPos.z, -Math.PI / 2);
                }
            }
        }
    }

    createInstancedWallBatch(wallGeo, wallMaterialN, wallBatches.north);
    createInstancedWallBatch(wallGeo, wallMaterialS, wallBatches.south);
    createInstancedWallBatch(wallGeo, wallMaterialE, wallBatches.east);
    createInstancedWallBatch(wallGeo, wallMaterialW, wallBatches.west);
    createInstancedWallBatch(wallGeo, goalWallMaterial, wallBatches.goal);
    addTechWallLighting(wallBatches, gridWidth, gridHeight);
}

function createLuckyCat() {
    const catGroup = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1 });
    const redMat   = new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.35, metalness: 0.1 });
    const goldMat  = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.1,  metalness: 0.5 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const pinkMat  = new THREE.MeshStandardMaterial({ color: 0xffc0cb, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 16), whiteMat);
    body.scale.y = 0.8; catGroup.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 16), whiteMat);
    head.position.y = 1.8; catGroup.add(head);
    const eyeGeo = new THREE.SphereGeometry(0.1, 12, 8);
    const leftEye  = new THREE.Mesh(eyeGeo, blackMat); leftEye.position.set(-0.4, 0.2, 1.11); head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, blackMat); rightEye.position.set( 0.4, 0.2, 1.11); head.add(rightEye);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), blackMat);
    nose.position.set(0, 0, 1.18); nose.scale.set(1.5, 1, 1); head.add(nose);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 });
    for (let i = 0; i < 3; i++) {
        const whiskerL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2,-0.1,1.15),new THREE.Vector3(-1.2,-i*0.15,0.8)]), lineMat);
        const whiskerR = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.2,-0.1,1.15),new THREE.Vector3(1.2,-i*0.15,0.8)]), lineMat);
        head.add(whiskerL, whiskerR);
    }
    const earOuterGeo = new THREE.ConeGeometry(0.4, 0.8, 12);
    const earInnerGeo = new THREE.ConeGeometry(0.28, 0.5, 12);
    const leftEar = new THREE.Mesh(earOuterGeo, whiteMat);
    leftEar.position.set(-0.8, 2.8, 0.06); leftEar.rotation.z = Math.PI / 10; catGroup.add(leftEar);
    const leftInner = new THREE.Mesh(earInnerGeo, pinkMat);
    leftInner.position.set(0, -0.05, 0.15); leftInner.rotation.x = -Math.PI / 12; leftEar.add(leftInner);
    const rightEar = new THREE.Mesh(earOuterGeo, whiteMat);
    rightEar.position.set(0.8, 2.8, 0.06); rightEar.rotation.z = -Math.PI / 10; catGroup.add(rightEar);
    const rightInner = new THREE.Mesh(earInnerGeo, pinkMat);
    rightInner.position.set(0, -0.05, 0.15); rightInner.rotation.x = -Math.PI / 12; rightEar.add(rightInner);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 8, 32), redMat);
    collar.position.y = 1.2; collar.rotation.x = Math.PI / 2; catGroup.add(collar);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8), goldMat);
    bell.position.set(0, 1.2, 1.3); catGroup.add(bell);
    luckyCatArm = new THREE.Object3D();
    luckyCatArm.position.set(-1.05, 1.1, 0.35); catGroup.add(luckyCatArm);
    const armCurvePoints = [new THREE.Vector3(0,0,0),new THREE.Vector3(0,0.75,0.25),new THREE.Vector3(0,1.35,0.4)];
    const armCurve = new THREE.CatmullRomCurve3(armCurvePoints);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 20, 0.30, 8, false), whiteMat);
    luckyCatArm.add(arm);
    luckyCatWrist = new THREE.Object3D();
    luckyCatWrist.position.copy(armCurvePoints[armCurvePoints.length - 1]); luckyCatArm.add(luckyCatWrist);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), whiteMat);
    paw.scale.set(1, 0.8, 1); luckyCatWrist.add(paw);
    const mainPad = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), pinkMat);
    mainPad.position.set(0, -0.1, 0.30); mainPad.scale.set(1.2, 1, 0.5); paw.add(mainPad);
    for (let i = 0; i < 3; i++) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), pinkMat);
        pad.position.set(-0.2 + i * 0.2, 0.1, 0.35); pad.scale.z = 0.5; paw.add(pad);
    }
    return catGroup;
}

function loadWaypointGoalCatSource() {
    if (!waypointGoalCatPromise) {
        const loader = new GLTFLoader();
        waypointGoalCatPromise = loader.loadAsync(WAYPOINT_MANEKI_NEKO_URL).then((gltf) => {
            const source = gltf.scene || gltf.scenes?.[0];
            if (!source) throw new Error('Waypoint lucky cat GLB did not contain a scene.');

            source.name = 'waypointGoalLuckyCatSource';
            source.traverse((child) => {
                if (!child.isMesh) return;
                child.castShadow = false;
                child.receiveShadow = true;
                child.frustumCulled = true;
                prepareWaypointGoalCatMesh(child);
            });
            return source;
        }).catch((error) => {
            console.warn('Failed to load waypoint lucky cat goal model.', error);
            waypointGoalCatPromise = null;
            return null;
        });
    }
    return waypointGoalCatPromise;
}

function loadFreeWaypointMarkerSource() {
    if (!freeWaypointMarkerPromise) {
        const loader = new GLTFLoader();
        freeWaypointMarkerPromise = loader.loadAsync(FREE_WAYPOINT_MARKER_URL).then((gltf) => {
            const source = gltf.scene || gltf.scenes?.[0];
            if (!source) throw new Error('Free waypoint GLB did not contain a scene.');

            source.name = 'freeWaypointMarkerSource';
            source.traverse((child) => {
                if (!child.isMesh) return;
                child.castShadow = false;
                child.receiveShadow = true;
                child.frustumCulled = true;
                prepareWaypointGoalCatMesh(child);
            });
            return source;
        }).catch((error) => {
            console.warn('Failed to load free waypoint marker model.', error);
            freeWaypointMarkerPromise = null;
            return null;
        });
    }
    return freeWaypointMarkerPromise;
}

function prepareWaypointGoalCatMesh(mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    materials.filter(Boolean).forEach((material) => {
        material.depthWrite = true;
        material.needsUpdate = true;
    });
}

function createWaypointGoalCatInstance(source) {
    return createScaledStandaloneModel(source, WAYPOINT_GOAL_ASSET_HEIGHT, 'waypointLuckyCatGoal', 'waypointLuckyCatModel');
}

function createScaledStandaloneModel(source, targetHeight, wrapperName, modelName) {
    const wrapper = new THREE.Group();
    wrapper.name = wrapperName;
    const model = source.clone(true);
    model.name = modelName;
    wrapper.add(model);

    model.updateMatrixWorld(true);
    tripoGoalBox.setFromObject(model);
    if (!tripoGoalBox.isEmpty()) {
        tripoGoalBox.getSize(tripoGoalSize);
        tripoGoalBox.getCenter(tripoGoalCenter);
        const sourceHeight = Math.max(tripoGoalSize.y, 0.001);
        const sourceScale = targetHeight / sourceHeight;
        model.scale.setScalar(sourceScale);
        model.position.set(
            -tripoGoalCenter.x * sourceScale,
            -tripoGoalBox.min.y * sourceScale,
            -tripoGoalCenter.z * sourceScale
        );
    }

    return wrapper;
}

function createFreeWaypointMarker(index) {
    const marker = new THREE.Group();
    marker.name = `freeWaypointMarker_${index + 1}`;
    marker.userData.kind = 'freeWaypoint';
    marker.userData.waypointIndex = index;
    marker.userData.collected = false;

    loadFreeWaypointMarkerSource().then((source) => {
        if (!source || !marker.parent || marker.userData.collected) return;
        const markerModel = createScaledStandaloneModel(
            source,
            FREE_WAYPOINT_MARKER_HEIGHT,
            'freeWaypointMarkerModelRoot',
            'freeWaypointMarkerModel'
        );
        markerModel.position.y = FREE_WAYPOINT_MARKER_FLOOR_CLEARANCE;
        marker.add(markerModel);
    });

    return marker;
}

function attachWaypointGoalCatToGoal(marker, loadingPlaceholder) {
    const requestId = Symbol('waypoint-goal-cat');
    marker.userData.tripoGoalRequestId = requestId;
    marker.userData.tripoGoalLoading = true;

    loadWaypointGoalCatSource().then((source) => {
        if (!source || goalMarker !== marker || marker.userData.tripoGoalRequestId !== requestId) {
            return;
        }

        const waypointCat = createWaypointGoalCatInstance(source);
        waypointCat.position.y = WAYPOINT_GOAL_FLOOR_CLEARANCE - GOAL_MARKER_BASE_Y;

        if (loadingPlaceholder?.parent === marker) marker.remove(loadingPlaceholder);
        marker.add(waypointCat);

        luckyCatArm = null;
        luckyCatWrist = null;
        marker.userData.tripoGoalLoading = false;
        marker.userData.tripoGoalLoaded = true;
    });
}

function createGoalMarker(goalCoords) {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    const goalPos = gridToWorld(goalCoords.x, goalCoords.z, level.grid);
    const isTechGoal = currentLevelState.isWaypointMode;
    luckyCatArm = null;
    luckyCatWrist = null;
    floatingHeart = null;
    goalMarker = new THREE.Group();
    goalMarker.userData.techGoal = isTechGoal;
    let cat;
    if (isTechGoal) {
        cat = new THREE.Group();
        cat.name = 'waypointGoalLoadingPlaceholder';
        goalMarker.add(cat);
        attachWaypointGoalCatToGoal(goalMarker, cat);
    } else {
        cat = createLuckyCat();
        cat.scale.set(1.5, 1.5, 1.5);
        goalMarker.add(cat);

        const heartShape = new THREE.Shape();
        const [x,y,s] = [0,0,0.6];
        heartShape.moveTo(x+0.5*s,y+0.5*s).bezierCurveTo(x+0.5*s,y+0.5*s,x+0.4*s,y,x,y).bezierCurveTo(x-0.6*s,y,x-0.6*s,y+0.7*s,x-0.6*s,y+0.7*s).bezierCurveTo(x-0.6*s,y+1.1*s,x-0.3*s,y+1.54*s,x+0.5*s,y+1.9*s).bezierCurveTo(x+1.2*s,y+1.54*s,x+1.6*s,y+1.1*s,x+1.6*s,y+0.7*s).bezierCurveTo(x+1.6*s,y+0.7*s,x+1.6*s,y,x+1.0*s,y).bezierCurveTo(x+0.7*s,y,x+0.5*s,y+0.5*s,x+0.5*s,y+0.5*s);
        const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.25, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.08, bevelThickness: 0.08 });
        const heartMat = new THREE.MeshBasicMaterial({
            color: 0xff4d6d,
            depthTest: true,
            depthWrite: true
        });
        const heart = new THREE.Mesh(heartGeo, heartMat);
        heart.position.set(0, 6.2, 0.2); heart.rotation.x = Math.PI; heart.scale.set(0.9, 0.9, 0.9);
        goalMarker.add(heart);
        floatingHeart = heart;
        floatingHeart.userData.baseY = heart.position.y;
    }
    goalMarker.position.copy(goalPos);
    goalMarker.position.y = GOAL_MARKER_BASE_Y;
    scene.add(goalMarker);
}

function createWaypointMesh(number, color = '#8A2BE2') {
    const group = new THREE.Group();
    group.userData.collected = false; // Mark as not collected initially
    const gemColor = new THREE.Color(color);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.3, 8), baseMat);
    group.add(base);

    const gemMat = new THREE.MeshStandardMaterial({
        color: gemColor,
        emissive: gemColor,
        emissiveIntensity: 0.8,
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.9
    });
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), gemMat);
    gem.position.y = 0.8;
    gem.name = 'waypoint_gem';
    group.add(gem);

    const light = new THREE.PointLight(gemColor, 3, TILE_SIZE * 0.8);
    light.position.y = 1;
    group.add(light);
    
    if (helveticaFont) {
        const textGeo = new TextGeometry(String(number), {
            font: helveticaFont,
            size: 1,
            height: 0.2,
            curveSegments: 4,
        });
        textGeo.center();
        const textMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.y = 2.5;
        textMesh.rotation.y = Math.PI; // Face forward
        const textWrapper = new THREE.Object3D();
        textWrapper.add(textMesh);
        group.add(textWrapper);
        textWrapper.onBeforeRender = function(renderer, scene, camera) {
            this.quaternion.copy(camera.quaternion);
        };
    }
    group.position.y = 0.15;
    return group;
}

function createHeartShapeGeometry() {
    if (goalHeartGeometryCache) return goalHeartGeometryCache;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.32);
    shape.bezierCurveTo(0, 0.32, -0.52, -0.12, -0.52, -0.46);
    shape.bezierCurveTo(-0.52, -0.72, -0.3, -0.92, -0.06, -0.92);
    shape.bezierCurveTo(0.12, -0.92, 0.25, -0.8, 0.32, -0.66);
    shape.bezierCurveTo(0.39, -0.8, 0.52, -0.92, 0.7, -0.92);
    shape.bezierCurveTo(0.94, -0.92, 1.16, -0.72, 1.16, -0.46);
    shape.bezierCurveTo(1.16, -0.12, 0.64, 0.32, 0.32, 0.62);
    shape.bezierCurveTo(0.18, 0.5, 0.07, 0.4, 0, 0.32);
    const geometry = new THREE.ShapeGeometry(shape, 16);
    geometry.center();
    goalHeartGeometryCache = geometry;
    return goalHeartGeometryCache;
}

function getGoalHeartColors(isTechGoal = false) {
    return isTechGoal
        ? [0xff4fd8, 0x5ee7ff, 0xf8fdff, 0x8b5cf6]
        : [0xff4d6d, 0xff79a8, 0xffb3c7, 0xfff0f5];
}

function getGoalHeartMaterials(isTechGoal = false) {
    const key = isTechGoal ? 'tech' : 'classic';
    if (!goalHeartMaterialsCache[key]) {
        goalHeartMaterialsCache[key] = getGoalHeartColors(isTechGoal).map(color => new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.94,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        }));
    }
    return goalHeartMaterialsCache[key];
}

function createCelebrationStarGeometry() {
    if (celebrationStarGeometryCache) return celebrationStarGeometryCache;
    const shape = new THREE.Shape();
    const outer = 0.34;
    const inner = 0.14;
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 12);
    geometry.center();
    celebrationStarGeometryCache = geometry;
    return celebrationStarGeometryCache;
}

function getCelebrationMaterials(isTechGoal = false) {
    const key = isTechGoal ? 'tech' : 'classic';
    if (!celebrationMaterialsCache[key]) {
        const colors = isTechGoal
            ? [0x5ee7ff, 0xff4fd8, 0xf8fdff]
            : [0xffd166, 0xff6f91, 0xffffff];
        celebrationMaterialsCache[key] = colors.map(color => new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.96,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        }));
    }
    return celebrationMaterialsCache[key];
}

function triggerCelebrationFlash(isTechGoal = false) {
    const color = isTechGoal ? '94, 231, 255' : '255, 209, 102';
    document.documentElement.style.setProperty('--celebration-flash-rgb', color);
    document.body.classList.remove('level-celebration-flash');
    void document.body.offsetWidth;
    document.body.classList.add('level-celebration-flash');
    window.setTimeout(() => document.body.classList.remove('level-celebration-flash'), 900);
}

function warmGoalHeartBurstResources() {
    const geometry = createHeartShapeGeometry();
    const celebrationGeometry = createCelebrationStarGeometry();
    getGoalHeartMaterials(false);
    getGoalHeartMaterials(true);
    getCelebrationMaterials(false);
    getCelebrationMaterials(true);
    if (!renderer || !scene || !camera) return;

    const warmGroup = new THREE.Group();
    goalHeartTempScale.set(0.001, 0.001, 0.001);
    goalHeartTempPosition.set(0, -1000, 0);
    goalHeartTempQuaternion.identity();
    goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
    [...getGoalHeartMaterials(false), ...getGoalHeartMaterials(true)].forEach(material => {
        const mesh = new THREE.InstancedMesh(geometry, material, 1);
        mesh.setMatrixAt(0, goalHeartTempMatrix);
        warmGroup.add(mesh);
    });
    [...getCelebrationMaterials(false), ...getCelebrationMaterials(true)].forEach(material => {
        const mesh = new THREE.InstancedMesh(celebrationGeometry, material, 1);
        mesh.setMatrixAt(0, goalHeartTempMatrix);
        warmGroup.add(mesh);
    });
    scene.add(warmGroup);
    renderer.compile(scene, camera);
    scene.remove(warmGroup);
}

function clearGoalHeartBursts() {
    activeGoalHeartBursts.forEach(burst => {
        if (burst.meshes) {
            burst.meshes.forEach(mesh => {
                if (mesh.dispose) mesh.dispose();
            });
        }
        if (burst.group) scene.remove(burst.group);
    });
    activeGoalHeartBursts = [];
}

function clearLevelCelebrations() {
    activeLevelCelebrations.forEach(celebration => {
        if (celebration.rings) {
            celebration.rings.forEach(ring => {
                if (ring.geometry) ring.geometry.dispose();
                if (ring.material) ring.material.dispose();
            });
        }
        if (celebration.group) scene.remove(celebration.group);
    });
    activeLevelCelebrations = [];
    document.body.classList.remove('level-celebration-flash');
}

function createGoalHeartBurst(position, isTechGoal = false) {
    if (!scene) return;
    const burstGroup = new THREE.Group();
    burstGroup.position.copy(position);
    burstGroup.position.y += WALL_HEIGHT * 0.78;
    scene.add(burstGroup);

    const geometry = createHeartShapeGeometry();
    const materials = getGoalHeartMaterials(isTechGoal);
    const hearts = [];
    const count = prefersMobilePerformance() ? 32 : 48;
    const meshCapacity = Math.ceil(count / materials.length);
    const meshes = materials.map(material => {
        material.opacity = 0.94;
        const mesh = new THREE.InstancedMesh(geometry, material, meshCapacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        burstGroup.add(mesh);
        return mesh;
    });
    const instanceCounts = new Array(materials.length).fill(0);
    let maxLifespan = 0;

    for (let i = 0; i < count; i++) {
        const meshIndex = i % meshes.length;
        const instanceIndex = instanceCounts[meshIndex]++;
        const theta = Math.random() * Math.PI * 2;
        const lift = Math.random() * 1.2 + 1.0;
        const spread = Math.random() * 4.2 + 2.2;
        const lifespan = 1.9 + Math.random() * 1.15;
        maxLifespan = Math.max(maxLifespan, lifespan);
        const heart = {
            meshIndex,
            instanceIndex,
            x: Math.cos(theta) * (Math.random() * 0.45),
            y: Math.random() * 0.65,
            z: Math.sin(theta) * (Math.random() * 0.45),
            vx: Math.cos(theta) * spread,
            vy: lift + Math.random() * 2.4,
            vz: Math.sin(theta) * spread,
            maxLifespan: lifespan,
            lifespan,
            baseScale: 0.26 + Math.random() * 0.34,
            spin: (Math.random() - 0.5) * 6.2,
            rotation: Math.random() * Math.PI * 2
        };
        goalHeartTempPosition.set(heart.x, heart.y, heart.z);
        goalHeartTempScale.setScalar(heart.baseScale);
        goalHeartTempQuaternion.identity();
        goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
        meshes[meshIndex].setMatrixAt(instanceIndex, goalHeartTempMatrix);
        hearts.push(heart);
    }
    meshes.forEach((mesh, index) => {
        mesh.count = instanceCounts[index];
        mesh.instanceMatrix.needsUpdate = true;
    });

    const light = new THREE.PointLight(isTechGoal ? 0xff4fd8 : 0xff7aa8, 1.6, TILE_SIZE * 3.0, 1.7);
    light.position.set(0, 2.2, 0);
    burstGroup.add(light);

    activeGoalHeartBursts.push({
        group: burstGroup,
        hearts,
        meshes,
        light,
        maxLifespan,
        lifespan: maxLifespan,
        baseOpacity: 0.94
    });
}

function createLevelCelebrationEffect(position, isTechGoal = false) {
    if (!scene) return;
    clearLevelCelebrations();
    triggerCelebrationFlash(isTechGoal);

    const group = new THREE.Group();
    group.position.copy(position);
    group.position.y += WALL_HEIGHT * 0.48;
    scene.add(group);

    const ringColors = isTechGoal ? [0x5ee7ff, 0xff4fd8, 0xffffff] : [0xffd166, 0xff6f91, 0xffffff];
    const rings = ringColors.map((color, index) => {
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: index === 0 ? 0.68 : 0.46,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18 + index * 0.28, 0.035, 8, 72), mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = index * 0.28;
        ring.userData.baseOpacity = mat.opacity;
        ring.userData.duration = 1.45 + index * 0.22;
        ring.userData.growSpeed = 2.4 + index * 0.55;
        group.add(ring);
        return ring;
    });

    const geometry = createCelebrationStarGeometry();
    const materials = getCelebrationMaterials(isTechGoal);
    const count = prefersMobilePerformance() ? 30 : 44;
    const meshCapacity = Math.ceil(count / materials.length);
    const meshes = materials.map(material => {
        material.opacity = 0.96;
        const mesh = new THREE.InstancedMesh(geometry, material, meshCapacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        group.add(mesh);
        return mesh;
    });
    const instanceCounts = new Array(materials.length).fill(0);
    const stars = [];
    let maxLifespan = 0;

    for (let i = 0; i < count; i++) {
        const meshIndex = i % meshes.length;
        const instanceIndex = instanceCounts[meshIndex]++;
        const theta = Math.random() * Math.PI * 2;
        const radius = Math.random() * 0.95;
        const spread = 2.5 + Math.random() * 3.4;
        const lifespan = 1.45 + Math.random() * 0.95;
        maxLifespan = Math.max(maxLifespan, lifespan);
        const star = {
            meshIndex,
            instanceIndex,
            x: Math.cos(theta) * radius,
            y: 0.25 + Math.random() * 0.55,
            z: Math.sin(theta) * radius,
            vx: Math.cos(theta) * spread,
            vy: 2.2 + Math.random() * 2.1,
            vz: Math.sin(theta) * spread,
            maxLifespan: lifespan,
            lifespan,
            baseScale: 0.28 + Math.random() * 0.26,
            spin: (Math.random() - 0.5) * 7.0,
            rotation: Math.random() * Math.PI * 2
        };
        goalHeartTempPosition.set(star.x, star.y, star.z);
        goalHeartTempScale.setScalar(star.baseScale);
        goalHeartTempQuaternion.identity();
        goalHeartTempMatrix.compose(goalHeartTempPosition, goalHeartTempQuaternion, goalHeartTempScale);
        meshes[meshIndex].setMatrixAt(instanceIndex, goalHeartTempMatrix);
        stars.push(star);
    }
    meshes.forEach((mesh, index) => {
        mesh.count = instanceCounts[index];
        mesh.instanceMatrix.needsUpdate = true;
    });

    const light = new THREE.PointLight(isTechGoal ? 0x5ee7ff : 0xffd166, 2.6, TILE_SIZE * 3.8, 1.6);
    light.position.set(0, 2.6, 0);
    group.add(light);

    activeLevelCelebrations.push({
        group,
        rings,
        stars,
        meshes,
        light,
        elapsed: 0,
        maxLifespan,
        lifespan: maxLifespan,
        baseOpacity: 0.96
    });
}

// Enhanced Firework Effect Implementation (v10.0)
function createFireworkEffect(position, color) {
    const firework = new THREE.Group();
    // Start higher for better visibility, especially in first person
    firework.position.copy(position);
    firework.position.y += WALL_HEIGHT * 0.6; 
    scene.add(firework);

    const particleCount = 150;
    const particles = [];
    
    // Base material definition for glowing effect
    const baseMaterial = new THREE.MeshBasicMaterial({ 
        color: color, 
        transparent: true, 
        opacity: 1.0,
        blending: THREE.AdditiveBlending, // Key for the glow effect
        depthWrite: false // Prevents particles rendering over each other incorrectly
    });

    // Shared geometry
    const particleGeo = new THREE.SphereGeometry(0.15, 8, 8); 

    for (let i = 0; i < particleCount; i++) {
        // Clone material for individual opacity control (ESSENTIAL for fade-out)
        const particleMaterial = baseMaterial.clone();
        const particle = new THREE.Mesh(particleGeo, particleMaterial);
        
        // Calculate velocity for explosion
        const theta = Math.random() * 2 * Math.PI;
        // Slightly restrict vertical angle so it doesn't just shoot straight up/down
        const phi = Math.acos((Math.random() * 1.8) - 0.8);
        const speed = Math.random() * 8 + 8; // Increased speed (8 to 16)

        particle.userData.velocity = new THREE.Vector3(
            speed * Math.sin(phi) * Math.cos(theta),
            speed * Math.cos(phi),
            speed * Math.sin(phi) * Math.sin(theta)
        );

        // Lifespan
        const lifespan = Math.random() * 2.0 + 1.0; // 1.0s to 3.0s
        particle.userData.lifespan = lifespan;
        particle.userData.maxLifespan = lifespan; // Store max lifespan for fade calculation

        firework.add(particle);
        particles.push(particle);
    }
    baseMaterial.dispose(); // Dispose the template material

    // Store group, particles, and the shared geometry for later cleanup
    activeFireworks.push({ group: firework, particles: particles, geometry: particleGeo });
}

function createHighlightFloorMesh(worldPos) {
    const geo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffc107, // Golden yellow
        emissive: 0xcc9a00,
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(worldPos.x, 0.05, worldPos.z);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}


function createDirectionalHelpers() {
    // Clear old arrows
    while (landmarksGroup.children.length > 0) landmarksGroup.remove(landmarksGroup.children[0]);

    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    if (!level) return { forward: false, left: false, right: false };

    const gridPos = worldToGrid(player.position);
    const available = { forward: false, left: false, right: false };

    // Arrow geometry & materials
    const arrowShape = new THREE.Shape();
    const w = 0.5, h = 0.72;
    arrowShape.moveTo(0, h/2).lineTo(w/2, 0).lineTo(w/4, 0).lineTo(w/4, -h/2)
      .lineTo(-w/4, -h/2).lineTo(-w/4, 0).lineTo(-w/2, 0).closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    const yellowArrowMat = new THREE.MeshBasicMaterial({ color: 0xffc107, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    const redArrowMat    = new THREE.MeshBasicMaterial({ color: 0xdc3545, side: THREE.DoubleSide, depthTest: false, depthWrite: false });

    const baseYaw = Math.round(player.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
    const isPath = (x, z) => z >= 0 && z < level.grid.length && x >= 0 && x < level.grid[0].length && level.grid[z][x] === 1;

    const dirs = [
{ name: 'forward', yaw: baseYaw,             pos: new THREE.Vector3( 0.0, -0.0, -4.0), rotZ:  0.0 },
{ name: 'left',    yaw: baseYaw + Math.PI/2, pos: new THREE.Vector3(-1.6, -0.0, -4.0), rotZ:  Math.PI/2 },
{ name: 'right',   yaw: baseYaw - Math.PI/2, pos: new THREE.Vector3( 1.6, -0.0, -4.0), rotZ: -Math.PI/2 }
    ];

    // Per-view toggle
    const shouldShowArrows = !!arrowHintsEnabled[viewMode];

    for (const d of dirs) {
const moveVec = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, d.yaw, 0));
const nx = gridPos.x + Math.round(moveVec.x);
const nz = gridPos.z + Math.round(moveVec.z);

if (isPath(nx, nz)) {
    available[d.name] = true;

    if (shouldShowArrows) {
        const isBackwards = previousGridPos && nx === previousGridPos.x && nz === previousGridPos.z;
        const arrowMat = isBackwards ? redArrowMat : yellowArrowMat;
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.copy(d.pos);
        arrow.rotation.z = d.rotZ;
        landmarksGroup.add(arrow);
    }
}
    }
    return available;
}


function createSteeringWheel() {
    const wheelGroup = new THREE.Group();
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.1 });
    const gloveMatLeft  = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.8 });
    const gloveMatRight = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6 });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 16, 60), wheelMat);
    wheelGroup.add(wheel);
    const createGlove = (hand = 'left', gloveMat = gloveMatRight) => {
        const gloveGroup = new THREE.Group();
        const palm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), gloveMat);
        palm.scale.set(1, 1.2, 1); gloveGroup.add(palm);
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), gloveMat);
        thumb.position.set((hand === 'left') ? 0.15 : -0.15, 0.1, 0); gloveGroup.add(thumb);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16), cuffMat);
        cuff.position.y = -0.15; gloveGroup.add(cuff);
        return gloveGroup;
    };
    const leftHand = createGlove('left', gloveMatLeft); leftHand.position.set(-0.45, 0.1, 0); leftHand.rotation.z = 0.5; wheelGroup.add(leftHand);
    const rightHand = createGlove('right', gloveMatRight); rightHand.position.set(0.45, 0.1, 0); rightHand.rotation.z = -0.5; wheelGroup.add(rightHand);
    wheelGroup.position.set(0, -1.2, -2); wheelGroup.rotation.x = -0.5;
    return wheelGroup;
}

function createStarField(){
    const starCount = 4500; const radius = 500; const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; ) {
        const u=Math.random(), v=Math.random(), theta=2*Math.PI*u, phi=Math.acos(2*v-1);
        const y = Math.cos(phi); if(y < 0.02) continue;
        positions[i++] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i++] = radius * y;
        positions[i++] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ size: 2.0, sizeAttenuation: true, color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    starField = new THREE.Points(geo, mat); starField.frustumCulled = false; starField.renderOrder = 0;
    scene.add(starField);
}
function getCssColor(variableName, fallbackColor) {
    const value = getComputedStyle(document.body).getPropertyValue(variableName).trim();
    return new THREE.Color(value || fallbackColor);
}

function configureRepeatingTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    return texture;
}

function loadRepeatingTexture(url) {
    const loader = new THREE.TextureLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (texture) => {
            configureRepeatingTexture(texture);
            resolve(texture);
        }, undefined, reject);
    });
}

function requestDefaultFloorTexture() {
    if (!defaultFloorTexturePromise) {
        defaultFloorTexturePromise = loadRepeatingTexture(DEFAULT_FLOOR_TEXTURE_URL).catch((webpError) => {
            console.warn(`Texture failed to load: ${DEFAULT_FLOOR_TEXTURE_URL}`, webpError);
            return loadRepeatingTexture(FALLBACK_FLOOR_TEXTURE_URL);
        });
    }
    return defaultFloorTexturePromise;
}

function applyTextureToMaterial(texture, material) {
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
    updateTextureScales();
}

function loadTextureIntoMaterial(url, material, { onErrorColor = null, texturePromise = null } = {}) {
    const pendingTexture = texturePromise || loadRepeatingTexture(url);
    pendingTexture
        .then((texture) => applyTextureToMaterial(texture, material))
        .catch((error) => {
            console.warn(`Texture failed to load: ${url}`, error);
            material.map = null;
            if (onErrorColor !== null) material.color.set(onErrorColor);
            material.needsUpdate = true;
        });
}

function createSatinMetalMaterial(color, options = {}) {
    const materialConfig = {
        color,
        metalness: options.metalness ?? 0.46,
        roughness: options.roughness ?? 0.28,
        clearcoat: options.clearcoat ?? 0.28,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.18,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        side: options.side ?? THREE.FrontSide
    };

    if (options.map) materialConfig.map = options.map;
    if (options.envMapIntensity !== undefined) materialConfig.envMapIntensity = options.envMapIntensity;

    return new THREE.MeshPhysicalMaterial(materialConfig);
}

function createClassicalLamp() {
    const group = new THREE.Group();
    const postMat = createSatinMetalMaterial(0x2f3741, { metalness: 0.62, roughness: 0.22, clearcoat: 0.38 });
    const trimMat = createSatinMetalMaterial(0xb8893a, { metalness: 0.58, roughness: 0.24, clearcoat: 0.32 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.48, 0.22, 10), trimMat);
    base.position.y = 0.11; group.add(base);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 3.5, 10), postMat);
    post.position.y = 1.86; group.add(post);
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.95), postMat);
    holder.position.set(0, 3.58, 0.35); group.add(holder);
    const bulbColor = 0xffd98a;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: bulbColor }));
    bulb.position.set(0, 3.6, 0.35); group.add(bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshBasicMaterial({ color: bulbColor, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.position.copy(bulb.position); group.add(glow);
    const light = new THREE.PointLight(bulbColor, 0, TILE_SIZE * 2.1, 1.45);
    light.name = 'lampLight'; light.position.copy(bulb.position); group.add(light);
    return group;
}

function createMetalBollard(color = 0x8f99a8) {
    const group = new THREE.Group();
    const bodyMat = createSatinMetalMaterial(color, { metalness: 0.54, roughness: 0.26, clearcoat: 0.34 });
    const capMat = createSatinMetalMaterial(0xd5b46a, { metalness: 0.6, roughness: 0.22, clearcoat: 0.36 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 14), bodyMat);
    post.position.y = 0.45; group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8), capMat);
    cap.position.y = 0.94; group.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 14), capMat);
    base.position.y = 0.06; group.add(base);
    return group;
}

function addSceneryObject(object, x, y, z, rotationY = 0) {
    object.position.set(x, y, z);
    object.rotation.y = rotationY;
    sceneryGroup.add(object);
    const light = object.getObjectByName('lampLight');
    if (light) activeLampLights.push(light);
}

function placeRoadsideObjects(grid) {
    const gridHeight = grid.length; const gridWidth = grid[0].length;
    const cellCount = gridWidth * gridHeight;
    const pathCells = grid.reduce((total, row) => total + row.filter(cell => cell === 1).length, 0);
    const maxDecorations = cellCount > 900 ? 28 : cellCount > 500 ? 44 : 72;
    const maxLamps = cellCount > 900 ? 8 : cellCount > 500 ? 14 : 24;
    const spacing = cellCount > 900 ? 11 : cellCount > 500 ? 8 : 5;
    const shouldDecorate = pathCells > 0;
    let decorationCount = 0;
    let lampCount = 0;
    const directionColors = {
        north: 0x0e8f92,
        south: 0x3f5fa8,
        east: 0xc89b3c,
        west: 0xb35b6a
    };
    for (let z = 0; z < gridHeight; z++) {
        for (let x = 0; x < gridWidth; x++) {
            if (grid[z][x] === 0) continue;
            if (!shouldDecorate || decorationCount >= maxDecorations) continue;
            const worldPos = gridToWorld(x, z, grid);
            const seed = x * 13 + z * 17;
            const preferLamp = lampCount < maxLamps && seed % spacing === 0;
            const preferBollard = seed % Math.max(3, spacing - 2) === 0;
            if (z > 0 && grid[z-1][x]===0 && preferLamp) {
                addSceneryObject(createClassicalLamp(), worldPos.x, 0, worldPos.z - TILE_SIZE * 0.45, 0);
                lampCount++; decorationCount++;
            } else if (z > 0 && grid[z-1][x]===0 && preferBollard) {
                addSceneryObject(createMetalBollard(directionColors.north), worldPos.x, 0, worldPos.z - TILE_SIZE * 0.42, 0);
                decorationCount++;
            }
            if (decorationCount >= maxDecorations) continue;
            if (z < gridHeight-1 && grid[z+1][x]===0 && preferLamp && seed % 2 === 0) {
                addSceneryObject(createClassicalLamp(), worldPos.x, 0, worldPos.z + TILE_SIZE * 0.45, Math.PI);
                lampCount++; decorationCount++;
            } else if (z < gridHeight-1 && grid[z+1][x]===0 && preferBollard && seed%7===0) {
                addSceneryObject(createMetalBollard(directionColors.south), worldPos.x, 0, worldPos.z + TILE_SIZE * 0.42, Math.PI);
                decorationCount++;
            }
            if (decorationCount >= maxDecorations) continue;
            if (x > 0 && grid[z][x-1]===0 && preferLamp && seed % 3 === 0) {
                addSceneryObject(createClassicalLamp(), worldPos.x - TILE_SIZE * 0.45, 0, worldPos.z, Math.PI/2);
                lampCount++; decorationCount++;
            } else if (x > 0 && grid[z][x-1]===0 && preferBollard && seed%6===0) {
                addSceneryObject(createMetalBollard(directionColors.west), worldPos.x - TILE_SIZE * 0.42, 0, worldPos.z, Math.PI/2);
                decorationCount++;
            }
            if (decorationCount >= maxDecorations) continue;
            if (x < gridWidth-1 && grid[z][x+1]===0 && preferLamp && seed % 5 === 0) {
                addSceneryObject(createClassicalLamp(), worldPos.x + TILE_SIZE * 0.45, 0, worldPos.z, -Math.PI/2);
                lampCount++; decorationCount++;
            } else if (x < gridWidth-1 && grid[z][x+1]===0 && preferBollard && seed%8===0) {
                addSceneryObject(createMetalBollard(directionColors.east), worldPos.x + TILE_SIZE * 0.42, 0, worldPos.z, -Math.PI/2);
                decorationCount++;
            }
        }
    }
}

function createMaterials() {
    const wallOptions = { metalness: 0.48, roughness: 0.25, clearcoat: 0.34, clearcoatRoughness: 0.16, side: THREE.DoubleSide };
    wallMaterialN = createSatinMetalMaterial(getCssColor('--wall-color-n', '#0e8f92'), wallOptions);
    wallMaterialS = createSatinMetalMaterial(getCssColor('--wall-color-s', '#3f5fa8'), wallOptions);
    wallMaterialE = createSatinMetalMaterial(getCssColor('--wall-color-e', '#c89b3c'), wallOptions);
    wallMaterialW = createSatinMetalMaterial(getCssColor('--wall-color-w', '#b35b6a'), wallOptions);

    floorMaterial = createSatinMetalMaterial(0xf1d6dc, {
        metalness: 0.28,
        roughness: 0.34,
        clearcoat: 0.28,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.58
    });
    loadTextureIntoMaterial(DEFAULT_FLOOR_TEXTURE_URL, floorMaterial, {
        onErrorColor: 0xf1d6dc,
        texturePromise: requestDefaultFloorTexture()
    });

    landmarkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(getComputedStyle(document.body).getPropertyValue('--landmark-color').trim()), transparent: true, blending: THREE.AdditiveBlending });
    
    goalWallMaterial = createSatinMetalMaterial(0xd64a3a, {
        roughness: 0.24,
        metalness: 0.42,
        clearcoat: 0.35,
        clearcoatRoughness: 0.16,
        emissive: 0x3a0906,
        emissiveIntensity: 0.1,
        side: THREE.DoubleSide
    });
}

// ====================================================================
// 小地图 (Minimap)
// ====================================================================

// NEW: Minimap orientation mode helpers (v10.1)
function saveMinimapOrientationMode() {
    try { localStorage.setItem('minimap_orientation_mode_v1', minimapOrientationMode); } catch (e) {}
}

function updateMinimapOrientationButton() {
    const btn = document.getElementById('minimap-orientation-btn');
    if (!btn) return;

    const isHeadingUp = minimapOrientationMode === 'HEADING_UP';
    btn.classList.toggle('active', isHeadingUp);

    // Button label: N (north-up) / 🚗 (heading-up)
    btn.textContent = isHeadingUp ? '🚗' : 'N';

    if (currentLanguage === 'zh') {
        btn.title = isHeadingUp
            ? '小地图：跟随车头（点击切换为北向固定）'
            : '小地图：北向固定（点击切换为跟随车头）';
    } else {
        btn.title = isHeadingUp
            ? 'Minimap: Heading-Up (click to switch to North-Up)'
            : 'Minimap: North-Up (click to switch to Heading-Up)';
    }
}

function toggleMinimapOrientationMode() {
    minimapOrientationMode = (minimapOrientationMode === 'HEADING_UP') ? 'NORTH_UP' : 'HEADING_UP';
    saveMinimapOrientationMode();
    updateMinimapOrientationButton();
    // Redraw immediately
    updateMinimapPlayer();
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x, y;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawMinimapBackground(ctx, canvas, grid, start, goal, waypoints, freeWaypoints, highlightFloors, nextWaypoint, touchedFreeWaypoints, touchedHighlightFloors) {
    canvas.width = 500; canvas.height = 500;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellWidth = canvas.width / grid[0].length;
    const cellHeight = canvas.height / grid.length;
    for (let z = 0; z < grid.length; z++) {
        for (let x = 0; x < grid[0].length; x++) {
            ctx.fillStyle = grid[z][x] === 0 ? "#444" : "#ddd";
            ctx.fillRect(x * cellWidth, z * cellHeight, cellWidth, cellHeight);
        }
    }
    if (highlightFloors) {
        highlightFloors.forEach(hf => {
            const floorKey = `${hf.x},${hf.z}`;
            ctx.fillStyle = touchedHighlightFloors.has(floorKey) 
                ? getComputedStyle(document.body).getPropertyValue('--start-color') // Blue
                : '#ffc107'; // Golden yellow
            ctx.fillRect(hf.x * cellWidth, hf.z * cellHeight, cellWidth, cellHeight);
        });
    }
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--start-color');
    ctx.fillRect(start.x * cellWidth, start.z * cellHeight, cellWidth, cellHeight);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--goal-color');
    ctx.fillRect(goal.x * cellWidth, goal.z * cellHeight, cellWidth, cellHeight);
    if (waypoints) {
        waypoints.forEach((wp, index) => {
            // Determine if visited based on the next required waypoint index
            const isVisited = (index < nextWaypoint - 1);
            const cx = (wp.x + 0.5) * cellWidth;
            const cy = (wp.z + 0.5) * cellHeight;
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 2;
            if (isVisited) {
                // Draw Star for visited waypoints (v10.0 Fix)
                ctx.fillStyle = '#FFD700'; // Gold color
                drawStar(ctx, cx, cy, 5, cellWidth / 2.5, cellWidth / 5);
            } else {
                // Draw Diamond for upcoming waypoints
                ctx.fillStyle = wp.color;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-cellWidth / 3, -cellHeight / 3, cellWidth * 2 / 3, cellHeight * 2 / 3);
                ctx.strokeRect(-cellWidth / 3, -cellHeight / 3, cellWidth * 2 / 3, cellHeight * 2 / 3);
                ctx.restore();
                // Draw waypoint number only for unvisited waypoints
                ctx.fillStyle = 'white';
                ctx.font = `bold ${cellHeight * 0.5}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 4;
                ctx.fillText(index + 1, cx, cy);
                ctx.shadowBlur = 0;
            }
        });
    }
    if (freeWaypoints) {
        freeWaypoints.forEach((wp, index) => {
            const waypointKey = `${index}:${wp.x},${wp.z}`;
            const isVisited = touchedFreeWaypoints.has(waypointKey);
            const cx = (wp.x + 0.5) * cellWidth;
            const cy = (wp.z + 0.5) * cellHeight;
            const radius = Math.min(cellWidth, cellHeight) * 0.34;
            ctx.save();
            ctx.fillStyle = isVisited ? '#a7f3d0' : '#00c2ff';
            ctx.strokeStyle = isVisited ? '#047857' : '#0f172a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = isVisited ? '#047857' : '#ffffff';
            ctx.font = `bold ${cellHeight * 0.45}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', cx, cy + cellHeight * 0.02);
            ctx.restore();
        });
    }
}

function drawMinimapPlayerArrow(ctx, playerX, playerZ, rotationRad, cellWidth, cellHeight) {
    ctx.save();
    ctx.translate(playerX, playerZ);
    ctx.rotate(rotationRad);

    const size = Math.min(cellWidth, cellHeight) * 1.2;
    const grad = ctx.createRadialGradient(0,0,0,0,0,size*0.5);
    grad.addColorStop(0, '#ff8080');
    grad.addColorStop(1, '#c00000');

    // Triangle points to +X by default
    ctx.beginPath();
    ctx.moveTo(size*0.5, 0);
    ctx.lineTo(-size*0.4, -size*0.3);
    ctx.lineTo(-size*0.4,  size*0.3);
    ctx.closePath();

    // Fill
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(255,0,0,0.9)';
    ctx.shadowBlur = size*0.7;
    ctx.fill();

    // Outline edges (keep original style)
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const ax = size * 0.5,  ay = 0;
    const bx = -size * 0.4, by = -size * 0.3;
    const cx = -size * 0.4, cy =  size * 0.3;

    // Bottom edge (B->C): dark green
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.strokeStyle = '#006400';
    ctx.stroke();

    // Side edge (A->B): yellow
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#FFD700';
    ctx.stroke();

    // Side edge (A->C): white
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    ctx.restore();
}

function ensureMinimapBackground(level) {
    if (!minimapBgCanvas || !minimapBgCtx) return false;
    if (minimapBgDirty || minimapBgCanvas.width !== 500 || minimapBgCanvas.height !== 500) {
        drawMinimapBackground(
            minimapBgCtx,
            minimapBgCanvas,
            level.grid,
            level.start,
            level.goal,
            level.waypoints,
            currentLevelState.isWaypointMode ? level.freeWaypoints : [],
            level.highlightFloors,
            currentLevelState.nextWaypoint,
            currentLevelState.touchedFreeWaypoints,
            currentLevelState.touchedHighlightFloors
        );
        minimapBgDirty = false;
    }
    return true;
}

function updateMinimapPlayer() {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    if (!level || !level.grid) return;
    const minimapContainer = document.getElementById('minimap-container');
    if (minimapContainer && getComputedStyle(minimapContainer).display === 'none') return;

    const { grid, start, goal, waypoints, freeWaypoints, highlightFloors } = level;

    // Player data
    const gridPos = worldToGrid(player.position);

    // Heading angle in minimap (x right, z down)
    const dirVec = new THREE.Vector3(0,0,-1).applyEuler(player.rotation);
    const headingAngle = Math.atan2(dirVec.z, dirVec.x);

    // Canvas sizing
    if (minimap.width !== 500) minimap.width = 500;
    if (minimap.height !== 500) minimap.height = 500;

    const ctx = minimapCtx;
    const cellWidth = ctx.canvas.width / grid[0].length;
    const cellHeight = ctx.canvas.height / grid.length;
    const playerX = (gridPos.x + 0.5) * cellWidth;
    const playerZ = (gridPos.z + 0.5) * cellHeight;
    const renderKey = [
        currentLevelIndex,
        gridPos.x,
        gridPos.z,
        player.rotation.y.toFixed(3),
        minimapOrientationMode,
        currentLevelState.nextWaypoint,
        currentLevelState.touchedFreeWaypoints.size,
        currentLevelState.touchedHighlightFloors.size,
        minimap.width,
        minimap.height
    ].join('|');
    if (!minimapBgDirty && renderKey === lastMinimapRenderKey) return;
    const hasCachedBackground = ensureMinimapBackground(level);

    if (minimapOrientationMode === 'NORTH_UP') {
        // 1) North-Up (original behavior): map fixed, arrow rotates
        if (hasCachedBackground) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(minimapBgCanvas, 0, 0);
        } else {
            drawMinimapBackground(ctx, minimap, grid, start, goal, waypoints, currentLevelState.isWaypointMode ? freeWaypoints : [], highlightFloors, currentLevelState.nextWaypoint, currentLevelState.touchedFreeWaypoints, currentLevelState.touchedHighlightFloors);
        }
        drawMinimapPlayerArrow(ctx, playerX, playerZ, headingAngle, cellWidth, cellHeight);
        lastMinimapRenderKey = renderKey;
        return;
    }

    // 2) Heading-Up: rotate the whole minimap so the car heading is "up"
    if (!hasCachedBackground) {
        // Fallback
        drawMinimapBackground(ctx, minimap, grid, start, goal, waypoints, currentLevelState.isWaypointMode ? freeWaypoints : [], highlightFloors, currentLevelState.nextWaypoint, currentLevelState.touchedFreeWaypoints, currentLevelState.touchedHighlightFloors);
        drawMinimapPlayerArrow(ctx, playerX, playerZ, headingAngle, cellWidth, cellHeight);
        lastMinimapRenderKey = renderKey;
        return;
    }

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const desiredArrowAngle = -Math.PI / 2; // Up on canvas
    const rotateMapBy = desiredArrowAngle - headingAngle;

    // Keep the player visually centered while the map rotates around them.
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotateMapBy);
    ctx.translate(-playerX, -playerZ);
    ctx.drawImage(minimapBgCanvas, 0, 0);
    ctx.restore();

    // Draw player arrow fixed to "up" at the center of the minimap.
    drawMinimapPlayerArrow(ctx, centerX, centerY, desiredArrowAngle, cellWidth, cellHeight);
    lastMinimapRenderKey = renderKey;
}



// ====================================================================
// 菜单与UI逻辑 (Menu & UI Logic)
// ====================================================================

function showFreeModeLevelSelect() {
    const modal = document.getElementById('free-mode-level-select-modal');
    const grid = document.getElementById('free-mode-level-select-grid');
    grid.innerHTML = '';

    for (let i = 0; i < levels.length; i++) {
        const button = document.createElement('button');
        button.textContent = i + 1;
        button.onclick = () => {
            modal.style.display = 'none';
            loadLevel(i);
        };
        grid.appendChild(button);
    }
    document.getElementById('main-menu-modal').style.display = 'none';
    modal.style.display = 'flex';
}

function showIngameHint(messageKey = 'hint_ingame_controls') {
    const hintEl = document.getElementById('ingame-hint');
    if (isPortraitTouchScreen()) {
        clearTimeout(hintTimeout);
        hintEl.style.display = 'none';
        return;
    }
    hintEl.textContent = translations[currentLanguage][messageKey];
    hintEl.style.display = 'block'; hintEl.style.opacity = 1;
    clearTimeout(hintTimeout);
    hintTimeout = setTimeout(() => {
        hintEl.style.opacity = 0;
        setTimeout(() => { hintEl.style.display = 'none'; }, 500);
    }, 8000);
}

function updateHUD() {
    const waypointHudEl = document.getElementById('waypoint-hud');
    if (currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints) {
        waypointHudEl.style.display = 'block';
        waypointHudEl.textContent = translations[currentLanguage].waypoint_hud(currentLevelState.nextWaypoint, currentLevelState.totalWaypoints);
    } else {
        waypointHudEl.style.display = 'none';
    }
}

function updateUIText() {
    document.querySelectorAll('[data-lang-zh]').forEach(el => {
        const key = currentLanguage === 'zh' ? 'langZh' : 'langEn';
        // Handle alt text for save button
        if (el.id === 'editor-save-btn' && el.dataset.langZhAlt) {
            const altKey = currentLanguage === 'zh' ? 'langZhAlt' : 'langEnAlt';
            el.textContent = (currentEditorMode === 'custom') ? el.dataset[key] : el.dataset[altKey];
        } else {
            el.textContent = el.dataset[key];
        }
    });
     document.querySelectorAll('select').forEach(select => {
        select.querySelectorAll('option').forEach(option => {
            const key = currentLanguage === 'zh' ? 'langZh' : 'langEn';
            if (option.dataset[key]) option.textContent = option.dataset[key];
        });
    });
    document.querySelectorAll('[data-lang-placeholder-zh]').forEach(el => {
        el.placeholder = el.dataset[currentLanguage === 'zh' ? 'langPlaceholderZh' : 'langPlaceholderEn'];
    });
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) welcomeMsg.textContent = translations[currentLanguage].welcome(playerInfo.nickname);
    if (gameState === 'AT_INTERSECTION') checkForTurns();
    if (document.getElementById('ingame-hint').style.display !== 'none') showIngameHint();
    updateMinimapOrientationButton();
    updateHUD();
}

function togglePauseMenu() {
    const menu = document.getElementById('pause-menu-modal');
    const isPaused = menu.style.display === 'flex';
    if (isPaused) {
        menu.style.display = 'none';
        gameState = previousGameState;
    } else if (['AT_INTERSECTION', 'DRIVING', 'TURNING', 'BIG_MAP'].includes(gameState)) {
        previousGameState = gameState;
        gameState = 'PAUSED';
        menu.style.display = 'flex';
    }
    syncMobileDriveControls();
}

function showLevelSelectModal() {
    const grid = document.getElementById('level-select-grid');
    grid.innerHTML = '';
    for (let i = 0; i < levels.length; i++) {
        const button = document.createElement('button');
        button.textContent = i + 1;
        button.onclick = () => {
            document.getElementById('level-select-modal').style.display = 'none';
            togglePauseMenu();
            loadLevel(i);
        };
        grid.appendChild(button);
    }
    document.getElementById('pause-menu-modal').style.display = 'none';
    document.getElementById('level-select-modal').style.display = 'flex';
}

function resetGame() {
    playerInfo = { nickname: 'Driver', gender: 'other' };
    document.getElementById('nickname-input').value = '';
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    document.getElementById('startup-modal').style.display = 'flex';
    gameState = 'STARTUP_MODAL';
    updateUIText();
}

// ====================================================================
// 地图编辑器 (Map Editor) & Custom Maps
// ====================================================================

let editorState = {
    gridData: [], start: {}, goal: {}, waypoints: [], freeWaypoints: [], highlightFloors: [],
    isWaypointMode: false, currentTool: 'wall', isDrawing: false
};
let selectedCustomMapIndex = 0;
const EDITOR_SIZE = 17;
const MAX_CUSTOM_LEVELS = 15;

function loadCustomLevels() {
    try {
        const savedLevels = localStorage.getItem('customMazeLevels_v2');
        customLevels = savedLevels ? JSON.parse(savedLevels) : new Array(MAX_CUSTOM_LEVELS).fill(null);
    } catch (e) {
        console.error("Failed to load custom levels:", e);
        customLevels = new Array(MAX_CUSTOM_LEVELS).fill(null);
    }
}

function saveCustomLevels() {
    localStorage.setItem('customMazeLevels_v2', JSON.stringify(customLevels));
}

function showEditor(slotIndex = 0) {
    document.getElementById('main-menu-modal').style.display = 'none';
    document.getElementById('custom-maps-modal').style.display = 'none';
    document.getElementById('editor-modal').style.display = 'flex';
    initEditor(slotIndex);
}

function initEditor(slotIndex = 0) {
    currentEditorMode = 'custom';
    const grid = document.getElementById('editor-grid');
    const slotSelect = document.getElementById('editor-slot-select');
    const builtinLevelSelect = document.getElementById('editor-builtin-level-select');
    
    slotSelect.innerHTML = '';
    for (let i = 0; i < MAX_CUSTOM_LEVELS; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${translations[currentLanguage].map_slot} ${i+1}` + (customLevels[i] ? '' : ` (${translations[currentLanguage].empty_slot})`);
        slotSelect.appendChild(option);
    }
    slotSelect.value = slotIndex;
    slotSelect.onchange = () => loadEditorGrid(parseInt(slotSelect.value), 'custom');

    builtinLevelSelect.innerHTML = '';
    levels.forEach((_, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${translations[currentLanguage].level} ${index+1}`;
        builtinLevelSelect.appendChild(option);
    });
    builtinLevelSelect.onchange = () => loadEditorGrid(parseInt(builtinLevelSelect.value), 'builtin');

    const setEditorMode = (mode) => {
        currentEditorMode = mode;
        const isCustom = mode === 'custom';
        document.getElementById('editor-mode-custom-btn').classList.toggle('selected', isCustom);
        document.getElementById('editor-mode-builtin-btn').classList.toggle('selected', !isCustom);
        slotSelect.style.display = isCustom ? 'block' : 'none';
        builtinLevelSelect.style.display = isCustom ? 'none' : 'block';
        document.getElementById('editor-delete-btn').disabled = !isCustom;
        updateUIText(); // Update save button text
        loadEditorGrid(parseInt(isCustom ? slotSelect.value : builtinLevelSelect.value), mode);
    };

    document.getElementById('editor-mode-custom-btn').onclick = () => setEditorMode('custom');
    document.getElementById('editor-mode-builtin-btn').onclick = () => setEditorMode('builtin');
    
    grid.oncontextmenu = (e) => {
        e.preventDefault();
        if (editorState.currentTool === 'waypoint' && editorState.waypoints.length > 0) {
            editorState.waypoints.pop();
            redrawEditorGrid();
        } else if (editorState.currentTool === 'free-waypoint' && editorState.freeWaypoints.length > 0) {
            editorState.freeWaypoints.pop();
            redrawEditorGrid();
        }
    };
    const stopDrawing = () => { editorState.isDrawing = false; };
    grid.onpointerdown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        editorState.isDrawing = true;
        grid.setPointerCapture?.(e.pointerId);
        handleGridInteraction(e, true);
        e.preventDefault();
    };
    grid.onpointermove = (e) => handleGridInteraction(e);
    grid.onpointerup = (e) => {
        if (grid.hasPointerCapture?.(e.pointerId)) {
            grid.releasePointerCapture(e.pointerId);
        }
        stopDrawing();
    };
    grid.onpointercancel = stopDrawing;
    document.onpointerup = stopDrawing;

    document.getElementById('editor-tools').onclick = (e) => {
        if (e.target.tagName === 'BUTTON') {
            editorState.currentTool = e.target.dataset.tool;
            document.querySelectorAll('#editor-tools button').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    };
    
    document.getElementById('editor-save-btn').onclick = saveCustomMap;
    document.getElementById('editor-delete-btn').onclick = deleteCustomMap;
    document.getElementById('editor-back-btn').onclick = () => {
        document.getElementById('editor-modal').style.display = 'none'; showMainMenu();
    };
    setEditorMode('custom');
}

function loadEditorGrid(index, mode) {
    const levelToLoad = (mode === 'custom') ? customLevels[index] : levels[index];
    editorState = {
        gridData: [], start: {}, goal: {}, waypoints: [], freeWaypoints: [], highlightFloors: [],
        isWaypointMode: false, currentTool: 'wall', isDrawing: false
    };
    document.querySelectorAll('#editor-tools button').forEach(b=>b.classList.remove('selected'));
    document.getElementById('tool-wall').classList.add('selected');

    let sourceGrid, sourceStart, sourceGoal, sourceWidth, sourceHeight;
    if (levelToLoad) {
        sourceGrid = levelToLoad.grid;
        sourceStart = levelToLoad.start;
        sourceGoal = levelToLoad.goal;
        sourceWidth = sourceGrid[0].length;
        sourceHeight = sourceGrid.length;
        editorState.isWaypointMode = levelToLoad.isWaypointMode || false;
        editorState.waypoints = levelToLoad.waypoints ? JSON.parse(JSON.stringify(levelToLoad.waypoints)) : [];
        editorState.freeWaypoints = levelToLoad.freeWaypoints ? JSON.parse(JSON.stringify(levelToLoad.freeWaypoints)) : [];
        editorState.highlightFloors = levelToLoad.highlightFloors ? JSON.parse(JSON.stringify(levelToLoad.highlightFloors)) : [];
    } else {
        sourceWidth = sourceHeight = EDITOR_SIZE;
    }

    document.getElementById('editor-waypoint-mode-toggle').checked = editorState.isWaypointMode;

    const xOffset = Math.floor((EDITOR_SIZE - sourceWidth) / 2);
    const zOffset = Math.floor((EDITOR_SIZE - sourceHeight) / 2);

    for (let z = 0; z < EDITOR_SIZE; z++) {
        const row = [];
        for (let x = 0; x < EDITOR_SIZE; x++) {
            let cellType = 1; // 1=wall, 0=path
            const srcZ = z - zOffset, srcX = x - xOffset;

            if (sourceGrid && srcZ >= 0 && srcZ < sourceHeight && srcX >= 0 && srcX < sourceWidth) {
                cellType = sourceGrid[srcZ][srcX] === 1 ? 0 : 1;
                if (sourceStart.x === srcX && sourceStart.z === srcZ) editorState.start = {x, z};
                if (sourceGoal.x === srcX && sourceGoal.z === srcZ) editorState.goal = {x, z};
            } else if (!levelToLoad && mode === 'custom') {
                 cellType = (x===0||x===EDITOR_SIZE-1||z===0||z===EDITOR_SIZE-1) ? 1 : 0;
            }
            row.push(cellType);
        }
        editorState.gridData.push(row);
    }
    redrawEditorGrid();
}

function redrawEditorGrid() {
    const grid = document.getElementById('editor-grid');
    grid.innerHTML = '';
    for(let z=0; z < EDITOR_SIZE; z++) {
        for(let x=0; x < EDITOR_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('editor-cell');
            cell.dataset.x = x; cell.dataset.z = z;
            
            if (editorState.start.x === x && editorState.start.z === z) cell.classList.add('start');
            else if (editorState.goal.x === x && editorState.goal.z === z) cell.classList.add('goal');
            else if (editorState.highlightFloors.some(hf => hf.x===x && hf.z===z)) cell.classList.add('highlight-floor');
            else cell.classList.toggle('wall', editorState.gridData[z][x] === 1);

            const waypoint = editorState.waypoints.find(wp => wp.x === x && wp.z === z);
            if (waypoint) {
                const marker = document.createElement('div');
                marker.className = 'waypoint-marker';
                marker.style.backgroundColor = waypoint.color;
                marker.textContent = editorState.waypoints.indexOf(waypoint) + 1;
                cell.appendChild(marker);
            }
            const freeWaypoint = editorState.freeWaypoints.find(wp => wp.x === x && wp.z === z);
            if (freeWaypoint) {
                const marker = document.createElement('div');
                marker.className = 'free-waypoint-marker';
                marker.textContent = '★';
                cell.appendChild(marker);
            }
            grid.appendChild(cell);
        }
    }
}

function handleGridInteraction(e, force = false) {
    if (!editorState.isDrawing && !force) return;
    if (!force && e.pointerType === 'mouse' && e.buttons !== 1) return;

    const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
    const cell = elementAtPoint?.closest?.('.editor-cell') || e.target.closest?.('.editor-cell');
    if (!cell) return;
    const x = parseInt(cell.dataset.x), z = parseInt(cell.dataset.z);
    const isStart = editorState.start.x === x && editorState.start.z === z;
    const isGoal = editorState.goal.x === x && editorState.goal.z === z;

    if ((editorState.currentTool === 'waypoint' || editorState.currentTool === 'free-waypoint') && (isStart || isGoal)) {
        showEditorMessage(translations[currentLanguage].editor_waypoint_on_special);
        return;
    }
    if (editorState.currentTool === 'highlight-floor' && (isStart || isGoal)) return;

    // Clear special status before applying new tool
    if (isStart) editorState.start = {};
    if (isGoal) editorState.goal = {};
    editorState.waypoints = editorState.waypoints.filter(wp => wp.x !== x || wp.z !== z);
    editorState.freeWaypoints = editorState.freeWaypoints.filter(wp => wp.x !== x || wp.z !== z);
    editorState.highlightFloors = editorState.highlightFloors.filter(hf => hf.x !== x || hf.z !== z);
    
    // Clear old start/goal if placing a new one
    if (editorState.currentTool === 'start' && editorState.start.x !== undefined) editorState.gridData[editorState.start.z][editorState.start.x] = 0;
    if (editorState.currentTool === 'goal' && editorState.goal.x !== undefined) editorState.gridData[editorState.goal.z][editorState.goal.x] = 0;

    switch (editorState.currentTool) {
        case 'wall': editorState.gridData[z][x] = 1; break;
        case 'path': editorState.gridData[z][x] = 0; break;
        case 'start': editorState.gridData[z][x] = 0; editorState.start = { x, z }; editorState.isDrawing = false; break;
        case 'goal': editorState.gridData[z][x] = 0; editorState.goal = { x, z }; editorState.isDrawing = false; break;
        case 'waypoint':
            if (isStart || isGoal) { showEditorMessage(translations[currentLanguage].editor_waypoint_on_special); break; }
            editorState.gridData[z][x] = 0;
            editorState.isWaypointMode = true;
            document.getElementById('editor-waypoint-mode-toggle').checked = true;
            editorState.waypoints.push({x, z, color: document.getElementById('editor-waypoint-color').value });
            editorState.isDrawing = false;
            break;
        case 'free-waypoint':
            if (isStart || isGoal) { showEditorMessage(translations[currentLanguage].editor_waypoint_on_special); break; }
            editorState.gridData[z][x] = 0;
            editorState.isWaypointMode = true;
            document.getElementById('editor-waypoint-mode-toggle').checked = true;
            editorState.freeWaypoints.push({x, z});
            editorState.isDrawing = false;
            break;
        case 'highlight-floor':
            if (isStart || isGoal) break; // Cannot be on start/goal
            editorState.gridData[z][x] = 0;
            editorState.highlightFloors.push({x, z});
            break;
    }
    redrawEditorGrid();
}

function showEditorMessage(text, isError = true) {
    const messageEl = document.getElementById('editor-message');
    messageEl.textContent = text;
    messageEl.style.color = isError ? 'red' : 'green';
    setTimeout(() => { messageEl.textContent = ''; }, 2500);
}

function saveCustomMap() {
    const { start, goal, gridData, waypoints, freeWaypoints, highlightFloors } = editorState;
    if (!start.hasOwnProperty('x')) { showEditorMessage(translations[currentLanguage].editor_need_start); return; }
    if (!goal.hasOwnProperty('x')) { showEditorMessage(translations[currentLanguage].editor_need_goal); return; }
    
    const mazeDataForSolver = gridData.map(row => row.map(cell => cell === 1 ? 0 : 1));
    
    let slotIndex;
    if (currentEditorMode === 'custom') {
         slotIndex = parseInt(document.getElementById('editor-slot-select').value);
    } else {
        slotIndex = customLevels.findIndex(slot => slot === null);
        if (slotIndex === -1) { showEditorMessage(translations[currentLanguage].editor_slots_full); return; }
    }
    
    const newLevel = {
        grid: mazeDataForSolver,
        start: { ...start, dir: 'S' }, // Default dir
        goal: { ...goal },
        isWaypointMode: document.getElementById('editor-waypoint-mode-toggle').checked,
        waypoints: waypoints,
        freeWaypoints: freeWaypoints,
        highlightFloors: highlightFloors
    };
    if (newLevel.start.x === 0) newLevel.start.dir = 'E'; else if (newLevel.start.x === EDITOR_SIZE - 1) newLevel.start.dir = 'W';
    else if (newLevel.start.z === 0) newLevel.start.dir = 'S'; else if (newLevel.start.z === EDITOR_SIZE - 1) newLevel.start.dir = 'N';

    customLevels[slotIndex] = newLevel;
    saveCustomLevels();
    
    document.getElementById('editor-slot-select').options[slotIndex].textContent = `${translations[currentLanguage].map_slot} ${slotIndex + 1}`;
    showEditorMessage(`${translations[currentLanguage].map_slot} ${slotIndex + 1} 已保存!`, false);
    if (currentEditorMode === 'builtin') {
        document.getElementById('editor-slot-select').value = slotIndex;
        document.getElementById('editor-mode-custom-btn').click();
    }
}

function deleteCustomMap() {
    const slotIndex = parseInt(document.getElementById('editor-slot-select').value);
    if (customLevels[slotIndex] && confirm(translations[currentLanguage].confirm_delete)) {
        customLevels[slotIndex] = null;
        saveCustomLevels();
        initEditor(slotIndex);
    }
}

function showCustomMapsModal() {
    document.getElementById('main-menu-modal').style.display = 'none';
    document.getElementById('custom-maps-modal').style.display = 'flex';
    const grid = document.getElementById('custom-maps-grid');
    grid.innerHTML = '';
    selectedCustomMapIndex = -1;
    ['custom-play-btn', 'custom-edit-btn', 'custom-delete-btn'].forEach(id => document.getElementById(id).disabled = true);

    customLevels.forEach((level, i) => {
        const button = document.createElement('button');
        button.dataset.index = i;
        if (level) {
            button.textContent = `${translations[currentLanguage].map_slot} ${i + 1}`;
        } else {
            button.textContent = `${i + 1} (${translations[currentLanguage].empty_slot})`;
            button.disabled = true;
        }
        grid.appendChild(button);
    });

    grid.onclick = (e) => {
        if (e.target.tagName === 'BUTTON' && !e.target.disabled) {
            document.querySelectorAll('#custom-maps-grid button').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedCustomMapIndex = parseInt(e.target.dataset.index);
            ['custom-play-btn', 'custom-edit-btn', 'custom-delete-btn'].forEach(id => document.getElementById(id).disabled = false);
        }
    };
    document.getElementById('custom-play-btn').onclick = () => {
        if(selectedCustomMapIndex !== -1) {
            document.getElementById('custom-maps-modal').style.display = 'none';
            loadLevel(customLevels[selectedCustomMapIndex]);
        }
    };
    document.getElementById('custom-edit-btn').onclick = () => { if(selectedCustomMapIndex !== -1) showEditor(selectedCustomMapIndex); };
    document.getElementById('custom-delete-btn').onclick = () => {
        if(selectedCustomMapIndex !== -1 && confirm(translations[currentLanguage].confirm_delete)) {
            customLevels[selectedCustomMapIndex] = null;
            saveCustomLevels();
            showCustomMapsModal();
        }
    };
    document.getElementById('custom-back-btn').onclick = () => {
        document.getElementById('custom-maps-modal').style.display = 'none';
        showMainMenu();
    };
}

// ====================================================================
// 启动 (Boot)
// ====================================================================
init();
