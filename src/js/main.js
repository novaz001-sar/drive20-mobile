import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { TILE_SIZE, WALL_HEIGHT, MOVE_SPEED, TURN_SPEED, LUCKY_CAT } from './constants.js';
import { translations } from './i18n.js';
import { levels } from './levels.js';

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
    touchedHighlightFloors: new Set()
};
let activeFireworks = [];

let targetPosition = new THREE.Vector3();
let targetRotation = new THREE.Euler();
let previousGameState = '';
let previousGridPos = null;

const keyState = { 'a': false, 'd': false, 'e': false, 'w': false, 'escape': false };
let keyDebounce = false;

let wallMaterialN, wallMaterialS, wallMaterialE, wallMaterialW, floorMaterial, landmarkMaterial, goalWallMaterial;
let hemisphereLight, dirLight;

let customLevels = [];
let luckyCatArm, luckyCatWrist, floatingHeart;
let helveticaFont = null;

let currentLanguage = 'zh';
let promptTimeout;
let hintTimeout;
let currentEditorMode = 'custom';

// Texture customization variables
let textureURLs = { floor: null, wallN: null, wallS: null, wallE: null, wallW: null };
let textureScales = { floor: 1, wall: 1 };

// ====================================================================
// 初始化函数 (Initialization)
// ====================================================================

async function init() {
    scene = new THREE.Scene();
    
function setupSkyBackground() {
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 128;
  skyCanvas.height = 512;
  const ctx = skyCanvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, skyCanvas.height);
  gradient.addColorStop(0, '#7dd3fc');
  gradient.addColorStop(0.38, '#bae6fd');
  gradient.addColorStop(0.72, '#dcfce7');
  gradient.addColorStop(1, '#fef3c7');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

  ctx.fillStyle = 'rgba(255, 214, 102, 0.9)';
  ctx.beginPath();
  ctx.arc(96, 86, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(14, 116, 144, 0.24)';
  ctx.beginPath();
  ctx.moveTo(0, 390);
  ctx.lineTo(22, 330);
  ctx.lineTo(48, 380);
  ctx.lineTo(76, 318);
  ctx.lineTo(112, 392);
  ctx.lineTo(128, 360);
  ctx.lineTo(128, 512);
  ctx.lineTo(0, 512);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(skyCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
}

    setupSkyBackground();
    scene.fog = new THREE.Fog(0xb7e4d8, TILE_SIZE * 10, TILE_SIZE * 34);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Initialize clear color based on fog, might be overwritten by setupSkyBackground
    if (scene.fog) {
         renderer.setClearColor(scene.fog.color, 1);
    }

    clock = new THREE.Clock();
    
    fontLoader = new FontLoader();
    try {
        const font = await fontLoader.loadAsync('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json');
        helveticaFont = font;
        console.log("Font loaded successfully.");
    } catch (error) {
        console.error("Could not load font for 3D text.", error);
    }

    hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x78c6a3, 2.4);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);

    dirLight = new THREE.DirectionalLight(0xfff1c2, 2.8);
    dirLight.position.set(-1, 1.75, 1).multiplyScalar(30);
    scene.add(dirLight);

    const softFillLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(softFillLight);

    player = new THREE.Object3D();
    scene.add(player);
    
    // Initialize Player Car Model for 3P view (v10.0)
    playerCarModel = createPlayerCarModel();
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

    createMaterials();
    loadCustomLevels();

    window.addEventListener('resize', onWindowResize, false);
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
    if (!minimapContainer.classList.contains('big-map') || gameState !== 'BIG_MAP') return;

    document.getElementById('big-map-view-modal').style.display = 'none';
    document.body.appendChild(minimapContainer);
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
    } else if (action === 'left') {
        targetRotation.y += Math.PI / 2;
        gameState = 'TURNING';
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
    controls.classList.toggle('visible', visible);
    controls.querySelectorAll('[data-action]').forEach(button => {
        const action = button.dataset.action;
        button.disabled = visible && action !== 'pause' && gameState !== 'AT_INTERSECTION';
    });
}

function setupUI() {
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
    const showMinimapBtn = document.getElementById('show-minimap-btn');

    // NEW: Minimap orientation toggle (inside minimap) (v10.1)
    const minimapOrientationBtn = document.getElementById('minimap-orientation-btn');
    if (minimapOrientationBtn) {
        minimapOrientationBtn.addEventListener('click', (e) => {
            // Prevent triggering minimap container click (hide/start)
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
            showMinimapBtn.style.display = 'flex';
        }
    });

    // Toggle button click shows the small map again
    showMinimapBtn.addEventListener('click', () => {
        showMinimapBtn.style.display = 'none';
        minimapContainer.style.display = 'block';
    });

    document.getElementById('start-driving-btn')?.addEventListener('click', startDrivingFromBigMap);
    document.querySelectorAll('#mobile-drive-controls [data-action]').forEach(button => {
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            handleDriveAction(button.dataset.action);
        });
    });


    
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

document.getElementById('settings-button').addEventListener('click', () => {
        document.getElementById('settings-panel').style.display = 'flex';
    });
    document.getElementById('close-settings-btn').addEventListener('click', () => {
        document.getElementById('settings-panel').style.display = 'none';
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
        
        const texture = textureLoader.load(newURL);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        material.map = texture;
        material.color.set(0xffffff); // Set to white to show full texture color
        material.needsUpdate = true;
        
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
        floorMaterial.map.repeat.set(textureScales.floor, textureScales.floor);
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
    document.getElementById('main-menu-modal').style.display = 'flex';
    document.getElementById('custom-mode-btn').disabled = !customLevels.some(level => level !== null);
    document.getElementById('main-menu-info-box').innerHTML = '';
    
    [mazeGroup, landmarksGroup, sceneryGroup, waypointsGroup, highlightFloorsGroup].forEach(group => {
        while(group.children.length > 0){ group.remove(group.children[0]); }
    });
    if(goalMarker) {
        scene.remove(goalMarker);
        goalMarker = null;
    }

    // Hide gameplay UI elements (v10.0)
    document.getElementById('view-toggle-container').style.display = 'none';
    document.getElementById('third-person-controls').style.display = 'none'; // NEW: Hide 3P controls
    document.getElementById('minimap-container').style.display = 'none';
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
    document.getElementById('choice-prompt').style.display = 'none';
    previousGridPos = null;

    // Reset groups
    [mazeGroup, landmarksGroup, sceneryGroup, waypointsGroup, highlightFloorsGroup].forEach(group => {
        while(group.children.length > 0){ group.remove(group.children[0]); }
    });
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
        touchedHighlightFloors: new Set()
    };

    createMazeMesh(level.grid, level.goal);
    placeRoadsideObjects(level.grid);
    createGoalMarker(level.goal);
    if (level.waypoints && level.waypoints.length > 0) {
        level.waypoints.forEach((wp, index) => {
            const waypointMesh = createWaypointMesh(index + 1, wp.color);
            const wpPos = gridToWorld(wp.x, wp.z, level.grid);
            waypointMesh.position.set(wpPos.x, 0, wpPos.z);
            waypointsGroup.add(waypointMesh);
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
    bigMapWrapper.appendChild(minimapContainer);
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
            const collectedWaypointMesh = waypointsGroup.children[currentLevelState.nextWaypoint - 1];
            if (collectedWaypointMesh && !collectedWaypointMesh.userData.collected) {
                collectedWaypointMesh.userData.collected = true;

                // Trigger enhanced firework effect
                createFireworkEffect(collectedWaypointMesh.position, nextWpData.color);
                
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
                updateMinimapPlayer(); 
            }
        }
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
        }
    }

    // Goal check
    if (gridPos.x === level.goal.x && gridPos.z === level.goal.z) {
         if (currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints) {
            showTemporaryMessage(translations[currentLanguage].prompt_goal_locked);
            checkForTurns();
        } else {
            gameState = 'LEVEL_COMPLETE';
            showLevelComplete();
        }
        return;
    }
    
    checkForTurns();
}

function checkForTurns() {
    const availableTurns = createDirectionalHelpers();
    updateChoicePrompt(availableTurns);
    gameState = 'AT_INTERSECTION';
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

function showTemporaryMessage(message, duration = 2000) {
    const prompt = document.getElementById('choice-prompt');
    prompt.textContent = message;
    prompt.style.display = 'inline-block';
    clearTimeout(promptTimeout);
    promptTimeout = setTimeout(() => {
        if (gameState === 'AT_INTERSECTION') {
            checkForTurns();
        }
    }, duration);
}

function updateChoicePrompt(availableTurns) {
    const prompt = document.getElementById('choice-prompt');
    const helperToggle = document.getElementById('helper-text-toggle').value;
    const lang = translations[currentLanguage];

    if (gameState !== 'AT_INTERSECTION' || helperToggle === 'off') {
        prompt.style.display = 'none';
        return;
    }
    
    prompt.style.display = 'inline-block';
    const options = [];
    if (availableTurns.forward) options.push(lang.forward);
    if (availableTurns.left) options.push(lang.turnLeft);
    if (availableTurns.right) options.push(lang.turnRight);

    if (!availableTurns.forward && !availableTurns.left && !availableTurns.right) {
        prompt.textContent = lang.prompt_dead_end;
    } else if (options.length > 0) {
        prompt.textContent = lang.prompt_options(options);
    } else {
        prompt.textContent = lang.turnAround; 
    }
}


function setupMove(dir = 1) {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    const gridPos = worldToGrid(player.position);
    const moveVector = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation).multiplyScalar(dir);
    const nextGridX = gridPos.x + Math.round(moveVector.x);
    const nextGridZ = gridPos.z + Math.round(moveVector.z);

    const isGoalNext = (nextGridX === level.goal.x && nextGridZ === level.goal.z);
    const isGoalLocked = currentLevelState.isWaypointMode && currentLevelState.nextWaypoint <= currentLevelState.totalWaypoints;

    if (isGoalNext && !isGoalLocked) {
showTemporaryMessage(translations[currentLanguage].prompt_near_goal, 2500);
    }

    if (nextGridZ < 0 || nextGridZ >= level.grid.length || nextGridX < 0 || nextGridX >= level.grid[0].length || level.grid[nextGridZ][nextGridX] === 0) {
cameraShake();
showTemporaryMessage(translations[currentLanguage].prompt_wall);
    } else {
previousGridPos = gridPos;
currentLevelState.playerChoices++;
document.getElementById('choice-prompt').style.display = 'none';
while (landmarksGroup.children.length > 0) {
    landmarksGroup.remove(landmarksGroup.children[0]);
}
targetPosition.copy(gridToWorld(nextGridX, nextGridZ, level.grid));
gameState = 'DRIVING';
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
    const skyDay = new THREE.Color(0x87ceeb);
    const skyNight = new THREE.Color(0x210033); 
    const visualColor = skyNight.clone().lerp(skyDay, dayNightCycle);

    if (scene.fog) scene.fog.color.copy(visualColor);
    // Only update background color if a texture isn't used
    if (!scene.background || !scene.background.isTexture) {
         scene.background = visualColor;
         renderer.setClearColor(visualColor, 1);
    }

    hemisphereLight.intensity = dayNightCycle * 2.0 + 0.4;
    dirLight.intensity = dayNightCycle * 2.5 + 0.3;

    const nightIntensity = Math.max(0, 1 - dayNightCycle * 3);
    sceneryGroup.children.forEach(sceneryObject => {
        const light = sceneryObject.getObjectByName('lampLight');
        if (light) light.intensity = nightIntensity * 8;
    });

    // Object animations (Lucky Cat, Heart, Waypoints)
    if (goalMarker && luckyCatArm) {
        goalMarker.position.y = WALL_HEIGHT/2 - 1.5 + Math.sin(elapsedTime) * 0.2;
        goalMarker.rotation.y += delta * 0.4;
        const toRad = THREE.MathUtils.degToRad;
        luckyCatArm.rotation.x = toRad(LUCKY_CAT.WAVE_CENTER_DEG) + Math.sin(elapsedTime * LUCKY_CAT.WAVE_SPEED) * toRad(LUCKY_CAT.WAVE_AMPL_DEG);
        if (luckyCatWrist) luckyCatWrist.rotation.x = Math.sin(elapsedTime * LUCKY_CAT.WRIST_SPEED) * toRad(LUCKY_CAT.WRIST_AMPL_DEG);
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
                // Iterate through the car model parts to find the wheels (which are Groups containing the tire and rim)
                playerCarModel.children.forEach(child => {
                    if (child.name === 'wheelGroup') {
                        // Rotate the wheel group around its local X axis (since it was rotated on Z during creation)
                        // Rotation speed is proportional to movement speed. (MOVE_SPEED / wheelRadius)
                        // Wheel radius is TILE_SIZE * 0.15
                        child.rotation.x += (MOVE_SPEED / (TILE_SIZE * 0.15)) * delta;
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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

// New function to create the 3P Car Model (v10.0)
function createPlayerCarModel() {
    const carGroup = new THREE.Group();
    
    // Main Chassis
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.3, metalness: 0.6 }); // Sporty Red
    const bodyGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.21, TILE_SIZE * 0.63);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = TILE_SIZE * 0.21;
    carGroup.add(body);

    // Cabin
    const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.4, metalness: 0.4 }); // Dark Gray
    // Using a slightly trapezoidal shape for the cabin
    const cabinShape = new THREE.Shape();
    const cw = TILE_SIZE * 0.175;
    cabinShape.moveTo(-cw, 0);
    cabinShape.lineTo(cw, 0);
    cabinShape.lineTo(cw * 0.8, TILE_SIZE * 0.21);
    cabinShape.lineTo(-cw * 0.8, TILE_SIZE * 0.21);
    cabinShape.closePath();

    const extrudeSettings = { depth: TILE_SIZE * 0.35, bevelEnabled: false };
    const cabinGeometry = new THREE.ExtrudeGeometry(cabinShape, extrudeSettings);
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.y = TILE_SIZE * 0.315;
    cabin.position.z = -TILE_SIZE * 0.245;
    carGroup.add(cabin);
    
    // Spoiler
    const spoilerMat = bodyMaterial;
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.035, TILE_SIZE * 0.07), spoilerMat);
    spoiler.position.set(0, TILE_SIZE * 0.35, -TILE_SIZE * 0.28);
    carGroup.add(spoiler);

    // Wheels
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.2 });
    const wheelRadius = TILE_SIZE * 0.105;
    const wheelWidth = TILE_SIZE * 0.07;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
    const rimGeometry = new THREE.CylinderGeometry(wheelRadius * 0.7, wheelRadius * 0.7, wheelWidth + 0.01, 12);
    
    const wheelPositions = [
        { x: TILE_SIZE * 0.21, z: TILE_SIZE * 0.21 },  // Front right
        { x: -TILE_SIZE * 0.21, z: TILE_SIZE * 0.21 }, // Front left
        { x: TILE_SIZE * 0.21, z: -TILE_SIZE * 0.21 }, // Rear right
        { x: -TILE_SIZE * 0.21, z: -TILE_SIZE * 0.21 } // Rear left
    ];

    wheelPositions.forEach(pos => {
        const wheelGroupInternal = new THREE.Group();
        wheelGroupInternal.name = "wheelGroup"; // Name for easy identification in animation loop
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        wheelGroupInternal.add(wheel);
        wheelGroupInternal.add(rim);

        // Rotate so the cylinder axis aligns with the X-axis (for rotation during driving)
        wheelGroupInternal.rotation.z = Math.PI / 2;
        wheelGroupInternal.position.set(pos.x + Math.sign(pos.x) * wheelWidth/2, wheelRadius, pos.z);
        carGroup.add(wheelGroupInternal);
    });
    
    // Headlights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xFFF9C4 });
    const lightGeo = new THREE.PlaneGeometry(TILE_SIZE * 0.105, TILE_SIZE * 0.07);

    const hl1 = new THREE.Mesh(lightGeo, lightMat);
    hl1.position.set(TILE_SIZE * 0.14, TILE_SIZE * 0.21, TILE_SIZE * 0.3157);
    carGroup.add(hl1);

    const hl2 = new THREE.Mesh(lightGeo, lightMat);
    hl2.position.set(-TILE_SIZE * 0.14, TILE_SIZE * 0.21, TILE_SIZE * 0.3157);
    carGroup.add(hl2);

    return carGroup;
}

function createMazeMesh(grid, goal) {
    const gridWidth = grid[0].length;
    const gridHeight = grid.length;
    const floorPlane = new THREE.PlaneGeometry(gridWidth * TILE_SIZE, gridHeight * TILE_SIZE);
    const floor = new THREE.Mesh(floorPlane, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    mazeGroup.add(floor);
    updateTextureScales();

    const wallGeo = new THREE.PlaneGeometry(TILE_SIZE, WALL_HEIGHT);
    for (let z = 0; z < gridHeight; z++) {
        for (let x = 0; x < gridWidth; x++) {
            if (grid[z][x] === 1) {
                const worldPos = gridToWorld(x, z, grid);
                const isNearGoal = Math.abs(x - goal.x) <= 1 && Math.abs(z - goal.z) <= 1 && !(x === goal.x && z === goal.z);
                
                // South-facing wall (of cell z-1)
                if (z > 0 && grid[z - 1][x] === 0) {
                     const wall = new THREE.Mesh(wallGeo, isNearGoal && z - 1 === goal.z ? goalWallMaterial : wallMaterialS);
                     wall.position.set(worldPos.x, WALL_HEIGHT / 2, worldPos.z - TILE_SIZE / 2);
                     mazeGroup.add(wall);
                }
                // North-facing wall (of cell z+1)
                if (z < gridHeight - 1 && grid[z + 1][x] === 0) {
                     const wall = new THREE.Mesh(wallGeo, isNearGoal && z + 1 === goal.z ? goalWallMaterial : wallMaterialN);
                     wall.position.set(worldPos.x, WALL_HEIGHT / 2, worldPos.z + TILE_SIZE / 2);
                     wall.rotation.y = Math.PI;
                     mazeGroup.add(wall);
                }
                // West-facing wall (of cell x-1)
                if (x > 0 && grid[z][x - 1] === 0) {
                     const wall = new THREE.Mesh(wallGeo, isNearGoal && x - 1 === goal.x ? goalWallMaterial : wallMaterialW);
                     wall.position.set(worldPos.x - TILE_SIZE / 2, WALL_HEIGHT / 2, worldPos.z);
                     wall.rotation.y = Math.PI / 2;
                     mazeGroup.add(wall);
                }
                // East-facing wall (of cell x+1)
                if (x < gridWidth - 1 && grid[z][x + 1] === 0) {
                     const wall = new THREE.Mesh(wallGeo, isNearGoal && x + 1 === goal.x ? goalWallMaterial : wallMaterialE);
                     wall.position.set(worldPos.x + TILE_SIZE / 2, WALL_HEIGHT / 2, worldPos.z);
                     wall.rotation.y = -Math.PI / 2;
                     mazeGroup.add(wall);
                }
            }
        }
    }
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

function createGoalMarker(goalCoords) {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    const goalPos = gridToWorld(goalCoords.x, goalCoords.z, level.grid);
    goalMarker = new THREE.Group();
    const cat = createLuckyCat();
    cat.scale.set(1.5, 1.5, 1.5); goalMarker.add(cat);
    const heartShape = new THREE.Shape();
    const [x,y,s] = [0,0,0.6];
    heartShape.moveTo(x+0.5*s,y+0.5*s).bezierCurveTo(x+0.5*s,y+0.5*s,x+0.4*s,y,x,y).bezierCurveTo(x-0.6*s,y,x-0.6*s,y+0.7*s,x-0.6*s,y+0.7*s).bezierCurveTo(x-0.6*s,y+1.1*s,x-0.3*s,y+1.54*s,x+0.5*s,y+1.9*s).bezierCurveTo(x+1.2*s,y+1.54*s,x+1.6*s,y+1.1*s,x+1.6*s,y+0.7*s).bezierCurveTo(x+1.6*s,y+0.7*s,x+1.6*s,y,x+1.0*s,y).bezierCurveTo(x+0.7*s,y,x+0.5*s,y+0.5*s,x+0.5*s,y+0.5*s);
    const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.25, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.08, bevelThickness: 0.08 });
    const heart = new THREE.Mesh(heartGeo, new THREE.MeshBasicMaterial({ color: 0xff4d6d, depthTest: true, depthWrite: true }));
    heart.position.set(0, 6.2, 0.2); heart.rotation.x = Math.PI; heart.scale.set(0.9, 0.9, 0.9);
    goalMarker.add(heart);
    floatingHeart = heart;
    floatingHeart.userData.baseY = heart.position.y;
    goalMarker.position.copy(goalPos);
    goalMarker.position.y = WALL_HEIGHT/2 - 1.5;
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
function createClassicalLamp() {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x155e75, roughness: 0.45, metalness: 0.35 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.25 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.48, 0.22, 10), trimMat);
    base.position.y = 0.11; group.add(base);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 3.5, 10), postMat);
    post.position.y = 1.86; group.add(post);
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.95), postMat);
    holder.position.set(0, 3.58, 0.35); group.add(holder);
    const lightColors = [0xfff3b0, 0xc7f9ff, 0xffd6e7, 0xd9f99d, 0xfef08a];
    const randomColor = lightColors[Math.floor(Math.random() * lightColors.length)];
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 8), new THREE.MeshBasicMaterial({ color: randomColor }));
    bulb.position.set(0, 3.6, 0.35); group.add(bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 8), new THREE.MeshBasicMaterial({ color: randomColor, transparent: true, opacity: 0.18, depthWrite: false }));
    glow.position.copy(bulb.position); group.add(glow);
    const light = new THREE.PointLight(randomColor, 0, TILE_SIZE * 2.4, 1.35);
    light.name = 'lampLight'; light.position.copy(bulb.position); group.add(light);
    return group;
}

function createFlowerMarker(color = 0xf472b6) {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75, metalness: 0.05 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7 });
    const flowerMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: color, emissiveIntensity: 0.08 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.38, 10), potMat);
    pot.position.y = 0.19; group.add(pot);
    for (let i = 0; i < 3; i++) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62 + i * 0.08, 6), leafMat);
        stem.position.set((i - 1) * 0.15, 0.62, 0); group.add(stem);
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flowerMat);
        bloom.position.set((i - 1) * 0.15, 0.95 + i * 0.08, 0); group.add(bloom);
    }
    return group;
}

function createFriendlySign(color = 0x0f766e) {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const boardMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.08 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.7, 8), postMat);
    post.position.y = 0.85; group.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.58, 0.12), boardMat);
    board.position.y = 1.62; group.add(board);
    const star = new THREE.Mesh(new THREE.TetrahedronGeometry(0.18), new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.35 }));
    star.position.set(0, 1.62, 0.09); star.rotation.z = Math.PI / 4; group.add(star);
    return group;
}

function addSceneryObject(object, x, y, z, rotationY = 0) {
    object.position.set(x, y, z);
    object.rotation.y = rotationY;
    sceneryGroup.add(object);
}

function placeRoadsideObjects(grid) {
    const gridHeight = grid.length; const gridWidth = grid[0].length;
    const flowerColors = [0xf472b6, 0x38bdf8, 0xa3e635, 0xfacc15, 0xfb7185];
    const signColors = [0x0f766e, 0x2563eb, 0xdc2626, 0x7c3aed];
    for (let z = 0; z < gridHeight; z++) {
        for (let x = 0; x < gridWidth; x++) {
            if (grid[z][x] === 0) continue;
            const worldPos = gridToWorld(x, z, grid);
            const seed = x * 13 + z * 17;
            if (z > 0 && grid[z-1][x]===0 && x%3===0) {
                addSceneryObject(createClassicalLamp(), worldPos.x, 0, worldPos.z - TILE_SIZE * 0.45, 0);
            } else if (z > 0 && grid[z-1][x]===0 && seed%5===0) {
                addSceneryObject(createFlowerMarker(flowerColors[seed % flowerColors.length]), worldPos.x, 0, worldPos.z - TILE_SIZE * 0.42, 0);
            }
            if (z < gridHeight-1 && grid[z+1][x]===0 && x%3===1) {
                addSceneryObject(createClassicalLamp(), worldPos.x, 0, worldPos.z + TILE_SIZE * 0.45, Math.PI);
            } else if (z < gridHeight-1 && grid[z+1][x]===0 && seed%7===0) {
                addSceneryObject(createFriendlySign(signColors[seed % signColors.length]), worldPos.x, 0, worldPos.z + TILE_SIZE * 0.42, Math.PI);
            }
            if (x > 0 && grid[z][x-1]===0 && z%3===0) {
                addSceneryObject(createClassicalLamp(), worldPos.x - TILE_SIZE * 0.45, 0, worldPos.z, Math.PI/2);
            } else if (x > 0 && grid[z][x-1]===0 && seed%6===0) {
                addSceneryObject(createFlowerMarker(flowerColors[(seed + 2) % flowerColors.length]), worldPos.x - TILE_SIZE * 0.42, 0, worldPos.z, Math.PI/2);
            }
            if (x < gridWidth-1 && grid[z][x+1]===0 && z%3===1) {
                addSceneryObject(createClassicalLamp(), worldPos.x + TILE_SIZE * 0.45, 0, worldPos.z, -Math.PI/2);
            } else if (x < gridWidth-1 && grid[z][x+1]===0 && seed%8===0) {
                addSceneryObject(createFriendlySign(signColors[(seed + 1) % signColors.length]), worldPos.x + TILE_SIZE * 0.42, 0, worldPos.z, -Math.PI/2);
            }
        }
    }
}

function createCanvasTexture(width, height, painter) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    painter(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createFloorTexture() {
    return createCanvasTexture(256, 256, (ctx, width, height) => {
        ctx.fillStyle = '#dff7ec';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#c7f0de';
        for (let y = 0; y < height; y += 32) ctx.fillRect(0, y, width, 3);
        for (let x = 0; x < width; x += 32) ctx.fillRect(x, 0, 3, height);
        ctx.strokeStyle = 'rgba(15,118,110,0.28)';
        ctx.lineWidth = 5;
        ctx.setLineDash([18, 14]);
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(245,158,11,0.16)';
        ctx.beginPath();
        ctx.arc(54, 64, 26, 0, Math.PI * 2);
        ctx.arc(194, 188, 24, 0, Math.PI * 2);
        ctx.fill();
    });
}

function createWallTexture(base, accent) {
    return createCanvasTexture(128, 128, (ctx, width, height) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, width, 15);
        ctx.fillRect(0, height - 15, width, 15);
        ctx.fillStyle = 'rgba(255,255,255,0.24)';
        for (let x = -24; x < width; x += 42) {
            ctx.beginPath();
            ctx.moveTo(x, height);
            ctx.lineTo(x + 42, 0);
            ctx.lineTo(x + 56, 0);
            ctx.lineTo(x + 14, height);
            ctx.closePath();
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(17,24,39,0.18)';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
    });
}

function createMaterials() {
    const defaultWallColorN = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--wall-color-ns').trim());
    const defaultWallColorS = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--wall-color-ns').trim());
    const defaultWallColorE = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--wall-color-ew').trim());
    const defaultWallColorW = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--wall-color-ew').trim());

    const northTexture = createWallTexture('#bbf7d0', '#0f766e');
    const southTexture = createWallTexture('#dbeafe', '#2563eb');
    const eastTexture = createWallTexture('#fde68a', '#d97706');
    const westTexture = createWallTexture('#fbcfe8', '#be185d');

    wallMaterialN = new THREE.MeshStandardMaterial({ color: defaultWallColorN, map: northTexture, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    wallMaterialS = new THREE.MeshStandardMaterial({ color: defaultWallColorS, map: southTexture, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    wallMaterialE = new THREE.MeshStandardMaterial({ color: defaultWallColorE, map: eastTexture, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    wallMaterialW = new THREE.MeshStandardMaterial({ color: defaultWallColorW, map: westTexture, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });

    const floorTexture = createFloorTexture();
    floorTexture.repeat.set(8, 8);
    floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTexture, metalness: 0.04, roughness: 0.72 });

    landmarkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(getComputedStyle(document.body).getPropertyValue('--landmark-color').trim()), transparent: true, blending: THREE.AdditiveBlending });
    
    goalWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xff8a65,
        roughness: 0.38,
        metalness: 0.08,
        emissive: 0xff3d00,
        emissiveIntensity: 0.38,
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

function drawMinimapBackground(ctx, canvas, grid, start, goal, waypoints, highlightFloors, nextWaypoint, touchedHighlightFloors) {
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

function updateMinimapPlayer() {
    const level = (currentLevelIndex === -1) ? customLevels[selectedCustomMapIndex] : levels[currentLevelIndex];
    if (!level || !level.grid) return;

    const { grid, start, goal, waypoints, highlightFloors } = level;

    // Player data
    const gridPos = worldToGrid(player.position);

    // Heading angle in minimap (x right, z down)
    const dirVec = new THREE.Vector3(0,0,-1).applyEuler(player.rotation);
    const headingAngle = Math.atan2(dirVec.z, dirVec.x);

    // Canvas sizing
    minimap.width = 500;
    minimap.height = 500;

    const ctx = minimapCtx;
    const cellWidth = ctx.canvas.width / grid[0].length;
    const cellHeight = ctx.canvas.height / grid.length;
    const playerX = (gridPos.x + 0.5) * cellWidth;
    const playerZ = (gridPos.z + 0.5) * cellHeight;

    if (minimapOrientationMode === 'NORTH_UP') {
        // 1) North-Up (original behavior): map fixed, arrow rotates
        drawMinimapBackground(ctx, minimap, grid, start, goal, waypoints, highlightFloors, currentLevelState.nextWaypoint, currentLevelState.touchedHighlightFloors);
        drawMinimapPlayerArrow(ctx, playerX, playerZ, headingAngle, cellWidth, cellHeight);
        return;
    }

    // 2) Heading-Up: rotate the whole minimap so the car heading is "up"
    if (!minimapBgCanvas || !minimapBgCtx) {
        // Fallback
        drawMinimapBackground(ctx, minimap, grid, start, goal, waypoints, highlightFloors, currentLevelState.nextWaypoint, currentLevelState.touchedHighlightFloors);
        drawMinimapPlayerArrow(ctx, playerX, playerZ, headingAngle, cellWidth, cellHeight);
        return;
    }

    // Draw background to offscreen first
    drawMinimapBackground(minimapBgCtx, minimapBgCanvas, grid, start, goal, waypoints, highlightFloors, currentLevelState.nextWaypoint, currentLevelState.touchedHighlightFloors);

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
    gridData: [], start: {}, goal: {}, waypoints: [], highlightFloors: [],
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
        }
    };
    grid.onmousedown = (e) => { editorState.isDrawing = true; handleGridInteraction(e); };
    grid.onmouseover = handleGridInteraction;
    document.onmouseup = () => editorState.isDrawing = false;
    grid.onmouseleave = () => editorState.isDrawing = false;

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
        gridData: [], start: {}, goal: {}, waypoints: [], highlightFloors: [],
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
            grid.appendChild(cell);
        }
    }
}

function handleGridInteraction(e) {
    if (!editorState.isDrawing || e.buttons !== 1) return;
    const cell = e.target.closest('.editor-cell');
    if (!cell) return;
    const x = parseInt(cell.dataset.x), z = parseInt(cell.dataset.z);
    const isStart = editorState.start.x === x && editorState.start.z === z;
    const isGoal = editorState.goal.x === x && editorState.goal.z === z;

    // Clear special status before applying new tool
    if (isStart) editorState.start = {};
    if (isGoal) editorState.goal = {};
    editorState.waypoints = editorState.waypoints.filter(wp => wp.x !== x || wp.z !== z);
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
            editorState.waypoints.push({x, z, color: document.getElementById('editor-waypoint-color').value });
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
    const { start, goal, gridData, waypoints, highlightFloors } = editorState;
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
