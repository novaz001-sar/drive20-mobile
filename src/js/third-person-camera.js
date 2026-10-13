import * as THREE from 'three';

// Test only the nearby solid wall cells. This is the same box intersection as
// the rendered wall mesh, without scanning the whole maze's triangle buffer.
export function clearsMazeWalls(grid, tileSize, wallHeight, from, to, clearance = 0.25) {
    if (!grid?.length) return true;
    const width = grid[0].length;
    const depth = grid.length;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dy = to.y - from.y;
    if (Math.min(from.y, to.y) > wallHeight + clearance) return true;
    const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) / tileSize + width / 2));
    const maxX = Math.min(width - 1, Math.floor(Math.max(from.x, to.x) / tileSize + width / 2));
    const minZ = Math.max(0, Math.floor(Math.min(from.z, to.z) / tileSize + depth / 2));
    const maxZ = Math.min(depth - 1, Math.floor(Math.max(from.z, to.z) / tileSize + depth / 2));
    for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
            if (grid[z][x] !== 0) continue;
            let entry = 0;
            let exit = 1;
            const left = (x - width / 2) * tileSize;
            const north = (z - depth / 2) * tileSize;
            if (Math.abs(dx) < 1e-8) {
                if (from.x < left || from.x > left + tileSize) continue;
            } else {
                const a = (left - from.x) / dx;
                const b = (left + tileSize - from.x) / dx;
                entry = Math.max(entry, Math.min(a, b));
                exit = Math.min(exit, Math.max(a, b));
            }
            if (Math.abs(dz) < 1e-8) {
                if (from.z < north || from.z > north + tileSize) continue;
            } else {
                const a = (north - from.z) / dz;
                const b = (north + tileSize - from.z) / dz;
                entry = Math.max(entry, Math.min(a, b));
                exit = Math.min(exit, Math.max(a, b));
            }
            if (entry > exit) continue;
            const lowY = from.y + dy * (dy >= 0 ? entry : exit);
            const highY = from.y + dy * (dy >= 0 ? exit : entry);
            if (lowY <= wallHeight + clearance && highY >= 0) return false;
        }
    }
    return true;
}

export function resolveThirdPersonCamera({ grid, tileSize, wallHeight, position, heading = 0,
    zoom, angle, cameraMode = 'follow', bounds }) {
    const width = grid?.[0]?.length || 0;
    const depth = grid?.length || 0;
    const distance = tileSize * zoom;
    const yaw = cameraMode === 'overhead' ? 0 : heading;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const min = bounds?.min || { x: -tileSize * 0.2, y: tileSize * 0.025, z: -tileSize * 0.3 };
    const max = bounds?.max || { x: tileSize * 0.2, y: wallHeight * 0.3, z: tileSize * 0.3 };
    const lowY = Math.max(tileSize * 0.025, Math.min(wallHeight * 0.8, min.y + (max.y - min.y) * 0.1));
    const centerX = (min.x + max.x) / 2;
    const centerZ = (min.z + max.z) / 2;

    function probe(localX, localZ, y) {
        // Oversized legacy models must not ask the camera to see through a wall
        // containing a box corner. Keep samples inside the local corridor.
        const radius = Math.hypot(localX, localZ);
        const scale = radius > tileSize * 0.495 ? tileSize * 0.495 / radius : 1;
        let offsetX = (localX * cos + localZ * sin) * scale;
        let offsetZ = (-localX * sin + localZ * cos) * scale;
        let point;
        for (let attempt = 0; attempt < 7; attempt++) {
            point = { x: position.x + offsetX, y: position.y + y, z: position.z + offsetZ };
            const x = Math.floor(point.x / tileSize + width / 2);
            const z = Math.floor(point.z / tileSize + depth / 2);
            if (!grid || grid[z]?.[x] !== 0) return point;
            offsetX *= 0.5;
            offsetZ *= 0.5;
        }
        return { x: position.x, y: position.y + y, z: position.z };
    }

    const focus = probe(centerX, centerZ,
        Math.max(tileSize * 0.025, Math.min(wallHeight * 0.8, (min.y + max.y) / 2)));
    const probes = [];
    for (const x of [min.x, centerX, max.x]) {
        for (const z of [min.z, centerZ, max.z]) probes.push(probe(x, z, lowY));
    }
    probes.push(focus);
    const cameraAt = degrees => {
        const radians = degrees * Math.PI / 180;
        const horizontal = distance * Math.cos(radians);
        return { x: position.x + horizontal * Math.sin(yaw),
            y: position.y + distance * Math.sin(radians),
            z: position.z + horizontal * Math.cos(yaw) };
    };
    const isClear = candidate => probes.every(point => clearsMazeWalls(grid, tileSize, wallHeight, point, candidate));
    let resolvedAngle = angle;
    let cameraPosition = cameraAt(angle);
    if (!isClear(cameraPosition)) {
        let lower = angle;
        let upper = Math.max(angle, 89);
        cameraPosition = cameraAt(upper);
        // Fixed iteration count and an almost vertical fallback bound the work
        // and camera height, even if an existing oversized model crosses walls.
        if (isClear(cameraPosition)) {
            for (let attempt = 0; attempt < 7; attempt++) {
                const middle = (lower + upper) / 2;
                const candidate = cameraAt(middle);
                if (isClear(candidate)) {
                    upper = middle;
                    cameraPosition = candidate;
                } else lower = middle;
            }
        }
        resolvedAngle = upper;
    }
    return { position: cameraPosition, focus, angle: resolvedAngle, probes };
}

export function createThirdPersonCameraController({ tileSize, wallHeight }) {
    const localBounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    const inversePlayer = new THREE.Matrix4();
    const relativeMatrix = new THREE.Matrix4();
    const cachedScale = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const focus = new THREE.Vector3();
    let cachedModel;
    let cachedChild;

    return function update({ camera, player, scene, grid, model, zoom, angle, cameraMode = 'follow' }) {
        const parent = cameraMode === 'overhead' ? scene : player;
        if (camera.parent !== parent) parent.add(camera);
        if (model && (cachedModel !== model || cachedChild !== model.children[0] || !cachedScale.equals(model.scale))) {
            model.updateWorldMatrix(true, true);
            inversePlayer.copy(player.matrixWorld).invert();
            localBounds.makeEmpty();
            model.traverse(child => {
                if (!child.isMesh || !child.geometry) return;
                if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                relativeMatrix.multiplyMatrices(inversePlayer, child.matrixWorld);
                meshBounds.copy(child.geometry.boundingBox).applyMatrix4(relativeMatrix);
                localBounds.union(meshBounds);
            });
            cachedModel = model;
            cachedChild = model.children[0];
            cachedScale.copy(model.scale);
        }
        const result = resolveThirdPersonCamera({ grid, tileSize, wallHeight,
            position: player.position, heading: player.rotation.y, zoom, angle, cameraMode,
            bounds: model && !localBounds.isEmpty() ? localBounds : undefined });
        cameraPosition.set(result.position.x, result.position.y, result.position.z);
        camera.position.copy(parent.worldToLocal(cameraPosition));
        focus.set(result.focus.x, result.focus.y, result.focus.z);
        camera.lookAt(focus);
        return result;
    };
}
