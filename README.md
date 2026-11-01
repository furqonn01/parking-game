# 🚗 3D Parking Simulation & Free Roam City

Simulasi berkendara realistis, parkir presisi, dan *free roam* perkotaan metropolitan 3D berbasis WebGL yang dibangun menggunakan **Three.js** dan **Vite**. Dioptimalkan untuk performa tinggi (*high FPS*) di perangkat PC maupun *smartphone* / *mobile*.

---

## 🌟 Fitur Utama

- **Fisika Kendaraan Realistis (*Rigid-Body Vehicle Dynamics*)**:
  - Geometri suspensi independen *Double-Wishbone* & *Multi-Link* dengan *bump camber gain*.
  - *Dynamic Kingpin Inclination (KPI)*, *Caster*, dan *inboard scrub radius* yang menjaga ban berputar presisi di dalam lekukan *fender* (*zero tire clipping*).
  - Kinematika kemudi *True Ackermann Geometry* dengan redaman inersia tangan manusia dan *speed-sensitive steering lock*.
  - Dinamika bodi *Roll* dan *Pitch* (*Anti-Dive* saat pengereman hidrolik keras & *Anti-Squat* saat akselerasi/mundur) dengan redaman *critical damping* 98% tanpa goyangan mengambang.
- **Transmisi Otomatis Sejati (PRND)**:
  - Tuas **P** (*Park* - penguncian roda mekanikal *parking pawl*), **R** (*Reverse* - akselerasi mundur), **N** (*Neutral* - meluncur bebas tanpa torsi mesin), dan **D** (*Drive* - maju dengan perpindahan 7 transmisi *dual-clutch* otomatis).
  - Tombol pedal **S** berfungsi sebagai rem hidrolik murni di semua posisi transmisi tanpa memicu gigi mundur mendadak.
- **Pilihan Mobil Ikonik**:
  - **Audi R8 V10 Plus**: *Supercar* bertenaga tinggi, suspensi kaku *magnetic ride*, rem karbon-keramik, dan *handling* lincah.
  - **Audi A7 Sportback**: *Executive 4-door coupe* mewah, sasis stabil, *wheelbase* panjang, dan perpindahan halus. Asset 3D telah dioptimalkan dengan kompresi *Meshopt* berkecepatan tinggi (~13.4 MB).
- **Berbagai Sudut Pandang Kamera (POV)**:
  - **Chase Camera**: Kamera luar dengan *smooth damping follow*, orbit mouse drag 360°, dan penyesuaian sudut otomatis.
  - **Driver Cockpit Camera**: Sudut pandang orang pertama (kursi pengemudi) lengkap dengan *dashboard cluster display* digital, speedometer, tachometer RPM dinamis, dan indikator transmisi.
  - **Hood Camera**: Kamera kap mesin untuk presisi parkir dan visibilitas sudut depan.
  - **Head Unit / Kamera Mundur (MMI)**: Tampilan visual layar kamera mundur saat tuas berada di posisi [R].
- **Dunia Perkotaan Metropolitan (LOD Chunks)**:
  - Distrik pusat kota (*Inner Downtown*) dengan jalan raya, garis marka, area parkir, dan gedung pencakar langit kembar 303m.
  - *Metropolis Skyline Chunk* untuk cakrawala kota luas tanpa membebani GPU/memori seluler.
- **Dukungan Multi-Platform**:
  - Kontrol *keyboard* responsif untuk desktop/laptop.
  - Antarmuka *touchscreen* lengkap (tombol setir, pedal gas & rem, tuas PRND, tombol kamera) untuk HP / tablet.

---

## 🎮 Panduan Kontrol

### 💻 Keyboard PC
| Tombol | Fungsi |
|---|---|
| <kbd>W</kbd> / <kbd>↑</kbd> | Pedal Gas (Maju di [D], Mundur di [R]) |
| <kbd>S</kbd> / <kbd>↓</kbd> | Pedal Rem Hidrolik Murni |
| <kbd>A</kbd> / <kbd>D</kbd> atau <kbd>←</kbd> / <kbd>→</kbd> | Belok Kiri / Kanan (Kemudi Ackermann) |
| <kbd>E</kbd> / <kbd>Q</kbd> | Pindah Tuas Transmisi Berurutan (P ⮂ R ⮂ N ⮂ D) |
| <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd> | Akses Cepat Posisi Transmisi [P], [R], [N], [D] |
| <kbd>Spasi</kbd> | Rem Tangan (*Handbrake* / *Drift*) |
| <kbd>Shift</kbd> | Nitro Boost ⚡ |
| <kbd>C</kbd> | Ganti Sudut Pandang Kamera (Kabin / Luar / Kap Mesin) |
| <kbd>V</kbd> | Ganti Pilihan Mobil (Audi R8 ⮂ Audi A7) |
| <kbd>R</kbd> | Reset / *Respawn* Posisi Mobil |
| <kbd>L</kbd> | Lampu Depan (*Headlights* On/Off) |
| <kbd>K</kbd> | Toggle Layar *Head Unit* / Kamera Mundur |
| **Mouse Drag** | Putar Sudut Pandang Kamera 360° |

### 📱 Layar Sentuh HP
- **Tuas [P] [R] [N] [D]**: Ketuk untuk mengganti posisi transmisi secara langsung.
- **Pedal GAS**: Memberikan tenaga akselerasi (Maju saat di [D], Mundur saat di [R]).
- **Pedal REM**: Mengerem roda secara hidrolik.
- **Tombol Panah Kiri / Kanan**: Memutar kemudi dengan kecepatan adaptif.
- **Tombol HANDBRAKE & NITRO**: Bermanuver *drift* dan akselerasi ekstra.
- **Sentuh & Geser Layar**: Memutar sudut kamera 360° secara bebas.

---

## 🚀 Memulai Proyek (Getting Started)

### Prasyarat
- [Node.js](https://nodejs.org/) versi 18 atau yang lebih baru.
- Web browser modern dengan dukungan WebGL (Google Chrome, Microsoft Edge, Safari, Mozilla Firefox).

### Instalasi & Menjalankan

1. **Clone repository:**
   ```bash
   git clone https://github.com/furqonn01/parking-game.git
   cd parking-game
   ```

2. **Instal dependensi:**
   ```bash
   npm install
   ```

3. **Jalankan local development server:**
   ```bash
   npm run dev
   ```
   Buka URL yang ditampilkan di terminal (biasanya `http://localhost:3000/` atau `http://localhost:5173/`).

4. **Build untuk produksi:**
   ```bash
   npm run build
   ```

---

## 🎨 Kredit Model 3D / Attributions

Asset model 3D yang digunakan dalam proyek ini bersumber dari para desainer berbakat di **CGTrader**. Kami memberikan apresiasi dan kredit sebesar-besarnya kepada:

* **Silent Studios**  
  [https://www.cgtrader.com/designers/silentstudios](https://www.cgtrader.com/designers/silentstudios?utm_source=credit&utm_source=credit_item_page)

* **Hooman Belly**  
  [https://www.cgtrader.com/designers/hooman-belly](https://www.cgtrader.com/designers/hooman-belly?utm_source=credit&utm_source=credit_item_page)

* **Orkqn**  
  [https://www.cgtrader.com/designers/orkqn](https://www.cgtrader.com/designers/orkqn?utm_source=credit&utm_source=credit_item_page)

---

## 📄 Lisensi

Proyek ini dirilis untuk tujuan portofolio dan edukasi simulasi Three.js. Hak cipta model 3D masing-masing tetap menjadi milik kreator aslinya di CGTrader sebagaimana dicantumkan pada bagian Kredit di atas.

