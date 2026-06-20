import * as THREE from 'three';

function physicalMaterial(color, options = {}) {
    return new THREE.MeshPhysicalMaterial({
        color,
        metalness: options.metalness ?? 0.55,
        roughness: options.roughness ?? 0.22,
        clearcoat: options.clearcoat ?? 0.75,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        side: options.side ?? THREE.FrontSide
    });
}

function createBodyShellGeometry(tileSize) {
    const length = tileSize * 0.72;
    const stations = [
        { z: -length * 0.50, w: tileSize * 0.118, y0: tileSize * 0.050, y1: tileSize * 0.086, y2: tileSize * 0.110, crown: tileSize * 0.122 },
        { z: -length * 0.38, w: tileSize * 0.158, y0: tileSize * 0.046, y1: tileSize * 0.103, y2: tileSize * 0.126, crown: tileSize * 0.134 },
        { z: -length * 0.12, w: tileSize * 0.174, y0: tileSize * 0.043, y1: tileSize * 0.112, y2: tileSize * 0.137, crown: tileSize * 0.148 },
        { z:  length * 0.18, w: tileSize * 0.166, y0: tileSize * 0.043, y1: tileSize * 0.108, y2: tileSize * 0.132, crown: tileSize * 0.142 },
        { z:  length * 0.39, w: tileSize * 0.145, y0: tileSize * 0.047, y1: tileSize * 0.093, y2: tileSize * 0.114, crown: tileSize * 0.122 },
        { z:  length * 0.50, w: tileSize * 0.104, y0: tileSize * 0.052, y1: tileSize * 0.076, y2: tileSize * 0.092, crown: tileSize * 0.098 }
    ];
    const pointsPerStation = 11;
    const vertices = [];
    const indices = [];

    stations.forEach(section => {
        const w = section.w;
        vertices.push(
            -w * 0.56, section.y0, section.z,
            -w * 0.93, section.y0 + tileSize * 0.015, section.z,
            -w, section.y1, section.z,
            -w * 0.82, section.y2, section.z,
            -w * 0.38, section.crown, section.z,
            0, section.crown + tileSize * 0.010, section.z,
            w * 0.38, section.crown, section.z,
            w * 0.82, section.y2, section.z,
            w, section.y1, section.z,
            w * 0.93, section.y0 + tileSize * 0.015, section.z,
            w * 0.56, section.y0, section.z
        );
    });

    for (let i = 0; i < stations.length - 1; i++) {
        const a = i * pointsPerStation;
        const b = (i + 1) * pointsPerStation;
        for (let j = 0; j < pointsPerStation - 1; j++) {
            indices.push(a + j, b + j, a + j + 1);
            indices.push(a + j + 1, b + j, b + j + 1);
        }
    }

    for (let i = 1; i < pointsPerStation - 1; i++) {
        indices.push(0, i, i + 1);
        const end = (stations.length - 1) * pointsPerStation;
        indices.push(end, end + i + 1, end + i);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createCabinGeometry(tileSize) {
    const stations = [
        { z: -tileSize * 0.205, w: tileSize * 0.103, base: tileSize * 0.119, shoulder: tileSize * 0.163, top: tileSize * 0.186 },
        { z: -tileSize * 0.090, w: tileSize * 0.126, base: tileSize * 0.128, shoulder: tileSize * 0.185, top: tileSize * 0.210 },
        { z:  tileSize * 0.065, w: tileSize * 0.112, base: tileSize * 0.126, shoulder: tileSize * 0.178, top: tileSize * 0.199 },
        { z:  tileSize * 0.178, w: tileSize * 0.078, base: tileSize * 0.116, shoulder: tileSize * 0.154, top: tileSize * 0.168 }
    ];
    const pointsPerStation = 7;
    const vertices = [];
    const indices = [];

    stations.forEach(section => {
        const w = section.w;
        vertices.push(
            -w, section.base, section.z,
            -w * 0.78, section.shoulder, section.z,
            -w * 0.36, section.top, section.z,
            0, section.top + tileSize * 0.006, section.z,
            w * 0.36, section.top, section.z,
            w * 0.78, section.shoulder, section.z,
            w, section.base, section.z
        );
    });

    for (let i = 0; i < stations.length - 1; i++) {
        const a = i * pointsPerStation;
        const b = (i + 1) * pointsPerStation;
        for (let j = 0; j < pointsPerStation - 1; j++) {
            indices.push(a + j, b + j, a + j + 1);
            indices.push(a + j + 1, b + j, b + j + 1);
        }
    }

    for (let i = 1; i < pointsPerStation - 1; i++) {
        indices.push(0, i, i + 1);
        const end = (stations.length - 1) * pointsPerStation;
        indices.push(end, end + i + 1, end + i);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createEllipseMesh(width, height, material) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), material);
}

function createArcTube(radius, material, startAngle, endAngle, tubeRadius = 0.025) {
    const points = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
        const t = startAngle + (endAngle - startAngle) * (i / steps);
        points.push(new THREE.Vector3(0, Math.sin(t) * radius, Math.cos(t) * radius));
    }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, tubeRadius, 8, false), material);
}

function createDetailBar(width, height, depth, material, x, y, z) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    bar.position.set(x, y, z);
    return bar;
}

function createWheelAssembly(tileSize, side, z, materials) {
    const wheelRadius = tileSize * 0.080;
    const wheelWidth = tileSize * 0.052;
    const wheelX = side * tileSize * 0.176;

    const wheelGroup = new THREE.Group();
    wheelGroup.name = 'wheelGroup';
    wheelGroup.userData.radius = wheelRadius;
    wheelGroup.position.set(wheelX, wheelRadius, z);
    wheelGroup.rotation.z = Math.PI / 2;

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 56), materials.tire);
    wheelGroup.add(tire);

    const outerRim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.72, wheelRadius * 0.72, wheelWidth * 1.06, 48), materials.rim);
    wheelGroup.add(outerRim);

    const innerShadow = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.48, wheelRadius * 0.48, wheelWidth * 1.09, 32), materials.brake);
    innerShadow.position.y = side > 0 ? -wheelWidth * 0.02 : wheelWidth * 0.02;
    wheelGroup.add(innerShadow);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.18, wheelRadius * 0.18, wheelWidth * 1.16, 24), materials.chrome);
    wheelGroup.add(hub);

    for (let i = 0; i < 10; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelRadius * 0.74, wheelWidth * 0.11, wheelRadius * 0.055), materials.chrome);
        spoke.position.x = wheelRadius * 0.34;
        spoke.rotation.y = (Math.PI * 2 * i) / 10;
        wheelGroup.add(spoke);
    }

    return wheelGroup;
}

function createHeadlight(side, tileSize, material) {
    const group = new THREE.Group();
    group.position.set(side * tileSize * 0.083, tileSize * 0.103, tileSize * 0.366);
    group.rotation.z = side * THREE.MathUtils.degToRad(8);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(tileSize * 0.112, tileSize * 0.013, tileSize * 0.010), material);
    blade.position.x = side * tileSize * 0.036;
    group.add(blade);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(tileSize * 0.035, tileSize * 0.010, tileSize * 0.012), material);
    inner.position.x = -side * tileSize * 0.034;
    group.add(inner);
    return group;
}

function createMirror(side, tileSize, materials) {
    const group = new THREE.Group();
    group.position.set(side * tileSize * 0.158, tileSize * 0.144, tileSize * 0.060);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(tileSize * 0.006, tileSize * 0.006, tileSize * 0.055, 8), materials.chrome);
    stalk.rotation.z = Math.PI / 2;
    stalk.position.x = -side * tileSize * 0.020;
    group.add(stalk);
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(tileSize * 0.028, 16, 8), materials.body);
    mirror.scale.set(1.45, 0.58, 0.7);
    group.add(mirror);
    return group;
}

export function createGrandTouringCarAsset({ tileSize = 10 } = {}) {
    const car = new THREE.Group();
    car.name = 'grandTouringCarAsset';

    const materials = {
        body: physicalMaterial(0x7b1021, {
            metalness: 0.72,
            roughness: 0.18,
            clearcoat: 0.92,
            clearcoatRoughness: 0.08,
            emissive: 0x140008,
            emissiveIntensity: 0.04
        }),
        bodyDark: physicalMaterial(0x2b0710, {
            metalness: 0.64,
            roughness: 0.22,
            clearcoat: 0.72,
            clearcoatRoughness: 0.14
        }),
        glass: physicalMaterial(0x06111f, {
            metalness: 0.28,
            roughness: 0.05,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
            emissive: 0x041827,
            emissiveIntensity: 0.28,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide
        }),
        chrome: physicalMaterial(0xd8dde6, {
            metalness: 0.95,
            roughness: 0.13,
            clearcoat: 0.55,
            clearcoatRoughness: 0.08
        }),
        grille: physicalMaterial(0x05070a, {
            metalness: 0.74,
            roughness: 0.28,
            clearcoat: 0.42
        }),
        tire: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.72, metalness: 0.05 }),
        rim: physicalMaterial(0xbfc7d5, { metalness: 0.92, roughness: 0.18, clearcoat: 0.35 }),
        brake: new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.55, metalness: 0.35 }),
        headlight: new THREE.MeshBasicMaterial({ color: 0xeaf9ff, transparent: true, opacity: 0.94 }),
        tail: new THREE.MeshBasicMaterial({ color: 0xff1c3d, transparent: true, opacity: 0.9 })
    };

    const shell = new THREE.Mesh(createBodyShellGeometry(tileSize), materials.body);
    shell.name = 'grandTouringBodyShell';
    car.add(shell);

    const underbody = new THREE.Mesh(new THREE.BoxGeometry(tileSize * 0.305, tileSize * 0.040, tileSize * 0.620), materials.grille);
    underbody.position.y = tileSize * 0.035;
    underbody.name = 'grandTouringUnderbody';
    car.add(underbody);

    const cabin = new THREE.Mesh(createCabinGeometry(tileSize), materials.glass);
    cabin.name = 'grandTouringGlassCabin';
    car.add(cabin);

    const roofSpine = createDetailBar(tileSize * 0.056, tileSize * 0.014, tileSize * 0.285, materials.bodyDark, 0, tileSize * 0.203, -tileSize * 0.018);
    roofSpine.name = 'grandTouringRoofSpine';
    car.add(roofSpine);

    for (const x of [-tileSize * 0.047, tileSize * 0.047]) {
        const hoodCrease = createDetailBar(tileSize * 0.010, tileSize * 0.010, tileSize * 0.265, materials.bodyDark, x, tileSize * 0.132, tileSize * 0.210);
        hoodCrease.rotation.x = THREE.MathUtils.degToRad(-4);
        hoodCrease.name = 'grandTouringHoodCrease';
        car.add(hoodCrease);
    }

    const frontZ = tileSize * 0.370;
    const grille = createEllipseMesh(tileSize * 0.130, tileSize * 0.082, materials.grille);
    grille.position.set(0, tileSize * 0.084, frontZ + tileSize * 0.004);
    grille.name = 'grandTouringOvalGrille';
    car.add(grille);

    for (let i = -3; i <= 3; i++) {
        const slatHeight = tileSize * (0.064 - Math.abs(i) * 0.006);
        const slat = createDetailBar(tileSize * 0.0048, slatHeight, tileSize * 0.006, materials.chrome, i * tileSize * 0.014, tileSize * 0.084, frontZ + tileSize * 0.010);
        slat.name = 'grandTouringGrilleSlat';
        car.add(slat);
    }

    const crest = createDetailBar(tileSize * 0.012, tileSize * 0.036, tileSize * 0.006, materials.chrome, 0, tileSize * 0.092, frontZ + tileSize * 0.014);
    crest.name = 'grandTouringCenterBlade';
    car.add(crest);

    car.add(createHeadlight(-1, tileSize, materials.headlight));
    car.add(createHeadlight(1, tileSize, materials.headlight));

    const lowerMouth = createDetailBar(tileSize * 0.252, tileSize * 0.020, tileSize * 0.012, materials.grille, 0, tileSize * 0.052, frontZ + tileSize * 0.012);
    lowerMouth.name = 'grandTouringLowerIntake';
    car.add(lowerMouth);

    for (const side of [-1, 1]) {
        const frontWheel = createWheelAssembly(tileSize, side, tileSize * 0.218, materials);
        const rearWheel = createWheelAssembly(tileSize, side, -tileSize * 0.238, materials);
        car.add(frontWheel, rearWheel);

        const sideX = side * tileSize * 0.171;
        for (const z of [tileSize * 0.218, -tileSize * 0.238]) {
            const arch = createArcTube(tileSize * 0.092, materials.chrome, 0.18, Math.PI - 0.18, tileSize * 0.004);
            arch.position.set(sideX, tileSize * 0.080, z);
            arch.name = 'grandTouringWheelArch';
            car.add(arch);
        }

        const rocker = createDetailBar(tileSize * 0.009, tileSize * 0.018, tileSize * 0.495, materials.chrome, side * tileSize * 0.178, tileSize * 0.060, -tileSize * 0.010);
        rocker.name = 'grandTouringSideRocker';
        car.add(rocker);

        for (let i = 0; i < 3; i++) {
            const vent = createDetailBar(tileSize * 0.006, tileSize * 0.012, tileSize * 0.050, materials.grille, side * tileSize * 0.183, tileSize * (0.105 + i * 0.017), tileSize * 0.102);
            vent.rotation.y = side * Math.PI / 2;
            vent.name = 'grandTouringSideVent';
            car.add(vent);
        }

        const shoulderLine = createDetailBar(tileSize * 0.006, tileSize * 0.010, tileSize * 0.430, materials.bodyDark, side * tileSize * 0.164, tileSize * 0.123, -tileSize * 0.025);
        shoulderLine.rotation.y = side * Math.PI / 2;
        shoulderLine.name = 'grandTouringShoulderLine';
        car.add(shoulderLine);

        car.add(createMirror(side, tileSize, materials));

        const tailLight = createDetailBar(tileSize * 0.090, tileSize * 0.014, tileSize * 0.010, materials.tail, side * tileSize * 0.065, tileSize * 0.103, -tileSize * 0.365);
        tailLight.rotation.z = -side * THREE.MathUtils.degToRad(8);
        tailLight.name = 'grandTouringTailLight';
        car.add(tailLight);
    }

    const rearLip = createDetailBar(tileSize * 0.265, tileSize * 0.022, tileSize * 0.030, materials.bodyDark, 0, tileSize * 0.126, -tileSize * 0.366);
    rearLip.rotation.x = THREE.MathUtils.degToRad(7);
    rearLip.name = 'grandTouringRearLip';
    car.add(rearLip);

    car.traverse(child => {
        if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
        }
    });

    return car;
}
