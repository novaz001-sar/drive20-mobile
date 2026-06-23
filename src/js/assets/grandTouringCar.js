import * as THREE from 'three';

function physicalMaterial(color, options = {}) {
    return new THREE.MeshPhysicalMaterial({
        color,
        metalness: options.metalness ?? 0.52,
        roughness: options.roughness ?? 0.24,
        clearcoat: options.clearcoat ?? 0.72,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.14,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        side: options.side ?? THREE.FrontSide
    });
}

function glowMaterial(color, opacity = 0.72) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function createLoftGeometry(sections) {
    const vertices = [];
    const indices = [];
    const pointsPerSection = 7;

    sections.forEach(section => {
        const w = section.w;
        vertices.push(
            -w * 0.72, section.floor, section.z,
            -w, section.belt, section.z,
            -w * 0.64, section.deck, section.z,
            0, section.crown, section.z,
            w * 0.64, section.deck, section.z,
            w, section.belt, section.z,
            w * 0.72, section.floor, section.z
        );
    });

    for (let i = 0; i < sections.length - 1; i++) {
        const a = i * pointsPerSection;
        const b = (i + 1) * pointsPerSection;
        for (let j = 0; j < pointsPerSection - 1; j++) {
            indices.push(a + j, b + j, a + j + 1);
            indices.push(a + j + 1, b + j, b + j + 1);
        }
    }

    for (let i = 1; i < pointsPerSection - 1; i++) {
        indices.push(0, i, i + 1);
        const end = (sections.length - 1) * pointsPerSection;
        indices.push(end, end + i + 1, end + i);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createBodyGeometry(tileSize) {
    const length = tileSize * 0.76;
    return createLoftGeometry([
        { z: -length * 0.50, w: tileSize * 0.118, floor: tileSize * 0.036, belt: tileSize * 0.082, deck: tileSize * 0.108, crown: tileSize * 0.118 },
        { z: -length * 0.33, w: tileSize * 0.166, floor: tileSize * 0.034, belt: tileSize * 0.102, deck: tileSize * 0.132, crown: tileSize * 0.143 },
        { z: -length * 0.03, w: tileSize * 0.188, floor: tileSize * 0.032, belt: tileSize * 0.112, deck: tileSize * 0.148, crown: tileSize * 0.160 },
        { z:  length * 0.25, w: tileSize * 0.166, floor: tileSize * 0.034, belt: tileSize * 0.102, deck: tileSize * 0.126, crown: tileSize * 0.135 },
        { z:  length * 0.50, w: tileSize * 0.088, floor: tileSize * 0.042, belt: tileSize * 0.076, deck: tileSize * 0.092, crown: tileSize * 0.096 }
    ]);
}

function createCanopyGeometry(tileSize) {
    return createLoftGeometry([
        { z: -tileSize * 0.172, w: tileSize * 0.086, floor: tileSize * 0.130, belt: tileSize * 0.156, deck: tileSize * 0.183, crown: tileSize * 0.192 },
        { z: -tileSize * 0.050, w: tileSize * 0.118, floor: tileSize * 0.136, belt: tileSize * 0.178, deck: tileSize * 0.214, crown: tileSize * 0.224 },
        { z:  tileSize * 0.100, w: tileSize * 0.098, floor: tileSize * 0.130, belt: tileSize * 0.166, deck: tileSize * 0.194, crown: tileSize * 0.202 },
        { z:  tileSize * 0.205, w: tileSize * 0.045, floor: tileSize * 0.116, belt: tileSize * 0.134, deck: tileSize * 0.146, crown: tileSize * 0.150 }
    ]);
}

function bar(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    return mesh;
}

function createWheelAssembly(tileSize, side, z, materials) {
    const radius = tileSize * 0.074;
    const width = tileSize * 0.044;
    const x = side * tileSize * 0.176;

    const group = new THREE.Group();
    group.name = 'wheelGroup';
    group.userData.radius = radius;
    group.position.set(x, radius, z);
    group.rotation.z = Math.PI / 2;

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 48), materials.tire);
    group.add(tire);

    const face = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, width * 1.08, 40), materials.wheelFace);
    group.add(face);

    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.64, radius * 0.035, 8, 48), materials.cyanGlow);
    glowRing.rotation.y = Math.PI / 2;
    glowRing.position.y = side > 0 ? -width * 0.58 : width * 0.58;
    group.add(glowRing);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width * 1.14, 24), materials.graphite);
    group.add(hub);

    return group;
}

function createLightBar(width, material, x, y, z) {
    const group = new THREE.Group();
    const core = bar(width, 0.018, 0.012, material, x, y, z);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.040, 0.004), material);
    glow.position.set(x, y, z + 0.008);
    group.add(core, glow);
    return group;
}

export function createGrandTouringCarAsset({ tileSize = 10 } = {}) {
    const car = new THREE.Group();
    car.name = 'minimalTechGrandTouringCarAsset';

    const materials = {
        body: physicalMaterial(0xe9eef2, {
            metalness: 0.62,
            roughness: 0.18,
            clearcoat: 0.86,
            clearcoatRoughness: 0.08,
            emissive: 0x07131a,
            emissiveIntensity: 0.035
        }),
        sidePanel: physicalMaterial(0xb8c4ce, {
            metalness: 0.72,
            roughness: 0.20,
            clearcoat: 0.66
        }),
        graphite: physicalMaterial(0x121922, {
            metalness: 0.58,
            roughness: 0.32,
            clearcoat: 0.34
        }),
        glass: physicalMaterial(0x07131f, {
            metalness: 0.22,
            roughness: 0.05,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
            emissive: 0x05283a,
            emissiveIntensity: 0.34,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide
        }),
        cyanGlow: glowMaterial(0x6beaff, 0.76),
        whiteGlow: glowMaterial(0xf7fdff, 0.86),
        redGlow: glowMaterial(0xff4f6d, 0.82),
        tire: new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.76, metalness: 0.08 }),
        wheelFace: physicalMaterial(0x2e3c47, { metalness: 0.82, roughness: 0.22, clearcoat: 0.42 })
    };

    const body = new THREE.Mesh(createBodyGeometry(tileSize), materials.body);
    body.name = 'minimalTechBodyShell';
    car.add(body);

    const belly = bar(tileSize * 0.310, tileSize * 0.030, tileSize * 0.620, materials.graphite, 0, tileSize * 0.032, -tileSize * 0.015);
    belly.name = 'minimalTechGraphiteBelly';
    car.add(belly);

    const canopy = new THREE.Mesh(createCanopyGeometry(tileSize), materials.glass);
    canopy.name = 'minimalTechGlassCanopy';
    car.add(canopy);

    const noseSpine = bar(tileSize * 0.030, tileSize * 0.010, tileSize * 0.310, materials.sidePanel, 0, tileSize * 0.139, tileSize * 0.205);
    noseSpine.rotation.x = THREE.MathUtils.degToRad(-3);
    noseSpine.name = 'minimalTechCenterSpine';
    car.add(noseSpine);

    const frontZ = tileSize * 0.385;
    const headlight = createLightBar(tileSize * 0.210, materials.whiteGlow, 0, tileSize * 0.086, frontZ);
    headlight.name = 'minimalTechFrontLightBlade';
    car.add(headlight);

    const lowerCyan = createLightBar(tileSize * 0.150, materials.cyanGlow, 0, tileSize * 0.053, frontZ + tileSize * 0.010);
    lowerCyan.name = 'minimalTechCyanIntakeGlow';
    car.add(lowerCyan);

    for (const side of [-1, 1]) {
        const frontWheel = createWheelAssembly(tileSize, side, tileSize * 0.220, materials);
        const rearWheel = createWheelAssembly(tileSize, side, -tileSize * 0.238, materials);
        car.add(frontWheel, rearWheel);

        const sideX = side * tileSize * 0.184;
        const blade = bar(tileSize * 0.010, tileSize * 0.020, tileSize * 0.500, materials.sidePanel, sideX, tileSize * 0.073, -tileSize * 0.020);
        blade.name = 'minimalTechSideBlade';
        car.add(blade);

        const cyanRail = bar(tileSize * 0.006, tileSize * 0.011, tileSize * 0.405, materials.cyanGlow, side * tileSize * 0.190, tileSize * 0.112, -tileSize * 0.030);
        cyanRail.name = 'minimalTechSideGlowRail';
        car.add(cyanRail);

        const tail = bar(tileSize * 0.104, tileSize * 0.016, tileSize * 0.012, materials.redGlow, side * tileSize * 0.066, tileSize * 0.094, -tileSize * 0.385);
        tail.name = 'minimalTechTailBlade';
        car.add(tail);
    }

    const rearDiffuser = bar(tileSize * 0.260, tileSize * 0.030, tileSize * 0.045, materials.graphite, 0, tileSize * 0.056, -tileSize * 0.390);
    rearDiffuser.name = 'minimalTechRearDiffuser';
    car.add(rearDiffuser);

    const frontLamp = new THREE.PointLight(0x9ff5ff, 0.92, tileSize * 1.25, 1.8);
    frontLamp.position.set(0, tileSize * 0.085, tileSize * 0.460);
    car.add(frontLamp);

    const cabinGlow = new THREE.PointLight(0x6beaff, 0.42, tileSize * 0.85, 1.9);
    cabinGlow.position.set(0, tileSize * 0.185, -tileSize * 0.030);
    car.add(cabinGlow);

    const rearLamp = new THREE.PointLight(0xff4f6d, 0.42, tileSize * 0.80, 1.8);
    rearLamp.position.set(0, tileSize * 0.088, -tileSize * 0.440);
    car.add(rearLamp);

    car.traverse(child => {
        if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
        }
    });

    return car;
}
