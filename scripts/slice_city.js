class FileReaderPolyfill {
    async readAsArrayBuffer(blob) {
        this.result = await blob.arrayBuffer();
        if (this.onload) this.onload({ target: this });
        if (this.onloadend) this.onloadend({ target: this });
    }
}
global.FileReader = FileReaderPolyfill;

const fs = require('fs');
const THREE = require('three');
const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');
const { GLTFExporter } = require('three/examples/jsm/exporters/GLTFExporter.js');

global.window = global;
global.document = {
    createElementNS: () => ({
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        style: {}
    })
};
global.HTMLImageElement = function() {};

async function sliceCity() {
    console.log('Loading city.fbx for progressive slicing...');
    const t0 = Date.now();
    const loader = new FBXLoader();
    const buffer = fs.readFileSync('Assets/Models/city/city.fbx');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const obj = loader.parse(arrayBuffer, '');
    obj.updateMatrixWorld(true);

    const outDir = 'public/assets/city';
    fs.mkdirSync(outDir, { recursive: true });

    // Clean up materials
    const matCache = new Map();
    const standardizeMaterial = (mat) => {
        if (!mat) return new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
        const name = mat.name || '';
        const key = name + '_' + (mat.color ? mat.color.getHexString() : 'd');
        if (matCache.has(key)) return matCache.get(key);

        const color = mat.color ? mat.color.clone() : new THREE.Color(0x888888);
        const isGlass = name.toLowerCase().includes('glass') || name.toLowerCase().includes('window');
        const isRoad = name.toLowerCase().includes('road') || name.toLowerCase().includes('asphalt');
        const isGrass = name.toLowerCase().includes('grass');

        let roughness = 0.8;
        let metalness = 0.1;
        let opacity = 1.0;
        let transparent = false;

        if (isGlass) {
            roughness = 0.1;
            metalness = 0.8;
            opacity = 0.6;
            transparent = true;
            color.setHex(0x99bbdd);
        } else if (isRoad) {
            roughness = 0.9;
            metalness = 0.05;
            color.setHex(0x333333);
        } else if (isGrass) {
            roughness = 0.95;
            color.setHex(0x447733);
        }

        const newMat = new THREE.MeshStandardMaterial({
            name: mat.name,
            color: color,
            roughness: roughness,
            metalness: metalness,
            opacity: opacity,
            transparent: transparent
        });
        matCache.set(key, newMat);
        return newMat;
    };

    const bbox = new THREE.Box3().setFromObject(obj);
    const minX = bbox.min.x, maxX = bbox.max.x;
    const minZ = bbox.min.z, maxZ = bbox.max.z;

    const GRID_SIZE = 3; // 3x3 grid = 9 chunks
    const stepX = (maxX - minX) / GRID_SIZE;
    const stepZ = (maxZ - minZ) / GRID_SIZE;

    console.log(`Bounding Box X:[${minX.toFixed(1)}, ${maxX.toFixed(1)}], Z:[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);
    console.log(`Grid cell size: ${stepX.toFixed(1)} x ${stepZ.toFixed(1)}`);

    const groundGroup = new THREE.Group();
    groundGroup.name = 'city_ground';
    const sectorGroups = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => new THREE.Group())
    );

    let groundCount = 0;
    let buildingCount = 0;

    obj.traverse((child) => {
        if (child.isMesh && child.geometry) {
            // Standardize material
            if (Array.isArray(child.material)) {
                child.material = child.material.map(standardizeMaterial);
            } else {
                child.material = standardizeMaterial(child.material);
            }

            child.geometry.computeBoundingBox();
            const childBox = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
            const size = new THREE.Vector3();
            childBox.getSize(size);
            const center = new THREE.Vector3();
            childBox.getCenter(center);

            // If it's a huge ground/road plane
            const area = size.x * size.z;
            const isGroundOrRoad = (area > 500000 && size.y < 50) || child.name.toLowerCase().includes('plane');

            const cloned = child.clone();
            cloned.applyMatrix4(child.matrixWorld); // Bake world transform

            if (isGroundOrRoad && area > 1000000) {
                groundGroup.add(cloned);
                groundCount++;
            } else {
                let gx = Math.floor((center.x - minX) / stepX);
                let gz = Math.floor((center.z - minZ) / stepZ);
                gx = Math.max(0, Math.min(GRID_SIZE - 1, gx));
                gz = Math.max(0, Math.min(GRID_SIZE - 1, gz));

                sectorGroups[gx][gz].add(cloned);
                buildingCount++;
            }
        }
    });

    console.log(`Classified: ${groundCount} ground/road meshes, ${buildingCount} district/building meshes.`);

    const exporter = new GLTFExporter();

    // 1. Export ground
    console.log('Exporting city_ground.glb...');
    const groundGltf = await exporter.parseAsync(groundGroup, { binary: true });
    fs.writeFileSync(`${outDir}/city_ground.glb`, Buffer.from(groundGltf));
    const s0 = fs.statSync(`${outDir}/city_ground.glb`);
    console.log(`=> city_ground.glb: ${(s0.size / 1024 / 1024).toFixed(2)} MB (${groundGroup.children.length} meshes)`);

    // 2. Export each sector
    const manifest = {
        gridSize: GRID_SIZE,
        bounds: { minX, maxX, minZ, maxZ, stepX, stepZ },
        groundFile: 'assets/city/city_ground.glb',
        sectors: []
    };

    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const group = sectorGroups[x][z];
            group.name = `sector_${x}_${z}`;
            const fileName = `sector_${x}_${z}.glb`;
            const filePath = `${outDir}/${fileName}`;

            if (group.children.length > 0) {
                const b = new THREE.Box3().setFromObject(group);
                const center = new THREE.Vector3();
                b.getCenter(center);

                const gltf = await exporter.parseAsync(group, { binary: true });
                fs.writeFileSync(filePath, Buffer.from(gltf));
                const s = fs.statSync(filePath);
                console.log(`=> ${fileName}: ${(s.size / 1024 / 1024).toFixed(2)} MB (${group.children.length} meshes)`);

                manifest.sectors.push({
                    x,
                    z,
                    file: `assets/city/${fileName}`,
                    meshCount: group.children.length,
                    sizeMB: (s.size / 1024 / 1024).toFixed(2),
                    center: { x: center.x, y: center.y, z: center.z },
                    bounds: { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }
                });
            }
        }
    }

    fs.writeFileSync(`${outDir}/city_manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`Wrote ${outDir}/city_manifest.json! Progressive city chunks are ready!`);
}

sliceCity().catch(console.error);

