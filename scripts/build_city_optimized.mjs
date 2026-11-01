import fs from 'fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class FileReaderPolyfill {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    if (this.onload) this.onload({ target: this });
    if (this.onloadend) this.onloadend({ target: this });
  }
}
globalThis.FileReader = FileReaderPolyfill;
globalThis.window = globalThis;
const dummyEl = () => ({
  addEventListener: () => {},
  removeEventListener: () => {},
  setAttribute: () => {},
  style: {},
  src: ''
});
globalThis.document = {
  createElement: dummyEl,
  createElementNS: dummyEl
};
globalThis.HTMLImageElement = dummyEl;

async function buildCity() {
  console.log('Loading Assets/Models/city/city.fbx...');
  const loader = new FBXLoader();
  const buffer = fs.readFileSync('Assets/Models/city/city.fbx');
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const obj = loader.parse(ab, '');
  obj.updateMatrixWorld(true);

  // Exact ground offset so road surface sits at Y=0 and the central downtown boulevard sits at (0,0)
  // Perfectly flanked North and South by the twin 303m skyscrapers with zero building overlap
  const X_OFF = -1998.0;
  const Y_OFF = -413.5;
  const Z_OFF = 82.0;

  const innerGroup = new THREE.Group();
  innerGroup.name = 'city_inner_district';

  const outerGroup = new THREE.Group();
  outerGroup.name = 'city_outer_skyline';

  // Optimized lightweight material palette
  const matCache = new Map();
  function getOptimizedMat(srcMat) {
    if (!srcMat) return new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 });
    const name = srcMat.name || 'mat';
    if (matCache.has(name)) return matCache.get(name);

    const isGlass = name.toLowerCase().includes('glass') || name.toLowerCase().includes('window');
    const isRoad = name.toLowerCase().includes('road') || name.toLowerCase().includes('asphalt');
    const isGrass = name.toLowerCase().includes('grass');
    const isRoof = name.toLowerCase().includes('roof');
    const color = srcMat.color ? srcMat.color.clone() : new THREE.Color(0x888888);

    let roughness = 0.8;
    let metalness = 0.1;
    let transparent = false;
    let opacity = 1.0;

    if (isGlass) {
      roughness = 0.15;
      metalness = 0.75;
      transparent = true;
      opacity = 0.65;
      color.setHex(0x88aacc);
    } else if (isRoad) {
      roughness = 0.9;
      metalness = 0.05;
      color.setHex(0x28282b);
    } else if (isGrass) {
      roughness = 0.95;
      color.setHex(0x446633);
    } else if (isRoof) {
      roughness = 0.85;
      color.setHex(0x3a3a40);
    }

    const mat = new THREE.MeshStandardMaterial({
      name,
      color,
      roughness,
      metalness,
      transparent,
      opacity
    });
    matCache.set(name, mat);
    return mat;
  }

  let totalCount = 0;
  obj.traverse(c => {
    if (c.isMesh && c.geometry) {
      const geo = c.geometry.clone();
      geo.applyMatrix4(c.matrixWorld);
      geo.translate(X_OFF, Y_OFF, Z_OFF);
      geo.computeBoundingBox();

      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      const dist = Math.sqrt(center.x * center.x + center.z * center.z);

      const mat = Array.isArray(c.material)
        ? c.material.map(getOptimizedMat)
        : getOptimizedMat(c.material);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = c.name;
      mesh.castShadow = false;
      mesh.receiveShadow = true;

      // Inner district (<900m) is fully detailed downtown around parking plaza
      if (dist < 900) {
        innerGroup.add(mesh);
      } else if (dist < 2600) {
        // Outer skyline (900m - 2600m) forms the breathtaking surrounding skyscrapers
        outerGroup.add(mesh);
      }
      totalCount++;
    }
  });

  console.log(`Processed ${totalCount} meshes:`);
  console.log(`- Inner District (<900m): ${innerGroup.children.length} buildings & roads`);
  console.log(`- Outer Skyline (900-2600m): ${outerGroup.children.length} buildings`);

  const exporter = new GLTFExporter();

  function exportGLB(group, path) {
    return new Promise((resolve, reject) => {
      exporter.parse(
        group,
        (buffer) => {
          fs.writeFileSync(path, Buffer.from(buffer));
          const stat = fs.statSync(path);
          console.log(`=> Created ${path} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        },
        (err) => reject(err),
        { binary: true }
      );
    });
  }

  await exportGLB(innerGroup, 'public/assets/city/city_inner.glb');
  await exportGLB(outerGroup, 'public/assets/city/city_outer.glb');
  console.log('City optimization completed successfully!');
}

buildCity().catch(console.error);

