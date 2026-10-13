import * as THREE from 'three';

// Grid value 0 is a wall; 1 is a walkable cell. Direction names follow
// the existing corridor-facing materials, rather than the face normals.
export function createSolidMazeWalls({ grid, goal, tileSize, wallHeight, materials }) {
    const width = grid[0].length;
    const depth = grid.length;
    const half = tileSize / 2;
    const buckets = Array.from({ length: 5 }, () => ({ positions: [], normals: [], uvs: [] }));
    const wallMaterials = [materials.north, materials.south, materials.east, materials.west, materials.goal];

    function addTriangle(materialIndex, points, normal, uvs) {
        const bucket = buckets[materialIndex];
        points.forEach((point, index) => {
            bucket.positions.push(...point);
            bucket.normals.push(...normal);
            bucket.uvs.push(...uvs[index]);
        });
    }

    function addQuad(materialIndex, points, normal) {
        // Keep uploaded textures oriented exactly as the former wall planes.
        const uvs = [[1, 1], [0, 1], [0, 0], [1, 0]];
        addTriangle(materialIndex, [points[0], points[1], points[2]], normal, [uvs[0], uvs[1], uvs[2]]);
        addTriangle(materialIndex, [points[0], points[2], points[3]], normal, [uvs[0], uvs[2], uvs[3]]);
    }

    function isWall(x, z) {
        return x >= 0 && x < width && z >= 0 && z < depth && grid[z][x] === 0;
    }

    function faceMaterial(x, z, dx, dz, direction) {
        const neighborX = x + dx;
        const neighborZ = z + dz;
        const hasPath = neighborX >= 0 && neighborX < width && neighborZ >= 0 && neighborZ < depth
            && grid[neighborZ][neighborX] === 1;
        // Preserve the existing highlighted faces around the goal corridor.
        const nearGoal = goal && hasPath && Math.abs(neighborX - goal.x) <= 1
            && Math.abs(neighborZ - goal.z) <= 1
            && !(neighborX === goal.x && neighborZ === goal.z);
        return nearGoal && (dx === 0 ? z === goal.z : x === goal.x) ? 4 : direction;
    }

    for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
            if (!isWall(x, z)) continue;
            const centerX = (x - width / 2 + 0.5) * tileSize;
            const centerZ = (z - depth / 2 + 0.5) * tileSize;
            const left = centerX - half;
            const right = centerX + half;
            const north = centerZ - half;
            const south = centerZ + half;
            const top = wallHeight;
            const faces = [
                { dx: 0, dz: -1, normal: [0, 0, -1], points: [[left, top, north], [right, top, north], [right, 0, north], [left, 0, north]] },
                { dx: 0, dz: 1, normal: [0, 0, 1], points: [[right, top, south], [left, top, south], [left, 0, south], [right, 0, south]] },
                { dx: -1, dz: 0, normal: [-1, 0, 0], points: [[left, top, south], [left, top, north], [left, 0, north], [left, 0, south]] },
                { dx: 1, dz: 0, normal: [1, 0, 0], points: [[right, top, north], [right, top, south], [right, 0, south], [right, 0, north]] }
            ];

            faces.forEach((face, direction) => {
                const materialIndex = faceMaterial(x, z, face.dx, face.dz, direction);
                if (!isWall(x + face.dx, z + face.dz)) {
                    addQuad(materialIndex, face.points, face.normal);
                }
                // Four filled roof sectors reuse the actual side materials.
                // Their UVs meet the wall's upper edge and keep texture density
                // in the depth direction, including after texture replacement.
                addTriangle(materialIndex,
                    [face.points[1], face.points[0], [centerX, top, centerZ]],
                    [0, 1, 0], [[0, 1], [1, 1], [0.5, 1 + half / wallHeight]]);
            });
            addQuad(0, [[left, 0, south], [left, 0, north], [right, 0, north], [right, 0, south]], [0, -1, 0]);
        }
    }

    const vertexCount = buckets.reduce((total, bucket) => total + bucket.positions.length / 3, 0);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const geometry = new THREE.BufferGeometry();
    let vertexOffset = 0;
    buckets.forEach((bucket, materialIndex) => {
        if (bucket.positions.length === 0) return;
        positions.set(bucket.positions, vertexOffset * 3);
        normals.set(bucket.normals, vertexOffset * 3);
        uvs.set(bucket.uvs, vertexOffset * 2);
        const count = bucket.positions.length / 3;
        geometry.addGroup(vertexOffset, count, materialIndex);
        vertexOffset += count;
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // One draw call per material, irrespective of maze size.
    const mesh = new THREE.Mesh(geometry, wallMaterials);
    mesh.name = 'solid-maze-walls';
    mesh.userData.solidMazeWalls = true;
    mesh.userData.grid = grid;
    return mesh;
}
