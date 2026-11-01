import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BaseVehicle } from './BaseVehicle.js';
import { DashboardDisplay } from './DashboardDisplay.js';

export class AudiA7 extends BaseVehicle {
  constructor(scene, initialPos = { x: 0, y: 0, z: 0 }, initialHeading = 0) {
    const options = {
      id: 'audi_a7',
      name: 'Audi A7 Sportback',
      type: 'Executive Coupe',
      file: 'assets/cars/audi_a7.glb',
      scale: 0.01,
      offset: { x: 0.0192, y: 0.0913, z: 0.0706 },
      rollCenterHeight: 0.36,
      wheelRadius: 0.355,
      dimensions: { width: 2.13, height: 1.43, length: 4.96 },
      wheelbase: 2.92,
      maxBodyRoll: 0.040,     // Executive luxury adaptive air-suspension cornering lean (~2.3 deg)
      maxBodyPitch: 0.022,    // Executive sedan pneumatic pitch under braking/acceleration (~1.25 deg)
      suspensionStiffness: 48.0,
      suspensionDamping: 15.0,
      driverCam: { x: 0.380, y: 1.11, z: -0.08 },
      interiorPitch: -0.05,
      hoodCam: { x: 0.0, y: 0.90, z: 1.85 },
      chaseCam: { distance: 6.0, height: 1.95, lookAtHeight: 1.15 },
      physics: {
        maxSpeed: 47,          // ~170 km/h
        reverseMaxSpeed: 10,   // ~36 km/h
        acceleration: 18,      // Twin-turbo V6 power
        brakeForce: 29,        // Smooth hydraulic braking
        reverseAccel: 9,
        handbrakeDecel: 34,
        friction: 2.3,
        airResistance: 0.0018,
        steerSpeed: 1.4,
        maxSteerAngle: 0.455   // ~26.1 degrees (Authentic Audi A7 11.9m turning circle, keeping tires tucked inside fenders)
      },
      initialPos,
      initialHeading
    };

    super(scene, options);

    // Exact wheel hub center positions tucked cleanly inside fender arches (in meters)
    this.frontLeftBaseX = -0.750;
    this.frontRightBaseX = 0.750;
    this.frontLeftSteerPivot.position.set(this.frontLeftBaseX, 0.355, 1.555);
    this.frontRightSteerPivot.position.set(this.frontRightBaseX, 0.355, 1.555);
    this.rearLeftWheelPivot.position.set(-0.770, 0.355, -1.367);
    this.rearRightWheelPivot.position.set(0.770, 0.355, -1.367);

    this.steeringWheelPivot = null;
    this.steerBaseQuaternion = null;
    this.rawSteerObj = null;
    this.originalMirrorMeshes = [];
    this.pendingMirrorTexture = null;

    this.loadModel();
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(this.options.file, (gltf) => {
      this.modelRoot = gltf.scene;
      this.modelRoot.scale.setScalar(this.options.scale);

      this.modelRoot.position.set(
        this.options.offset.x,
        this.options.offset.y - this.options.rollCenterHeight,
        this.options.offset.z
      );

      // Wheel parts in model: Left side parts (x = -0.814m) have 'Right' in model name,
      // and Right side parts (x = +0.814m) have 'Left' in model name.
      // Both Mesh and Group (Rim_*) objects must be matched so rims turn with tires!
      const flNames = new Set(['Tire_Front_Right', 'Rim_Front_Right', 'Brake_Disk_Front_Right', 'Brake_Pad_Front_Right']);
      const frNames = new Set(['Tire_Front_Left', 'Rim_Front_Left', 'Brake_Disk_Front_Left', 'Brake_Pad_Front_Left']);
      const rlNames = new Set(['Tire_Back_Right', 'Rim_Back_Right', 'Brake_Disk_Back_Right', 'Brake_Pad_Back_Right']);
      const rrNames = new Set(['Tire_Back_Left', 'Rim_Back_Left', 'Brake_Disk_Back_Left', 'Brake_Pad_Back_Left']);

      const wheelAttachList = [];
      const uglyGlassMeshes = [];
      const mergeGroups = new Map();
      const posAttrIds = new WeakMap();
      let nextBufId = 1;

      this.modelRoot.traverse((child) => {
        const name = child.name;

        // Attach wheel rims (velg), tires, and brake components to steer/spin nodes
        if (flNames.has(name)) {
          wheelAttachList.push({ child, node: this.frontLeftSpinNode });
        } else if (frNames.has(name)) {
          wheelAttachList.push({ child, node: this.frontRightSpinNode });
        } else if (rlNames.has(name)) {
          wheelAttachList.push({ child, node: this.rearLeftSpinNode });
        } else if (rrNames.has(name)) {
          wheelAttachList.push({ child, node: this.rearRightSpinNode });
        } else if (name.toLowerCase().includes('steer') && !this.rawSteerObj) {
          this.rawSteerObj = child;
        }

        if (child.isMesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const primaryMat = mats[0];
          const mName = primaryMat ? (primaryMat.name || '') : '';

          // 1. Remove / hide ugly opaque black glass meshes on Audi A7
          if (mName === 'Glass' || mName === 'Glass Black' || mName.toLowerCase().includes('window')) {
            child.visible = false;
            if (child.children.length === 0) uglyGlassMeshes.push(child);
            return;
          }

          // 2. ULTRA OPTIMIZATION: Group sibling primitives sharing the same vertex buffer & material
          // Merges 4,988 sub-meshes down to ~90 meshes in <5ms while keeping 100% of triangles!
          // Keep mesh_5_138 (stationary steering column shroud) separate so it doesn't rotate with the steering wheel rim.
          if (child.name !== 'mesh_5_138' && child.children.length === 0 && child.geometry && child.geometry.index && child.geometry.attributes.position && child.parent) {
            const posAttr = child.geometry.attributes.position;
            if (!posAttrIds.has(posAttr)) posAttrIds.set(posAttr, nextBufId++);
            const bufId = posAttrIds.get(posAttr);
            const key = `${child.parent.uuid}|${bufId}|${primaryMat ? primaryMat.uuid : ''}`;
            if (!mergeGroups.has(key)) mergeGroups.set(key, []);
            mergeGroups.get(key).push(child);
          }

          // 3. Targeted Shadow Optimization: only major exterior body shells cast shadows
          const isExteriorShell = mName.includes('Car Paint') || mName.includes('bumper') || mName.includes('Tire') || mName.includes('Rims');
          child.castShadow = isExteriorShell;
          child.receiveShadow = isExteriorShell;

          // Register headlight and taillight materials
          mats.forEach(mat => {
            const matName = (mat.name || '').toLowerCase();
            if (matName.includes('headlight') || matName.includes('emission') || matName.includes('laser')) {
              mat.userData.onColor = 0xeef6ff;
              mat.userData.onIntensity = 3.2;
              mat.emissive = new THREE.Color(0xeef6ff);
              mat.emissiveIntensity = 3.2;
              this.headlightMaterials.push(mat);
            } else if (matName.includes('red light') || matName.includes('taillight')) {
              mat.emissive = new THREE.Color(0x770000);
              mat.emissiveIntensity = 0.6;
              this.taillightMaterials.push(mat);
            }
          });
        }
      });

      // Detach opaque window glass leaf meshes
      uglyGlassMeshes.forEach(m => {
        if (m.parent) m.parent.remove(m);
      });

      // Concatenate index buffers of shared-vertex sibling primitives (reduces 4,988 draw calls to ~90!)
      for (const [, meshes] of mergeGroups) {
        if (meshes.length > 1) {
          const primary = meshes[0];
          let totalIdx = 0;
          for (let i = 0; i < meshes.length; i++) {
            totalIdx += meshes[i].geometry.index.count;
          }
          const posCount = primary.geometry.attributes.position.count;
          const CombinedArray = posCount > 65535 ? Uint32Array : Uint16Array;
          const combined = new CombinedArray(totalIdx);
          let offset = 0;
          for (let i = 0; i < meshes.length; i++) {
            const arr = meshes[i].geometry.index.array;
            combined.set(arr, offset);
            offset += arr.length;
            if (i > 0 && meshes[i].parent) {
              meshes[i].parent.remove(meshes[i]);
            }
          }
          primary.geometry.setIndex(new THREE.BufferAttribute(combined, 1));
        }
      }

      // Collect the surviving authentic mirror glass meshes (strictly material 'Mirror', excluding 'SideMirrors Under' housing)
      this.modelRoot.traverse((child) => {
        if (child.isMesh && child.visible) {
          const mat = Array.isArray(child.material) ? child.material[0] : child.material;
          const mName = mat ? (mat.name || '') : '';
          if (mName.trim() === 'Mirror') {
            this.originalMirrorMeshes.push(child);
            if (this.pendingMirrorTexture) {
              child.material = new THREE.MeshBasicMaterial({
                map: this.pendingMirrorTexture,
                toneMapped: false
              });
            }
          }
        }
      });

      // Add model to bodyPivot before attaching wheels so world matrices are valid
      this.bodyPivot.add(this.modelRoot);
      this.group.updateMatrixWorld(true);

      // Compute clean planar reflection UVs for left, center, and right native mirror meshes
      this.setupMirrorUVs(this.originalMirrorMeshes);

      // Attach wheel meshes and velg rims cleanly using Object3D.attach
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
      console.log('Audi A7 loaded with realistic materials, glowing Virtual Cockpit & steering wheel.');
    }, undefined, (err) => {
      console.error('Error loading Audi A7:', err);
    });
  }

  setupSteeringWheel(steerObj) {
    if (!steerObj) return;
    const parent = steerObj.parent;

    // Detach the stationary steering column shroud (mesh_5_138) onto modelRoot so it stays fixed to the dashboard
    if (parent) {
      const columnShroud = steerObj.getObjectByName('mesh_5_138');
      if (columnShroud) {
        parent.attach(columnShroud);
      }
    }

    // Steering_Wheel in audi_a7.glb already has its native CAD origin at the exact rim center (0.00mm eccentricity)
    // and its native quaternion aligned with the 22.57° tilted steering column shaft
    this.steeringWheelPivot = steerObj;
    this.steerBaseQuaternion = steerObj.quaternion.clone();
  }

  setupDashboard() {
    // Audi Virtual Cockpit & Center Dual Touchscreen MMI
    this.dashboard = new DashboardDisplay({
      carId: 'audi_a7',
      themeColor: '#00d4ff',
      maxSpeed: 280,
      maxRpm: 7000,
      screenSize: { width: 0.28, height: 0.102 },
      screenPos: { x: 0.380, y: 0.585, z: 0.635 },
      screenTilt: 0.08,
      mmiPos: { x: -0.035, y: 0.463, z: 0.577 },
      mmiSize: { width: 0.262, height: 0.114 },
      mmiTilt: 0.0,      // Model's MMI glass is vertical
      mmiYaw: -0.137     // Angled ~8° toward the right-hand driver, matching the model's screen panel
    });

    if (this.pendingMirrorTexture) {
      this.dashboard.setMirrorTexture(this.pendingMirrorTexture);
    }

    this.bodyPivot.add(this.dashboard.group);
  }

  setupLights() {
    // Twin forward Matrix LED Headlight Beams onto the asphalt road
    const beamPositions = [
      { x: -0.72, y: 0.65, z: 2.35 },
      { x: 0.72, y: 0.65, z: 2.35 }
    ];

    beamPositions.forEach((h) => {
      const spot = new THREE.SpotLight(0xfffaed, 3.8, 60, Math.PI / 4.8, 0.75, 1.2);
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
      this.steeringWheelPivot.rotateZ(-this.steerWheelAngle);
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
