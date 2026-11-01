import * as THREE from 'three';
import { CollisionSystem } from '../physics/CollisionSystem.js';

export const PARKING_LEVELS = [
  {
    level: 1,
    title: 'Level 1: Parkir Maju',
    description: 'Maju lurus dan parkir tepat di dalam kotak kuning bay VIP.',
    startPos: { x: 0, y: 0, z: 8 },
    startHeading: 0,
    targetSlot: { x: 0, z: -9.8, heading: 0, width: 2.6, length: 5.5 },
    cones: [
      { x: -1.6, z: -7.0 }, { x: 1.6, z: -7.0 },
      { x: -1.6, z: -12.6 }, { x: 1.6, z: -12.6 }
    ],
    timeLimit: 60
  },
  {
    level: 2,
    title: 'Level 2: Parkir Mundur (Reverse)',
    description: 'Maju pelan, belokkan kemudi, lalu mundur rapi ke dalam bay parkir.',
    startPos: { x: -8, y: 0, z: -0.5 },
    startHeading: Math.PI / 2,
    targetSlot: { x: -20, z: -9.8, heading: 0, width: 2.6, length: 5.5 },
    cones: [
      { x: -21.6, z: -7.0 }, { x: -18.4, z: -7.0 },
      { x: -21.6, z: -12.6 }, { x: -18.4, z: -12.6 },
      { x: -13.5, z: -2.0 }, { x: -13.5, z: 2.0 }
    ],
    timeLimit: 80
  },
  {
    level: 3,
    title: 'Level 3: Parkir Paralel',
    description: 'Parkir paralel sejajar di sepanjang tepi curb jalan selatan.',
    startPos: { x: -4, y: 0, z: 2 },
    startHeading: Math.PI / 2,
    targetSlot: { x: 15, z: 10.5, heading: Math.PI / 2, width: 2.6, length: 6.2 },
    cones: [
      { x: 11.5, z: 8.8 }, { x: 11.5, z: 12.2 },
      { x: 18.5, z: 8.8 }, { x: 18.5, z: 12.2 },
      { x: 5, z: 5.5 }, { x: 7, z: 5.5 }
    ],
    timeLimit: 90
  },
  {
    level: 4,
    title: 'Level 4: Parkir Sempit & Tikungan',
    description: 'Lewati jalur slalom boulevard lalu parkir di slot executive bay.',
    startPos: { x: -50, y: 0, z: 2.5 },
    startHeading: Math.PI / 2,
    targetSlot: { x: 35.2, z: -9.8, heading: 0, width: 2.6, length: 5.5 },
    cones: [
      { x: -30, z: -1.5 }, { x: -10, z: 2.5 },
      { x: 10, z: -1.5 }, { x: 25, z: 2.0 },
      { x: 33.6, z: -7.0 }, { x: 36.8, z: -7.0 },
      { x: 33.6, z: -12.6 }, { x: 36.8, z: -12.6 }
    ],
    timeLimit: 120
  }
];

export class ParkingGameMode {
  constructor(parkingDistrict, audioManager) {
    this.district = parkingDistrict;
    this.audio = audioManager;

    this.currentLevelIndex = 0;
    this.levelData = null;
    this.spawnedCones = [];

    this.levelStartTime = 0;
    this.elapsedTime = 0;
    this.strikes = 0;
    this.isCompleted = false;

    // Parking alignment state
    this.parkingHoldTimer = 0; // Must hold parking position for 1.2s to win
    this.parkingAccuracy = 0;
    this.minObstacleDist = 999;

    // Callbacks
    this.onLevelComplete = null;
    this.onLevelFail = null;

    // Realistic SAT OBB collision system
    this.collisionSystem = new CollisionSystem(this.audio);
  }

  startLevel(index = 0, vehicle) {
    this.currentLevelIndex = index % PARKING_LEVELS.length;
    this.levelData = PARKING_LEVELS[this.currentLevelIndex];

    this.cleanupCones();

    // Spawn level cones
    this.levelData.cones.forEach(c => {
      const cone = this.district.spawnTrafficCone(c.x, c.z);
      this.spawnedCones.push(cone);
    });

    // Set target bay marker
    this.district.setTargetSlot(this.levelData.targetSlot);

    // Reset vehicle to start
    vehicle.reset(
      this.levelData.startPos.x,
      this.levelData.startPos.y,
      this.levelData.startPos.z,
      this.levelData.startHeading
    );

    this.levelStartTime = performance.now();
    this.elapsedTime = 0;
    this.strikes = 0;
    this.isCompleted = false;
    this.parkingHoldTimer = 0;
  }

  cleanupCones() {
    this.spawnedCones.forEach(c => {
      this.district.group.remove(c);
    });
    this.spawnedCones = [];
  }

  update(vehicle, delta) {
    if (this.isCompleted || !this.levelData) return;

    this.elapsedTime = (performance.now() - this.levelStartTime) / 1000;

    // 1. Collision check with obstacles
    this.checkCollisions(vehicle);

    // 2. Parking alignment check
    this.checkParkingSuccess(vehicle, delta);

    // 3. Audio parking assist sensor (PDC)
    this.updateParkingSensor(vehicle);
  }

  checkCollisions(vehicle) {
    if (!this.district || !this.district.obstacles) return;

    const res = this.collisionSystem.resolveVehicleCollisions(
      vehicle,
      this.district.obstacles,
      this.elapsedTime
    );

    if (res.strike) {
      this.strikes++;
    }
  }

  checkParkingSuccess(vehicle, delta) {
    const slot = this.levelData.targetSlot;
    const dx = vehicle.position.x - slot.x;
    const dz = vehicle.position.z - slot.z;
    const distToCenter = Math.sqrt(dx * dx + dz * dz);

    // Angle difference
    let angleDiff = Math.abs(vehicle.heading - slot.heading) % (Math.PI * 2);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    // Allow 180 reverse parking alignment too
    let reverseAngleDiff = Math.abs(angleDiff - Math.PI);
    const effectiveAngleDiff = Math.min(angleDiff, reverseAngleDiff);

    const isStopped = Math.abs(vehicle.speed) < 0.2;
    const isInsideSlot = distToCenter < 1.1 && effectiveAngleDiff < 0.28; // ~16 degrees

    if (isInsideSlot && isStopped) {
      this.parkingHoldTimer += delta;
      this.parkingAccuracy = Math.max(0, 100 - (distToCenter * 40 + effectiveAngleDiff * 80));

      if (this.parkingHoldTimer >= 1.2) {
        // SUCCESS!
        this.isCompleted = true;
        this.audio.playSuccessSound();

        let stars = 3;
        if (this.strikes > 0 || this.elapsedTime > this.levelData.timeLimit * 0.7) stars = 2;
        if (this.strikes > 2 || this.elapsedTime > this.levelData.timeLimit) stars = 1;

        if (this.onLevelComplete) {
          this.onLevelComplete({
            level: this.levelData.level,
            title: this.levelData.title,
            time: this.elapsedTime.toFixed(1),
            strikes: this.strikes,
            accuracy: Math.round(this.parkingAccuracy),
            stars: stars,
            hasNext: this.currentLevelIndex < PARKING_LEVELS.length - 1
          });
        }
      }
    } else {
      this.parkingHoldTimer = Math.max(0, this.parkingHoldTimer - delta * 2.0);
    }
  }

  updateParkingSensor(vehicle) {
    // Distance to nearest obstacle
    let minD = 999;
    const vPos = vehicle.position;

    this.district.obstacles.forEach(obs => {
      const center = new THREE.Vector3();
      obs.getCenter(center);
      const d = vPos.distanceTo(center);
      if (d < minD) minD = d;
    });

    this.minObstacleDist = minD;

    // If reversing or maneuvering, play ultrasonic beep
    if (vehicle.speed < 0 || minD < 4.0) {
      this.audio.playParkingSensor(minD);
    }
  }

  nextLevel(vehicle) {
    this.startLevel(this.currentLevelIndex + 1, vehicle);
  }

  restartLevel(vehicle) {
    this.startLevel(this.currentLevelIndex, vehicle);
  }
}

