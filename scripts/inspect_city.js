const fs = require('fs');
const THREE = require('three');
const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');

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

const loader = new FBXLoader();
const buffer = fs.readFileSync('Assets/Models/city/city.fbx');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const obj = loader.parse(arrayBuffer, '');

obj.updateMatrixWorld(true);

const cubes = [];
obj.traverse(c => {
    if (c.isMesh && c.geometry) {
        c.geometry.computeBoundingBox();
        const b = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
        const s = new THREE.Vector3();
        b.getSize(s);
        cubes.push({ name: c.name, size: s, height: s.y, yMin: b.min.y, yMax: b.max.y });
    }
});

cubes.sort((a, b) => b.height - a.height);
console.log('Tallest 10 objects:');
cubes.slice(0, 10).forEach(c => {
    console.log(c.name + ': W=' + c.size.x.toFixed(1) + ' D=' + c.size.z.toFixed(1) + ' H=' + c.size.y.toFixed(1) + ' Ymin=' + c.yMin.toFixed(1));
});
