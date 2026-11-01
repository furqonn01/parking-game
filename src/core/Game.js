import * as THREE from 'three';
import { AudiR8 } from '../vehicles/AudiR8.js';
import { AudiA7 } from '../vehicles/AudiA7.js';
import { CameraController, CameraMode } from './CameraController.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { Environment } from '../world/Environment.js';
import { CityChunkManager } from '../world/CityChunkManager.js';
import { ParkingDistrict } from '../world/ParkingDistrict.js';
import { ParkingGameMode } from '../gameplay/ParkingGameMode.js';
import { FreeRoamMode } from '../gameplay/FreeRoamMode.js';
import { MirrorManager } from '../world/MirrorManager.js';
import { TouchControls } from '../ui/TouchControls.js';
import { UIManager } from '../ui/UIManager.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Core managers
    this.environment = null;
    this.input = null;
    this.cameraController = null;
    this.audio = null;
    this.chunkManager = null;
    this.parkingDistrict = null;
    this.mirrorManager = null;
    this.touchControls = null;
    this.ui = null;

    // Vehicle
    this.activeCarKey = 'r8'; // 'r8' or 'audi_a7'
    this.vehicle = null;

    // Game modes: 'parking' or 'roam'
    this.mode = 'parking';
    this.parkingGame = null;
    this.freeRoam = null;

    // Quality setting: 'mobile' (Ringan), 'balanced' (Sedang), 'high' (Tinggi/Full)
    this.quality = 'mobile';

    // High-precision modern Timer (replaces deprecated THREE.Clock)
    this.timer = new THREE.Timer();

    this.init();
  }

  async init() {
    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );

    // 2. Renderer
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const maxPixelRatio = isMobile ? 1.5 : 2.0;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 3. Subsystems
    this.environment = new Environment(this.scene, this.renderer);
    this.input = new InputManager(this.canvas);
    this.cameraController = new CameraController(this.camera);
    this.audio = new AudioManager();
    this.chunkManager = new CityChunkManager(this.scene);
    this.parkingDistrict = new ParkingDistrict(this.scene);
    this.mirrorManager = new MirrorManager(this.renderer, this.scene);

    // Setup input gear selector listeners
    this.input.onShiftUp = () => {
      if (this.vehicle) this.vehicle.shiftUp();
    };
    this.input.onShiftDown = () => {
      if (this.vehicle) this.vehicle.shiftDown();
    };
    this.input.onSetGear = (mode) => {
      if (this.vehicle) this.vehicle.setGear(mode);
    };

    // 4. Vehicle creation
    this.spawnVehicle(this.activeCarKey);

    // 5. Game Modes
    this.parkingGame = new ParkingGameMode(this.parkingDistrict, this.audio);
    this.freeRoam = new FreeRoamMode(this.audio);

    this.parkingGame.onLevelComplete = (data) => {
      this.ui.showLevelCompleteModal(data);
    };

    // Start with parking mode
    this.parkingGame.startLevel(0, this.vehicle);
    this.cameraController.snapToTarget(this.vehicle);

    // 6. UI & Controls
    this.ui = new UIManager(this);
    this.touchControls = new TouchControls(this.input);

    // Input one-shots
    this.input.onToggleCamera = () => this.toggleCamera();
    this.input.onToggleCar = () => this.toggleCar();
    this.input.onResetCar = () => this.resetCar();
    this.input.onToggleLights = () => this.toggleLights();
    this.input.onToggleMirror = () => this.toggleMirror();

    // 7. Load progressive city chunks
    await this.chunkManager.init();

    // Unlock audio on first user touch/click
    const unlockAudio = () => {
      this.audio.unlockAudio();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Window resize listener
    window.addEventListener('resize', () => this.onWindowResize());

    // Apply initial mobile quality
    this.applyQuality(this.quality);

    // Start animation loop
    this.animate(performance.now());
  }

  spawnVehicle(carKey, initialPos = { x: 0, y: 0, z: 0 }, initialHeading = 0) {
    if (this.vehicle) {
      this.vehicle.destroy();
    }

    this.activeCarKey = carKey;
    if (carKey === 'audi_a7') {
      this.vehicle = new AudiA7(this.scene, initialPos, initialHeading);
    } else {
      this.vehicle = new AudiR8(this.scene, initialPos, initialHeading);
    }

    // Attach functional rearview and side mirrors (in-cabin glass reflections)
    if (this.mirrorManager) {
      this.vehicle.attachMirrors(this.mirrorManager.getTexture());
    }

    // Snap camera to newly spawned car
    this.cameraController.snapToTarget(this.vehicle);
  }

  toggleCar() {
    const nextKey = this.activeCarKey === 'r8' ? 'audi_a7' : 'r8';
    const oldPos = { ...this.vehicle.position };
    const oldHeading = this.vehicle.heading;

    this.spawnVehicle(nextKey, oldPos, oldHeading);

    if (this.ui) {
      this.ui.updateHUD(this.vehicle, this.cameraController.mode, this.mode, this.chunkManager);
    }
  }

  toggleCamera() {
    const newMode = this.cameraController.toggleMode(this.vehicle);
    if (this.ui) {
      this.ui.updateHUD(this.vehicle, newMode, this.mode, this.chunkManager);
    }
  }

  toggleGameMode() {
    this.mode = this.mode === 'parking' ? 'roam' : 'parking';
    if (this.mode === 'parking') {
      this.parkingGame.startLevel(0, this.vehicle);
    } else {
      this.parkingDistrict.setTargetSlot(null);
      this.freeRoam.start(this.vehicle);
    }
    this.ui.setGameModeUI(this.mode);
  }

  resetCar() {
    if (this.mode === 'parking') {
      this.parkingGame.restartLevel(this.vehicle);
    } else {
      this.vehicle.reset(0, 0, 0, 0);
    }
    this.cameraController.snapToTarget(this.vehicle);
    this.input.resetLook();
  }

  nextLevel() {
    this.parkingGame.nextLevel(this.vehicle);
    this.cameraController.snapToTarget(this.vehicle);
  }

  restartLevel() {
    this.parkingGame.restartLevel(this.vehicle);
    this.cameraController.snapToTarget(this.vehicle);
  }

  toggleLights() {
    if (this.vehicle) {
      this.vehicle.toggleLights();
    }
  }

  toggleTimeOfDay() {
    return this.environment.toggleTimeOfDay();
  }

  cycleQuality() {
    const levels = ['mobile', 'balanced', 'high'];
    const nextIdx = (levels.indexOf(this.quality) + 1) % levels.length;
    this.quality = levels[nextIdx];
    this.applyQuality(this.quality);
  }

  applyQuality(quality) {
    if (quality === 'mobile') {
      this.chunkManager.loadDistance = 1400;
      this.chunkManager.unloadDistance = 2200;
      this.chunkManager.setMode('progressive');
      this.scene.fog.density = 0.003;
      this.camera.far = 1200;
      this.camera.updateProjectionMatrix();
      this.ui.setQualityLabel('Ringan (HP)');
    } else if (quality === 'balanced') {
      this.chunkManager.loadDistance = 2200;
      this.chunkManager.unloadDistance = 3200;
      this.chunkManager.setMode('progressive');
      this.scene.fog.density = 0.0018;
      this.camera.far = 1800;
      this.camera.updateProjectionMatrix();
      this.ui.setQualityLabel('Seimbang');
    } else if (quality === 'high') {
      this.chunkManager.setMode('full');
      this.scene.fog.density = 0.001;
      this.camera.far = 3000;
      this.camera.updateProjectionMatrix();
      this.ui.setQualityLabel('Penuh (PC)');
    }

    if (this.mirrorManager) {
      this.mirrorManager.setQuality(quality);
    }
  }

  toggleMirror() {
    if (this.mirrorManager) {
      const active = this.mirrorManager.toggleHUD();
      const btn = document.getElementById('btn-toggle-mirror');
      if (btn) btn.classList.toggle('active', active);
      return active;
    }
    return false;
  }

  toggleAudio() {
    const enabled = this.audio.toggleMute();
    this.ui.setAudioMuteIcon(enabled);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));

    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const time = this.timer.getElapsed();

    // 1. Process Input
    this.input.update(delta);

    // 2. Vehicle Update
    if (this.vehicle) {
      this.vehicle.update(this.input, delta);

      // 3. Audio Update
      this.audio.update(
        this.vehicle.speed,
        this.vehicle.options.physics.maxSpeed,
        this.vehicle.isBraking,
        this.vehicle.isDrifting,
        this.vehicle.engineRpm,
        this.vehicle.gear
      );

      // 4. Camera Update
      this.cameraController.update(this.vehicle, this.input, delta);

      // 5. World progressive chunk streaming & lighting follow
      this.chunkManager.update(this.vehicle.position);
      this.environment.update(this.vehicle.position);
      this.parkingDistrict.update(time);

      // 6. Game Mode Logic
      if (this.mode === 'parking') {
        this.parkingGame.update(this.vehicle, delta);
        this.ui.updateParkingHUD(this.parkingGame);
      } else {
        this.freeRoam.update(this.vehicle, this.parkingDistrict.obstacles, delta);
        this.ui.updateFreeRoamHUD(this.freeRoam);
      }

      // 7. General HUD
      this.ui.updateHUD(
        this.vehicle,
        this.cameraController.mode,
        this.mode,
        this.chunkManager
      );
    }

    // 8. Main Scene Render
    this.renderer.render(this.scene, this.camera);

    // 9. Digital Rearview Mirror Render Pass
    if (this.mirrorManager && this.vehicle) {
      this.mirrorManager.render(this.vehicle);
    }
  }
}
