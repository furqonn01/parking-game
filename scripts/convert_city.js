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

async function convertCity() {
    console.log('Loading city.fbx...');
    const t0 = Date.now();
    const loader = new FBXLoader();
    const buffer = fs.readFileSync('Assets/Models/city/city.fbx');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const obj = loader.parse(arrayBuffer, '');
    console.log('Loaded in', ((Date.now() - t0) / 1000).toFixed(2), 's');

    // Clean up materials: convert all materials to MeshStandardMaterial and strip broken texture references
    const matCache = new Map();

    obj.traverse(child => {
        if (child.isMesh) {
            const processMat = (mat) => {
                if (!mat) return new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
                const key = mat.name + '_' + (mat.color ? mat.color.getHexString() : 'def');
                if (matCache.has(key)) return matCache.get(key);

                const color = mat.color ? mat.color.clone() : new THREE.Color(0x888888);
                const isGlass = mat.name.toLowerCase().includes('glass') || mat.name.toLowerCase().includes('window');
                const isRoad = mat.name.toLowerCase().includes('road') || mat.name.toLowerCase().includes('asphalt');
                const isGrass = mat.name.toLowerCase().includes('grass');

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

            if (Array.isArray(child.material)) {
                child.material = child.material.map(processMat);
            } else {
                child.material = processMat(child.material);
            }
        }
    });

    console.log(`Created ${matCache.size} standardized PBR materials.`);
    console.log('Exporting city to GLB...');
    const exporter = new GLTFExporter();
    const gltf = await exporter.parseAsync(obj, { binary: true });
    fs.writeFileSync('Assets/Models/city/city.glb', Buffer.from(gltf));
    const s = fs.statSync('Assets/Models/city/city.glb');
    console.log('SUCCESS! city.glb size:', (s.size / 1024 / 1024).toFixed(2), 'MB');
}

convertCity().catch(console.error);

