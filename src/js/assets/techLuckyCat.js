import * as THREE from 'three';

function glowMaterial(color, opacity = 0.85) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
}

function physicalMaterial(color, options = {}) {
    return new THREE.MeshPhysicalMaterial({
        color,
        metalness: options.metalness ?? 0.18,
        roughness: options.roughness ?? 0.32,
        clearcoat: options.clearcoat ?? 0.7,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        flatShading: options.flatShading ?? true
    });
}

function createRoundedBoxGeometry(width, height, depth, radius, segments = 4) {
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: Math.min(radius * 0.34, depth * 0.12),
        bevelThickness: Math.min(radius * 0.32, depth * 0.10),
        bevelSegments: 2,
        curveSegments: segments,
        steps: 1
    });
    geometry.center();
    geometry.computeVertexNormals();
    return geometry;
}

function createRoundedBoxMesh(width, height, depth, radius, material) {
    return new THREE.Mesh(createRoundedBoxGeometry(width, height, depth, radius), material);
}

function createStarGeometry(outerRadius = 0.16, innerRadius = 0.07, depth = 0.035) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: depth * 0.35,
        bevelThickness: depth * 0.35,
        bevelSegments: 1,
        steps: 1
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
}

function createTubeLine(points, material, radius = 0.018) {
    return new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, radius, 6, false),
        material
    );
}

function createClosedEye(side, material) {
    return createTubeLine([
        new THREE.Vector3(side * 0.56, 1.86, 1.04),
        new THREE.Vector3(side * 0.40, 1.98, 1.08),
        new THREE.Vector3(side * 0.22, 1.88, 1.06)
    ], material, 0.026);
}

function createMouthLine(side, material) {
    return createTubeLine([
        new THREE.Vector3(0, 1.62, 1.15),
        new THREE.Vector3(side * 0.12, 1.51, 1.16),
        new THREE.Vector3(side * 0.27, 1.58, 1.12)
    ], material, 0.014);
}

function createWhisker(side, y, material) {
    return createTubeLine([
        new THREE.Vector3(side * 0.52, y, 1.08),
        new THREE.Vector3(side * 0.86, y + 0.035, 1.0)
    ], material, 0.011);
}

function createStarPatch(material, x, y, z, scale = 1, rotation = 0) {
    const star = new THREE.Mesh(createStarGeometry(0.16, 0.072, 0.028), material);
    star.position.set(x, y, z);
    star.rotation.set(0, 0, rotation);
    star.scale.setScalar(scale);
    star.name = 'catPlanetStarPatch';
    return star;
}

function createTriangularEar(side, shellMat, innerMat, trimMat) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.72, 2.45, 0.26);
    earGroup.rotation.set(0.08, side * -0.08, side * -0.34);

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.78, 3), shellMat);
    outer.rotation.y = Math.PI / 3;
    outer.name = side < 0 ? 'leftTriangularCatEar' : 'rightTriangularCatEar';
    earGroup.add(outer);

    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.49, 3), innerMat);
    inner.position.set(0, -0.025, 0.08);
    inner.scale.set(0.82, 0.72, 0.72);
    inner.rotation.y = Math.PI / 3;
    earGroup.add(inner);

    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.018, 6, 3), trimMat);
    trim.position.set(0, -0.12, 0.09);
    trim.rotation.set(Math.PI / 2, 0, Math.PI / 6);
    trim.scale.set(1.0, 0.78, 1.0);
    earGroup.add(trim);

    return earGroup;
}

function createPaw(shellMat, padMat, clawMat) {
    const paw = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 8), shellMat);
    palm.scale.set(1.08, 0.82, 0.78);
    paw.add(palm);

    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6), padMat);
    pad.position.set(0, -0.03, 0.24);
    pad.scale.set(1.15, 0.76, 0.34);
    paw.add(pad);

    for (let i = 0; i < 3; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), clawMat);
        claw.position.set((i - 1) * 0.14, -0.03, 0.31);
        claw.rotation.x = Math.PI / 2;
        paw.add(claw);
    }

    return paw;
}

function addPanelLine(parent, material, x, y, width = 0.26) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.028, 0.025), material);
    line.position.set(x, y, 0.038);
    parent.add(line);
}

export function createTechLuckyCatAsset() {
    const group = new THREE.Group();
    group.name = 'catPlanetTechLuckyCatAsset';

    const shellMat = physicalMaterial(0xfff2ea, {
        metalness: 0.1,
        roughness: 0.24,
        clearcoat: 0.86,
        emissive: 0x1d0d12,
        emissiveIntensity: 0.03
    });
    const bodyMat = physicalMaterial(0xf8dfe4, {
        metalness: 0.14,
        roughness: 0.25,
        clearcoat: 0.82,
        emissive: 0x230912,
        emissiveIntensity: 0.045
    });
    const pinkMat = physicalMaterial(0xffa5c4, {
        metalness: 0.08,
        roughness: 0.31,
        clearcoat: 0.72,
        emissive: 0x3c071a,
        emissiveIntensity: 0.08
    });
    const goldMat = physicalMaterial(0xd9a45d, {
        metalness: 0.72,
        roughness: 0.22,
        clearcoat: 0.5,
        emissive: 0x241000,
        emissiveIntensity: 0.05
    });
    const silverMat = physicalMaterial(0xd8dce4, {
        metalness: 0.76,
        roughness: 0.2,
        clearcoat: 0.62
    });
    const eyeMat = physicalMaterial(0x17151a, {
        metalness: 0.15,
        roughness: 0.2,
        clearcoat: 0.5
    });
    const neonPinkMat = glowMaterial(0xff6fb7, 0.78);
    const neonCyanMat = glowMaterial(0x8df7ff, 0.68);
    const starGlowMat = glowMaterial(0xfff6b8, 0.84);

    const body = createRoundedBoxMesh(1.82, 1.78, 1.08, 0.26, bodyMat);
    body.position.set(0, 0.72, 0);
    body.name = 'roundedCubePlanetBody';
    group.add(body);

    const bellyPanel = createRoundedBoxMesh(0.95, 0.72, 0.07, 0.12, shellMat);
    bellyPanel.position.set(0, 0.66, 0.58);
    bellyPanel.rotation.x = THREE.MathUtils.degToRad(-3);
    bellyPanel.name = 'roundedBodyFrontPanel';
    group.add(bellyPanel);
    addPanelLine(bellyPanel, neonPinkMat, -0.22, 0.16, 0.08);
    addPanelLine(bellyPanel, neonCyanMat, 0.08, -0.02, 0.34);
    addPanelLine(bellyPanel, neonPinkMat, 0.26, -0.20, 0.12);

    const faceGeometry = new THREE.SphereGeometry(1.0, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    faceGeometry.rotateX(Math.PI / 2);
    faceGeometry.computeVertexNormals();
    const face = new THREE.Mesh(faceGeometry, shellMat);
    face.position.set(0, 1.64, 0.45);
    face.scale.set(1.15, 0.74, 0.62);
    face.name = 'catFaceHemisphere';
    group.add(face);

    group.add(createTriangularEar(-1, shellMat, pinkMat, goldMat));
    group.add(createTriangularEar(1, shellMat, pinkMat, goldMat));

    const planetRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.035, 8, 56), neonPinkMat);
    planetRing.position.set(0, 1.70, 0.98);
    planetRing.rotation.set(0, 0, THREE.MathUtils.degToRad(-8));
    planetRing.scale.set(1.14, 0.34, 1);
    planetRing.name = 'techGoalHalo';
    group.add(planetRing);

    const metalOrbit = new THREE.Mesh(new THREE.TorusGeometry(1.30, 0.024, 8, 56), silverMat);
    metalOrbit.position.copy(planetRing.position);
    metalOrbit.rotation.copy(planetRing.rotation);
    metalOrbit.scale.set(1.12, 0.32, 1);
    metalOrbit.name = 'catPlanetMetalOrbit';
    group.add(metalOrbit);

    const foreheadBadge = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.055, 20), silverMat);
    foreheadBadge.position.set(0, 2.12, 0.98);
    foreheadBadge.rotation.x = Math.PI / 2;
    foreheadBadge.name = 'catPlanetForeheadBadge';
    group.add(foreheadBadge);
    const tinyPlanet = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.01, 6, 24), neonPinkMat);
    tinyPlanet.position.set(0, 2.12, 1.025);
    tinyPlanet.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(-10));
    group.add(tinyPlanet);

    group.add(createClosedEye(-1, eyeMat));
    group.add(createClosedEye(1, eyeMat));

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6), pinkMat);
    nose.position.set(0, 1.68, 1.12);
    nose.scale.set(1.1, 0.82, 0.55);
    group.add(nose);
    group.add(createMouthLine(-1, neonPinkMat));
    group.add(createMouthLine(1, neonPinkMat));

    for (const side of [-1, 1]) {
        const blush = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6), pinkMat);
        blush.position.set(side * 0.65, 1.55, 1.01);
        blush.scale.set(1.38, 0.62, 0.28);
        blush.name = side < 0 ? 'leftCheekBlush' : 'rightCheekBlush';
        group.add(blush);

        group.add(createWhisker(side, 1.58, neonPinkMat));
        group.add(createWhisker(side, 1.47, neonPinkMat));
    }

    group.add(createStarPatch(starGlowMat, -0.56, 0.98, 0.61, 0.72, -0.25));
    group.add(createStarPatch(neonCyanMat, 0.58, 0.38, 0.61, 0.58, 0.22));
    group.add(createStarPatch(neonPinkMat, -0.20, 2.28, 0.96, 0.46, 0.15));

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.075, 8, 48), pinkMat);
    collar.position.set(0, 1.16, 0.1);
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1.14, 0.82, 1);
    collar.name = 'pinkPlanetCollar';
    group.add(collar);

    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), goldMat);
    bell.position.set(0, 1.02, 0.72);
    bell.name = 'goldPlanetBell';
    group.add(bell);
    const bellSlot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025), eyeMat);
    bellSlot.position.set(0, 0.96, 0.86);
    group.add(bellSlot);

    for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), shellMat);
        leg.position.set(side * 0.55, -0.15, 0.36);
        leg.scale.set(1.08, 0.58, 0.84);
        group.add(leg);
        for (let i = 0; i < 3; i++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.13, 8), goldMat);
            claw.position.set(side * 0.55 + (i - 1) * 0.12, -0.20, 0.67);
            claw.rotation.x = Math.PI / 2;
            group.add(claw);
        }
    }

    const sidePaw = createPaw(shellMat, pinkMat, goldMat);
    sidePaw.position.set(-1.08, 0.62, 0.42);
    sidePaw.rotation.set(0.08, 0.24, -0.18);
    group.add(sidePaw);

    const armPivot = new THREE.Object3D();
    armPivot.position.set(0.92, 1.10, 0.30);
    armPivot.name = 'catPlanetRaisedArmPivot';
    group.add(armPivot);

    const armCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.03, 0.42, 0.10),
        new THREE.Vector3(-0.02, 0.88, 0.30)
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 18, 0.18, 10, false), shellMat);
    arm.name = 'lowPolyWavingArm';
    armPivot.add(arm);

    const wrist = new THREE.Object3D();
    wrist.position.copy(armCurve.points[armCurve.points.length - 1]);
    wrist.name = 'catPlanetWrist';
    armPivot.add(wrist);

    const wavingPaw = createPaw(shellMat, pinkMat, goldMat);
    wavingPaw.position.set(0, 0.02, 0.02);
    wavingPaw.rotation.set(0.18, -0.1, 0.05);
    wrist.add(wavingPaw);
    const pawStar = createStarPatch(neonPinkMat, 0.0, 0.13, 0.30, 0.42, 0.12);
    wrist.add(pawStar);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.62, 0.18, 32), silverMat);
    base.position.set(0, -0.43, 0);
    base.name = 'catPlanetLowPolyBase';
    group.add(base);

    const baseGlow = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.025, 8, 64), neonPinkMat);
    baseGlow.position.set(0, -0.31, 0);
    baseGlow.rotation.x = Math.PI / 2;
    baseGlow.name = 'catPlanetBaseGlow';
    group.add(baseGlow);

    const techLight = new THREE.PointLight(0xff8ac8, 1.6, 18, 1.45);
    techLight.position.set(0, 1.75, 1.75);
    group.add(techLight);

    return {
        group,
        arm: armPivot,
        wrist,
        halo: planetRing,
        pulseParts: [
            { material: neonPinkMat, baseOpacity: 0.54, pulseOpacity: 0.34, phase: 0, speed: 3.7, light: techLight, baseIntensity: 0.85, pulseIntensity: 0.95 },
            { material: neonCyanMat, baseOpacity: 0.48, pulseOpacity: 0.30, phase: 1.25, speed: 4.2 },
            { material: starGlowMat, baseOpacity: 0.50, pulseOpacity: 0.28, phase: 2.1, speed: 5.0 },
            { material: pinkMat, baseOpacity: 0.88, pulseOpacity: 0.10, phase: 0.7, speed: 2.4 }
        ]
    };
}
