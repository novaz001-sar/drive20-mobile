// Shared with the minimap: its triangle points forward, with yellow on the
// player's left, white on the right, and a dark green rear edge.
export const PLAYER_ARROW_PALETTE = Object.freeze({
    bodyCenter: '#ff8080',
    bodyEdge: '#c00000',
    left: '#FFD700',
    right: '#FFFFFF',
    rear: '#006400',
    glow: 'rgba(255,0,0,0.9)'
});

/**
 * A closed, beveled version of the minimap triangle, facing local -Z.
 * At the largest existing size setting (1.6), its footprint still fits inside
 * one maze cell. All vertices remain above the floor at every size setting.
 */
export function createPlayerArrowModel(THREE, tileSize) {
    const model = new THREE.Group();
    model.name = 'playerArrowModel';

    const size = tileSize * 0.62;
    const bottomY = tileSize * 0.025;
    const lowerShoulderY = tileSize * 0.042;
    const upperShoulderY = tileSize * 0.102;
    const topY = tileSize * 0.12;

    // The minimap's +X triangle is rotated so the tip matches the player's -Z.
    // A -> B is the yellow left edge; B -> C is green; C -> A is white.
    const outline = [
        [0, -size * 0.5],
        [-size * 0.3, size * 0.4],
        [size * 0.3, size * 0.4]
    ];
    const ring = (scale, y) => outline.map(([x, z]) => new THREE.Vector3(x * scale, y, z * scale));
    const bottom = ring(0.94, bottomY);
    const lower = ring(1, lowerShoulderY);
    const upper = ring(1, upperShoulderY);
    const top = ring(0.86, topY);

    const redCenter = new THREE.Color(PLAYER_ARROW_PALETTE.bodyCenter);
    const redEdge = new THREE.Color(PLAYER_ARROW_PALETTE.bodyEdge);
    const white = new THREE.Color(0xffffff);
    const lowerShade = new THREE.Color(0xaaaaaa);
    const subdivisions = 12;
    const positions = [];
    const colors = [];
    const geometry = new THREE.BufferGeometry();

    function triangle(a, b, c, materialIndex, colorA = white, colorB = colorA, colorC = colorA) {
        const start = positions.length / 3;
        for (const [point, color] of [[a, colorA], [b, colorB], [c, colorC]]) {
            positions.push(point.x, point.y, point.z);
            colors.push(color.r, color.g, color.b);
        }
        const previousGroup = geometry.groups[geometry.groups.length - 1];
        if (previousGroup && previousGroup.materialIndex === materialIndex) {
            previousGroup.count += 3;
        } else {
            geometry.addGroup(start, 3, materialIndex);
        }
    }

    function edgeBand(low, high, index, materialIndex, shade = white) {
        const next = (index + 1) % 3;
        for (let step = 0; step < subdivisions; step++) {
            const lowA = low[index].clone().lerp(low[next], step / subdivisions);
            const lowB = low[index].clone().lerp(low[next], (step + 1) / subdivisions);
            const highA = high[index].clone().lerp(high[next], step / subdivisions);
            const highB = high[index].clone().lerp(high[next], (step + 1) / subdivisions);
            triangle(lowA, lowB, highB, materialIndex, shade, shade, white);
            triangle(lowA, highB, highA, materialIndex, shade, white, white);
        }
    }

    // Every perimeter edge joins the bottom, sidewall, bevel, and top face.
    // Unlike a plane or open extrusion, the arrow is solid from every view.
    const edgeMaterials = [1, 3, 2];
    outline.forEach((point, index) => {
        const materialIndex = edgeMaterials[index];
        edgeBand(bottom, lower, index, materialIndex, lowerShade);
        edgeBand(lower, upper, index, materialIndex);
        edgeBand(upper, top, index, materialIndex);
    });
    const bottomCenter = new THREE.Vector3(0, bottomY, 0);
    outline.forEach((point, index) => {
        const next = (index + 1) % 3;
        for (let step = 0; step < subdivisions; step++) {
            const a = bottom[index].clone().lerp(bottom[next], step / subdivisions);
            const b = bottom[index].clone().lerp(bottom[next], (step + 1) / subdivisions);
            triangle(b, a, bottomCenter, 0, redEdge);
        }
    });

    // A small triangular tessellation keeps the red radial gradient smooth,
    // including the bright center used by the original minimap icon.
    const surfacePoint = (i, j) => top[0].clone()
        .addScaledVector(top[1].clone().sub(top[0]), i / subdivisions)
        .addScaledVector(top[2].clone().sub(top[0]), j / subdivisions);
    const surfaceColor = point => redCenter.clone().lerp(
        redEdge,
        THREE.MathUtils.clamp(Math.hypot(point.x, point.z) / (size * 0.43), 0, 1)
    );
    const topTriangle = (a, b, c) => triangle(a, b, c, 0, surfaceColor(a), surfaceColor(b), surfaceColor(c));

    for (let i = 0; i < subdivisions; i++) {
        for (let j = 0; j < subdivisions - i; j++) {
            const a = surfacePoint(i, j);
            const b = surfacePoint(i + 1, j);
            const c = surfacePoint(i, j + 1);
            topTriangle(a, b, c);
            if (i + j < subdivisions - 1) {
                topTriangle(b, surfacePoint(i + 1, j + 1), c);
            }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.33,
        metalness: 0.18
    });
    const edgeMaterial = color => new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
        vertexColors: true,
        roughness: 0.25,
        metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, [
        bodyMaterial,
        edgeMaterial(PLAYER_ARROW_PALETTE.left),
        edgeMaterial(PLAYER_ARROW_PALETTE.right),
        edgeMaterial(PLAYER_ARROW_PALETTE.rear)
    ]);
    mesh.name = 'playerArrowBody';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
    return model;
}
