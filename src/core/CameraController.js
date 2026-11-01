import * as THREE from 'three';

export const CameraMode = {
  CHASE: 'chase',         // Outside chase cam (3rd person)
  INTERIOR: 'interior',   // Cockpit / Driver's view (1st person)
  HOOD: 'hood'            // Front hood view
};

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.mode = CameraMode.CHASE;

    this.currentPos = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();

    // Mode cycle order
    this.modes = [CameraMode.CHASE, CameraMode.INTERIOR, CameraMode.HOOD];
    this.modeIndex = 0;
  }

  toggleMode(vehicle = null) {
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
    this.mode = this.modes[this.modeIndex];
    if (vehicle) {
      this.snapToTarget(vehicle);
    }
    return this.mode;
  }

  setMode(mode, vehicle = null) {
    this.mode = mode;
    this.modeIndex = this.modes.indexOf(mode);
    if (this.modeIndex === -1) this.modeIndex = 0;
    if (vehicle) {
      this.snapToTarget(vehicle);
    }
  }

  update(vehicle, input, delta) {
    if (!vehicle || !vehicle.group) return;

    const carPos = vehicle.position;
    const carHeading = vehicle.heading;
    const config = vehicle.config;

    if (this.mode === CameraMode.CHASE) {
      this.camera.up.set(0, 1, 0);
      if (Math.abs(this.camera.fov - 60) > 0.1 || this.camera.near !== 0.1) {
        this.camera.fov = 60;
        this.camera.near = 0.1;
        this.camera.updateProjectionMatrix();
      }
      // 3rd Person exterior chase camera
      const chaseConfig = config.chaseCam;
      const dist = chaseConfig.distance;
      const height = chaseConfig.height;

      // Base camera offset behind the car
      const angle = carHeading + Math.PI + input.lookYaw;
      const cx = carPos.x + Math.sin(angle) * dist;
      const cz = carPos.z + Math.cos(angle) * dist;
      const cy = carPos.y + height + input.lookPitch * 2.0;

      this.targetPos.set(cx, cy, cz);
      this.targetLookAt.set(
        carPos.x,
        carPos.y + (chaseConfig.lookAtHeight || 1.1) + input.lookPitch * 1.5,
        carPos.z
      );

      // Smooth camera dampening
      const lerpSpeed = Math.min(1.0, delta * 9.0);
      this.currentPos.lerp(this.targetPos, lerpSpeed);
      this.currentLookAt.lerp(this.targetLookAt, lerpSpeed);

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);

    } else if (this.mode === CameraMode.INTERIOR) {
      // 1st Person Cockpit Interior Camera
      // Use wider cockpit FOV (68° desktop, 74° portrait mobile) and tight near plane so
      // windshield road, Virtual Cockpit, Center MMI, and mirrors are all naturally framed
      const desiredFov = this.camera.aspect < 1.0 ? 74 : 68;
      if (Math.abs(this.camera.fov - desiredFov) > 0.1 || this.camera.near !== 0.06) {
        this.camera.fov = desiredFov;
        this.camera.near = 0.06;
        this.camera.updateProjectionMatrix();
      }

      const driverOffset = config.driverCam;
      const rollCenterY = config.rollCenterHeight || 0.35;

      // The driver's head is mounted firmly to the vehicle cockpit seat (bodyPivot).
      // When the suspension rolls, pitches, and heaves, the driver remains seated in the cabin
      // with zero disconnect or drifting away from the dashboard and steering wheel.
      const eyeWorld = new THREE.Vector3(
        driverOffset.x,
        driverOffset.y - rollCenterY,
        driverOffset.z
      );
      if (vehicle.bodyPivot) {
        vehicle.bodyPivot.localToWorld(eyeWorld);
      } else {
        eyeWorld.y = driverOffset.y;
        vehicle.group.localToWorld(eyeWorld);
      }

      this.targetPos.copy(eyeWorld);

      // Camera up vector is aligned with true world gravity (0, 1, 0).
      // Under human vestibular inner-ear balance, the outside horizon remains level with gravity,
      // while the steering wheel, dashboard, A-pillars, and hood visibly roll and pitch in front of the driver.
      this.camera.up.set(0, 1, 0);

      // In interior mode, camera is fixed straight ahead with the vehicle heading (no auto-turn on steer)
      // Only manual mouse/touch lookYaw and lookPitch apply
      const basePitch = config.interiorPitch !== undefined ? config.interiorPitch : -0.05;
      const lookAngle = carHeading + input.lookYaw;
      const pitchAngle = input.lookPitch + basePitch;
      const forwardDist = 10.0;
      const cosPitch = Math.cos(pitchAngle);
      const lx = eyeWorld.x + Math.sin(lookAngle) * cosPitch * forwardDist;
      const lz = eyeWorld.z + Math.cos(lookAngle) * cosPitch * forwardDist;
      const ly = eyeWorld.y + Math.sin(pitchAngle) * forwardDist;

      this.targetLookAt.set(lx, ly, lz);

      // Keep position synced so switching back to chase cam never warps or glitches
      this.currentPos.copy(this.targetPos);
      this.currentLookAt.copy(this.targetLookAt);

      this.camera.position.copy(this.targetPos);
      this.camera.lookAt(this.targetLookAt);

    } else if (this.mode === CameraMode.HOOD) {
      this.camera.up.set(0, 1, 0);
      if (Math.abs(this.camera.fov - 60) > 0.1 || this.camera.near !== 0.1) {
        this.camera.fov = 60;
        this.camera.near = 0.1;
        this.camera.updateProjectionMatrix();
      }
      // Hood bumper camera
      const hoodOffset = config.hoodCam;
      const hoodWorld = new THREE.Vector3(hoodOffset.x, hoodOffset.y, hoodOffset.z);
      vehicle.group.localToWorld(hoodWorld);

      this.targetPos.copy(hoodWorld);

      const lookAngle = carHeading + input.lookYaw * 0.5;
      const forwardDist = 15.0;
      const lx = hoodWorld.x + Math.sin(lookAngle) * forwardDist;
      const lz = hoodWorld.z + Math.cos(lookAngle) * forwardDist;
      const ly = hoodWorld.y + Math.sin(input.lookPitch) * forwardDist;

      this.targetLookAt.set(lx, ly, lz);

      this.currentPos.copy(this.targetPos);
      this.currentLookAt.copy(this.targetLookAt);

      this.camera.position.copy(this.targetPos);
      this.camera.lookAt(this.targetLookAt);
    }
  }

  snapToTarget(vehicle) {
    if (!vehicle || !vehicle.group) return;
    const carPos = vehicle.position;
    const carHeading = vehicle.heading;
    const config = vehicle.config;

    if (this.mode === CameraMode.CHASE) {
      const dist = config.chaseCam.distance;
      const height = config.chaseCam.height;
      const angle = carHeading + Math.PI;
      this.currentPos.set(
        carPos.x + Math.sin(angle) * dist,
        carPos.y + height,
        carPos.z + Math.cos(angle) * dist
      );
      this.currentLookAt.set(carPos.x, carPos.y + (config.chaseCam.lookAtHeight || 1.1), carPos.z);
    } else if (this.mode === CameraMode.INTERIOR) {
      const offset = config.driverCam;
      const rollCenterY = config.rollCenterHeight || 0.35;
      const eyeWorld = new THREE.Vector3(offset.x, offset.y - rollCenterY, offset.z);
      if (vehicle.bodyPivot) {
        vehicle.bodyPivot.localToWorld(eyeWorld);
      } else {
        eyeWorld.y = offset.y;
        vehicle.group.localToWorld(eyeWorld);
      }
      this.currentPos.copy(eyeWorld);
      const basePitch = config.interiorPitch !== undefined ? config.interiorPitch : -0.05;
      const forwardDist = 10.0;
      this.currentLookAt.set(
        eyeWorld.x + Math.sin(carHeading) * Math.cos(basePitch) * forwardDist,
        eyeWorld.y + Math.sin(basePitch) * forwardDist,
        eyeWorld.z + Math.cos(carHeading) * Math.cos(basePitch) * forwardDist
      );
    } else if (this.mode === CameraMode.HOOD) {
      const offset = config.hoodCam;
      const hoodWorld = new THREE.Vector3(offset.x, offset.y, offset.z);
      vehicle.group.localToWorld(hoodWorld);
      this.currentPos.copy(hoodWorld);
      const forwardDist = 15.0;
      this.currentLookAt.set(
        hoodWorld.x + Math.sin(carHeading) * forwardDist,
        hoodWorld.y,
        hoodWorld.z + Math.cos(carHeading) * forwardDist
      );
    }
    this.targetPos.copy(this.currentPos);
    this.targetLookAt.copy(this.currentLookAt);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}

