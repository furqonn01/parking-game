const fs = require('fs');
const THREE = require('three');
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');

global.window = global;
global.document = { createElementNS: () => ({}) };

function diagnose(name, file, scale) {
    console.log(`\n=================== ${name} ===================`);
    const buffer = fs.readFileSync(file);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const loader = new GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        console.log('Raw Box Min:', box.min);
        console.log('Raw Box Max:', box.max);
        console.log('Raw Size:', size);
        console.log('Raw Center:', center);

        console.log(`\nScaled by ${scale}:`);
        console.log('Scaled Size (m):', size.clone().multiplyScalar(scale));
        console.log('Scaled Min Y (tire bottom in raw pos):', box.min.y * scale);
        console.log('Scaled Center:', center.clone().multiplyScalar(scale));
    });
}

diagnose('AUDI R8', 'public/assets/cars/r8.glb', 0.001);
diagnose('AUDI A7', 'public/assets/cars/audi_a7.glb', 0.01);
