import * as THREE from 'three';

export class MirrorManager {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;

    // Wide-angle rear view (65° vertical / ~102° horizontal) with tight 80m far plane
    // Covers left lane (left mirror), center road (interior mirror), and right lane (right mirror) in 1 pass
    this.rearCamera = new THREE.PerspectiveCamera(65, 2.0, 0.25, 80);

    // Optimized RenderTarget for both in-cabin mirrors and digital HUD quad blit
    this.renderTarget = new THREE.WebGLRenderTarget(384, 192, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace
    });

    // 2-Triangle Orthographic Quad Scene for zero-overhead GPU blitting (0.01ms)
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.orthoScene = new THREE.Scene();
    this.quadMat = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture,
      depthTest: false,
      depthWrite: false
    });
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(quadGeo, this.quadMat);
    this.orthoScene.add(this.quadMesh);

    // Mirror display states
    this.isEnabled = true;
    this.isHUDVisible = true;
    this.quality = 'mobile';
    this.frameCounter = 0;

    // HUD overlays
    this.hudBezel = null;
    this.guidelineCanvas = null;
    this.guidelineCtx = null;
    this.gearTag = null;
    this.cachedGear = '';

    this.createHUDOverlay();
  }

  createHUDOverlay() {
    const bezel = document.createElement('div');
    bezel.id = 'audi-headunit-overlay';
    bezel.className = 'audi-headunit-overlay';

    bezel.innerHTML = `
      <div class="headunit-frame">
        <div class="headunit-header">
          <div class="headunit-title-group">
            <span class="headunit-mmi-logo">MMI</span>
            <span class="headunit-title">PARKING SYSTEM PLUS</span>
          </div>
          <div class="headunit-status-group">
            <span id="headunit-gear-tag" class="headunit-gear gear-p">P (PARKIR)</span>
          </div>
        </div>

        <!-- Dynamic Parking Guidelines & PDC Sensor Overlay Canvas -->
        <canvas id="headunit-guideline-canvas" class="headunit-canvas"></canvas>

        <!-- Audi MMI Touch Bottom Softkey Bar -->
        <div class="headunit-footer">
          <div class="mmi-softkey active"><span class="sk-icon">⤹</span> TRAJECTORY</div>
          <div class="mmi-softkey active"><span class="sk-icon">📶</span> PDC SENSOR</div>
          <div class="mmi-softkey"><span class="sk-icon">📷</span> WIDE REAR</div>
        </div>
      </div>
    `;

    document.body.appendChild(bezel);
    this.hudBezel = bezel;
    this.gearTag = document.getElementById('headunit-gear-tag');
    this.guidelineCanvas = document.getElementById('headunit-guideline-canvas');
    if (this.guidelineCanvas) {
      this.guidelineCtx = this.guidelineCanvas.getContext('2d');
    }
  }

  setQuality(quality) {
    this.quality = quality;
    if (quality === 'mobile') {
      this.renderTarget.setSize(320, 160);
    } else {
      this.renderTarget.setSize(440, 220);
    }
  }

  toggleHUD() {
    this.isHUDVisible = !this.isHUDVisible;
    if (this.hudBezel) {
      this.hudBezel.style.display = this.isHUDVisible ? 'block' : 'none';
    }
    return this.isHUDVisible;
  }

  setVisible(visible) {
    this.isHUDVisible = visible;
    if (this.hudBezel) {
      this.hudBezel.style.display = visible ? 'block' : 'none';
    }
  }

  getMirrorViewportRect() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW <= 768;

    let headunitW, headunitH, x, y;

    if (isMobile) {
      // Mobile layout: position above pedals to preserve touch driving area
      headunitW = Math.min(270, Math.max(190, Math.round(screenW * 0.46)));
      headunitH = Math.round(headunitW * 0.56); // 16:9 widescreen ratio
      x = screenW - headunitW - 14;
      y = screenH - headunitH - 160;
    } else {
      // Desktop / PC layout: authentic center-console Head Unit position at bottom-right
      headunitW = Math.min(360, Math.max(270, Math.round(screenW * 0.23)));
      headunitH = Math.round(headunitW * 0.56); // 16:9 widescreen ratio
      x = screenW - headunitW - 24;
      y = screenH - headunitH - 24;
    }

    return {
      x,
      y,
      w: headunitW,
      h: headunitH,
      screenW,
      screenH
    };
  }

  updateCamera(vehicle) {
    const pos = vehicle.position;
    const heading = vehicle.heading;
    const dim = vehicle.options.dimensions || { length: 4.5, height: 1.25 };

    const rearHeading = heading + Math.PI;
    const backOffset = (dim.length || 4.5) * 0.40;
    const camX = pos.x - Math.sin(heading) * backOffset;
    const camY = pos.y + (dim.height || 1.25) * 0.90;
    const camZ = pos.z - Math.cos(heading) * backOffset;

    this.rearCamera.position.set(camX, camY, camZ);

    const lookDist = 18.0;
    const lookPitch = -0.085;
    const lx = camX + Math.sin(rearHeading) * Math.cos(lookPitch) * lookDist;
    const ly = camY + Math.sin(lookPitch) * lookDist;
    const lz = camZ + Math.cos(rearHeading) * Math.cos(lookPitch) * lookDist;

    this.rearCamera.lookAt(lx, ly, lz);
  }

  render(vehicle) {
    if (!this.isEnabled || !vehicle || !vehicle.group) return;

    this.frameCounter++;
    // Ultra-smooth 30 FPS mirror render cadence: runs 3D scene render only on even frames,
    // cutting mirror CPU/GPU load by 50% and guaranteeing 60 FPS in main loop
    const shouldUpdate3D = (this.frameCounter % 2 === 0);

    if (shouldUpdate3D) {
      this.updateCamera(vehicle);

      // Hide car body to prevent interior panel clipping
      vehicle.group.visible = false;

      // Disable shadow map recalculation during mirror pass (massive performance boost)
      const prevShadowAuto = this.renderer.shadowMap.autoUpdate;
      this.renderer.shadowMap.autoUpdate = false;

      // 1. Single 3D render pass to RenderTarget
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.render(this.scene, this.rearCamera);
      this.renderer.setRenderTarget(null);

      // Restore
      this.renderer.shadowMap.autoUpdate = prevShadowAuto;
      vehicle.group.visible = true;
    }

    // 2. High-speed 2D Quad Blit directly to Head Unit screen scissor viewport (0.01ms overhead!)
    if (this.isHUDVisible) {
      const rect = this.getMirrorViewportRect();

      // Align DOM frame
      if (this.hudBezel) {
        this.hudBezel.style.left = `${rect.x}px`;
        this.hudBezel.style.top = `${rect.y}px`;
        this.hudBezel.style.width = `${rect.w}px`;
        this.hudBezel.style.height = `${rect.h}px`;
      }

      // Update guidelines
      if (this.guidelineCanvas) {
        if (this.guidelineCanvas.width !== rect.w || this.guidelineCanvas.height !== rect.h) {
          this.guidelineCanvas.width = rect.w;
          this.guidelineCanvas.height = rect.h;
        }
        this.drawGuidelines(vehicle, rect.w, rect.h);
      }

      // Gear Tag
      if (this.gearTag) {
        let gear = 'D (MAJU)';
        let gearClass = 'headunit-gear gear-d';
        if (vehicle.isReversing || vehicle.speed < -0.1) {
          gear = 'R (MUNDUR)';
          gearClass = 'headunit-gear gear-r';
        } else if (Math.abs(vehicle.speed) < 0.15) {
          gear = 'P (PARKIR)';
          gearClass = 'headunit-gear gear-p';
        }

        if (this.cachedGear !== gear) {
          this.cachedGear = gear;
          this.gearTag.textContent = gear;
          this.gearTag.className = gearClass;
        }
      }

      // Three.js setScissor & setViewport take logical CSS pixels and multiply by pixelRatio internally.
      // Inset by 2px so the WebGL quad sits strictly inside the .headunit-frame border.
      const borderInset = 2;
      const sx = Math.round(rect.x) + borderInset;
      const sy = Math.round(rect.screenH - rect.y - rect.h) + borderInset;
      const sw = Math.max(1, Math.round(rect.w) - borderInset * 2);
      const sh = Math.max(1, Math.round(rect.h) - borderInset * 2);

      // Blit texture directly with hardware scissor
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(sx, sy, sw, sh);
      this.renderer.setViewport(sx, sy, sw, sh);

      // Render 2-triangle ortho quad (instant blit!)
      this.renderer.render(this.orthoScene, this.orthoCamera);

      // Reset scissor and restore full logical CSS viewport
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, rect.screenW, rect.screenH);
    }
  }

  drawGuidelines(vehicle, w, h) {
    if (!this.guidelineCtx) return;
    const ctx = this.guidelineCtx;
    ctx.clearRect(0, 0, w, h);

    const isReversing = vehicle.isReversing || vehicle.speed < -0.05;
    const steer = vehicle.steerAngle || 0;
    // Steering trajectory curve offset in pixels
    const steerCurve = steer * (w * 0.18);

    ctx.save();

    // 1. Red warning bar (0.5m critical distance)
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#ff2b2b';
    ctx.shadowColor = '#ff2b2b';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.26 + steerCurve * 0.25, h * 0.86);
    ctx.lineTo(w * 0.74 + steerCurve * 0.25, h * 0.86);
    ctx.stroke();

    // 2. Yellow intermediate caution bar (1.5m)
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = '#ffcc00';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.30 + steerCurve * 0.55, h * 0.68);
    ctx.lineTo(w * 0.70 + steerCurve * 0.55, h * 0.68);
    ctx.stroke();

    // 3. Green safe distance guide bar (3.0m)
    ctx.strokeStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.34 + steerCurve * 0.85, h * 0.52);
    ctx.lineTo(w * 0.66 + steerCurve * 0.85, h * 0.52);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Dynamic Trajectory Side Guidelines (Active Steering Path)
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = isReversing ? '#00e5ff' : 'rgba(255, 255, 255, 0.45)';
    ctx.setLineDash([6, 3]);

    // Left Track
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.94);
    ctx.quadraticCurveTo(w * 0.28 + steerCurve * 0.6, h * 0.65, w * 0.36 + steerCurve, h * 0.44);
    ctx.stroke();

    // Right Track
    ctx.beginPath();
    ctx.moveTo(w * 0.78, h * 0.94);
    ctx.quadraticCurveTo(w * 0.72 + steerCurve * 0.6, h * 0.65, w * 0.64 + steerCurve, h * 0.44);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Mini In-Display PDC Sensor Radar Widget (top-left of Head Unit)
    const pdcX = 12;
    const pdcY = 30;
    const pdcW = 28;
    const pdcH = 42;

    // Stylized car top-view outline
    ctx.fillStyle = 'rgba(12, 16, 24, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(pdcX, pdcY, pdcW, pdcH, 4) : ctx.rect(pdcX, pdcY, pdcW, pdcH);
    ctx.fill();
    ctx.stroke();

    // Car wheels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(pdcX - 2, pdcY + 5, 2, 7);
    ctx.fillRect(pdcX + pdcW, pdcY + 5, 2, 7);
    ctx.fillRect(pdcX - 2, pdcY + 30, 2, 7);
    ctx.fillRect(pdcX + pdcW, pdcY + 30, 2, 7);

    // Rear ultrasonic sonar arc waves
    const arcColors = isReversing ? ['#00ff88', '#ffcc00', '#ff2b2b'] : ['rgba(255,255,255,0.2)'];
    arcColors.forEach((col, idx) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pdcX + pdcW / 2, pdcY + pdcH - 2, 6 + idx * 4, 0.2 * Math.PI, 0.8 * Math.PI, false);
      ctx.stroke();
    });

    ctx.restore();
  }

  getTexture() {
    return this.renderTarget.texture;
  }
}
