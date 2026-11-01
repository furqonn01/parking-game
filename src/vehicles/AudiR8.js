import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseVehicle } from './BaseVehicle.js';
import { DashboardDisplay } from './DashboardDisplay.js';

export class AudiR8 extends BaseVehicle {
  constructor(scene, initialPos = { x: 0, y: 0, z: 0 }, initialHeading = 0) {
    const options = {
      id: 'r8',
      name: 'Audi R8 V10 Plus',
      type: 'Supercar',
      file: 'assets/cars/r8.glb',
      scale: 0.001,
      offset: { x: -0.9835, y: 0.0025, z: 2.212 },
      rollCenterHeight: 0.28,
      wheelRadius: 0.31,
      dimensions: { width: 1.97, height: 1.20, length: 4.42 },
      wheelbase: 2.65,
      maxBodyRoll: 0.032,     // Factory track-tuned magnetic ride supercar cornering lean (~1.8 deg)
      maxBodyPitch: 0.018,    // Firm supercar pitch under braking/acceleration (~1.0 deg)
      suspensionStiffness: 52.0,
      suspensionDamping: 16.0,
      driverCam: { x: -0.352, y: 0.91, z: -0.02 },
      interiorPitch: -0.05,
      hoodCam: { x: 0.0, y: 0.78, z: 1.55 },
      chaseCam: { distance: 5.2, height: 1.62, lookAtHeight: 1.0 },
      physics: {
        maxSpeed: 52,          // ~187 km/h
        reverseMaxSpeed: 12,   // ~43 km/h
        acceleration: 23,      // Supercar V10 punch
        brakeForce: 34,        // Carbon-ceramic brakes
        reverseAccel: 11,
        handbrakeDecel: 40,
        friction: 2.2,
        airResistance: 0.0015,
        steerSpeed: 1.5,
        maxSteerAngle: 0.455   // ~26.1 degrees (Authentic Audi R8 11.2m turning circle, keeping tires tucked inside fenders)
      },
      initialPos,
      initialHeading
    };

    super(scene, options);

    // Exact wheel hub center positions tucked cleanly inside fender arches (in meters)
    this.frontLeftBaseX = -0.765;
    this.frontRightBaseX = 0.765;
    this.frontLeftSteerPivot.position.set(this.frontLeftBaseX, 0.313, 1.217);
    this.frontRightSteerPivot.position.set(this.frontRightBaseX, 0.313, 1.217);
    this.rearLeftWheelPivot.position.set(-0.780, 0.313, -1.426);
    this.rearRightWheelPivot.position.set(0.780, 0.313, -1.426);

    this.steeringWheelPivot = null;
    this.steerBaseQuaternion = null;
    this.rawSteerObj = null;
    this.originalMirrorMeshes = [];
    this.pendingMirrorTexture = null;

    this.loadModel();
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load(this.options.file, (gltf) => {
      this.modelRoot = gltf.scene;
      this.modelRoot.scale.setScalar(this.options.scale);

      this.modelRoot.position.set(
        this.options.offset.x,
        this.options.offset.y - this.options.rollCenterHeight,
        this.options.offset.z
      );

      // Wheel mesh classification sets (including brake calipers Mesh154, Mesh2, Mesh162, Mesh10)
      const flNames = new Set(['Mesh153', 'Mesh154', 'Mesh155', 'Mesh156', 'Mesh157', 'Mesh158', 'Mesh159', 'Mesh160']);
      const frNames = new Set(['Mesh1', 'Mesh2', 'Mesh3', 'Mesh4', 'Mesh5', 'Mesh6', 'Mesh7', 'Mesh8']);
      const rlNames = new Set(['Mesh161', 'Mesh162', 'Mesh163', 'Mesh164', 'Mesh165', 'Mesh166', 'Mesh167', 'Mesh168']);
      const rrNames = new Set(['Mesh9', 'Mesh10', 'Mesh11', 'Mesh12', 'Mesh13', 'Mesh14', 'Mesh15', 'Mesh16']);

      const wheelAttachList = [];

      this.modelRoot.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          const name = child.name;
          if (flNames.has(name)) {
            wheelAttachList.push({ child, node: this.frontLeftSpinNode });
          } else if (frNames.has(name)) {
            wheelAttachList.push({ child, node: this.frontRightSpinNode });
          } else if (rlNames.has(name)) {
            wheelAttachList.push({ child, node: this.rearLeftSpinNode });
          } else if (rrNames.has(name)) {
            wheelAttachList.push({ child, node: this.rearRightSpinNode });
          } else if (name === 'Mesh35' && !this.rawSteerObj) {
            this.rawSteerObj = child;
          }

          // Use the car's authentic 3D model mirrors directly (no fake box attachments)
          // Mesh78 is the interior rearview mirror on the windshield.
          // Mesh74 is the pair of door-mounted side wing mirrors.
          if (name === 'Mesh74' || name === 'Mesh78') {
            this.originalMirrorMeshes.push(child);
            if (this.pendingMirrorTexture) {
              child.material = new THREE.MeshBasicMaterial({
                map: this.pendingMirrorTexture,
                toneMapped: false
              });
            }
          }

          // Crystal clear transparent glass for unobstructed interior cockpit & road view
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              const mName = (mat.name || '').toLowerCase();
              if (mName.includes('glass_window')) {
                mat.transparent = true;
                mat.opacity = 0.16;
                mat.depthWrite = false;
                mat.roughness = 0.05;
              }
            });
          }

          // Register headlight and taillight materials
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              const mName = (mat.name || '').toLowerCase();
              if (mName.includes('lamp') || mName.includes('projector') || mName === 'light') {
                mat.userData.onColor = 0xfffaed;
                mat.userData.onIntensity = 2.8;
                mat.emissive = new THREE.Color(0xfffaed);
                mat.emissiveIntensity = 2.8;
                this.headlightMaterials.push(mat);
              } else if (mName.includes('tail_light')) {
                mat.emissive = new THREE.Color(0x770000);
                mat.emissiveIntensity = 0.6;
                this.taillightMaterials.push(mat);
              }
            });
          }
        }
      });

      // Add model to bodyPivot before attaching wheels so world matrices are valid
      this.bodyPivot.add(this.modelRoot);
      this.group.updateMatrixWorld(true);

      // Compute clean planar reflection UVs for left, center, and right native mirror meshes
      this.setupMirrorUVs(this.originalMirrorMeshes);

      // Attach wheel meshes cleanly using Object3D.attach (preserves exact positions)
      wheelAttachList.forEach(({ child, node }) => {
        node.attach(child);
      });

      // Setup steering wheel AFTER modelRoot has valid world matrices in scene graph
      if (this.rawSteerObj) {
        this.setupSteeringWheel(this.rawSteerObj);
      }

      this.setupLights();
      this.setupDashboard();

      this.isLoaded = true;
      console.log('Audi R8 loaded with realistic materials, glowing Virtual Cockpit & steering wheel.');
    }, undefined, (err) => {
      console.error('Error loading Audi R8:', err);
    });
  }

  setupSteeringWheel(steerObj) {
    if (!steerObj) return;

    // Place pivot in bodyPivot at the exact geometric center of the circular R8 steering wheel rim
    // (-0.3517, 0.4389, 0.4293) with its local Z axis tilted 23.23° (0.4054 rad) along the steering column shaft
    const pivot = new THREE.Group();
    pivot.position.set(-0.3517, 0.4389, 0.4293);
    pivot.rotation.set(0.4054, 0, 0);
    this.bodyPivot.add(pivot);
    this.bodyPivot.updateMatrixWorld(true);

    pivot.attach(steerObj);

    this.steeringWheelPivot = pivot;
    this.steerBaseQuaternion = pivot.quaternion.clone();
  }

  setupDashboard() {
    // High-definition Audi Virtual Cockpit & Center MMI Display
    this.dashboard = new DashboardDisplay({
      carId: 'r8',
      themeColor: '#ff1438',
      maxSpeed: 320,
      maxRpm: 9000,
      screenSize: { width: 0.25, height: 0.095 },
      screenPos: { x: -0.352, y: 0.485, z: 0.600 },
      screenTilt: 0.06,
      mmiPos: { x: 0.005, y: 0.425, z: 0.560 },
      mmiSize: { width: 0.21, height: 0.10 },
      mmiTilt: 0.45,
      mmiYaw: 0.12
    });

    if (this.pendingMirrorTexture) {
      this.dashboard.setMirrorTexture(this.pendingMirrorTexture);
    }

    this.bodyPivot.add(this.dashboard.group);
  }

  setupLights() {
    // Forward Xenon Projector Light Beams onto the asphalt road
    const beamPositions = [
      { x: -0.65, y: 0.52, z: 2.05 },
      { x: 0.65, y: 0.52, z: 2.05 }
    ];

    beamPositions.forEach((h) => {
      // Natural soft projector headlight beam with penumbra
      const spot = new THREE.SpotLight(0xfffaee, 3.8, 60, Math.PI / 4.8, 0.75, 1.2);
      spot.position.set(h.x, h.y - this.options.rollCenterHeight, h.z);

      const target = new THREE.Object3D();
      target.position.set(h.x * 0.4, -this.options.rollCenterHeight - 0.2, h.z + 28);
      this.bodyPivot.add(target);
      spot.target = target;
      spot.castShadow = false;

      this.bodyPivot.add(spot);
      this.headlightSpots.push(spot);
    });
  }

  update(input, delta) {
    if (!this.isLoaded) return;
    this.updatePhysics(input, delta);

    // Rotate steering wheel inside driver cockpit along its steering column shaft
    if (this.steeringWheelPivot && this.steerBaseQuaternion) {
      this.steeringWheelPivot.quaternion.copy(this.steerBaseQuaternion);
      this.steeringWheelPivot.rotateZ(this.steerWheelAngle);
    }

    // Update glowing digital Virtual Cockpit dashboard display
    if (this.dashboard) {
      this.dashboard.update(this, input, delta);
    }
  }

  attachMirrors(mirrorTexture) {
    if (!mirrorTexture) return;
    this.pendingMirrorTexture = mirrorTexture;

    if (this.dashboard) {
      this.dashboard.setMirrorTexture(mirrorTexture);
    }

    const mirrorMat = new THREE.MeshBasicMaterial({
      map: mirrorTexture,
      toneMapped: false
    });

    // Apply mirror texture directly to the vehicle model's authentic mirror surfaces
    this.originalMirrorMeshes.forEach(mesh => {
      mesh.material = mirrorMat;
    });
  }

  destroy() {
    this.originalMirrorMeshes = [];
    if (this.dashboard) {
      this.dashboard.destroy();
    }
    super.destroy();
  }
}
