import * as THREE from 'three';

export class CollisionSystem {
  constructor(audioManager = null) {
    this.audio = audioManager;
    this.lastCollisionTime = 0;
    this.strikeCooldown = 0.35; // Seconds between strike increments
  }

  /**
   * Separating Axis Theorem (SAT) collision test between
   * vehicle's Oriented Bounding Box (OBB) and an obstacle AABB (THREE.Box3).
   */
  checkOBBvsAABB(carPos, heading, halfWidth, halfLength, obs) {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);

    // Car unit direction vectors
    const carForward = { x: sin, z: cos };
    const carRight = { x: cos, z: -sin };

    // 4 Corners of the vehicle chassis in X-Z world space
    const carCorners = [
      { x: carPos.x + carRight.x * halfWidth + carForward.x * halfLength, z: carPos.z + carRight.z * halfWidth + carForward.z * halfLength },
      { x: carPos.x - carRight.x * halfWidth + carForward.x * halfLength, z: carPos.z - carRight.z * halfWidth + carForward.z * halfLength },
      { x: carPos.x - carRight.x * halfWidth - carForward.x * halfLength, z: carPos.z - carRight.z * halfWidth - carForward.z * halfLength },
      { x: carPos.x + carRight.x * halfWidth - carForward.x * halfLength, z: carPos.z + carRight.z * halfWidth - carForward.z * halfLength }
    ];

    // 4 Corners of the obstacle in X-Z space
    const obsCorners = [
      { x: obs.min.x, z: obs.min.z },
      { x: obs.max.x, z: obs.min.z },
      { x: obs.max.x, z: obs.max.z },
      { x: obs.min.x, z: obs.max.z }
    ];

    // The 4 test axes (2 from obstacle, 2 from car)
    const axes = [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      carRight,
      carForward
    ];

    let minOverlap = Infinity;
    let separationNormal = null;

    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];

      // Project car corners onto axis
      let carMin = Infinity;
      let carMax = -Infinity;
      for (let j = 0; j < 4; j++) {
        const proj = carCorners[j].x * axis.x + carCorners[j].z * axis.z;
        if (proj < carMin) carMin = proj;
        if (proj > carMax) carMax = proj;
      }

      // Project obstacle corners onto axis
      let obsMin = Infinity;
      let obsMax = -Infinity;
      for (let j = 0; j < 4; j++) {
        const proj = obsCorners[j].x * axis.x + obsCorners[j].z * axis.z;
        if (proj < obsMin) obsMin = proj;
        if (proj > obsMax) obsMax = proj;
      }

      const overlap = Math.min(carMax, obsMax) - Math.max(carMin, obsMin);
      if (overlap <= 0) {
        // Separating axis found: no collision!
        return null;
      }

      if (overlap < minOverlap) {
        minOverlap = overlap;

        // Ensure normal points from obstacle outward to car
        const obsCenterX = (obs.min.x + obs.max.x) * 0.5;
        const obsCenterZ = (obs.min.z + obs.max.z) * 0.5;
        const dirX = carPos.x - obsCenterX;
        const dirZ = carPos.z - obsCenterZ;
        const dot = dirX * axis.x + dirZ * axis.z;
        const sign = dot < 0 ? -1 : 1;

        separationNormal = { x: axis.x * sign, z: axis.z * sign };
      }
    }

    return {
      depth: minOverlap,
      normal: separationNormal
    };
  }

  /**
   * Resolves vehicle collisions against an array of Box3 obstacles.
   * Returns { collided: boolean, strike: boolean, impactSpeed: number }
   */
  resolveVehicleCollisions(vehicle, obstacles, currentTimeSec) {
    if (!vehicle || !obstacles || obstacles.length === 0) {
      return { collided: false, strike: false, impactSpeed: 0 };
    }

    const dims = vehicle.options.dimensions || { width: 1.95, length: 4.5, height: 1.25 };
    const halfWidth = (dims.width || 1.95) * 0.48; // Snug contact boundary
    const halfLength = (dims.length || 4.5) * 0.48;
    const vehicleY = vehicle.position.y;
    const vehicleH = dims.height || 1.25;

    let hasCollided = false;
    let didStrike = false;
    let maxImpactSpeed = 0;

    const carPos = vehicle.position;
    const heading = vehicle.heading;
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];

      // 1. Fast broad-phase spatial check (distance < 7.5m)
      const obsCenterX = (obs.min.x + obs.max.x) * 0.5;
      const obsCenterZ = (obs.min.z + obs.max.z) * 0.5;
      const dx = carPos.x - obsCenterX;
      const dz = carPos.z - obsCenterZ;
      if (dx * dx + dz * dz > 56.25) continue; // 7.5^2

      // 2. Vertical overlap check
      if (vehicleY > obs.max.y || (vehicleY + vehicleH) < obs.min.y) {
        continue;
      }

      // 3. Narrow-phase 2D OBB vs AABB SAT
      const sat = this.checkOBBvsAABB(carPos, heading, halfWidth, halfLength, obs);
      if (!sat) continue;

      hasCollided = true;
      const depth = sat.depth;
      const nx = sat.normal.x;
      const nz = sat.normal.z;

      // 4. HARD POSITIONAL SEPARATION
      // Immediately push vehicle out of the obstacle by penetration depth + safety margin
      const pushDist = depth + 0.015;
      vehicle.position.x += nx * pushDist;
      vehicle.position.z += nz * pushDist;

      // 5. PHYSICAL IMPULSE & VELOCITY RESOLUTION
      // Current velocity vector along forward heading
      const vx = vehicle.speed * fwdX;
      const vz = vehicle.speed * fwdZ;

      // Velocity component along the collision normal
      const vNormal = vx * nx + vz * nz;

      // Only respond if vehicle is actively moving INTO the obstacle surface
      if (vNormal < 0) {
        const impactSpeed = Math.abs(vNormal);
        if (impactSpeed > maxImpactSpeed) maxImpactSpeed = impactSpeed;

        // Inelastic bumper restitution: e = 0.22 (damped metal/plastic bounce)
        const restitution = 0.22;
        const friction = 0.65; // Wall/curb sliding friction

        // Tangential velocity vector
        const vtX = vx - vNormal * nx;
        const vtZ = vz - vNormal * nz;

        // Resolved velocity
        const vNewX = vtX * (1.0 - friction) - vNormal * restitution * nx;
        const vNewZ = vtZ * (1.0 - friction) - vNormal * restitution * nz;

        // Reconstruct scalar vehicle speed along car forward axis
        vehicle.speed = vNewX * fwdX + vNewZ * fwdZ;

        // Angular torque impulse based on impact location relative to center of mass
        // Contact offset in vehicle local space
        const contactRelX = (obsCenterX - carPos.x);
        const contactRelZ = (obsCenterZ - carPos.z);
        const torque = (contactRelX * nz - contactRelZ * nx);
        vehicle.angularVelocity += Math.sign(torque) * Math.min(Math.abs(torque) * 0.4, 2.5) * Math.min(impactSpeed, 8.0);

        // Suspension pitch/roll shudder on crash impact
        vehicle.bodyPitchVel += nz * Math.min(impactSpeed * 0.35, 2.0);
        vehicle.bodyRollVel -= nx * Math.min(impactSpeed * 0.35, 2.0);

        // Strike tracking with cooldown
        if (currentTimeSec - this.lastCollisionTime > this.strikeCooldown) {
          this.lastCollisionTime = currentTimeSec;
          didStrike = true;

          if (this.audio) {
            const vol = Math.min(1.0, Math.max(0.3, impactSpeed / 8.0));
            this.audio.playCrashSound(vol);
          }
        }
      }
    }

    return {
      collided: hasCollided,
      strike: didStrike,
      impactSpeed: maxImpactSpeed
    };
  }
}
