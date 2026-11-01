export class InputManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;

    // Combined active control outputs
    this.throttle = 0;       // 0 to 1
    this.brake = 0;          // 0 to 1
    this.steering = 0;       // -1 to 1
    this.handbrake = false;
    this.boost = false;
    this.headlights = false;

    // Virtual Touch state inputs (from touch UI on mobile)
    this.touchThrottle = 0;
    this.touchBrake = 0;
    this.touchSteering = 0;
    this.touchHandbrake = false;
    this.touchBoost = false;

    // View control (drag to look around)
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;

    // Single-trigger actions
    this.onToggleCamera = null;
    this.onToggleCar = null;
    this.onResetCar = null;
    this.onToggleLights = null;
    this.onToggleMirror = null;
    this.onShiftUp = null;       // Shifter actions
    this.onShiftDown = null;
    this.onSetGear = null;

    // Internal keys set
    this.keys = {};

    this.initKeyboard();
    this.initPointerDrag();
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Trigger one-shots
      if (e.code === 'KeyC' && this.onToggleCamera) this.onToggleCamera();
      if (e.code === 'KeyV' && this.onToggleCar) this.onToggleCar();
      if (e.code === 'KeyR' && this.onResetCar) this.onResetCar();
      if (e.code === 'KeyL' && this.onToggleLights) this.onToggleLights();
      if (e.code === 'KeyK' && this.onToggleMirror) this.onToggleMirror();

      // Gear selector triggers (Automatic transmission PRND)
      if (e.code === 'KeyE' && this.onShiftUp) this.onShiftUp();
      if (e.code === 'KeyQ' && this.onShiftDown) this.onShiftDown();
      if (e.code === 'Digit1' && this.onSetGear) this.onSetGear('P');
      if (e.code === 'Digit2' && this.onSetGear) this.onSetGear('R');
      if (e.code === 'Digit3' && this.onSetGear) this.onSetGear('N');
      if (e.code === 'Digit4' && this.onSetGear) this.onSetGear('D');
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  initPointerDrag() {
    const onDown = (x, y) => {
      this.isDragging = true;
      this.lastPointerX = x;
      this.lastPointerY = y;
    };

    const onMove = (x, y) => {
      if (!this.isDragging) return;
      const dx = x - this.lastPointerX;
      const dy = y - this.lastPointerY;
      this.lastPointerX = x;
      this.lastPointerY = y;

      const sensitivity = 0.005;
      this.lookYaw -= dx * sensitivity;
      this.lookPitch -= dy * sensitivity;
      this.lookPitch = Math.max(-0.5, Math.min(0.6, this.lookPitch));
    };

    const onUp = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onUp);

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    this.canvas.addEventListener('touchend', onUp);
  }

  update(delta) {
    // Read keyboard controls cleanly every frame
    let kbThrottle = 0;
    let kbBrake = 0;
    let kbSteer = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) kbThrottle = 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) kbBrake = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kbSteer -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kbSteer += 1;

    const kbHandbrake = !!this.keys['Space'];
    const kbBoost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    // Combine keyboard with touch inputs:
    this.throttle = Math.max(kbThrottle, this.touchThrottle);
    this.brake = Math.max(kbBrake, this.touchBrake);
    this.steering = kbSteer !== 0 ? kbSteer : this.touchSteering;
    this.handbrake = kbHandbrake || this.touchHandbrake;
    this.boost = kbBoost || this.touchBoost;

    // Gradually return look yaw/pitch back towards forward view when not dragging
    if (!this.isDragging) {
      this.lookYaw *= Math.exp(-2.5 * delta);
      this.lookPitch *= Math.exp(-2.5 * delta);
    }
  }

  resetLook() {
    this.lookYaw = 0;
    this.lookPitch = 0;
  }
}
