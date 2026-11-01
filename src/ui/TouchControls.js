export class TouchControls {
  constructor(inputManager) {
    this.input = inputManager;
    this.container = null;
    this.isMobileDevice = this.detectMobile();

    this.init();
  }

  detectMobile() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 1024
    );
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'touch-controls-container';
    this.container.className = this.isMobileDevice ? 'visible' : 'desktop-hidden';

    this.container.innerHTML = `
      <!-- Left Steering Controls -->
      <div class="touch-cluster left-cluster">
        <button id="btn-steer-left" class="touch-btn steer-btn" aria-label="Steer Left">
          <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <button id="btn-steer-right" class="touch-btn steer-btn" aria-label="Steer Right">
          <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
      </div>

      <!-- Center Parking Handbrake -->
      <div class="touch-cluster center-cluster">
        <button id="btn-handbrake" class="touch-btn handbrake-btn">
          <span>(P)</span>
          <small>REM TANGAN</small>
        </button>
      </div>

      <!-- Right Pedals Cluster -->
      <div class="touch-cluster right-cluster">
        <button id="btn-nitro" class="touch-btn nitro-btn">
          <span>⚡ NITRO</span>
        </button>
        <div class="pedals-row">
          <button id="btn-brake" class="touch-btn pedal-btn brake-pedal">
            <span>REM</span>
            <small>STOP</small>
          </button>
          <button id="btn-gas" class="touch-btn pedal-btn gas-pedal">
            <span>GAS</span>
            <small>DRIVE</small>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);
    this.bindTouchEvents();
  }

  bindTouchEvents() {
    const bindBtn = (elementId, onPress, onRelease) => {
      const el = document.getElementById(elementId);
      if (!el) return;

      const handlePress = (e) => {
        e.preventDefault();
        el.classList.add('active');
        onPress();
      };

      const handleRelease = (e) => {
        e.preventDefault();
        el.classList.remove('active');
        onRelease();
      };

      el.addEventListener('touchstart', handlePress, { passive: false });
      el.addEventListener('touchend', handleRelease, { passive: false });
      el.addEventListener('touchcancel', handleRelease, { passive: false });

      el.addEventListener('mousedown', handlePress);
      el.addEventListener('mouseup', handleRelease);
      el.addEventListener('mouseleave', handleRelease);
    };

    // Steering
    bindBtn(
      'btn-steer-left',
      () => { this.input.touchSteering = -1; },
      () => { if (this.input.touchSteering === -1) this.input.touchSteering = 0; }
    );

    bindBtn(
      'btn-steer-right',
      () => { this.input.touchSteering = 1; },
      () => { if (this.input.touchSteering === 1) this.input.touchSteering = 0; }
    );

    // Gas Pedal
    bindBtn(
      'btn-gas',
      () => { this.input.touchThrottle = 1; },
      () => { this.input.touchThrottle = 0; }
    );

    // Brake Pedal
    bindBtn(
      'btn-brake',
      () => { this.input.touchBrake = 1; },
      () => { this.input.touchBrake = 0; }
    );

    // Handbrake
    bindBtn(
      'btn-handbrake',
      () => { this.input.touchHandbrake = true; },
      () => { this.input.touchHandbrake = false; }
    );

    // Nitro / Boost
    bindBtn(
      'btn-nitro',
      () => { this.input.touchBoost = true; },
      () => { this.input.touchBoost = false; }
    );
  }

  toggleVisibility(force) {
    if (force !== undefined) {
      this.container.className = force ? 'visible' : 'desktop-hidden';
    } else {
      this.container.classList.toggle('visible');
    }
  }
}

