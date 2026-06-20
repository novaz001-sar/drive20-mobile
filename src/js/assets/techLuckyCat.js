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
        metalness: options.metalness ?? 0.45,
        roughness: options.roughness ?? 0.22,
        clearcoat: options.clearcoat ?? 0.55,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.12,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0
    });
}

function createCircuitLine(width, height, material, x, y, z = 0.06) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.035), material);
    line.position.set(x, y, z);
    return line;
}

export function createTechLuckyCatAsset() {
    const group = new THREE.Group();
    group.name = 'techLuckyCatAsset';

    const blackMat = physicalMaterial(0x05070c, {
        metalness: 0.38,
        roughness: 0.18,
        clearcoat: 0.72,
        emissive: 0x030b12,
        emissiveIntensity: 0.14
    });
    const graphiteMat = physicalMaterial(0x111827, {
        metalness: 0.58,
        roughness: 0.2,
        clearcoat: 0.65,
        emissive: 0x07131d,
        emissiveIntensity: 0.2
    });
    const armorMat = physicalMaterial(0x1f2937, {
        metalness: 0.7,
        roughness: 0.16,
        clearcoat: 0.7
    });
    const cyanMat = glowMaterial(0x5ee7ff, 0.82);
    const magentaMat = glowMaterial(0xff4fd8, 0.72);
    const whiteGlowMat = glowMaterial(0xeaffff, 0.72);
    const eyeMat = glowMaterial(0x7df9ff, 0.95);
    const visorMat = new THREE.MeshPhysicalMaterial({
        color: 0x07121f,
        emissive: 0x00d9ff,
        emissiveIntensity: 0.95,
        metalness: 0.35,
        roughness: 0.05,
        clearcoat: 0.88,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0.82
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.45, 32, 18), blackMat);
    body.scale.set(1.0, 0.82, 0.92);
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.16, 32, 16), blackMat);
    head.position.y = 1.75;
    group.add(head);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10), graphiteMat);
    muzzle.position.set(0, -0.18, 1.03);
    muzzle.scale.set(1.22, 0.7, 0.38);
    head.add(muzzle);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.28, 0.1), visorMat);
    visor.position.set(0, 0.16, 1.13);
    visor.name = 'techCatVisor';
    head.add(visor);

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), eyeMat);
    leftEye.position.set(-0.38, 0.17, 1.2);
    head.add(leftEye);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), eyeMat);
    rightEye.position.set(0.38, 0.17, 1.2);
    head.add(rightEye);

    const visorScan = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.035, 0.04), cyanMat);
    visorScan.position.set(0, 0.18, 1.205);
    head.add(visorScan);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), magentaMat);
    nose.position.set(0, -0.21, 1.27);
    head.add(nose);

    for (let side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const y = -0.16 - i * 0.13;
            const points = [
                new THREE.Vector3(side * 0.16, y, 1.18),
                new THREE.Vector3(side * (0.7 + i * 0.06), y + 0.04 - i * 0.02, 0.98)
            ];
            const whisker = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.7 })
            );
            head.add(whisker);
        }
    }

    const earOuterGeo = new THREE.ConeGeometry(0.43, 0.82, 4);
    const leftEar = new THREE.Mesh(earOuterGeo, blackMat);
    leftEar.position.set(-0.82, 2.62, 0.05);
    leftEar.rotation.set(0.1, 0.18, Math.PI / 10);
    group.add(leftEar);
    const rightEar = new THREE.Mesh(earOuterGeo, blackMat);
    rightEar.position.set(0.82, 2.62, 0.05);
    rightEar.rotation.set(0.1, -0.18, -Math.PI / 10);
    group.add(rightEar);

    const earChipGeo = new THREE.BoxGeometry(0.28, 0.1, 0.07);
    const leftChip = new THREE.Mesh(earChipGeo, cyanMat);
    leftChip.position.set(-0.84, 2.64, 0.34);
    leftChip.rotation.z = THREE.MathUtils.degToRad(15);
    group.add(leftChip);
    const rightChip = new THREE.Mesh(earChipGeo, magentaMat);
    rightChip.position.set(0.84, 2.64, 0.34);
    rightChip.rotation.z = THREE.MathUtils.degToRad(-15);
    group.add(rightChip);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 8, 48), armorMat);
    collar.position.y = 1.12;
    collar.rotation.x = Math.PI / 2;
    group.add(collar);
    const collarGlow = new THREE.Mesh(new THREE.TorusGeometry(1.29, 0.035, 8, 48), magentaMat);
    collarGlow.position.y = 1.13;
    collarGlow.rotation.x = Math.PI / 2;
    group.add(collarGlow);

    const coreMat = glowMaterial(0x5ee7ff, 0.9);
    const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.78, 0.08), graphiteMat);
    chestPanel.position.set(0, 0.18, 1.25);
    chestPanel.rotation.x = THREE.MathUtils.degToRad(-6);
    group.add(chestPanel);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 24), coreMat);
    core.position.set(0, 0.07, 0.085);
    core.rotation.x = Math.PI / 2;
    chestPanel.add(core);
    chestPanel.add(createCircuitLine(0.08, 0.46, cyanMat, -0.35, 0.25));
    chestPanel.add(createCircuitLine(0.48, 0.055, magentaMat, -0.08, -0.18));
    chestPanel.add(createCircuitLine(0.08, 0.36, cyanMat, 0.34, -0.02));
    chestPanel.add(createCircuitLine(0.34, 0.055, whiteGlowMat, 0.15, 0.31));

    const armMat = blackMat;
    const leftArm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), armMat);
    leftArm.position.set(-1.12, 0.45, 0.45);
    leftArm.scale.set(0.56, 0.9, 0.5);
    group.add(leftArm);

    const armPivot = new THREE.Object3D();
    armPivot.position.set(1.02, 1.1, 0.34);
    group.add(armPivot);
    const armCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.08, 0.64, 0.12),
        new THREE.Vector3(0.0, 1.22, 0.35)
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 20, 0.24, 10, false), armMat);
    armPivot.add(arm);
    const wrist = new THREE.Object3D();
    wrist.position.copy(armCurve.points[armCurve.points.length - 1]);
    armPivot.add(wrist);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 12), armMat);
    paw.scale.set(1, 0.82, 1);
    wrist.add(paw);
    const pawCore = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), cyanMat);
    pawCore.position.set(0, -0.06, 0.31);
    pawCore.scale.z = 0.45;
    paw.add(pawCore);

    const baseHalo = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.035, 8, 64), cyanMat);
    baseHalo.position.y = -0.06;
    baseHalo.rotation.x = Math.PI / 2;
    group.add(baseHalo);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.035, 8, 64), cyanMat);
    halo.position.set(0, 3.2, 0.02);
    halo.rotation.x = Math.PI / 2;
    halo.name = 'techGoalHalo';
    group.add(halo);

    const antenna = new THREE.Group();
    const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 8), cyanMat);
    antennaStem.position.y = 0.36;
    antenna.add(antennaStem);
    const antennaOrb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), magentaMat);
    antennaOrb.position.y = 0.8;
    antenna.add(antennaOrb);
    antenna.position.set(0.92, 2.68, 0.04);
    antenna.rotation.z = THREE.MathUtils.degToRad(-23);
    group.add(antenna);

    const techLight = new THREE.PointLight(0x5ee7ff, 1.18, 22, 1.35);
    techLight.position.set(0, 1.75, 1.8);
    group.add(techLight);

    return {
        group,
        arm: armPivot,
        wrist,
        halo,
        pulseParts: [
            { material: cyanMat, baseOpacity: 0.56, pulseOpacity: 0.34, phase: 0, speed: 3.4, light: techLight, baseIntensity: 0.72, pulseIntensity: 0.72 },
            { material: magentaMat, baseOpacity: 0.48, pulseOpacity: 0.36, phase: 1.35, speed: 4.1 },
            { material: whiteGlowMat, baseOpacity: 0.42, pulseOpacity: 0.32, phase: 2.2, speed: 5.0 },
            { material: visorMat, baseOpacity: 0.68, pulseOpacity: 0.18, phase: 0.6, speed: 2.8 }
        ]
    };
}
