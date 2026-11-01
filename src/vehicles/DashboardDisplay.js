import * as THREE from 'three';

/**
 * Creates a driver-facing plane geometry with correct normals (facing -Z towards driver)
 * and natural non-mirrored horizontal UV mapping.
 */
function createDriverFacingPlane(width, height) {
  const geo = new THREE.PlaneGeometry(width, height);
  // Rotating around Y by 180 degrees turns normal to face -Z (towards driver)
  // When looking at the front from -Z, UV (0, 1) is naturally at Screen Left.
  geo.rotateY(Math.PI);
  geo.computeVertexNormals();
  return geo;
}

/**
 * High-definition Audi Virtual Cockpit & Digital Dashboard
 * Renders real-time animated instrument cluster (Speedometer, Tachometer, Gear,
 * Telemetry, Turn Signals, Headlights, Nitro bar) using an emissive CanvasTexture.
 */
export class DashboardDisplay {
  /**
   * @param {Object} options
   * @param {string} options.carId - 'r8' or 'audi_a7'
   * @param {string} options.themeColor - Accent color ('#ff1438' for R8, '#00d4ff' for A7)
   * @param {number} options.maxSpeed - Max speed on dial (e.g. 320 or 280)
   * @param {number} options.maxRpm - Max RPM on dial (e.g. 9000 or 7500)
   * @param {Object} options.screenSize - { width: 0.29, height: 0.108 }
   * @param {Object} options.screenPos - Local position in bodyPivot { x, y, z }
   * @param {number} options.screenTilt - Tilt angle in radians (around X axis)
   * @param {Object} [options.mmiPos] - Center MMI screen position { x, y, z }
   * @param {Object} [options.mmiSize] - Center MMI screen size { width, height }
   */
  constructor(options = {}) {
    this.carId = options.carId || 'r8';
    this.themeColor = options.themeColor || (this.carId === 'r8' ? '#ff1438' : '#00d4ff');
    this.secondaryColor = options.secondaryColor || '#ffffff';
    this.maxSpeed = options.maxSpeed || (this.carId === 'r8' ? 320 : 280);
    this.maxRpm = options.maxRpm || (this.carId === 'r8' ? 9000 : 7000);
    this.redlineRpm = this.maxRpm * 0.82;

    this.screenSize = options.screenSize || { width: 0.29, height: 0.108 };
    this.screenPos = options.screenPos || { x: -0.352, y: 0.475, z: 0.635 };
    this.screenTilt = options.screenTilt !== undefined ? options.screenTilt : 0.08;

    this.mmiPos = options.mmiPos || null;
    this.mmiSize = options.mmiSize || { width: 0.22, height: 0.10 };
    // MMI orientation: tilt (pitch, around X) and yaw (around Y, negative = angled toward a right-hand driver)
    this.mmiTilt = options.mmiTilt !== undefined ? options.mmiTilt : this.screenTilt * 0.85;
    this.mmiYaw = options.mmiYaw || 0;
    this.mirrorTexture = null;
    this.isReversingMode = false;

    // Telemetry state
    this.currentSpeed = 0;
    this.currentRpm = 850;
    this.targetRpm = 850;
    this.currentGear = 'P';
    this.currentGearNum = 1;
    this.nitroPercent = 100;
    this.tripDistance = 14.8;
    this.blinkTimer = 0;
    this.blinkState = false;

    // Performance throttle: update canvas at 45 fps
    this.updateInterval = 1 / 45;
    this.timeSinceLastDraw = 0;

    // Root display group
    this.group = new THREE.Group();
    this.group.name = `Dashboard_${this.carId}`;

    this.setupClusterCanvas();
    this.setupClusterMesh();

    if (this.mmiPos) {
      this.setupMmiCanvas();
      this.setupMmiMesh();
    }

    this.setupAmbientLight();

    // Initial render & immediate texture upload
    this.drawCluster();
    this.clusterTexture.needsUpdate = true;

    if (this.mmiCanvas) {
      this.drawMmi();
      this.mmiTexture.needsUpdate = true;
    }
  }

  setMirrorTexture(texture) {
    this.mirrorTexture = texture;
  }

  setupClusterCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 380;
    this.ctx = this.canvas.getContext('2d');

    this.clusterTexture = new THREE.CanvasTexture(this.canvas);
    this.clusterTexture.generateMipmaps = false;
    this.clusterTexture.minFilter = THREE.LinearFilter;
    this.clusterTexture.magFilter = THREE.LinearFilter;
  }

  setupClusterMesh() {
    // 1. Digital Display Screen (Driver-facing geometry, 100% non-mirrored)
    const screenGeo = createDriverFacingPlane(this.screenSize.width, this.screenSize.height);

    this.clusterMaterial = new THREE.MeshBasicMaterial({
      map: this.clusterTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    this.screenMesh = new THREE.Mesh(screenGeo, this.clusterMaterial);
    this.screenMesh.position.set(this.screenPos.x, this.screenPos.y, this.screenPos.z);
    this.screenMesh.rotation.x = this.screenTilt;
    this.group.add(this.screenMesh);

    // 2. Beveled Outer Bezel / Housing (Behind the screen further along +Z)
    const bezelGeo = createDriverFacingPlane(this.screenSize.width + 0.014, this.screenSize.height + 0.012);
    const bezelMat = new THREE.MeshBasicMaterial({
      color: 0x05070a,
      side: THREE.DoubleSide
    });
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.position.set(this.screenPos.x, this.screenPos.y, this.screenPos.z + 0.003);
    bezelMesh.rotation.x = this.screenTilt;
    this.group.add(bezelMesh);

    // 3. Glare Lens Cover (In front of screen closer to driver along -Z)
    const glassGeo = createDriverFacingPlane(this.screenSize.width, this.screenSize.height);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x112233,
      transparent: true,
      opacity: 0.05,
      roughness: 0.05,
      metalness: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(this.screenPos.x, this.screenPos.y, this.screenPos.z - 0.002);
    glassMesh.rotation.x = this.screenTilt;
    this.group.add(glassMesh);
  }

  setupMmiCanvas() {
    // Match canvas aspect ratio to the physical screen so MMI content is not stretched
    const aspect = this.mmiSize.width / this.mmiSize.height;
    this.mmiCanvas = document.createElement('canvas');
    this.mmiCanvas.width = 640;
    this.mmiCanvas.height = Math.round(640 / aspect);
    this.mmiCtx = this.mmiCanvas.getContext('2d');

    this.mmiTexture = new THREE.CanvasTexture(this.mmiCanvas);
    this.mmiTexture.generateMipmaps = false;
    this.mmiTexture.minFilter = THREE.LinearFilter;
    this.mmiTexture.magFilter = THREE.LinearFilter;
  }

  setupMmiMesh() {
    // Group carries position + orientation so screen and bezel stay perfectly aligned
    this.mmiGroup = new THREE.Group();
    this.mmiGroup.position.set(this.mmiPos.x, this.mmiPos.y, this.mmiPos.z);
    this.mmiGroup.rotation.set(this.mmiTilt, this.mmiYaw, 0, 'YXZ');
    this.group.add(this.mmiGroup);

    const geo = createDriverFacingPlane(this.mmiSize.width, this.mmiSize.height);
    this.mmiMaterial = new THREE.MeshBasicMaterial({
      map: this.mmiTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    this.mmiMesh = new THREE.Mesh(geo, this.mmiMaterial);
    this.mmiMesh.renderOrder = 2;
    this.mmiGroup.add(this.mmiMesh);

    // Black glass bezel behind the screen (local +Z = away from driver)
    const frameGeo = createDriverFacingPlane(this.mmiSize.width + 0.012, this.mmiSize.height + 0.010);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0x030405,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.z = 0.002;
    frameMesh.renderOrder = 1;
    this.mmiGroup.add(frameMesh);
  }

  setupAmbientLight() {
    // Glowing neon LED strip along dashboard
    const stripWidth = this.carId === 'r8' ? 0.42 : 1.10;
    const stripGeo = createDriverFacingPlane(stripWidth, 0.006);
    const stripMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.themeColor),
      side: THREE.DoubleSide
    });

    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    stripMesh.position.set(
      this.carId === 'r8' ? this.screenPos.x : 0.0,
      this.screenPos.y - 0.072,
      this.screenPos.z - 0.02
    );
    stripMesh.rotation.x = -0.3;
    this.group.add(stripMesh);
  }

  update(vehicle, input, delta) {
    if (!vehicle) return;

    this.timeSinceLastDraw += delta;
    this.blinkTimer += delta;
    if (this.blinkTimer >= 0.36) {
      this.blinkTimer = 0;
      this.blinkState = !this.blinkState;
    }

    // Vehicle telemetry
    const speedKmh = Math.abs(vehicle.speed || 0) * 3.6;
    this.currentSpeed += (speedKmh - this.currentSpeed) * Math.min(1.0, 14.0 * delta);
    this.currentGear = vehicle.gear || 'D';
    this.currentGearNum = vehicle.forwardGear || 1;
    this.currentRpm = vehicle.engineRpm || 850;
    this.targetRpm = vehicle.targetRpm || 850;
    this.lightsOn = !!vehicle.lightsOn;
    this.isBraking = !!vehicle.isBraking;
    this.isHandbrake = !!input.handbrake;
    this.steerInput = input.steering || 0;

    if (this.currentSpeed > 1) {
      this.tripDistance += (this.currentSpeed / 3600) * delta;
    }

    // Dynamic Audi MMI Display: Switch between GPS Navigation & Reverse Camera on Head Unit
    const isRev = (this.currentGear === 'R' || vehicle.isReversing);
    if (this.mmiMaterial && this.mirrorTexture) {
      if (isRev && !this.isReversingMode) {
        this.isReversingMode = true;
        this.mmiMaterial.map = this.mirrorTexture;
        this.mmiMaterial.needsUpdate = true;
      } else if (!isRev && this.isReversingMode) {
        this.isReversingMode = false;
        this.mmiMaterial.map = this.mmiTexture;
        this.mmiMaterial.needsUpdate = true;
      }
    }

    if (this.timeSinceLastDraw >= this.updateInterval) {
      this.timeSinceLastDraw = 0;
      this.drawCluster();
      this.clusterTexture.needsUpdate = true;

      if (this.mmiCanvas && !this.isReversingMode) {
        this.drawMmi();
        this.mmiTexture.needsUpdate = true;
      }
    }
  }

  updateSimulatedRpm(vehicle, input, delta) {
    const speed = this.currentSpeed;
    const throttle = input.throttle || 0;
    const isBoost = input.boost;

    if (this.currentGear === 'P') {
      this.targetRpm = 850 + throttle * (this.redlineRpm - 850) * 0.95;
      this.currentGearNum = 1;
    } else if (this.currentGear === 'R') {
      const revRatio = Math.min(1.0, speed / 40);
      this.targetRpm = 950 + revRatio * 4500;
      this.currentGearNum = 'R';
    } else {
      const gearSpeeds = [0, 42, 78, 122, 168, 215, 265, 330];
      let gear = 1;
      for (let i = 1; i < gearSpeeds.length; i++) {
        if (speed >= gearSpeeds[i - 1]) gear = i;
      }
      this.currentGearNum = gear;

      const lower = gearSpeeds[gear - 1];
      const upper = gearSpeeds[gear] || (gearSpeeds[gear - 1] + 50);
      const frac = Math.min(1.0, Math.max(0.0, (speed - lower) / (upper - lower)));

      const minGearRpm = gear === 1 ? 950 : 2200;
      const maxGearRpm = isBoost ? this.maxRpm * 0.98 : this.redlineRpm;
      this.targetRpm = minGearRpm + frac * (maxGearRpm - minGearRpm) + throttle * 400;
    }

    const rpmSpeed = this.targetRpm > this.currentRpm ? 14.0 : 8.0;
    this.currentRpm += (this.targetRpm - this.currentRpm) * Math.min(1.0, rpmSpeed * delta);
  }

  /**
   * Render the high-resolution Audi Virtual Cockpit UI
   * Perfectly spaced so nothing is cut off or clipped
   */
  drawCluster() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Crystal-clear dark cockpit backdrop
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, w, h);

    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 1.7);
    bgGrad.addColorStop(0, '#0d121c');
    bgGrad.addColorStop(0.7, '#070a0f');
    bgGrad.addColorStop(1, '#040508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Top Audi Sport accent line
    ctx.strokeStyle = this.themeColor;
    ctx.lineWidth = 3.0;
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.16, 10);
    ctx.lineTo(w * 0.84, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. LEFT DIAL: DYNAMIC TACHOMETER (RPM GAUGE) - Radius 122 fits without clipping
    this.drawTachometer(ctx, w * 0.22, h * 0.50, 122);

    // 3. CENTER DISPLAY: DIGITAL SPEEDOMETER & TELEMETRY
    this.drawCenterDisplay(ctx, w * 0.50, h * 0.50);

    // 4. RIGHT DIAL: ANALOG SPEEDOMETER & BOOST - Radius 122
    this.drawSpeedometerDial(ctx, w * 0.78, h * 0.50, 122);

    // 5. TOP STATUS BAR: Turn signals, Headlights, Handbrake
    this.drawTopStatusBar(ctx, w, h);
  }

  drawTachometer(ctx, cx, cy, r) {
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const angleRange = endAngle - startAngle;

    // Outer gauge ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = '#1b222d';
    ctx.lineWidth = 12;
    ctx.stroke();

    // Redline arc (from redline to max)
    const redlineFrac = (this.redlineRpm) / this.maxRpm;
    const redlineAngle = startAngle + redlineFrac * angleRange;
    ctx.beginPath();
    ctx.arc(cx, cy, r, redlineAngle, endAngle);
    ctx.strokeStyle = '#ff1133';
    ctx.lineWidth = 12;
    ctx.stroke();

    // Active RPM progress arc
    const currentFrac = Math.min(1.0, Math.max(0.0, this.currentRpm / this.maxRpm));
    const currentAngle = startAngle + currentFrac * angleRange;
    const arcGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    arcGrad.addColorStop(0, '#ffffff');
    arcGrad.addColorStop(0.7, this.themeColor);
    arcGrad.addColorStop(1, '#ff1133');

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, currentAngle);
    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 12;
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Tick marks and numbers (0 to Max RPM)
    const tickSteps = this.carId === 'r8' ? 9 : 7;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= tickSteps; i++) {
      const frac = i / tickSteps;
      const angle = startAngle + frac * angleRange;
      const isRed = (i * 1000) >= this.redlineRpm;

      const innerR = r - 16;
      const outerR = r - 6;
      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isRed ? '#ff2244' : '#6f7e91';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      const textR = r - 28;
      const tx = cx + Math.cos(angle) * textR;
      const ty = cy + Math.sin(angle) * textR;
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = isRed ? '#ff4455' : '#c2c9d2';
      ctx.fillText(i.toString(), tx, ty);
    }

    // Dynamic glowing needle
    const needleLen = r - 14;
    const nx = cx + Math.cos(currentAngle) * needleLen;
    const ny = cy + Math.sin(currentAngle) * needleLen;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#ff2233';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#ff1122';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center hub cap
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#12151b';
    ctx.fill();
    ctx.strokeStyle = this.themeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Digital RPM Readout
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(Math.round(this.currentRpm).toString(), cx, cy + 42);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#8e9caa';
    ctx.fillText('1/min x1000', cx, cy + 58);
  }

  drawCenterDisplay(ctx, cx, cy) {
    const speed = Math.round(this.currentSpeed);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 74px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 14;
    ctx.fillText(speed.toString(), cx, cy - 22);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = this.themeColor;
    ctx.fillText('KM / H', cx, cy + 24);

    // Transmission Gear Strip: [P] [R] [N] [D] [S]
    const gears = ['P', 'R', 'N', 'D', 'S'];
    const activeGear = this.currentGear;
    const startX = cx - 74;
    const spacing = 37;
    const gy = cy + 62;

    gears.forEach((g, idx) => {
      const gx = startX + idx * spacing;
      const isActive = (activeGear === g) || (activeGear === 'D' && g === 'D');

      if (isActive) {
        ctx.fillStyle = this.themeColor;
        ctx.shadowColor = this.themeColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(gx - 15, gy - 12, 30, 24, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(activeGear === 'D' ? `D${this.currentGearNum}` : g, gx, gy);
      } else {
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#495260';
        ctx.fillText(g, gx, gy);
      }
    });

    // Drive Select mode pill
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#9cb0c8';
    ctx.fillText(this.carId === 'r8' ? 'AUDI SPORT / DYNAMIC' : 'AUDI DRIVE SELECT / COMFORT', cx, cy + 104);

    // Trip Odometer & Ambient Temp
    ctx.font = '12px monospace';
    ctx.fillStyle = '#a0b3c6';
    ctx.fillText(`TRIP ${this.tripDistance.toFixed(1)} km   |   24.5 °C`, cx, cy + 124);
  }

  drawSpeedometerDial(ctx, cx, cy, r) {
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const angleRange = endAngle - startAngle;

    // Outer gauge ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = '#1b222d';
    ctx.lineWidth = 12;
    ctx.stroke();

    // Active speed progress arc
    const currentFrac = Math.min(1.0, Math.max(0.0, this.currentSpeed / this.maxSpeed));
    const currentAngle = startAngle + currentFrac * angleRange;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, currentAngle);
    ctx.strokeStyle = this.themeColor;
    ctx.lineWidth = 12;
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Speed tick marks (0 to maxSpeed)
    const tickSteps = 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= tickSteps; i++) {
      const frac = i / tickSteps;
      const speedVal = Math.round(frac * this.maxSpeed);
      const angle = startAngle + frac * angleRange;

      const innerR = r - 16;
      const outerR = r - 6;
      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = '#6f7e91';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      const textR = r - 28;
      const tx = cx + Math.cos(angle) * textR;
      const ty = cy + Math.sin(angle) * textR;
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#c2c9d2';
      ctx.fillText(speedVal.toString(), tx, ty);
    }

    // Dynamic glowing needle
    const needleLen = r - 14;
    const nx = cx + Math.cos(currentAngle) * needleLen;
    const ny = cy + Math.sin(currentAngle) * needleLen;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.0;
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center hub cap
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#12151b';
    ctx.fill();
    ctx.strokeStyle = this.themeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Nitro / Boost Meter inside dial
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = this.themeColor;
    ctx.fillText('NITRO BOOST', cx, cy + 38);

    // Boost bar
    const barW = 100;
    const barH = 8;
    const barX = cx - barW / 2;
    const barY = cy + 48;

    ctx.fillStyle = '#171d26';
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = this.themeColor;
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 6;
    ctx.fillRect(barX, barY, barW * (this.nitroPercent / 100), barH);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#3d4857';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#9cb0c8';
    ctx.fillText('RANGE 460 KM', cx, cy + 72);
  }

  drawTopStatusBar(ctx, w, h) {
    const y = 30;

    // 1. Left Turn Signal
    const isLeftBlink = (this.steerInput < -0.15 || this.currentGear === 'R') && this.blinkState;
    ctx.fillStyle = isLeftBlink ? '#00ff66' : '#232b35';
    ctx.shadowColor = isLeftBlink ? '#00ff66' : 'transparent';
    ctx.shadowBlur = isLeftBlink ? 8 : 0;
    ctx.beginPath();
    ctx.moveTo(w * 0.38, y);
    ctx.lineTo(w * 0.38 + 12, y - 8);
    ctx.lineTo(w * 0.38 + 12, y - 3);
    ctx.lineTo(w * 0.38 + 22, y - 3);
    ctx.lineTo(w * 0.38 + 22, y + 3);
    ctx.lineTo(w * 0.38 + 12, y + 3);
    ctx.lineTo(w * 0.38 + 12, y + 8);
    ctx.closePath();
    ctx.fill();

    // 2. Right Turn Signal
    const isRightBlink = (this.steerInput > 0.15 || this.currentGear === 'R') && this.blinkState;
    ctx.fillStyle = isRightBlink ? '#00ff66' : '#232b35';
    ctx.shadowColor = isRightBlink ? '#00ff66' : 'transparent';
    ctx.shadowBlur = isRightBlink ? 8 : 0;
    ctx.beginPath();
    ctx.moveTo(w * 0.62, y);
    ctx.lineTo(w * 0.62 - 12, y - 8);
    ctx.lineTo(w * 0.62 - 12, y - 3);
    ctx.lineTo(w * 0.62 - 22, y - 3);
    ctx.lineTo(w * 0.62 - 22, y + 3);
    ctx.lineTo(w * 0.62 - 12, y + 3);
    ctx.lineTo(w * 0.62 - 12, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // 3. Headlight Indicator Lamp
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = this.lightsOn ? '#00e1ff' : '#252e3b';
    ctx.shadowColor = this.lightsOn ? '#00e1ff' : 'transparent';
    ctx.shadowBlur = this.lightsOn ? 8 : 0;
    ctx.fillText('💡', w * 0.45, y);

    // 4. Handbrake / Park indicator
    ctx.fillStyle = (this.isHandbrake || this.currentGear === 'P') ? '#ff2233' : '#252e3b';
    ctx.shadowColor = (this.isHandbrake || this.currentGear === 'P') ? '#ff2233' : 'transparent';
    ctx.shadowBlur = (this.isHandbrake || this.currentGear === 'P') ? 8 : 0;
    ctx.fillText('(P)', w * 0.55, y);
    ctx.shadowBlur = 0;
  }

  drawMmi() {
    const ctx = this.mmiCtx;
    const w = this.mmiCanvas.width;
    const h = this.mmiCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#080a10';
    ctx.fillRect(0, 0, w, h);

    // All layout is proportional to the canvas so content always fits inside the screen box
    const pad = Math.round(w * 0.025);
    const barH = Math.round(h * 0.13);

    // Header bar
    ctx.fillStyle = '#10141f';
    ctx.fillRect(0, 0, w, barH);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(barH * 0.5)}px sans-serif`;
    ctx.fillStyle = '#8ea1b8';
    ctx.fillText('AUDI MMI NAVIGATION PLUS', pad, barH / 2);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(this.currentSpeed)} km/h`, w - pad, barH / 2);

    // Map viewport (clipped to the area between header and footer)
    const mapTop = barH + 4;
    const mapBottom = h - barH - 4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, mapTop, w - pad * 2, mapBottom - mapTop);
    ctx.clip();

    ctx.strokeStyle = '#182232';
    ctx.lineWidth = 1.5;
    const grid = Math.round(w / 14);
    for (let x = pad; x < w - pad; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, mapTop);
      ctx.lineTo(x, mapBottom);
      ctx.stroke();
    }
    for (let y = mapTop; y < mapBottom; y += grid) {
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    // Glowing navigation path
    const mh = mapBottom - mapTop;
    ctx.strokeStyle = this.themeColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = this.themeColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, mapBottom - 4);
    ctx.lineTo(w * 0.34, mapTop + mh * 0.5);
    ctx.lineTo(w * 0.56, mapTop + mh * 0.5);
    ctx.lineTo(w * 0.76, mapTop + mh * 0.15);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Car location marker
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * 0.34, mapTop + mh * 0.5, Math.max(5, h * 0.03), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Footer info bar
    ctx.fillStyle = '#10141f';
    ctx.fillRect(0, h - barH, w, barH);
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(barH * 0.45)}px sans-serif`;
    ctx.fillStyle = '#8ea1b8';
    ctx.fillText(`♫ Bang & Olufsen 3D Sound  |  ${this.carId === 'r8' ? 'V10 Plus Engine' : 'V6 TFSI Engine'}`, pad, h - barH / 2);

    // Thin screen border so content is visibly framed inside the display box
    ctx.strokeStyle = 'rgba(142, 161, 184, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.textBaseline = 'alphabetic';
  }

  destroy() {
    if (this.clusterTexture) this.clusterTexture.dispose();
    if (this.clusterMaterial) this.clusterMaterial.dispose();
    if (this.mmiTexture) this.mmiTexture.dispose();
    if (this.mmiMaterial) this.mmiMaterial.dispose();
  }
}
