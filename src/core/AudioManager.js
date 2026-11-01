export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.isAudioUnlocked = false;

    // Engine sound nodes
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.subOsc = null;

    // Tire screech nodes
    this.screechNoise = null;
    this.screechGain = null;
    this.screechFilter = null;

    // Parking sensor beep timer
    this.lastSensorBeepTime = 0;
  }

  unlockAudio() {
    if (this.isAudioUnlocked) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.initEngineAudio();
      this.initScreechAudio();
      this.isAudioUnlocked = true;
    } catch (e) {
      console.warn('AudioContext not allowed yet:', e);
    }
  }

  initEngineAudio() {
    if (!this.ctx) return;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 45;

    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'triangle';
    this.subOsc.frequency.value = 30;

    this.engineOsc.connect(this.engineFilter);
    this.subOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);

    this.engineOsc.start();
    this.subOsc.start();
  }

  initScreechAudio() {
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1400;
    this.screechFilter.Q.value = 4.0;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    whiteNoise.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.ctx.destination);

    whiteNoise.start();
  }

  update(speed, maxSpeed, isBraking, isDrifting, engineRpm = null, gear = 'D') {
    if (!this.enabled || !this.ctx || !this.isAudioUnlocked) return;

    const absSpeed = Math.abs(speed);
    const speedRatio = Math.min(absSpeed / maxSpeed, 1.0);

    // Realistic RPM directly from vehicle transmission simulation
    let rpm = engineRpm;
    if (rpm === null || rpm === undefined) {
      const gearCount = 5;
      const gearFraction = (speedRatio * gearCount) % 1.0;
      const currentGear = Math.min(Math.floor(speedRatio * gearCount) + 1, gearCount);
      rpm = 800 + gearFraction * 4500 + currentGear * 120;
    }

    if (this.engineOsc && this.engineGain) {
      // Natural engine fundamental frequency: 32 Hz idle up to ~155 Hz at 8000 RPM
      const targetFreq = 30 + (rpm / 8500) * 125;
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.04);
      this.subOsc.frequency.setTargetAtTime(targetFreq * 0.5, this.ctx.currentTime, 0.04);

      // Acoustic filter opens up with RPM and speed
      const filterFreq = 220 + (rpm / 8500) * 1200;
      this.engineFilter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.04);

      const targetGain = 0.09 + (rpm / 8500) * 0.16;
      this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
    }

    if (this.screechGain) {
      const screech = (isDrifting || (isBraking && absSpeed > 6)) ? Math.min(speedRatio * 0.25, 0.2) : 0.0;
      this.screechGain.gain.setTargetAtTime(screech, this.ctx.currentTime, 0.04);
    }
  }

  playCrashSound(intensity = 1.0) {
    if (!this.enabled || !this.ctx || !this.isAudioUnlocked) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(Math.min(0.4 * intensity, 0.5), this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  playParkingSensor(distance) {
    if (!this.enabled || !this.ctx || !this.isAudioUnlocked) return;
    if (distance > 5.0) return; // Beyond sensor range

    const now = performance.now();
    // Beep interval: 5m -> 800ms, 0.6m -> continuous/rapid 100ms
    const interval = Math.max(90, (distance / 5.0) * 750);

    if (now - this.lastSensorBeepTime > interval) {
      this.lastSensorBeepTime = now;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1600, this.ctx.currentTime);

      const duration = distance < 0.8 ? 0.09 : 0.045;
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }
  }

  playSuccessSound() {
    if (!this.enabled || !this.ctx || !this.isAudioUnlocked) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.engineGain) {
      this.engineGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
      if (this.screechGain) this.screechGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    }
    return this.enabled;
  }
}

