import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Vehicle {
  constructor(scene, config, initialPos = { x: 0, y: 0, z: 0 }, initialHeading = 0) {
    this.scene = scene;
    this.config = config;

    this.position = new THREE.Vector3(initialPos.x, initialPos.y, initialPos.z);
    this.heading = initialHeading; // Radians, 0 = forward along +Z

    // Dynamic states
    this.speed = 0;              // Current speed in m/s (+ forward, - reverse)
    this.gear = 'D';             // 'P', 'R', 'N', 'D'
    this.steerAngle = 0;         // Current steering angle (radians)
    this.angularVelocity = 0;    // Yaw turn rate

    // Suspension dynamics (Spring-Mass-Damper for realistic body roll & pitch)
    this.rollCenterHeight = 0.45; // Height of suspension roll center in meters
    this.bodyRoll = 0;
    this.bodyRollVel = 0;
    this.bodyPitch = 0;
    this.bodyPitchVel = 0;

    this.isBraking = false;
    this.isDrifting = false;
    this.isReversing = false;
    this.lightsOn = true;

    // Three.js Hierarchy:
    // this.group (Position & Yaw)
    //   -> this.bodyPivot (Roll center height Y=0.45, handles Pitch & Roll)
    //        -> this.modelRoot (Offset by -rollCenterHeight so bottom stays on ground Y=0)
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.set(0, this.rollCenterHeight, 0);
    this.group.add(this.bodyPivot);

    // Node references
    this.modelRoot = null;
    this.steeringWheelNode = null;
    this.steeringWheelPivot = null;

    // Lighting
    this.headlightObjects = [];
    this.taillightMeshes = [];

    // Particles
    this.tireSmokeParticles = null;
    this.tireSmokeData = null;

    // Collision Box
    this.collider = new THREE.Box3();

    this.isLoaded = false;
    this.loadModel();
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load(this.config.file, (gltf) => {
      this.modelRoot = gltf.scene;

      // Apply configuration scale and offset
      this.modelRoot.scale.setScalar(this.config.scale);
      // Place model inside bodyPivot so its wheels rest on the road (Y = 0)
      this.modelRoot.position.set(
        this.config.offset.x,
        this.config.offset.y - this.rollCenterHeight,
        this.config.offset.z
      );

      // Find steering wheel and configure proper in-place pivot
      this.modelRoot.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          const name = child.name.toLowerCase();
          if (name.includes('steer') && !this.steeringWheelNode) {
            this.setupSteeringWheelPivot(child);
          }
        }
      });

      this.bodyPivot.add(this.modelRoot);
      this.setupLights();
      this.setupParticles();

      this.isLoaded = true;
      console.log(`Vehicle ${this.config.name} loaded and configured.`);
    }, undefined, (err) => {
      console.error(`Error loading vehicle ${this.config.name}:`, err);
    });
  }

  setupSteeringWheelPivot(steerMesh) {
    steerMesh.geometry.computeBoundingBox();
    const box = steerMesh.geometry.boundingBox;
    if (!box) return;

    // Center of steering wheel geometry
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Create a dedicated pivot node at the center of the steering wheel
    const parent = steerMesh.parent;
    if (!parent) return;

    const pivot = new THREE.Group();
    pivot.position.copy(center);
    parent.add(pivot);

    // Re-parent mesh under pivot
    parent.remove(steerMesh);
    steerMesh.position.sub(center);
    pivot.add(steerMesh);

    this.steeringWheelPivot = pivot;
    this.steeringWheelNode = steerMesh;
  }

  setupLights() {
    // Twin forward headlights
    this.config.headlights.forEach((h) => {
      const spot = new THREE.SpotLight(0xfffaed, 2.8, 50, Math.PI / 5.5, 0.35, 1.2);
      spot.position.set(h.x, h.y - this.rollCenterHeight, h.z);

      const target = new THREE.Object3D();
      target.position.set(h.x * 0.8, h.y - this.rollCenterHeight - 0.2, h.z + 25);
      this.bodyPivot.add(target);
      spot.target = target;
      spot.castShadow = false;

      this.bodyPivot.add(spot);
      this.headlightObjects.push(spot);

      // Visual headlight bulb glow
      const bulbGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(h.x, h.y - this.rollCenterHeight, h.z);
      this.bodyPivot.add(bulb);
    });

    // Rear taillights glow bulbs
    this.config.taillights.forEach((t) => {
      const bulbGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xaa1111 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(t.x, t.y - this.rollCenterHeight, t.z);
      this.bodyPivot.add(bulb);
      this.taillightMeshes.push(bulb);
    });
  }

  setupParticles() {
    const count = 35;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const ages = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] = -100;
      ages[i] = 1.0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 0.9,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });

    this.tireSmokeParticles = new THREE.Points(geo, mat);
    this.tireSmokeData = { count, positions, ages };
    this.scene.add(this.tireSmokeParticles);
  }

  toggleLights() {
    this.lightsOn = !this.lightsOn;
    this.headlightObjects.forEach((light) => {
      light.visible = this.lightsOn;
    });
    return this.lightsOn;
  }

  update(input, delta) {
    if (!this.isLoaded) return;

    const phys = this.config.physics;
    const accelInput = input.throttle;
    const brakeInput = input.brake;
    const steerInput = input.steering;
    const isHandbrake = input.handbrake;
    const isBoost = input.boost;

    // 1. DYNAMIC SPEED-SENSITIVE STEERING
    // At low parking speed (<15 km/h), full turning lock (up to 34 deg) for easy parking.
    // At high highway speed, gradually reduce steer lock to maintain smooth control without flipping.
    const speedKmh = Math.abs(this.speed) * 3.6;
    const speedSteerFactor = Math.max(0.35, 1.0 - (speedKmh / 140.0) * 0.65);
    const maxCurrentSteer = phys.maxSteerAngle * speedSteerFactor;

    const targetSteer = steerInput * maxCurrentSteer;
    const steerRate = steerInput !== 0 ? phys.steerSpeed * 3.5 : phys.steerSpeed * 4.5;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1.0, steerRate * delta);

    // 2. LONGITUDINAL FORCES (ACCELERATION / BRAKING / REVERSE)
    const boostMultiplier = isBoost ? 1.6 : 1.0;
    const effectiveMaxSpeed = phys.maxSpeed * boostMultiplier;
    this.isBraking = false;
    this.isReversing = false;

    if (this.gear === 'D') {
      if (accelInput > 0) {
        // Accelerate forward
        this.speed += phys.acceleration * boostMultiplier * accelInput * delta;
        this.speed = Math.min(this.speed, effectiveMaxSpeed);
      } else if (brakeInput > 0) {
        if (this.speed > 0.2) {
          // Brake forward
          this.speed -= phys.brakeForce * brakeInput * delta;
          this.isBraking = true;
          if (this.speed < 0) this.speed = 0;
        } else {
          // Came to a full stop -> switch to Reverse!
          this.speed = 0;
          this.gear = 'R';
        }
      } else {
        // Rolling resistance & drag
        const drag = (phys.friction + (this.speed * this.speed) * phys.airResistance) * delta;
        this.speed = Math.max(0, this.speed - drag);
      }
    } else if (this.gear === 'R') {
      this.isReversing = true;
      if (brakeInput > 0) {
        // Accelerate in reverse
        this.speed -= phys.reverseAccel * brakeInput * delta;
        this.speed = Math.max(this.speed, -phys.reverseMaxSpeed);
      } else if (accelInput > 0) {
        if (this.speed < -0.2) {
          // Brake in reverse
          this.speed += phys.brakeForce * accelInput * delta;
          this.isBraking = true;
          if (this.speed > 0) this.speed = 0;
        } else {
          // Came to a stop -> switch back to Drive!
          this.speed = 0;
          this.gear = 'D';
        }
      } else {
        // Rolling resistance in reverse
        const drag = (phys.friction + (this.speed * this.speed) * phys.airResistance) * delta;
        this.speed = Math.min(0, this.speed + drag);
      }
    }

    // 3. HANDBRAKE & DRIFT
    this.isDrifting = false;
    if (isHandbrake) {
      this.speed *= Math.max(0, 1.0 - (phys.handbrakeDecel * 0.04 * delta));
      if (Math.abs(this.speed) > 4.5 && Math.abs(this.steerAngle) > 0.1) {
        this.isDrifting = true;
      }
    }

    // 4. KINEMATIC BICYCLE MODEL (Realistic Turning & Heading)
    const wheelbase = 2.8; // Standard wheelbase in meters
    if (Math.abs(this.speed) > 0.04) {
      // Drift multiplier gives tail slide on handbrake
      const driftMultiplier = this.isDrifting ? 1.7 : 1.0;
      // Heading change rate (rad/s)
      const targetTurnRate = (this.speed / wheelbase) * Math.tan(this.steerAngle) * driftMultiplier;

      // Inertial yaw lag gives natural car weight feel
      this.angularVelocity += (targetTurnRate - this.angularVelocity) * Math.min(1.0, 10.0 * delta);
      this.heading += this.angularVelocity * delta;
    } else {
      this.angularVelocity = 0;
    }

    // 5. UPDATE WORLD POSITION
    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;

    // 6. REALISTIC SUSPENSION BODY ROLL & PITCH
    // Centrifugal lateral acceleration: a_lat = v * omega
    const lateralAcc = this.speed * this.angularVelocity;
    // When turning right (a_lat > 0), centrifugal force pushes the body to lean LEFT.
    // In Three.js: -Z roll tilts body to the left!
    // Clamped target roll angle (-0.065 to +0.065 radians = ~3.7 degrees)
    const targetRoll = -Math.max(-0.065, Math.min(0.065, lateralAcc * 0.007));

    // Pitch: Brake dive (front suspension compresses) and throttle squat
    let targetPitch = 0;
    if (this.isBraking) {
      targetPitch = 0.038 * (Math.abs(this.speed) / phys.maxSpeed);
    } else if (accelInput > 0 && this.speed > 0) {
      targetPitch = -0.022 * (Math.abs(this.speed) / phys.maxSpeed);
    }

    // 2nd-order Damped Spring-Mass system for suspension
    const springK = 35.0; // Spring stiffness
    const damperC = 9.0;  // Damping coefficient

    const rollForce = (targetRoll - this.bodyRoll) * springK - this.bodyRollVel * damperC;
    this.bodyRollVel += rollForce * delta;
    this.bodyRoll += this.bodyRollVel * delta;

    const pitchForce = (targetPitch - this.bodyPitch) * springK - this.bodyPitchVel * damperC;
    this.bodyPitchVel += pitchForce * delta;
    this.bodyPitch += this.bodyPitchVel * delta;

    // 7. APPLY ROTATIONS & ORIENTATIONS
    // Outer group rotates around World Y (Yaw heading)
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.heading, 0);

    // Inner bodyPivot rotates around Roll Center (Pitch & Roll)
    this.bodyPivot.rotation.set(this.bodyPitch, 0, this.bodyRoll);

    // 8. STEERING WHEEL ROTATION IN COCKPIT
    if (this.steeringWheelPivot) {
      // Rotates smoothly on its steering column
      this.steeringWheelPivot.rotation.z = -this.steerAngle * 3.8;
    }

    // 9. BRAKE LIGHTS VISUAL GLOW
    const isBrightBrake = this.isBraking || this.isReversing;
    this.taillightMeshes.forEach(bulb => {
      bulb.material.color.setHex(isBrightBrake ? 0xff2222 : 0x660808);
      bulb.scale.setScalar(isBrightBrake ? 1.4 : 1.0);
    });

    // 10. TIRE SMOKE PARTICLES
    this.updateParticles(delta);

    // 11. COLLIDER UPDATE
    this.collider.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + this.config.dimensions.height * 0.5, this.position.z),
      new THREE.Vector3(this.config.dimensions.width, this.config.dimensions.height, this.config.dimensions.length)
    );
  }

  updateParticles(delta) {
    if (!this.tireSmokeParticles || !this.tireSmokeData) return;

    const data = this.tireSmokeData;
    const shouldEmit = this.isDrifting || (this.isBraking && Math.abs(this.speed) > 8);

    for (let i = 0; i < data.count; i++) {
      data.ages[i] += delta;
      if (data.ages[i] > 0.55) {
        if (shouldEmit && Math.random() < 0.35) {
          const sign = Math.random() > 0.5 ? 1 : -1;
          const cosH = Math.cos(this.heading);
          const sinH = Math.sin(this.heading);

          const localX = sign * 0.72;
          const localZ = -1.6;

          data.positions[i * 3 + 0] = this.position.x + (localX * cosH + localZ * sinH);
          data.positions[i * 3 + 1] = this.position.y + 0.12;
          data.positions[i * 3 + 2] = this.position.z + (-localX * sinH + localZ * cosH);
          data.ages[i] = 0;
        } else {
          data.positions[i * 3 + 1] = -100;
        }
      } else {
        data.positions[i * 3 + 1] += 0.45 * delta;
      }
    }
    this.tireSmokeParticles.geometry.attributes.position.needsUpdate = true;
  }

  reset(x = 0, y = 0, z = 0, heading = 0) {
    this.position.set(x, y, z);
    this.heading = heading;
    this.speed = 0;
    this.gear = 'D';
    this.steerAngle = 0;
    this.angularVelocity = 0;
    this.bodyRoll = 0;
    this.bodyRollVel = 0;
    this.bodyPitch = 0;
    this.bodyPitchVel = 0;
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.heading, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
  }

  destroy() {
    this.scene.remove(this.group);
    if (this.tireSmokeParticles) this.scene.remove(this.tireSmokeParticles);
  }
}
