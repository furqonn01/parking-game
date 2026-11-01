import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export class CityChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.cityGroup = new THREE.Group();
    this.cityGroup.name = 'city_district_root';
    this.scene.add(this.cityGroup);

    this.manifest = null;
    this.innerMesh = null;
    this.outerMesh = null;

    this.loadedChunks = new Set();
    this.isLoading = false;

    // Quality mode: 'progressive' (default, lightweight inner downtown) or 'full' (inner + outer skyline)
    this.mode = 'progressive';
    this.isEnabled = true;
  }

  async init() {
    try {
      const res = await fetch('assets/city/city_manifest.json');
      this.manifest = await res.json();
      console.log('City manifest loaded:', this.manifest);

      // 1. Immediately load the core inner downtown district (<900m)
      await this.loadInnerDistrict();
    } catch (err) {
      console.warn('City manifest not found or error loading:', err);
    }
  }

  loadInnerDistrict() {
    return new Promise((resolve) => {
      console.log('Loading aligned downtown city district (city_inner.glb)...');
      this.loader.load('assets/city/city_inner.glb', (gltf) => {
        this.innerMesh = gltf.scene;
        this.innerMesh.traverse((child) => {
          if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow = false; // Keep high FPS on mobile
            child.matrixAutoUpdate = false; // Static mesh optimization: eliminates 500+ redundant matrix calculations per frame
            child.updateMatrix();
            child.frustumCulled = true;
          }
        });
        this.cityGroup.add(this.innerMesh);
        this.loadedChunks.add('inner');
        console.log('Inner downtown district loaded and aligned successfully.');
        resolve();
      }, undefined, (err) => {
        console.warn('Error loading city_inner:', err);
        resolve();
      });
    });
  }

  loadOuterSkyline() {
    if (this.outerMesh || this.isLoading) return;
    this.isLoading = true;

    console.log('Loading outer skyline buildings (city_outer.glb)...');
    this.loader.load('assets/city/city_outer.glb', (gltf) => {
      this.outerMesh = gltf.scene;
      this.outerMesh.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true;
          child.castShadow = false;
          child.matrixAutoUpdate = false;
          child.updateMatrix();
          child.frustumCulled = true;
        }
      });
      this.cityGroup.add(this.outerMesh);
      this.loadedChunks.add('outer');
      this.isLoading = false;
      console.log('Outer metropolis skyline loaded successfully.');
    }, undefined, (err) => {
      console.warn('Error loading city_outer:', err);
      this.isLoading = false;
    });
  }

  setMode(mode) {
    this.mode = mode;
    if (this.mode === 'full') {
      this.loadOuterSkyline();
      if (this.outerMesh) this.outerMesh.visible = true;
    } else {
      if (this.outerMesh) this.outerMesh.visible = false;
    }
  }

  update(playerPos) {
    if (!this.isEnabled) return;
    // Inner downtown is always active and visible around parking plaza
  }

  getLoadedCount() {
    return this.loadedChunks.size;
  }

  getTotalCount() {
    return this.manifest && this.manifest.chunks ? this.manifest.chunks.length : 2;
  }
}

