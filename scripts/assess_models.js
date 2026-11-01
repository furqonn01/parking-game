const fs = require('fs');
const THREE = require('three');
const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');

global.window = global;
global.document = { createElementNS: () => ({}) };

function assessModel(filePath) {
    console.log(`\n========================================`);
    console.log(`Assessing: ${filePath}`);
    const stats = fs.statSync(filePath);
    console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    const startTime = Date.now();
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const loader = new FBXLoader();
    let obj;
    try {
        obj = loader.parse(arrayBuffer, '');
    } catch (err) {
        console.error(`Failed to parse ${filePath}:`, err.message);
        return;
    }
    const parseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Parse time: ${parseTime}s`);

    let meshCount = 0;
    let groupCount = 0;
    let totalVertices = 0;
    let totalTriangles = 0;
    const materialNames = new Set();
    const meshNames = [];

    const bbox = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    obj.traverse((child) => {
        if (child.isMesh) {
            meshCount++;
            meshNames.push(child.name);
            const geom = child.geometry;
            if (geom) {
                const pos = geom.attributes.position;
                if (pos) totalVertices += pos.count;
                if (geom.index) {
                    totalTriangles += geom.index.count / 3;
                } else if (pos) {
                    totalTriangles += pos.count / 3;
                }
            }
            if (Array.isArray(child.material)) {
                child.material.forEach(m => materialNames.add(m.name || m.type));
            } else if (child.material) {
                materialNames.add(child.material.name || child.material.type);
            }
        } else if (child.isGroup) {
            groupCount++;
        }
    });

    console.log(`Bounding Box Size (XYZ): [${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}]`);
    console.log(`Meshes: ${meshCount}, Groups: ${groupCount}`);
    console.log(`Total Vertices: ${totalVertices.toLocaleString()}`);
    console.log(`Total Triangles / Polygons: ${Math.round(totalTriangles).toLocaleString()}`);
    console.log(`Materials (${materialNames.size}):`, Array.from(materialNames).slice(0, 15));
    console.log(`Sample Mesh names:`, meshNames.slice(0, 15));
    return { obj, meshCount, totalVertices, totalTriangles, size };
}

module.exports = { assessModel };

if (require.main === module) {
    const file = process.argv[2] || 'Assets/Models/cars/Audi+A7+sportback+2018.fbx';
    assessModel(file);
}
