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
        new THREE.Vector3(side * 0.56, 2.02, 1.22),
        new THREE.Vector3(side * 0.40, 2.14, 1.26),
        new THREE.Vector3(side * 0.23, 2.04, 1.24)
    ], material, 0.026);
}

function createMouthLine(side, material) {
    return createTubeLine([
        new THREE.Vector3(0, 1.76, 1.30),
        new THREE.Vector3(side * 0.12, 1.65, 1.31),
        new THREE.Vector3(side * 0.28, 1.72, 1.27)
    ], material, 0.014);
}

function createWhisker(side, y, material) {
    return createTubeLine([
        new THREE.Vector3(side * 0.52, y, 1.24),
        new THREE.Vector3(side * 0.96, y + 0.035, 1.13)
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
    earGroup.position.set(side * 0.78, 2.76, 0.04);
    earGroup.rotation.set(0.03, side * -0.08, side * -0.26);

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.72, 3), shellMat);
    outer.rotation.y = Math.PI / 3;
    outer.name = side < 0 ? 'leftTriangularCatEar' : 'rightTriangularCatEar';
    earGroup.add(outer);

    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.44, 3), innerMat);
    inner.position.set(0, -0.025, 0.08);
    inner.scale.set(0.82, 0.72, 0.72);
    inner.rotation.y = Math.PI / 3;
    earGroup.add(inner);

    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 6, 3), trimMat);
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
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.10, 8), clawMat);
        claw.position.set((i - 1) * 0.12, -0.03, 0.28);
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
        emissiveIntensity: 0.03,
        flatShading: false
    });
    const bodyMat = physicalMaterial(0xf8dfe4, {
        metalness: 0.14,
        roughness: 0.25,
        clearcoat: 0.82,
        emissive: 0x230912,
        emissiveIntensity: 0.045,
        flatShading: false
    });
    const pinkMat = physicalMaterial(0xffa5c4, {
        metalness: 0.08,
        roughness: 0.31,
        clearcoat: 0.72,
        emissive: 0x3c071a,
        emissiveIntensity: 0.08,
        flatShading: false
    });
    const goldMat = physicalMaterial(0xd9a45d, {
        metalness: 0.72,
        roughness: 0.22,
        clearcoat: 0.5,
        emissive: 0x241000,
        emissiveIntensity: 0.05,
        flatShading: false
    });
    const silverMat = physicalMaterial(0xd8dce4, {
        metalness: 0.76,
        roughness: 0.2,
        clearcoat: 0.62,
        flatShading: false
    });
    const eyeMat = physicalMaterial(0x17151a, {
        metalness: 0.15,
        roughness: 0.2,
        clearcoat: 0.5
    });
    const neonPinkMat = glowMaterial(0xff6fb7, 0.78);
    const neonCyanMat = glowMaterial(0x8df7ff, 0.68);
    const starGlowMat = glowMaterial(0xfff6b8, 0.84);

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 28, 16), bodyMat);
    body.scale.set(1, 0.8, 1);
    body.name = 'solidTechLuckyCatBody';
    group.add(body);

    const bellyPanel = createRoundedBoxMesh(0.92, 0.62, 0.07, 0.15, shellMat);
    bellyPanel.position.set(0, -0.14, 1.55);
    bellyPanel.rotation.x = THREE.MathUtils.degToRad(-3);
    bellyPanel.name = 'roundedBodyFrontPanel';
    group.add(bellyPanel);
    addPanelLine(bellyPanel, neonPinkMat, -0.16, 0.10, 0.08);
    addPanelLine(bellyPanel, neonCyanMat, 0.04, -0.02, 0.24);
    addPanelLine(bellyPanel, neonPinkMat, 0.18, -0.14, 0.10);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 28, 16), shellMat);
    head.position.y = 1.8;
    head.name = 'solidTechLuckyCatHead';
    group.add(head);

    group.add(createTriangularEar(-1, shellMat, pinkMat, goldMat));
    group.add(createTriangularEar(1, shellMat, pinkMat, goldMat));

    const planetRing = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.028, 8, 64), neonPinkMat);
    planetRing.position.set(0, 1.86, -0.16);
    planetRing.rotation.set(0, 0, THREE.MathUtils.degToRad(-8));
    planetRing.scale.set(1.08, 0.34, 1);
    planetRing.name = 'techGoalHalo';
    group.add(planetRing);

    const metalOrbit = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.018, 8, 64), silverMat);
    metalOrbit.position.copy(planetRing.position);
    metalOrbit.rotation.copy(planetRing.rotation);
    metalOrbit.position.z -= 0.02;
    metalOrbit.scale.set(1.06, 0.32, 1);
    metalOrbit.name = 'catPlanetMetalOrbit';
    group.add(metalOrbit);

    const foreheadBadge = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.045, 20), silverMat);
    foreheadBadge.position.set(0, 2.36, 1.08);
    foreheadBadge.rotation.x = Math.PI / 2;
    foreheadBadge.name = 'catPlanetForeheadBadge';
    group.add(foreheadBadge);
    const tinyPlanet = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.009, 6, 24), neonPinkMat);
    tinyPlanet.position.set(0, 2.36, 1.12);
    tinyPlanet.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(-10));
    group.add(tinyPlanet);

    group.add(createClosedEye(-1, eyeMat));
    group.add(createClosedEye(1, eyeMat));

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6), pinkMat);
    nose.position.set(0, 1.84, 1.30);
    nose.scale.set(1.1, 0.82, 0.55);
    group.add(nose);
    group.add(createMouthLine(-1, neonPinkMat));
    group.add(createMouthLine(1, neonPinkMat));

    for (const side of [-1, 1]) {
        const blush = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6), pinkMat);
        blush.position.set(side * 0.68, 1.68, 1.22);
        blush.scale.set(1.38, 0.62, 0.28);
        blush.name = side < 0 ? 'leftCheekBlush' : 'rightCheekBlush';
        group.add(blush);

        group.add(createWhisker(side, 1.70, neonPinkMat));
        group.add(createWhisker(side, 1.58, neonPinkMat));
    }

    group.add(createStarPatch(starGlowMat, -0.64, 0.45, 1.28, 0.55, -0.25));
    group.add(createStarPatch(neonCyanMat, 0.64, -0.42, 1.22, 0.46, 0.22));
    group.add(createStarPatch(neonPinkMat, -0.30, 2.42, 1.08, 0.34, 0.15));

    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.07, 8, 48), pinkMat);
    collar.position.set(0, 1.20, 0.08);
    collar.rotation.x = Math.PI / 2;
    collar.name = 'pinkPlanetCollar';
    group.add(collar);

    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), goldMat);
    bell.position.set(0, 1.18, 1.24);
    bell.name = 'goldPlanetBell';
    group.add(bell);
    const bellSlot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025), eyeMat);
    bellSlot.position.set(0, 1.13, 1.38);
    group.add(bellSlot);

    for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), shellMat);
        leg.position.set(side * 0.58, -1.02, 0.96);
        leg.scale.set(1.04, 0.58, 0.78);
        group.add(leg);
        for (let i = 0; i < 3; i++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.13, 8), goldMat);
            claw.position.set(side * 0.58 + (i - 1) * 0.12, -1.08, 1.23);
            claw.rotation.x = Math.PI / 2;
            group.add(claw);
        }
    }

    const sidePaw = createPaw(shellMat, pinkMat, goldMat);
    sidePaw.position.set(1.02, -0.36, 1.20);
    sidePaw.rotation.set(0.04, -0.28, 0.08);
    sidePaw.scale.setScalar(0.78);
    group.add(sidePaw);

    const armPivot = new THREE.Object3D();
    armPivot.position.set(-1.05, 1.10, 0.16);
    armPivot.name = 'catPlanetRaisedArmPivot';
    group.add(armPivot);

    const armCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.75, 0.18),
        new THREE.Vector3(0, 1.35, 0.28)
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 20, 0.24, 8, false), shellMat);
    arm.name = 'lowPolyWavingArm';
    armPivot.add(arm);

    const wrist = new THREE.Object3D();
    wrist.position.copy(armCurve.points[armCurve.points.length - 1]);
    wrist.name = 'catPlanetWrist';
    armPivot.add(wrist);

    const wavingPaw = createPaw(shellMat, pinkMat, goldMat);
    wavingPaw.position.set(0, 0.02, 0.02);
    wavingPaw.rotation.set(0.18, -0.1, 0.05);
    wavingPaw.scale.setScalar(1.05);
    wrist.add(wavingPaw);
    const pawStar = createStarPatch(neonPinkMat, 0.0, 0.13, 0.30, 0.42, 0.12);
    wrist.add(pawStar);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.68, 0.14, 32), silverMat);
    base.position.set(0, -1.34, 0);
    base.name = 'catPlanetLowPolyBase';
    group.add(base);

    const baseGlow = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.025, 8, 64), neonPinkMat);
    baseGlow.position.set(0, -1.24, 0);
    baseGlow.rotation.x = Math.PI / 2;
    baseGlow.name = 'catPlanetBaseGlow';
    group.add(baseGlow);

    const techLight = new THREE.PointLight(0xff8ac8, 1.6, 18, 1.45);
    techLight.position.set(0, 1.85, 2.10);
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
