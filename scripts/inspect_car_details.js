const fs = require('fs');
const THREE = require('three');
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');

global.window = global;
global.document = { createElementNS: () => ({}) };

function inspectCar(filePath) {
    console.log(`\n================ Inspecting ${filePath} ================`);
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const loader = new GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        console.log(`Bounding Box Min: [${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}]`);
        console.log(`Bounding Box Max: [${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}]`);
        console.log(`Size (W, H, L): [${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}]`);
        console.log(`Center: [${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}]`);

        const interiorNodes = [];
        const wheels = [];
        root.traverse(c => {
            const name = c.name.toLowerCase();
            if (name.includes('wheel') || name.includes('rim') || name.includes('tire') || name.includes('tyre')) {
                wheels.push(c.name);
            }
            if (name.includes('steer') || name.includes('seat') || name.includes('interior') || name.includes('dash') || name.includes('board')) {
                interiorNodes.push(c.name);
            }
        });

        console.log('Wheel nodes:', wheels.slice(0, 10));
        console.log('Interior nodes:', interiorNodes.slice(0, 10));
    });
}

inspectCar('public/assets/cars/r8.glb');
inspectCar('public/assets/cars/audi_a7.glb');

