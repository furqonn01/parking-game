import { CollisionSystem } from '../physics/CollisionSystem.js';

export class FreeRoamMode {
  constructor(audioManager = null) {
    this.topSpeed = 0;
    this.totalDistance = 0;
    this.driftScore = 0;
    this.driftMultiplier = 1;
    this.isDrifting = false;
    this.collisionSystem = new CollisionSystem(audioManager);
  }

  start(vehicle) {
    // Start along the central grand boulevard facing east towards the city avenues
    vehicle.reset(0, 0, 0, Math.PI / 2);
  }

  update(vehicle, obstacles, delta) {
    const kmh = Math.abs(vehicle.speed) * 3.6;
    if (kmh > this.topSpeed) {
      this.topSpeed = kmh;
    }

    this.totalDistance += (Math.abs(vehicle.speed) * delta) / 1000; // In km

    if (vehicle.isDrifting && kmh > 20) {
      this.isDrifting = true;
      this.driftScore += Math.round(kmh * delta * 2 * this.driftMultiplier);
      this.driftMultiplier = Math.min(4, this.driftMultiplier + delta * 0.5);
    } else {
      this.isDrifting = false;
      this.driftMultiplier = 1;
    }

    // Realistic collisions in Free Roam
    if (obstacles && obstacles.length > 0) {
      this.collisionSystem.resolveVehicleCollisions(vehicle, obstacles, performance.now() / 1000);
    }
  }

  getStats() {
    return {
      topSpeed: Math.round(this.topSpeed),
      totalDistance: this.totalDistance.toFixed(2),
      driftScore: this.driftScore
    };
  }
}

