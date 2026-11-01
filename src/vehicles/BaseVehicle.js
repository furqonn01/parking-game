import * as THREE from 'three';

export class BaseVehicle {
  constructor(scene, options) {
    this.scene = scene;
    this.options = options;
    this.config = options;

    // World position & heading
    this.position = new THREE.Vector3(options.initialPos?.x || 0, options.initialPos?.y || 0, options.initialPos?.z || 0);
    this.heading = options.initialHeading || 0; // 0 = facing along +Z

    // Kinematic motion states
    this.speed = 0;              // Current speed in m/s (+ forward, - reverse)
    this.steerAngle = 0;         // Steering angle in radians (+ = right, - = left)
    this.steerWheelAngle = 0;    // Interior steering wheel rotation angle in radians
    this.targetSteerAngle = 0;
    this.steerVelocity = 0;      // Physical steering rack velocity (for smooth, natural wheel turning animation)
    this.effectiveSteer = 0;     // Tire lateral slip relaxation angle (creates authentic mechanical delay from steering input to chassis yaw)
    this.angularVelocity = 0;    // Yaw rate in rad/s
    this.gear = 'D';             // Automatic PRND mode: 'P', 'R', 'N', 'D'
    this.forwardGear = 1;        // Active mechanical forward gear: 1, 2, 3, 4, 5, 6, 7
    this.shiftCooldown = 0;      // Shift delay timer (prevents rapid gear hunting)
    this.isShifting = false;     // Clutch disengagement flag during upshift/downshift
    this.shiftDuration = 0;      // Shift animation / dip timer
    this.engineRpm = 850;        // Simulated realistic engine RPM
    this.targetRpm = 850;        // Target RPM for audio and gauges

    // Wheel animation states
    this.wheelSpinAngle = 0;
    this.wheelRadius = options.wheelRadius || 0.35;

    // Chassis suspension dynamics
    this.bodyRoll = 0;
    this.bodyRollVel = 0;
    this.bodyPitch = 0;
    this.bodyPitchVel = 0;

    // State flags
    this.isBraking = false;
    this.isReversing = false;
    this.isDrifting = false;
    this.lightsOn = true;

    // Progressive engine & brake response smoothing
    this.smoothedThrottle = 0;
    this.smoothedBrake = 0;
    this.shiftTimer = 0;
    this.longitudinalAccel = 0;
    this.contactShadow = null;

    // Scene Graph Hierarchy:
    // this.group (World Position & Yaw heading)
    //   -> this.wheelsGroup (On road surface Y=0, holds steering & spinning wheels)
    //        -> this.frontLeftSteerPivot -> this.frontLeftSpinNode
    //        -> this.frontRightSteerPivot -> this.frontRightSpinNode
    //        -> this.rearLeftWheelPivot -> this.rearLeftSpinNode
    //        -> this.rearRightWheelPivot -> this.rearRightSpinNode
    //   -> this.bodyPivot (Suspension Roll & Pitch around roll center)
    //        -> this.modelRoot (Chassis body shell, interior, lights)
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.wheelsGroup = new THREE.Group();
    this.group.add(this.wheelsGroup);

    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.set(0, options.rollCenterHeight || 0.35, 0);
    this.group.add(this.bodyPivot);

    // Front Steerable Kingpin Pivots (Rotate around local Y for steering)
    this.frontLeftSteerPivot = new THREE.Group();
    this.frontRightSteerPivot = new THREE.Group();
    this.rearLeftWheelPivot = new THREE.Group();
    this.rearRightWheelPivot = new THREE.Group();

    // Wheel Spin Nodes (Rotate around local X for rolling)
    this.frontLeftSpinNode = new THREE.Group();
    this.frontRightSpinNode = new THREE.Group();
    this.rearLeftSpinNode = new THREE.Group();
    this.rearRightSpinNode = new THREE.Group();

    this.frontLeftSteerPivot.add(this.frontLeftSpinNode);
    this.frontRightSteerPivot.add(this.frontRightSpinNode);
    this.rearLeftWheelPivot.add(this.rearLeftSpinNode);
    this.rearRightWheelPivot.add(this.rearRightSpinNode);

    this.wheelsGroup.add(this.frontLeftSteerPivot);
    this.wheelsGroup.add(this.frontRightSteerPivot);
    this.wheelsGroup.add(this.rearLeftWheelPivot);
    this.wheelsGroup.add(this.rearRightWheelPivot);

    this.isLoaded = false;

    // Lighting collections (Spotlights & Car Material References)
    this.headlightSpots = [];
    this.headlightMaterials = [];
    this.taillightMaterials = [];

    // Tire smoke particles
    this.tireSmokeParticles = null;
    this.tireSmokeData = null;

    // Collider
    this.collider = new THREE.Box3();

    this.reset(options.initialPos?.x || 0, options.initialPos?.y || 0, options.initialPos?.z || 0, options.initialHeading || 0);
  }

  setGear(mode) {
    const validModes = ['P', 'R', 'N', 'D'];
    if (!validModes.includes(mode)) return;
    if (this.gear === mode) return;

    // Safety lockout: cannot shift into P or R while vehicle is moving forward significantly
    if ((mode === 'P' || mode === 'R') && this.speed > 1.2) {
      return; // Must brake before engaging Park or Reverse
    }
    // Cannot shift into D while reversing fast
    if (mode === 'D' && this.speed < -1.2) {
      return;
    }

    this.gear = mode;
    this.shiftCooldown = 0.25;
    if (mode === 'D' && this.forwardGear < 1) this.forwardGear = 1;
  }

  shiftUp() {
    const modes = ['P', 'R', 'N', 'D'];
    const idx = modes.indexOf(this.gear);
    if (idx < modes.length - 1) {
      this.setGear(modes[idx + 1]);
    }
  }

  shiftDown() {
    const modes = ['P', 'R', 'N', 'D'];
    const idx = modes.indexOf(this.gear);
    if (idx > 0) {
      this.setGear(modes[idx - 1]);
    }
  }

  setupContactShadow() {
    if (typeof document === 'undefined') return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, 256, 256);
      ctx.save();
      ctx.translate(128, 128);
      ctx.scale(1.0, 1.48); // Elongated along vehicle length
      const grad = ctx.createRadialGradient(0, 0, 26, 0, 0, 84);
      grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.88)');
      grad.addColorStop(0.38, 'rgba(0, 0, 0, 0.65)');
      grad.addColorStop(0.72, 'rgba(0, 0, 0, 0.22)');
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 84, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const shadowTex = new THREE.CanvasTexture(canvas);
      const dims = this.options.dimensions;
      const shadowGeo = new THREE.PlaneGeometry(dims.width * 1.10, dims.length * 1.04);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
        toneMapped: false
      });

      this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
      this.contactShadow.rotation.x = -Math.PI / 2;
      this.contactShadow.position.set(0, 0.015, 0); // Hugs road right beneath the tires
      this.group.add(this.contactShadow);
    } catch (e) {
      console.warn('Could not setup contact shadow:', e);
    }
  }

  setupParticles() {
    const count = 40;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const ages = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] = -100;
      ages[i] = 1.0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xdddddd,
      size: 0.95,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });

    this.tireSmokeParticles = new THREE.Points(geo, mat);
    this.tireSmokeData = { count, positions, ages };
    this.scene.add(this.tireSmokeParticles);
  }

  toggleLights() {
    this.lightsOn = !this.lightsOn;
    // Toggle forward spotlight beams
    this.headlightSpots.forEach(s => {
      s.visible = this.lightsOn;
    });
    // Toggle emissive glow on car's actual headlight lens materials
    this.headlightMaterials.forEach(m => {
      if (m && m.emissive) {
        m.emissive.setHex(this.lightsOn ? (m.userData.onColor || 0xfffaed) : 0x000000);
        m.emissiveIntensity = this.lightsOn ? (m.userData.onIntensity || 2.5) : 0.0;
      }
    });
    return this.lightsOn;
  }

  updatePhysics(input, delta) {
    const phys = this.options.physics;
    const accelInput = input.throttle || 0;
    const brakeInput = input.brake || 0;
    const steerInput = input.steering || 0; // -1 (Left), +1 (Right)
    const isHandbrake = input.handbrake;
    const isBoost = input.boost;

    // 1. PROGRESSIVE THROTTLE & HYDRAULIC BRAKE RESPONSIVENESS
    // Instantaneous, crisp response at parking & low speeds to eliminate sluggishness / hesitation ("nahan")
    const isLowSpeed = Math.abs(this.speed) < 3.5; // < ~12.5 km/h
    const throttleSpoolRate = isLowSpeed ? 26.0 : (accelInput > this.smoothedThrottle ? 10.0 : 16.0);
    this.smoothedThrottle += (accelInput - this.smoothedThrottle) * Math.min(1.0, throttleSpoolRate * delta);

    const brakeSpoolRate = isLowSpeed ? 28.0 : (brakeInput > this.smoothedBrake ? 14.0 : 18.0);
    this.smoothedBrake += (brakeInput - this.smoothedBrake) * Math.min(1.0, brakeSpoolRate * delta);

    // 2. SPEED-SENSITIVE ACKERMANN STEERING, HUMAN HAND RATE & CASTER SELF-CENTERING
    // Progressive steering reduction curve (German sports / executive steering tuning):
    // - Up to 22 km/h (Parking & Tight Maneuvering): 100% full steering lock (zero reduction)
    //   Allows maximum maneuverability into parking bays and tight U-turns.
    // - 22 - 75 km/h (City & Suburb): Gradual smooth tapering down to ~60% lock.
    // - 75 - 125 km/h (Highway Cruising): Stabilized around ~42% lock to prevent twitchy lane wandering.
    // - 125+ km/h (Autobahn): Smooth asymptotic floor at ~25% lock.
    const speedKmh = Math.abs(this.speed) * 3.6;
    const speedAboveParking = Math.max(0, speedKmh - 22.0);
    const speedReductionFactor = 1.0 / (1.0 + Math.pow(speedAboveParking / 72.0, 1.45) * 1.55);
    const steerLimitFactor = Math.max(0.25, Math.min(1.0, speedReductionFactor));
    const maxSteer = phys.maxSteerAngle * steerLimitFactor;

    this.targetSteerAngle = steerInput * maxSteer;

    // Realistic human-hand steering wheel rotation rate & speed-dependent caster return:
    // Turning from straight (0°) to full lock (~35° wheels / ~240° steering wheel) takes ~0.42s
    // with smooth S-curve acceleration so steering never snaps robotically in 1-2 frames.
    const isReleasing = (steerInput === 0);
    const isCounterSteering = (steerInput !== 0 && Math.abs(this.steerAngle) > 0.01 && Math.sign(steerInput) !== Math.sign(this.steerAngle));
    const absSpeedNow = Math.abs(this.speed);

    let maxRackSpeed;
    let rackAccel;
    if (isCounterSteering) {
      // Driver actively counter-steering across center assisted by caster torque
      maxRackSpeed = 2.05 + Math.min(0.65, absSpeedNow * 0.08);
      rackAccel = 13.5;
    } else if (isReleasing) {
      // Releasing steering wheel: caster self-aligning torque scales naturally with rolling speed
      // Gentle power-steering return when stationary, faster alignment when moving
      maxRackSpeed = 1.15 + Math.min(1.25, absSpeedNow * 0.14);
      rackAccel = 9.0 + Math.min(5.0, absSpeedNow * 0.45);
    } else {
      // Progressive hand turn-in into the corner
      maxRackSpeed = 1.45;
      rackAccel = 9.5;
    }

    const steerDiff = this.targetSteerAngle - this.steerAngle;
    if (Math.abs(steerDiff) < 0.002) {
      this.steerAngle = this.targetSteerAngle;
      this.steerVelocity = 0;
    } else {
      const desiredVelocity = Math.sign(steerDiff) * Math.min(maxRackSpeed, Math.sqrt(2.0 * rackAccel * Math.abs(steerDiff)));
      const velDiff = desiredVelocity - this.steerVelocity;
      this.steerVelocity += Math.sign(velDiff) * Math.min(Math.abs(velDiff), rackAccel * delta);
      this.steerAngle += this.steerVelocity * delta;
    }

    // Authentic steering column ratio (~6.8x front wheel angle -> ~240° each way at full lock)
    this.steerWheelAngle = this.steerAngle * 6.8;

    // 3. ENGINE ACCELERATION, AUTOMATIC GEAR SHIFTING & PURE BRAKING
    const boostMultiplier = isBoost ? 1.55 : 1.0;
    const effectiveMaxSpeed = phys.maxSpeed * boostMultiplier;

    this.isBraking = false;
    this.isReversing = (this.gear === 'R');
    const prevSpeed = this.speed;

    // Shift timer countdown
    if (this.shiftCooldown > 0) this.shiftCooldown -= delta;
    if (this.shiftDuration > 0) {
      this.shiftDuration -= delta;
      if (this.shiftDuration <= 0) this.isShifting = false;
    }

    const currentSpeedAbs = Math.abs(this.speed);
    const speedKmhCurrent = currentSpeedAbs * 3.6;

    // Automatic transmission shift schedule (7-speed dual clutch)
    // Speed thresholds (km/h) for upshifting under standard/moderate acceleration:
    // Gear 1 -> 2: ~28 km/h, 2 -> 3: ~52 km/h, 3 -> 4: ~84 km/h, 4 -> 5: ~124 km/h, 5 -> 6: ~170 km/h, 6 -> 7: ~225 km/h
    // Under full throttle/boost, upshift points stretch higher toward redline
    const throttleStretch = 1.0 + this.smoothedThrottle * (isBoost ? 0.35 : 0.22);
    const upshiftSpeeds = [0, 26 * throttleStretch, 50 * throttleStretch, 80 * throttleStretch, 118 * throttleStretch, 162 * throttleStretch, 215 * throttleStretch];
    // Downshift points (with hysteresis to prevent rapid gear hunting):
    const downshiftSpeeds = [0, 0, 18, 38, 64, 96, 138];

    if (this.gear === 'D' && !this.isShifting && this.shiftCooldown <= 0) {
      // Upshifting logic
      if (this.forwardGear < 7 && speedKmhCurrent > upshiftSpeeds[this.forwardGear]) {
        this.forwardGear++;
        this.isShifting = true;
        this.shiftDuration = 0.12; // 120ms lightning-fast dual-clutch shift
        this.shiftCooldown = 0.60;
      }
      // Downshifting logic (including kickdown under heavy throttle)
      else if (this.forwardGear > 1) {
        const kickdownDownshift = (this.smoothedThrottle > 0.85 && speedKmhCurrent < upshiftSpeeds[this.forwardGear - 1] * 0.95);
        if (speedKmhCurrent < downshiftSpeeds[this.forwardGear - 1] || kickdownDownshift) {
          this.forwardGear--;
          this.isShifting = true;
          this.shiftDuration = 0.14; // Rev-matching throttle blip duration
          this.shiftCooldown = 0.50;
        }
      }
    }

    // Gear torque multipliers (Gear 1 has highest mechanical torque punch, tapering off in high gears)
    const gearTorqueMultipliers = [1.0, 1.45, 1.15, 0.92, 0.76, 0.63, 0.52, 0.44];
    const activeTorqueMult = this.gear === 'D' ? (gearTorqueMultipliers[this.forwardGear] || 1.0) : 1.10;

    // A. PURE BRAKING (Tombol S murni rem hidrolik di semua mode gear)
    if (this.smoothedBrake > 0.02) {
      this.isBraking = true;
      const brakeDecel = phys.brakeForce * this.smoothedBrake * delta;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - brakeDecel);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + brakeDecel);
      }
    }

    // B. THROTTLE (Tombol W / Gas) berdasarkan posisi tuas transmisi (P, R, N, D)
    if (this.gear === 'P') {
      // Parkir: roda terkunci kuat (mekanikal parking pawl)
      this.speed = 0;
      this.forwardGear = 1;
    } else if (this.gear === 'N') {
      // Netral: tidak ada tenaga mesin ke roda, meluncur bebas dengan gesekan jalan
      const rollDrag = (phys.friction + Math.abs(this.speed) * phys.airResistance) * delta;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - rollDrag);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + rollDrag);
      if (Math.abs(this.speed) < 0.03) this.speed = 0;
    } else if (this.gear === 'R') {
      // Mundur: Gas menggerakkan mobil ke belakang (mundur murni)
      this.isReversing = true;
      if (this.smoothedThrottle > 0.02 && !this.isBraking) {
        const revMax = phys.reverseMaxSpeed;
        const revRatio = Math.min(1.0, Math.abs(this.speed) / revMax);
        const revTorque = Math.max(0.40, 1.0 - Math.pow(revRatio, 1.3));
        this.speed -= phys.reverseAccel * revTorque * this.smoothedThrottle * delta;
        this.speed = Math.max(this.speed, -revMax);
      } else if (!this.isBraking) {
        // Natural reverse rolling drag
        const rollDrag = (phys.friction + Math.abs(this.speed) * phys.airResistance) * delta;
        if (this.speed < 0) this.speed = Math.min(0, this.speed + rollDrag);
        if (Math.abs(this.speed) < 0.03) this.speed = 0;
      }
    } else if (this.gear === 'D') {
      // Maju (Drive): Gas menggerakkan mobil maju dengan perpindahan gigi bertahap
      if (this.smoothedThrottle > 0.02 && !this.isBraking) {
        // Cut drive power momentary during dual-clutch shift for realistic shift dip feel
        const shiftTorqueCut = this.isShifting ? 0.25 : 1.0;
        const vRatio = Math.min(1.0, Math.max(0, this.speed) / effectiveMaxSpeed);
        const torqueCurve = Math.max(0.35, 1.0 - Math.pow(vRatio, 1.5));
        const forwardAccel = phys.acceleration * boostMultiplier * activeTorqueMult * torqueCurve * shiftTorqueCut * this.smoothedThrottle * delta;
        this.speed += forwardAccel;
        this.speed = Math.min(this.speed, effectiveMaxSpeed);
      } else if (!this.isBraking) {
        // Natural engine braking & aerodynamic drag
        const engineBraking = (this.forwardGear <= 2 ? 1.6 : 0.8);
        const rollDrag = (phys.friction + engineBraking + Math.abs(this.speed) * phys.airResistance) * delta;
        if (this.speed > 0) this.speed = Math.max(0, this.speed - rollDrag);
        if (Math.abs(this.speed) < 0.03) this.speed = 0;
      }
    }

    // Realistic Engine RPM calculation
    this.updateEngineRpm(input, delta);

    // Instantaneous longitudinal acceleration (m/s^2) for physical pitch calculation
    this.longitudinalAccel = (this.speed - prevSpeed) / Math.max(delta, 0.001);

    // 4. HANDBRAKE & POWER SLIDE DRIFT
    this.isDrifting = false;
    if (isHandbrake) {
      this.speed *= Math.max(0, 1.0 - phys.handbrakeDecel * 0.04 * delta);
      if (Math.abs(this.speed) > 4.2 && Math.abs(this.steerAngle) > 0.07) {
        this.isDrifting = true;
      }
    }

    // 5. REALISTIC KINEMATIC & DYNAMIC VEHICLE YAW TURNING (REAR-AXLE PIVOT)
    // In authentic road vehicles, the rear axle cannot steer; hence at parking & city speeds
    // the vehicle's instantaneous center of rotation (poros putar) is anchored along the rear axle axis.
    // As the front wheels steer, the front swings while the rear wheels track cleanly behind.
    const wheelbase = this.options.wheelbase || 2.75;
    // Rear axle offset behind vehicle center (in meters)
    const rearAxleZ = this.rearLeftWheelPivot ? Math.abs(this.rearLeftWheelPivot.position.z) : (wheelbase * 0.52);

    // Mechanical Steering-to-Turn Delay (Tire Relaxation Length & Chassis Inertia):
    // In a real car, turning the steering wheel does not instantaneously wrench the heavy vehicle chassis.
    // The pneumatic tires must roll forward and build lateral deformation force (slip angle),
    // and the suspension bushes absorb initial lateral load before the vehicle enters the turn.
    const absSpeed = Math.abs(this.speed);
    if (absSpeed > 0.03) {
      // Tire slip angle builds progressively as the tires roll over their relaxation length (~0.14s cushion)
      const tireRelaxationRate = Math.min(7.5, Math.max(2.6, (absSpeed + 0.8) * 1.35));
      this.effectiveSteer += (this.steerAngle - this.effectiveSteer) * Math.min(1.0, tireRelaxationRate * delta);

      const driftGain = this.isDrifting ? 1.65 : 1.0;
      const ackermannYawRate = -(this.speed / wheelbase) * Math.tan(this.effectiveSteer) * driftGain;

      // Physically bound lateral acceleration: a_lat = v * omega <= 1.25G
      const maxLateralG = (this.isDrifting ? 1.55 : 1.20) * 9.81;
      const maxYaw = maxLateralG / Math.max(2.6, absSpeed);
      const targetYawRate = Math.sign(ackermannYawRate) * Math.min(Math.abs(ackermannYawRate), maxYaw);

      // Rotational polar moment of inertia dampens yaw rate build-up (smooth entry & exit arc)
      const yawInertiaRate = this.isDrifting ? 5.6 : 6.2;
      this.angularVelocity += (targetYawRate - this.angularVelocity) * Math.min(1.0, yawInertiaRate * delta);
      this.heading += this.angularVelocity * delta;
    } else {
      this.angularVelocity = 0;
      this.effectiveSteer += (this.steerAngle - this.effectiveSteer) * Math.min(1.0, 5.0 * delta);
    }

    // 6. UPDATE WORLD POSITION VIA SPEED-BLENDED REAR-AXLE PIVOT KINEMATICS
    // At low/parking speeds (< 22 km/h), the car rotates 100% around the rear axle so the nose swings
    // into tight parking bays while the rear wheels track without side-slip. At higher speeds, rear tire
    // slip angle naturally shifts the instantaneous turning pivot forward toward the center of gravity.
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    const rearPivotBlend = 1.0 / (1.0 + Math.pow(Math.max(0, speedKmh - 20.0) / 38.0, 1.4));
    const effectiveRearPivotZ = rearAxleZ * Math.max(0.35, rearPivotBlend);

    // Forward displacement along chassis heading:
    const forwardStep = this.speed * delta;
    // Lateral displacement of vehicle center induced by yaw rotation about the rear axle:
    const lateralSwingStep = (effectiveRearPivotZ * this.angularVelocity) * delta;

    this.position.x += forwardStep * sinH + lateralSwingStep * cosH;
    this.position.z += forwardStep * cosH - lateralSwingStep * sinH;

    // 7. WHEEL STEERING & SPINNING ANIMATION (TRUE ACKERMANN GEOMETRY)
    // Note on vehicle coordinate frame (+Z forward, +Y up):
    // - frontLeftSteerPivot is at x < 0 (-0.79m, Screen Right when looking forward)
    // - frontRightSteerPivot is at x > 0 (+0.79m, Screen Left when looking forward)
    // Therefore, when turning Right (steerAngle > 0, moving toward -X), frontLeftSteerPivot (x < 0)
    // is the INNER wheel (sharper Ackermann angle) and frontRightSteerPivot (x > 0) is the OUTER wheel!
    let leftSteerAngle = this.steerAngle;
    let rightSteerAngle = this.steerAngle;

    if (Math.abs(this.steerAngle) > 0.005) {
      const frontTrack = (this.frontRightSteerPivot && this.frontLeftSteerPivot)
        ? Math.abs(this.frontRightSteerPivot.position.x - this.frontLeftSteerPivot.position.x)
        : 1.60;
      const cotCenter = 1.0 / Math.tan(Math.abs(this.steerAngle));
      const trackRatio = frontTrack / (2.0 * wheelbase);

      const innerAngle = Math.atan(1.0 / Math.max(0.01, cotCenter - trackRatio));
      const outerAngle = Math.atan(1.0 / (cotCenter + trackRatio));

      if (this.steerAngle > 0) {
        // Turning Right (toward -X): x < 0 (frontLeftSteerPivot) is inside, x > 0 (frontRightSteerPivot) is outside
        leftSteerAngle = innerAngle;
        rightSteerAngle = outerAngle;
      } else {
        // Turning Left (toward +X): x > 0 (frontRightSteerPivot) is inside, x < 0 (frontLeftSteerPivot) is outside
        rightSteerAngle = -innerAngle;
        leftSteerAngle = -outerAngle;
      }
    }

    // Front wheels physically steer around kingpins with true Ackermann alignment
    this.frontLeftSteerPivot.rotation.y = -leftSteerAngle;
    this.frontRightSteerPivot.rotation.y = -rightSteerAngle;

    // Dynamic Kingpin Inclination (KPI), Scrub Radius & Caster Geometry:
    // In authentic double-wishbone / multi-link sports suspension:
    // 1. Kingpin Inclination (KPI ~ 12°): As the wheel steers, the hub tracks slightly inboard
    //    and the top of the wheel tilts inward (dynamic camber gain).
    // 2. Kingpin Caster (~ 7°): Dynamic negative camber tucks the top edge of the tire
    //    cleanly inside the fender lip throughout the entire steering sweep.
    // 3. Inboard virtual scrub displacement: Prevents tire edges from clipping fender arches.
    const isA7 = (this.options.id === 'audi_a7');

    // Dynamic suspension bump camber gain from body roll:
    // In unequal-length double wishbone / multi-link suspension, as the outside suspension
    // compresses under roll, the top of the outside wheel tilts inward into the wheel well.
    // When turning right (steer > 0, heading decreases, bodyRoll < 0), car rolls toward +X (Screen Left).
    // The +X wheels (frontRight / rearRight) are loaded/compressed into bump, gaining negative camber.
    // When turning left (steer < 0, heading increases, bodyRoll > 0), car rolls toward -X (Screen Right).
    // The -X wheels (frontLeft / rearLeft) are loaded/compressed into bump, gaining negative camber.
    const rollBumpCamberRight = Math.max(0, -this.bodyRoll) * 0.45;
    const rollBumpCamberLeft = Math.max(0, this.bodyRoll) * 0.45;

    const staticCamber = 0.026; // Authentic factory sports negative camber (~1.5°)
    const steerTuckCamberLeft = Math.abs(leftSteerAngle) * 0.28;
    const steerTuckCamberRight = Math.abs(rightSteerAngle) * 0.28;
    this.frontLeftSteerPivot.rotation.z = -(staticCamber + steerTuckCamberLeft + rollBumpCamberLeft);
    this.frontRightSteerPivot.rotation.z = (staticCamber + steerTuckCamberRight + rollBumpCamberRight);

    // Rear suspension static sports camber + dynamic multi-link roll camber gain
    const rearStaticCamber = 0.028;
    const rearBumpCamberRight = Math.max(0, -this.bodyRoll) * 0.35;
    const rearBumpCamberLeft = Math.max(0, this.bodyRoll) * 0.35;
    this.rearLeftWheelPivot.rotation.z = -(rearStaticCamber + rearBumpCamberLeft);
    this.rearRightWheelPivot.rotation.z = (rearStaticCamber + rearBumpCamberRight);

    // Dynamic scrub tuck (inward displacement along X as wheel turns):
    const flBaseX = this.frontLeftBaseX !== undefined ? this.frontLeftBaseX : (isA7 ? -0.750 : -0.765);
    const frBaseX = this.frontRightBaseX !== undefined ? this.frontRightBaseX : (isA7 ? 0.750 : 0.765);
    const tuckA = isA7 ? 0.185 : 0.165;
    const tuckB = isA7 ? 0.135 : 0.115;
    const leftTuck = Math.sin(Math.abs(leftSteerAngle)) * tuckA + (1.0 - Math.cos(leftSteerAngle)) * tuckB;
    const rightTuck = Math.sin(Math.abs(rightSteerAngle)) * tuckA + (1.0 - Math.cos(rightSteerAngle)) * tuckB;
    this.frontLeftSteerPivot.position.x = flBaseX + leftTuck;   // +X pushes left wheel inward toward center
    this.frontRightSteerPivot.position.x = frBaseX - rightTuck; // -X pushes right wheel inward toward center

    // All 4 wheels spin around axle as car moves forward/reverse
    this.wheelSpinAngle += (this.speed / this.wheelRadius) * delta;
    this.frontLeftSpinNode.rotation.x = this.wheelSpinAngle;
    this.frontRightSpinNode.rotation.x = this.wheelSpinAngle;
    this.rearLeftSpinNode.rotation.x = this.wheelSpinAngle;
    this.rearRightSpinNode.rotation.x = this.wheelSpinAngle;

    // 8. RIGID-BODY SUSPENSION DYNAMICS WITH GRAVITY, MASS INERTIA & CENTRIFUGAL OVERTURNING MOMENT
    // Implements canonical 1-DOF rotational mass-spring-damper vehicle dynamics with gravity:
    // I_xx * roll_accel = tau_centrifugal + tau_gravity - tau_spring - tau_damper
    // I_yy * pitch_accel = tau_longitudinal + tau_gravity - tau_spring - tau_damper
    const isSupercar = (this.options.type === 'Supercar');
    const mass = this.options.mass || (isSupercar ? 1560 : 1880); // kg
    const cgHeight = this.options.cgHeight || (isSupercar ? 0.44 : 0.52); // m
    const rollCenterH = this.options.rollCenterHeight || (isSupercar ? 0.28 : 0.36); // m
    const hRoll = Math.max(0.12, cgHeight - rollCenterH);
    const g = 9.81; // m/s^2

    // Sprung mass rotational inertia (kg*m^2):
    const dim = this.options.dimensions || { width: 2.0, height: 1.3, length: 4.6 };
    const I_roll = mass * (dim.width * dim.width + dim.height * dim.height) / 12 + mass * hRoll * hRoll;
    const I_pitch = mass * (dim.length * dim.length + dim.height * dim.height) / 12 + mass * 0.04;

    // Design roll & pitch compliance limits:
    const maxRollLimit = this.options.maxBodyRoll || (isSupercar ? 0.032 : 0.040);
    const maxPitchLimit = this.options.maxBodyPitch || (isSupercar ? 0.018 : 0.022);
    const maxLatG = (isSupercar ? 1.15 : 1.05) * g;
    const maxLongG = (isSupercar ? 1.10 : 0.95) * g;

    // Physical Roll Stiffness & Damping (Nm/rad):
    // Steady state: (K_roll - mass * g * cgHeight) * maxRoll = mass * maxLatG * hRoll
    const K_roll = (mass * maxLatG * hRoll / maxRollLimit) + (mass * g * cgHeight);
    const C_roll = 2.0 * Math.sqrt(K_roll * I_roll) * 0.94; // 94% critical damping (taut, planted, zero roll overshoot)

    // Physical Pitch Stiffness & Damping (Nm/rad):
    // Accounts for anti-dive / anti-squat suspension linkage geometry
    const hPitch = Math.max(0.09, cgHeight - 0.28);
    const K_pitch = (mass * maxLongG * hPitch / maxPitchLimit) + (mass * g * cgHeight);
    const C_pitch = 2.0 * Math.sqrt(K_pitch * I_pitch) * 0.98; // 98% critical damping (taut, planted, zero bounce)

    // A. Lateral Acceleration (Centrifugal force):
    // Continuous physical lateral acceleration: a_lat = - v * omega (m/s^2)
    // Looking forward (+Z), -X is car Left, +X is car Right.
    // When turning right (omega < 0), a_lat > 0. Centrifugal force pushes outward (-X, left).
    const aLat = -this.speed * this.angularVelocity;

    // B. Longitudinal Acceleration (Inertia force):
    // Only moving vehicles accelerate or decelerate; stationary vehicles experience 0 longitudinal force
    let aLong = 0;
    if (Math.abs(this.speed) > 0.04) {
      if (this.isBraking) {
        const brakeG = (phys.brakeForce || 30.0) * this.smoothedBrake;
        aLong = -Math.sign(this.speed) * brakeG;
      } else if (this.smoothedThrottle > 0.02) {
        const driveDir = (this.gear === 'R') ? -1.0 : 1.0;
        const accelG = (phys.acceleration || 20.0) * this.smoothedThrottle;
        aLong = driveDir * accelG;
      }
    }

    // Sub-stepped Symplectic Euler numerical integration (4 steps per frame)
    // Unconditionally stable, completely eliminates frame-rate jitter and sudden pops
    const subSteps = 4;
    const subDt = Math.min(0.05, delta) / subSteps;

    for (let i = 0; i < subSteps; i++) {
      // Roll torques:
      // Centrifugal inertia torque rolls the sprung mass outward toward the outside of the turn
      const tauLat = -mass * aLat * hRoll;
      const tauRollGrav = mass * g * cgHeight * Math.sin(this.bodyRoll);
      const tauRollSpring = -K_roll * this.bodyRoll;
      const tauRollDamp = -C_roll * this.bodyRollVel;
      const tauRollNet = tauLat + tauRollGrav + tauRollSpring + tauRollDamp;

      const rollAcc = tauRollNet / I_roll;
      this.bodyRollVel += rollAcc * subDt;
      this.bodyRoll += this.bodyRollVel * subDt;

      // Pitch torques:
      // aLong < 0 (braking forward): nose dives (+Pitch in Three.js)
      const tauLong = -mass * aLong * hPitch;
      const tauPitchGrav = mass * g * cgHeight * Math.sin(this.bodyPitch);
      const tauPitchSpring = -K_pitch * this.bodyPitch;
      const tauPitchDamp = -C_pitch * this.bodyPitchVel;
      const tauPitchNet = tauLong + tauPitchGrav + tauPitchSpring + tauPitchDamp;

      const pitchAcc = tauPitchNet / I_pitch;
      this.bodyPitchVel += pitchAcc * subDt;
      this.bodyPitch += this.bodyPitchVel * subDt;
    }

    // Natural resting restabilization when car is stationary
    if (Math.abs(this.speed) < 0.05 && Math.abs(aLat) < 0.01 && Math.abs(aLong) < 0.01) {
      this.bodyRollVel *= Math.max(0, 1.0 - 15.0 * delta);
      this.bodyPitchVel *= Math.max(0, 1.0 - 15.0 * delta);
      if (Math.abs(this.bodyRoll) < 0.0005) { this.bodyRoll = 0; this.bodyRollVel = 0; }
      if (Math.abs(this.bodyPitch) < 0.0005) { this.bodyPitch = 0; this.bodyPitchVel = 0; }
    }

    // 9. APPLY THREE.JS ORIENTATIONS & GRAVITY HEAVE
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.heading, 0);

    // Heave: Natural braking nose dive and gravity pitch, eliminating artificial roll sag
    const rollArcDrop = hRoll * (1.0 - Math.cos(this.bodyRoll));
    const loadCompression = Math.max(0, this.bodyPitch) * 0.018; // Natural brake dive compression only
    const totalHeave = rollArcDrop + loadCompression;

    this.bodyPivot.position.y = rollCenterH - totalHeave;
    this.bodyPivot.rotation.set(this.bodyPitch, 0, this.bodyRoll);

    // 9. DYNAMIC TAILLIGHT INTENSITY
    // Taillight materials illuminate with intense red on brake/reverse, and elegant running glow normally
    const isBrightBrake = this.isBraking || this.isReversing;
    this.taillightMaterials.forEach(m => {
      if (m && m.emissive) {
        m.emissive.setHex(isBrightBrake ? 0xff0000 : 0x770000);
        m.emissiveIntensity = isBrightBrake ? 4.2 : 0.6;
      }
    });

    // 10. TIRE SMOKE PARTICLES
    this.updateParticles(delta);

    // 11. COLLIDER UPDATE
    this.collider.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + this.options.dimensions.height * 0.5, this.position.z),
      new THREE.Vector3(this.options.dimensions.width, this.options.dimensions.height, this.options.dimensions.length)
    );
  }

  updateEngineRpm(input, delta) {
    const throttle = this.smoothedThrottle;
    const isBoost = input.boost;
    const maxRpm = this.options.id === 'r8' ? 9000 : 7000;
    const redline = maxRpm * 0.88;
    const idleRpm = 850;

    if (this.gear === 'P' || this.gear === 'N') {
      // Free revving in Park and Neutral
      this.targetRpm = idleRpm + throttle * (redline - idleRpm) * 0.90;
    } else if (this.gear === 'R') {
      // Reverse gear RPM
      const revRatio = Math.min(1.0, Math.abs(this.speed) / (this.options.physics.reverseMaxSpeed || 10));
      this.targetRpm = idleRpm + revRatio * (4600 - idleRpm) + throttle * 400;
    } else {
      // Drive: RPM calculated from actual wheel speed and active forward gear ratio
      // Approximate speeds (km/h) for redline in each gear:
      const maxGearSpeeds = [0, 48, 88, 134, 182, 234, 288, 340];
      const speedKmh = Math.abs(this.speed) * 3.6;
      const g = Math.max(1, Math.min(7, this.forwardGear));
      const minGearSpeed = g === 1 ? 0 : maxGearSpeeds[g - 1] * 0.42;
      const maxGearSpeed = maxGearSpeeds[g];

      const frac = Math.max(0, Math.min(1.0, (speedKmh - minGearSpeed) / Math.max(1, maxGearSpeed - minGearSpeed)));
      const baseRpm = g === 1 ? idleRpm : 1800;
      const topRpm = isBoost ? maxRpm * 0.98 : redline;
      let calculatedRpm = baseRpm + frac * (topRpm - baseRpm) + throttle * 350;

      // Dip RPM briefly during shift
      if (this.isShifting) {
        calculatedRpm *= 0.72;
      }
      this.targetRpm = Math.max(idleRpm, Math.min(maxRpm, calculatedRpm));
    }

    const rpmRate = this.targetRpm > this.engineRpm ? 16.0 : 9.0;
    this.engineRpm += (this.targetRpm - this.engineRpm) * Math.min(1.0, rpmRate * delta);
  }

  updateParticles(delta) {
    if (!this.tireSmokeParticles || !this.tireSmokeData) return;
    const data = this.tireSmokeData;
    const shouldEmit = this.isDrifting || (this.isBraking && Math.abs(this.speed) > 9);

    for (let i = 0; i < data.count; i++) {
      data.ages[i] += delta;
      if (data.ages[i] > 0.55) {
        if (shouldEmit && Math.random() < 0.35) {
          const sign = Math.random() > 0.5 ? 1 : -1;
          const cosH = Math.cos(this.heading);
          const sinH = Math.sin(this.heading);
          const localX = sign * (this.options.dimensions.width * 0.38);
          const localZ = -this.options.dimensions.length * 0.35;

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
    this.steerAngle = 0;
    this.steerWheelAngle = 0;
    this.targetSteerAngle = 0;
    this.steerVelocity = 0;
    this.effectiveSteer = 0;
    this.angularVelocity = 0;
    this.gear = 'D';
    this.forwardGear = 1;
    this.isShifting = false;
    this.shiftCooldown = 0;
    this.shiftDuration = 0;
    this.engineRpm = 850;
    this.targetRpm = 850;
    this.wheelSpinAngle = 0;
    this.bodyRoll = 0;
    this.bodyRollVel = 0;
    this.bodyPitch = 0;
    this.bodyPitchVel = 0;

    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.heading, 0);
    this.bodyPivot.rotation.set(0, 0, 0);

    this.frontLeftSteerPivot.rotation.set(0, 0, 0);
    this.frontRightSteerPivot.rotation.set(0, 0, 0);
    this.frontLeftSpinNode.rotation.set(0, 0, 0);
    this.frontRightSpinNode.rotation.set(0, 0, 0);
    this.rearLeftSpinNode.rotation.set(0, 0, 0);
    this.rearRightSpinNode.rotation.set(0, 0, 0);
  }

  /**
   * Computes clean planar reflection UVs in car-local (bodyPivot) space for the
   * 3D model's native left side mirror, center rearview mirror, and right side mirror meshes.
   */
  setupMirrorUVs(mirrorMeshes) {
    if (!mirrorMeshes || mirrorMeshes.length === 0) return;

    this.group.updateMatrixWorld(true);
    const invBodyMatrix = new THREE.Matrix4().copy(this.bodyPivot.matrixWorld).invert();
    const zones = {
      left: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      center: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      right: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    };
    const v = new THREE.Vector3();

    // Pass 1: Measure exact bounds of Left, Center, and Right mirror surfaces in car-local space
    mirrorMeshes.forEach(mesh => {
      if (!mesh.geometry || !mesh.geometry.attributes.position) return;
      const meshToCar = new THREE.Matrix4().multiplyMatrices(invBodyMatrix, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i++) {
        const vi = idx ? idx.getX(i) : i;
        v.fromBufferAttribute(pos, vi).applyMatrix4(meshToCar);
        const z = v.x < -0.4 ? zones.left : (v.x > 0.4 ? zones.right : zones.center);
        if (v.x < z.minX) z.minX = v.x;
        if (v.x > z.maxX) z.maxX = v.x;
        if (v.y < z.minY) z.minY = v.y;
        if (v.y > z.maxY) z.maxY = v.y;
      }
    });

    // Pass 2: Assign planar UVs mapped to the left-rear, center-rear, and right-rear FOV sectors
    mirrorMeshes.forEach(mesh => {
      if (!mesh.geometry || !mesh.geometry.attributes.position) return;
      const meshToCar = new THREE.Matrix4().multiplyMatrices(invBodyMatrix, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const uvAttr = mesh.geometry.attributes.uv
        ? mesh.geometry.attributes.uv.clone()
        : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
      mesh.geometry.setAttribute('uv', uvAttr);

      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i++) {
        const vi = idx ? idx.getX(i) : i;
        v.fromBufferAttribute(pos, vi).applyMatrix4(meshToCar);
        const isLeft = v.x < -0.4;
        const isRight = v.x > 0.4;
        const z = isLeft ? zones.left : (isRight ? zones.right : zones.center);
        const nx = (v.x - z.minX) / Math.max(0.001, z.maxX - z.minX);
        const ny = (v.y - z.minY) / Math.max(0.001, z.maxY - z.minY);

        let u;
        if (isLeft) {
          // Left side mirror reflects left-rear lane (u: 1.0 -> 0.45)
          u = 1.0 - nx * 0.55;
        } else if (isRight) {
          // Right side mirror reflects right-rear lane (u: 0.55 -> 0.0)
          u = 0.55 - nx * 0.55;
        } else {
          // Center interior mirror reflects center-rear road (u: 0.85 -> 0.15)
          u = 0.85 - nx * 0.70;
        }
        uvAttr.setXY(vi, u, ny);
      }
      uvAttr.needsUpdate = true;
    });
  }

  destroy() {
    if (this.contactShadow) {
      if (this.contactShadow.geometry) this.contactShadow.geometry.dispose();
      if (this.contactShadow.material) {
        if (this.contactShadow.material.map) this.contactShadow.material.map.dispose();
        this.contactShadow.material.dispose();
      }
      this.group.remove(this.contactShadow);
    }
    this.scene.remove(this.group);
    if (this.tireSmokeParticles) this.scene.remove(this.tireSmokeParticles);
  }
}
