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
        metalness: options.metalness ?? 0.22,
        roughness: options.roughness ?? 0.28,
        clearcoat: options.clearcoat ?? 0.62,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.14,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1
    });
}

function createCircuitLine(width, height, material, x, y, z = 0.06) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.035), material);
    line.position.set(x, y, z);
    return line;
}

function createWhisker(side, y, z, color, opacity = 0.62) {
    const points = [
        new THREE.Vector3(side * 0.18, y, z),
        new THREE.Vector3(side * 0.62, y + 0.05, z - 0.11)
    ];
    return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    );
}

function createVrStrap(side, material) {
    const points = [
        new THREE.Vector3(side * 0.66, 0.24, 1.05),
        new THREE.Vector3(side * 0.92, 0.25, 0.52),
        new THREE.Vector3(side * 0.96, 0.20, -0.08)
    ];
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.035, 8, false), material);
}

function createRemoteController(materials) {
    const remote = new THREE.Group();
    remote.name = 'techCatRemoteController';

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.16), materials.controller);
    body.position.y = 0.02;
    remote.add(body);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.028), materials.cyan);
    screen.position.set(0, 0.18, 0.095);
    remote.add(screen);

    const stickBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.026, 18), materials.magenta);
    stickBase.rotation.x = Math.PI / 2;
    stickBase.position.set(-0.10, -0.06, 0.102);
    remote.add(stickBase);

    const stickTop = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), materials.cyan);
    stickTop.position.set(-0.10, -0.06, 0.132);
    remote.add(stickTop);

    for (const [x, y, mat] of [
        [0.11, -0.03, materials.white],
        [0.16, -0.12, materials.magenta],
        [0.06, -0.15, materials.cyan]
    ]) {
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), mat);
        button.scale.z = 0.45;
        button.position.set(x, y, 0.122);
        remote.add(button);
    }

    const wristBand = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 28), materials.cyan);
    wristBand.position.set(0, -0.33, 0.02);
    wristBand.rotation.x = Math.PI / 2;
    remote.add(wristBand);

    return remote;
}

export function createTechLuckyCatAsset() {
    const group = new THREE.Group();
    group.name = 'techLuckyCatAsset';

    const creamMat = physicalMaterial(0xf5d89d, {
        metalness: 0.18,
        roughness: 0.24,
        clearcoat: 0.7,
        emissive: 0x241305,
        emissiveIntensity: 0.05
    });
    const warmCreamMat = physicalMaterial(0xffe7b8, {
        metalness: 0.12,
        roughness: 0.25,
        clearcoat: 0.68
    });
    const caramelMat = physicalMaterial(0xd99a43, {
        metalness: 0.24,
        roughness: 0.23,
        clearcoat: 0.6,
        emissive: 0x1f0f02,
        emissiveIntensity: 0.04
    });
    const blushMat = physicalMaterial(0xffb3bc, {
        metalness: 0.08,
        roughness: 0.34,
        clearcoat: 0.5
    });
    const graphiteMat = physicalMaterial(0x141821, {
        metalness: 0.58,
        roughness: 0.17,
        clearcoat: 0.76,
        emissive: 0x051425,
        emissiveIntensity: 0.18
    });
    const lensMat = new THREE.MeshPhysicalMaterial({
        color: 0x07182a,
        emissive: 0x00d9ff,
        emissiveIntensity: 1.15,
        metalness: 0.3,
        roughness: 0.05,
        clearcoat: 0.95,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.78
    });
    const cyanMat = glowMaterial(0x5ee7ff, 0.78);
    const magentaMat = glowMaterial(0xff62d2, 0.7);
    const whiteGlowMat = glowMaterial(0xf9ffff, 0.68);
    const controllerMat = physicalMaterial(0x273047, {
        metalness: 0.45,
        roughness: 0.2,
        clearcoat: 0.62,
        emissive: 0x071324,
        emissiveIntensity: 0.18
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.45, 34, 20), creamMat);
    body.scale.set(1.0, 0.82, 0.9);
    group.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.82, 22, 14), warmCreamMat);
    belly.position.set(0, -0.12, 1.02);
    belly.scale.set(0.82, 0.96, 0.28);
    group.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.16, 34, 18), creamMat);
    head.position.y = 1.72;
    group.add(head);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10), warmCreamMat);
    muzzle.position.set(0, -0.19, 1.03);
    muzzle.scale.set(1.26, 0.72, 0.38);
    head.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), magentaMat);
    nose.position.set(0, -0.22, 1.27);
    head.add(nose);

    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.82, 4), creamMat);
        ear.position.set(side * 0.82, 2.59, 0.04);
        ear.rotation.set(0.1, side * -0.18, side * -Math.PI / 10);
        group.add(ear);

        const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.46, 4), blushMat);
        innerEar.position.set(side * 0.82, 2.55, 0.25);
        innerEar.rotation.copy(ear.rotation);
        group.add(innerEar);

        for (let i = 0; i < 3; i++) {
            head.add(createWhisker(side, -0.18 - i * 0.12, 1.17, 0x5c4228, 0.5));
        }
    }

    const vrFrame = new THREE.Group();
    vrFrame.name = 'techCatVrGoggles';
    vrFrame.position.set(0, 0.15, 1.12);
    head.add(vrFrame);

    const visorShell = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.38, 0.14), graphiteMat);
    visorShell.position.z = 0.02;
    vrFrame.add(visorShell);

    const leftLens = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.25, 0.055), lensMat);
    leftLens.position.set(-0.36, 0, 0.095);
    vrFrame.add(leftLens);
    const rightLens = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.25, 0.055), lensMat);
    rightLens.position.set(0.36, 0, 0.095);
    vrFrame.add(rightLens);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), cyanMat);
    bridge.position.set(0, -0.01, 0.125);
    vrFrame.add(bridge);

    const scanLine = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.035, 0.04), whiteGlowMat);
    scanLine.position.set(0, 0.08, 0.145);
    vrFrame.add(scanLine);

    vrFrame.add(createVrStrap(-1, graphiteMat));
    vrFrame.add(createVrStrap(1, graphiteMat));

    const cheekLeft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), blushMat);
    cheekLeft.position.set(-0.54, -0.33, 1.05);
    cheekLeft.scale.z = 0.32;
    head.add(cheekLeft);
    const cheekRight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), blushMat);
    cheekRight.position.set(0.54, -0.33, 1.05);
    cheekRight.scale.z = 0.32;
    head.add(cheekRight);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.075, 8, 52), caramelMat);
    collar.position.y = 1.08;
    collar.rotation.x = Math.PI / 2;
    group.add(collar);
    const collarGlow = new THREE.Mesh(new THREE.TorusGeometry(1.30, 0.028, 8, 56), cyanMat);
    collarGlow.position.y = 1.1;
    collarGlow.rotation.x = Math.PI / 2;
    group.add(collarGlow);

    const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.60, 0.065), warmCreamMat);
    chestPanel.position.set(0, 0.20, 1.25);
    chestPanel.rotation.x = THREE.MathUtils.degToRad(-6);
    group.add(chestPanel);
    chestPanel.add(createCircuitLine(0.055, 0.34, cyanMat, -0.28, 0.12));
    chestPanel.add(createCircuitLine(0.34, 0.047, magentaMat, -0.04, -0.12));
    chestPanel.add(createCircuitLine(0.055, 0.30, cyanMat, 0.28, -0.02));
    const chestCore = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.055, 24), cyanMat);
    chestCore.position.set(0, 0.05, 0.08);
    chestCore.rotation.x = Math.PI / 2;
    chestPanel.add(chestCore);

    const leftArm = new THREE.Mesh(new THREE.SphereGeometry(0.50, 18, 12), creamMat);
    leftArm.position.set(-1.12, 0.45, 0.45);
    leftArm.scale.set(0.56, 0.9, 0.5);
    group.add(leftArm);

    const armPivot = new THREE.Object3D();
    armPivot.position.set(1.02, 1.08, 0.34);
    group.add(armPivot);
    const armCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.08, 0.62, 0.12),
        new THREE.Vector3(0.0, 1.18, 0.35)
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 22, 0.23, 12, false), creamMat);
    armPivot.add(arm);

    const wrist = new THREE.Object3D();
    wrist.position.copy(armCurve.points[armCurve.points.length - 1]);
    armPivot.add(wrist);

    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12), creamMat);
    paw.scale.set(1, 0.82, 1);
    wrist.add(paw);
    const pawPad = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), blushMat);
    pawPad.position.set(0, -0.05, 0.31);
    pawPad.scale.z = 0.45;
    paw.add(pawPad);

    const remote = createRemoteController({
        controller: controllerMat,
        cyan: cyanMat,
        magenta: magentaMat,
        white: whiteGlowMat
    });
    remote.position.set(0.03, -0.03, 0.52);
    remote.rotation.set(THREE.MathUtils.degToRad(-8), THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(12));
    wrist.add(remote);

    const baseHalo = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.035, 8, 64), cyanMat);
    baseHalo.position.y = -0.06;
    baseHalo.rotation.x = Math.PI / 2;
    group.add(baseHalo);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.50, 0.035, 8, 64), magentaMat);
    halo.position.set(0, 3.18, 0.02);
    halo.rotation.x = Math.PI / 2;
    halo.name = 'techGoalHalo';
    group.add(halo);

    const haloDot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), cyanMat);
    haloDot.position.set(0.0, 3.18, 1.5);
    group.add(haloDot);

    const techLight = new THREE.PointLight(0x5ee7ff, 1.2, 22, 1.35);
    techLight.position.set(0, 1.95, 1.85);
    group.add(techLight);

    return {
        group,
        arm: armPivot,
        wrist,
        halo,
        pulseParts: [
            { material: cyanMat, baseOpacity: 0.48, pulseOpacity: 0.36, phase: 0, speed: 3.4, light: techLight, baseIntensity: 0.72, pulseIntensity: 0.78 },
            { material: magentaMat, baseOpacity: 0.46, pulseOpacity: 0.34, phase: 1.35, speed: 4.1 },
            { material: whiteGlowMat, baseOpacity: 0.40, pulseOpacity: 0.30, phase: 2.2, speed: 5.0 },
            { material: lensMat, baseOpacity: 0.62, pulseOpacity: 0.20, phase: 0.6, speed: 2.8 }
        ]
    };
}
