export class UIManager {
  constructor(game) {
    this.game = game;
    this.container = null;

    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'game-ui-overlay';

    this.container.innerHTML = `
      <!-- Top Action Bar -->
      <header class="ui-topbar">
        <div class="topbar-left">
          <div class="badge-brand">🚗 3D Parking & Roam</div>
          <div id="badge-mode" class="badge-tag mode-tag">Mode: Parkir</div>
          <div id="badge-car" class="badge-tag car-tag">Audi R8</div>
          <div id="badge-cam" class="badge-tag cam-tag">Kamera: Luar</div>
        </div>

        <div class="topbar-right">
          <button id="btn-toggle-cam" class="ui-top-btn" title="Ganti Sudut Pandang (C)">
            <span class="btn-icon">📷</span>
            <span class="btn-label">POV</span>
          </button>
          <button id="btn-toggle-car" class="ui-top-btn" title="Ganti Mobil (V)">
            <span class="btn-icon">🏎️</span>
            <span class="btn-label">Mobil</span>
          </button>
          <button id="btn-toggle-mode" class="ui-top-btn" title="Ganti Mode Game">
            <span class="btn-icon">🎮</span>
            <span class="btn-label">Mode</span>
          </button>
          <button id="btn-reset-car" class="ui-top-btn" title="Reset / Respawn Mobil (R)">
            <span class="btn-icon">🔄</span>
            <span class="btn-label">Reset</span>
          </button>
          <button id="btn-toggle-lights" class="ui-top-btn" title="Lampu Depan (L)">
            <span class="btn-icon">💡</span>
            <span class="btn-label">Lampu</span>
          </button>
          <button id="btn-toggle-mirror" class="ui-top-btn active" title="Kamera Mundur & Layar Head Unit (K)">
            <span class="btn-icon">📺</span>
            <span class="btn-label">Head Unit</span>
          </button>
          <button id="btn-toggle-time" class="ui-top-btn" title="Waktu: Siang/Senja/Malam">
            <span class="btn-icon">☀️</span>
            <span class="btn-label">Waktu</span>
          </button>
          <button id="btn-toggle-quality" class="ui-top-btn" title="Kualitas Grafis (Enteng HP / Tinggi PC)">
            <span class="btn-icon">⚡</span>
            <span id="quality-label" class="btn-label">Ringan (HP)</span>
          </button>
          <button id="btn-toggle-audio" class="ui-top-btn" title="Mute/Unmute Audio (M)">
            <span id="audio-icon" class="btn-icon">🔊</span>
          </button>
          <button id="btn-help" class="ui-top-btn" title="Bantuan Kontrol">
            <span class="btn-icon">❓</span>
          </button>
        </div>
      </header>

      <!-- Parking Sensor (PDC) HUD -->
      <div id="parking-sensor-hud" class="sensor-container">
        <div class="sensor-title">RADAR PARKIR (PDC)</div>
        <div class="sensor-bars">
          <div id="sensor-bar-1" class="s-bar s-green"></div>
          <div id="sensor-bar-2" class="s-bar s-yellow"></div>
          <div id="sensor-bar-3" class="s-bar s-orange"></div>
          <div id="sensor-bar-4" class="s-bar s-red"></div>
        </div>
        <div id="sensor-dist-text" class="sensor-dist">Jarak: -- m</div>
      </div>

      <!-- Center Parking Alignment Status -->
      <div id="parking-status-hud" class="parking-status-box">
        <div id="parking-level-title" class="status-level-title">Level 1: Parkir Maju</div>
        <div id="parking-level-desc" class="status-level-desc">Maju ke kotak target</div>
        <div class="status-meters">
          <div class="meter-item">
            <span>WAKTU</span>
            <strong id="hud-timer">00:00</strong>
          </div>
          <div class="meter-item">
            <span>TABRAKAN</span>
            <strong id="hud-strikes" class="text-strikes">0</strong>
          </div>
          <div class="meter-item">
            <span>AKURASI</span>
            <strong id="hud-accuracy">0%</strong>
          </div>
        </div>
        <div id="parking-hold-progress-bar" class="hold-bar-container">
          <div id="parking-hold-fill" class="hold-bar-fill"></div>
        </div>
      </div>

      <!-- Free Roam Stats HUD -->
      <div id="free-roam-hud" class="free-roam-box hidden">
        <div class="roam-stat">
          <span>TOP SPEED</span>
          <strong id="hud-top-speed">0 km/h</strong>
        </div>
        <div class="roam-stat">
          <span>JARAK TEMPUH</span>
          <strong id="hud-distance">0.00 km</strong>
        </div>
        <div class="roam-stat">
          <span>DRIFT SCORE</span>
          <strong id="hud-drift">0 pts</strong>
        </div>
      </div>

      <!-- Speedometer & Dash Cluster -->
      <div class="dash-cluster">
        <div class="speedo-box">
          <!-- Automatic Transmission PRND Shifter Selector -->
          <div class="prnd-shifter-strip">
            <button id="gear-btn-p" class="gear-btn" data-gear="P">P</button>
            <button id="gear-btn-r" class="gear-btn" data-gear="R">R</button>
            <button id="gear-btn-n" class="gear-btn" data-gear="N">N</button>
            <button id="gear-btn-d" class="gear-btn active" data-gear="D">D</button>
          </div>
          <div id="gear-indicator" class="gear-badge">D1</div>
          <div class="speed-number-wrap">
            <span id="speed-display" class="speed-val">0</span>
            <span class="speed-unit">KM/H</span>
          </div>
          <div class="rpm-bar-wrap">
            <div id="rpm-fill" class="rpm-fill-bar"></div>
          </div>
        </div>
        <div id="city-chunk-badge" class="city-status-badge">
          🏙️ Kota: Memuat bertahap (0/9 sektor)
        </div>
      </div>

      <!-- Level Complete Modal Dialog -->
      <div id="modal-level-complete" class="modal-overlay hidden">
        <div class="modal-card">
          <div class="modal-icon">🏆</div>
          <h2 id="modal-title">Parkir Sempurna!</h2>
          <div id="modal-stars" class="modal-stars">⭐⭐⭐</div>
          <div class="modal-stats-grid">
            <div class="stat-cell">
              <span>Waktu</span>
              <strong id="modal-time">18.5s</strong>
            </div>
            <div class="stat-cell">
              <span>Tabrakan</span>
              <strong id="modal-strikes">0</strong>
            </div>
            <div class="stat-cell">
              <span>Akurasi</span>
              <strong id="modal-accuracy">96%</strong>
            </div>
          </div>
          <div class="modal-actions">
            <button id="modal-btn-restart" class="modal-btn btn-secondary">Ulangi Level</button>
            <button id="modal-btn-next" class="modal-btn btn-primary">Level Berikutnya</button>
          </div>
        </div>
      </div>

      <!-- Help / Keyboard Controls Modal -->
      <div id="modal-help" class="modal-overlay hidden">
        <div class="modal-card">
          <h2>Panduan Kontrol</h2>
          <div class="help-grid">
            <div class="help-section">
              <h3>💻 Keyboard PC</h3>
              <ul>
                <li><kbd>W</kbd> / <kbd>↑</kbd> : Gas (Drive / Reverse)</li>
                <li><kbd>S</kbd> / <kbd>↓</kbd> : Rem Murni (Brake Hidrolik)</li>
                <li><kbd>E</kbd> / <kbd>Q</kbd> : Ganti Tuas Transmisi (P ⮂ R ⮂ N ⮂ D)</li>
                <li><kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd> : Langsung Pilih [P], [R], [N], [D]</li>
                <li><kbd>A</kbd> / <kbd>D</kbd> : Belok Kiri / Kanan</li>
                <li><kbd>Spasi</kbd> : Rem Tangan (Handbrake / Drift)</li>
                <li><kbd>Shift</kbd> : Nitro Boost ⚡</li>
                <li><kbd>C</kbd> : Ganti Sudut Kamera (POV Dalam / Luar)</li>
                <li><kbd>V</kbd> : Ganti Mobil (Audi R8 / Audi A7)</li>
                <li><kbd>R</kbd> : Reset Posisi Mobil</li>
                <li><kbd>L</kbd> : Nyalakan/Matikan Lampu Depan</li>
                <li><kbd>K</kbd> : Kamera Mundur & Head Unit (MMI Display)</li>
                <li><strong>Mouse Drag</strong> : Putar Sudut Pandang 360°</li>
              </ul>
            </div>
            <div class="help-section">
              <h3>📱 Layar Sentuh HP</h3>
              <ul>
                <li><strong>Tuas [P] [R] [N] [D]</strong> : Tap untuk ganti transmisi</li>
                <li><strong>Pedal REM</strong> : Rem murni hidrolik</li>
                <li><strong>Pedal GAS</strong> : Menjalankan mobil (Maju di D, Mundur di R)</li>
                <li><strong>Tombol Panah Kiri/Kanan</strong> : Setir</li>
                <li><strong>Tombol REM TANGAN</strong> : Handbrake / Drift</li>
                <li><strong>Tombol NITRO</strong> : Kecepatan Ekstra</li>
                <li><strong>Tombol POV (Atas)</strong> : Kamera Dalam / Luar</li>
                <li><strong>Geser Layar</strong> : Putar Pandangan 360°</li>
              </ul>
            </div>
          </div>
          <div class="help-section" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.12); text-align: left;">
            <h3 style="font-size: 0.95rem; margin-bottom: 6px; color: #e2e8f0;">🎨 Kredit Model 3D (3D Model Credits)</h3>
            <p style="font-size: 0.82rem; color: #94a3b8; margin: 0 0 8px 0; line-height: 1.4;">Asset 3D mobil dan lingkungan kota bersumber dari para kreator 3D berbakat di CGTrader:</p>
            <ul style="font-size: 0.82rem; list-style: none; padding-left: 0; margin: 0; display: flex; flex-direction: column; gap: 4px;">
              <li>• <strong>Silent Studios</strong> : <a href="https://www.cgtrader.com/designers/silentstudios?utm_source=credit&utm_source=credit_item_page" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline;">cgtrader.com/designers/silentstudios</a></li>
              <li>• <strong>Hooman Belly</strong> : <a href="https://www.cgtrader.com/designers/hooman-belly?utm_source=credit&utm_source=credit_item_page" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline;">cgtrader.com/designers/hooman-belly</a></li>
              <li>• <strong>Orkqn</strong> : <a href="https://www.cgtrader.com/designers/orkqn?utm_source=credit&utm_source=credit_item_page" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline;">cgtrader.com/designers/orkqn</a></li>
            </ul>
          </div>
          <button id="modal-btn-close-help" class="modal-btn btn-primary" style="margin-top: 16px;">Tutup & Mulai Main</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);
    this.cacheElements();
    this.bindButtons();
  }

  cacheElements() {
    this.dom = {
      speed: document.getElementById('speed-display'),
      gear: document.getElementById('gear-indicator'),
      rpm: document.getElementById('rpm-fill'),
      badgeCar: document.getElementById('badge-car'),
      badgeCam: document.getElementById('badge-cam'),
      badgeChunk: document.getElementById('city-chunk-badge'),
      timer: document.getElementById('hud-timer'),
      strikes: document.getElementById('hud-strikes'),
      accuracy: document.getElementById('hud-accuracy'),
      holdFill: document.getElementById('parking-hold-fill'),
      sensorDist: document.getElementById('sensor-dist-text'),
      bar1: document.getElementById('sensor-bar-1'),
      bar2: document.getElementById('sensor-bar-2'),
      bar3: document.getElementById('sensor-bar-3'),
      bar4: document.getElementById('sensor-bar-4'),
      topSpeed: document.getElementById('hud-top-speed'),
      distance: document.getElementById('hud-distance'),
      drift: document.getElementById('hud-drift'),
      shifterButtons: {
        P: document.getElementById('gear-btn-p'),
        R: document.getElementById('gear-btn-r'),
        N: document.getElementById('gear-btn-n'),
        D: document.getElementById('gear-btn-d')
      }
    };
  }

  bindButtons() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    bind('btn-toggle-cam', () => this.game.toggleCamera());
    bind('btn-toggle-car', () => this.game.toggleCar());
    bind('btn-toggle-mode', () => this.game.toggleGameMode());
    bind('btn-reset-car', () => this.game.resetCar());
    bind('btn-toggle-lights', () => this.game.toggleLights());
    bind('btn-toggle-mirror', () => this.game.toggleMirror());
    bind('btn-toggle-time', () => this.game.toggleTimeOfDay());
    bind('btn-toggle-quality', () => this.game.cycleQuality());
    bind('btn-toggle-audio', () => this.game.toggleAudio());

    bind('btn-help', () => {
      document.getElementById('modal-help').classList.remove('hidden');
    });
    bind('modal-btn-close-help', () => {
      document.getElementById('modal-help').classList.add('hidden');
    });

    bind('modal-btn-next', () => {
      document.getElementById('modal-level-complete').classList.add('hidden');
      this.game.nextLevel();
    });
    bind('modal-btn-restart', () => {
      document.getElementById('modal-level-complete').classList.add('hidden');
      this.game.restartLevel();
    });

    // PRND Shifter button clicks
    const modes = ['P', 'R', 'N', 'D'];
    modes.forEach(mode => {
      const btn = document.getElementById(`gear-btn-${mode.toLowerCase()}`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.game.vehicle) {
            this.game.vehicle.setGear(mode);
          }
        });
      }
    });
  }

  updateHUD(vehicle, camMode, gameMode, chunkManager) {
    if (!vehicle || !this.dom) return;

    // Speed & Gear
    const kmh = Math.round(Math.abs(vehicle.speed) * 3.6);
    if (this.dom.speed) this.dom.speed.textContent = kmh;

    let gear = vehicle.gear || 'D';
    if (this.dom.gear) {
      if (gear === 'D') {
        this.dom.gear.textContent = `D${vehicle.forwardGear || 1}`;
      } else {
        this.dom.gear.textContent = gear;
      }
    }

    // Update active PRND shifter strip highlight
    if (this.dom.shifterButtons) {
      Object.entries(this.dom.shifterButtons).forEach(([m, btn]) => {
        if (btn) btn.classList.toggle('active', m === gear);
      });
    }

    // RPM fill bar (linked to simulated engine RPM)
    const maxRpm = vehicle.options.id === 'r8' ? 9000 : 7000;
    const curRpm = vehicle.engineRpm || 850;
    const rpmPercent = Math.min(100, Math.max(0, Math.round(((curRpm - 800) / (maxRpm - 800)) * 100)));
    if (this.dom.rpm) this.dom.rpm.style.width = `${rpmPercent}%`;

    // Badges
    if (this.dom.badgeCar) this.dom.badgeCar.textContent = vehicle.config.name;

    const camLabels = {
      chase: 'Kamera: Luar (Chase)',
      interior: 'Kamera: Dalam (Cockpit)',
      hood: 'Kamera: Kap Depan'
    };
    if (this.dom.badgeCam) this.dom.badgeCam.textContent = camLabels[camMode] || 'Kamera: Luar';

    // City District Badge
    if (chunkManager && this.dom.badgeChunk) {
      const loaded = chunkManager.getLoadedCount();
      const total = chunkManager.getTotalCount();
      const modeStr = chunkManager.mode === 'full' ? 'Metropolis Penuh' : 'Downtown (Enteng)';
      this.dom.badgeChunk.textContent = `🏙️ Kota: ${modeStr} (${loaded}/${total} aktif)`;
    }
  }

  updateParkingHUD(parkingMode) {
    if (!parkingMode || !parkingMode.levelData || !this.dom) return;

    // Timer
    const mins = Math.floor(parkingMode.elapsedTime / 60);
    const secs = Math.floor(parkingMode.elapsedTime % 60);
    if (this.dom.timer) {
      this.dom.timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Strikes
    if (this.dom.strikes) {
      this.dom.strikes.textContent = parkingMode.strikes;
      if (parkingMode.strikes > 0) this.dom.strikes.classList.add('strike-warning');
    }

    // Accuracy
    if (this.dom.accuracy) {
      this.dom.accuracy.textContent = `${Math.round(parkingMode.parkingAccuracy)}%`;
    }

    // Hold progress bar
    const holdPct = Math.min(100, (parkingMode.parkingHoldTimer / 1.2) * 100);
    if (this.dom.holdFill) {
      this.dom.holdFill.style.width = `${holdPct}%`;
    }

    // Parking sensor bars (4 stages)
    const d = parkingMode.minObstacleDist;
    const distText = d > 8 ? '> 8.0 m' : `${d.toFixed(1)} m`;
    if (this.dom.sensorDist) {
      this.dom.sensorDist.textContent = `Jarak: ${distText}`;
    }

    if (this.dom.bar1) this.dom.bar1.className = 's-bar s-green' + (d < 5.0 ? ' active' : '');
    if (this.dom.bar2) this.dom.bar2.className = 's-bar s-yellow' + (d < 3.2 ? ' active' : '');
    if (this.dom.bar3) this.dom.bar3.className = 's-bar s-orange' + (d < 1.8 ? ' active' : '');
    if (this.dom.bar4) this.dom.bar4.className = 's-bar s-red' + (d < 0.9 ? ' active' : '');
  }

  updateFreeRoamHUD(freeRoamMode) {
    if (!freeRoamMode || !this.dom) return;
    const stats = freeRoamMode.getStats();
    if (this.dom.topSpeed) this.dom.topSpeed.textContent = `${stats.topSpeed} km/h`;
    if (this.dom.distance) this.dom.distance.textContent = `${stats.totalDistance} km`;
    if (this.dom.drift) this.dom.drift.textContent = `${stats.driftScore} pts`;
  }

  setGameModeUI(mode) {
    const isParking = mode === 'parking';
    document.getElementById('badge-mode').textContent = isParking ? 'Mode: Parkir' : 'Mode: Free Roam';
    document.getElementById('parking-status-hud').classList.toggle('hidden', !isParking);
    document.getElementById('parking-sensor-hud').classList.toggle('hidden', !isParking);
    document.getElementById('free-roam-hud').classList.toggle('hidden', isParking);
  }

  showLevelCompleteModal(data) {
    document.getElementById('modal-title').textContent = `${data.title} Selesai!`;
    document.getElementById('modal-stars').textContent = '⭐'.repeat(data.stars);
    document.getElementById('modal-time').textContent = `${data.time}s`;
    document.getElementById('modal-strikes').textContent = data.strikes;
    document.getElementById('modal-accuracy').textContent = `${data.accuracy}%`;

    const nextBtn = document.getElementById('modal-btn-next');
    if (data.hasNext) {
      nextBtn.style.display = 'block';
      nextBtn.textContent = 'Level Berikutnya';
    } else {
      nextBtn.textContent = 'Semua Level Tamat!';
      nextBtn.style.display = 'inline-block';
    }

    document.getElementById('modal-level-complete').classList.remove('hidden');
  }

  setQualityLabel(label) {
    document.getElementById('quality-label').textContent = label;
  }

  setAudioMuteIcon(enabled) {
    document.getElementById('audio-icon').textContent = enabled ? '🔊' : '🔇';
  }
}

