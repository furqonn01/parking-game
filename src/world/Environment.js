import * as THREE from 'three';

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.ambientLight = null;
    this.dirLight = null;
    this.hemiLight = null;

    // Time of day: 'day', 'sunset', 'night'
    this.timeOfDay = 'day';

    this.init();
  }

  init() {
    // Ambient / Hemisphere light
    this.hemiLight = new THREE.HemisphereLight(0xcce0ff, 0x383b40, 0.75);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // Directional sunlight - angled to cast rich, realistic car body & tire shadows
    this.dirLight = new THREE.DirectionalLight(0xfff8ee, 1.85);
    this.dirLight.position.set(65, 115, 50);
    this.dirLight.castShadow = true;

    // High-resolution shadow map with optimized tight bounds around the vehicle
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 15;
    this.dirLight.shadow.camera.far = 240;

    const d = 32; // Tight frustum (64m x 64m) yields ultra-sharp, anti-aliased shadows
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.00035;
    this.dirLight.shadow.normalBias = 0.038; // Eliminates shadow acne on curved vehicle hoods & panels

    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Atmospheric Fog
    this.scene.fog = new THREE.FogExp2(0xd8e8f8, 0.0016);
    this.scene.background = new THREE.Color(0xd8e8f8);

    // Procedural HDR environment reflection map for realistic metallic car paint & chrome
    this.setupProceduralEnvMap();

    this.setTimeOfDay('day');
  }

  setupProceduralEnvMap() {
    if (!this.renderer) return;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      // Sky to horizon to asphalt gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.0, '#3a7bd5'); // Deep sky blue
      grad.addColorStop(0.42, '#99c2ff'); // Light horizon sky
      grad.addColorStop(0.50, '#fffaee'); // Bright sunlit horizon line
      grad.addColorStop(0.54, '#4a4d50'); // Road surface tone
      grad.addColorStop(1.0, '#1c1d20'); // Dark asphalt ground
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Soft sun glare spot
      const sunGrad = ctx.createRadialGradient(256, 115, 4, 256, 115, 80);
      sunGrad.addColorStop(0, 'rgba(255, 255, 245, 1.0)');
      sunGrad.addColorStop(0.25, 'rgba(255, 242, 210, 0.65)');
      sunGrad.addColorStop(1, 'rgba(255, 240, 200, 0.0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, 512, 256);

      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;

      const renderTarget = pmrem.fromEquirectangular(texture);
      this.scene.environment = renderTarget.texture;

      texture.dispose();
      pmrem.dispose();
    } catch (e) {
      console.warn('Could not generate PMREM envMap:', e);
    }
  }

  update(playerPos) {
    // Follow the player with shadow camera so shadows are razor-sharp around the vehicle
    if (this.dirLight && playerPos) {
      this.dirLight.position.set(playerPos.x + 65, playerPos.y + 115, playerPos.z + 50);
      this.dirLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
      this.dirLight.target.updateMatrixWorld();
    }
  }

  setTimeOfDay(time) {
    this.timeOfDay = time;

    if (time === 'day') {
      this.scene.background.setHex(0xd8e8f8);
      this.scene.fog.color.setHex(0xd8e8f8);
      this.scene.fog.density = 0.0016;

      this.hemiLight.color.setHex(0xcce0ff);
      this.hemiLight.groundColor.setHex(0x383b40);
      this.hemiLight.intensity = 0.75;

      this.dirLight.color.setHex(0xfff8ee);
      this.dirLight.intensity = 1.85;

    } else if (time === 'sunset') {
      this.scene.background.setHex(0xf79d65);
      this.scene.fog.color.setHex(0xf79d65);
      this.scene.fog.density = 0.0020;

      this.hemiLight.color.setHex(0xffaa77);
      this.hemiLight.groundColor.setHex(0x281c19);
      this.hemiLight.intensity = 0.60;

      this.dirLight.color.setHex(0xff6a28);
      this.dirLight.intensity = 2.2;

    } else if (time === 'night') {
      this.scene.background.setHex(0x070a16);
      this.scene.fog.color.setHex(0x070a16);
      this.scene.fog.density = 0.0032;

      this.hemiLight.color.setHex(0x182848);
      this.hemiLight.groundColor.setHex(0x05070e);
      this.hemiLight.intensity = 0.30;

      this.dirLight.color.setHex(0x4466aa);
      this.dirLight.intensity = 0.42;
    }
  }

  toggleTimeOfDay() {
    const cycle = ['day', 'sunset', 'night'];
    const nextIdx = (cycle.indexOf(this.timeOfDay) + 1) % cycle.length;
    this.setTimeOfDay(cycle[nextIdx]);
    return this.timeOfDay;
  }
}

