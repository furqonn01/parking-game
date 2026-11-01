import * as THREE from 'three';

export class ParkingDistrict {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'parking_district_root';
    this.scene.add(this.group);

    // Obstacles for vehicle collision detection
    this.obstacles = []; // Array of THREE.Box3

    // Parking slot target indicator
    this.targetMarker = null;
    this.targetArrow = null;
    this.targetSlot = null;

    this.initDistrict();
  }

  initDistrict() {
    // Grand Downtown Skyscraper Plaza: 160m (E-W) x 44m (N-S)
    // Sits perfectly in the open avenue corridor framed by the twin 303m skyscrapers
    const plazaWidth = 160;
    const plazaDepth = 44;

    // 1. Flush asphalt surface matching metropolitan road pavement
    const asphaltGeo = new THREE.PlaneGeometry(plazaWidth, plazaDepth);
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x1f2023,
      roughness: 0.88,
      metalness: 0.08
    });
    const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
    asphaltMesh.rotation.x = -Math.PI / 2;
    asphaltMesh.position.set(0, 0.005, 0); // Sits flush right on top of city terrain
    asphaltMesh.receiveShadow = true;
    this.group.add(asphaltMesh);

    // 2. North & South Sidewalks with curbs, trees, and planter islands
    this.createSidewalkBoulevards(plazaWidth);

    // 3. Central Thoroughfare markings & Zebra crossings
    this.createThoroughfareMarkings(plazaWidth);

    // 4. North & South Parking bays with yellow stall lines & concrete wheel stops
    this.createParkingBays();

    // 5. Entrance Ticket Gate Booths & Architecture
    this.createEntranceFeatures();

    // 6. Parked background luxury cars (gives realistic urban life & context)
    this.createParkedCars();

    // 7. Architectural street lamps (strictly on sidewalks, zero in driving lanes)
    this.createSidewalkLamps();

    // 8. Target parking box marker
    this.createTargetMarker();
  }

  createSidewalkBoulevards(width) {
    const curbHeight = 0.22;
    const walkDepth = 4.5;
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x828489,
      roughness: 0.85,
      metalness: 0.05
    });
    const planterMat = new THREE.MeshStandardMaterial({
      color: 0x36383b,
      roughness: 0.9
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x2d4f28,
      roughness: 0.95
    });
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x244a20,
      roughness: 0.8
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x3a2e24,
      roughness: 0.9
    });
    const bollardMat = new THREE.MeshStandardMaterial({
      color: 0xd0d4da,
      metalness: 0.85,
      roughness: 0.25
    });

    // North Sidewalk: z = -20.25
    // South Sidewalk: z = +20.25
    const sides = [
      { z: -20.25, curbZ: -18.0, dir: -1 },
      { z: 20.25, curbZ: 18.0, dir: 1 }
    ];

    sides.forEach(s => {
      // Main sidewalk walkway slab
      const walkGeo = new THREE.BoxGeometry(width, curbHeight, walkDepth);
      const walkMesh = new THREE.Mesh(walkGeo, sidewalkMat);
      walkMesh.position.set(0, curbHeight / 2, s.z);
      walkMesh.receiveShadow = true;
      this.group.add(walkMesh);

      // Collision box for curb
      const curbBox = new THREE.Box3().setFromObject(walkMesh);
      this.obstacles.push(curbBox);

      // Add modern planters with lush ornamental trees along the sidewalk
      const treeXs = [-60, -35, -10, 10, 35, 60];
      treeXs.forEach(tx => {
        // Concrete planter box
        const pBoxGeo = new THREE.BoxGeometry(3.6, 0.45, 2.2);
        const pBox = new THREE.Mesh(pBoxGeo, planterMat);
        pBox.position.set(tx, 0.225, s.z);
        this.group.add(pBox);

        // Grass/soil top
        const soilGeo = new THREE.BoxGeometry(3.2, 0.05, 1.8);
        const soil = new THREE.Mesh(soilGeo, grassMat);
        soil.position.set(tx, 0.46, s.z);
        this.group.add(soil);

        // Tree trunk
        const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.4, 8);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(tx, 1.6, s.z);
        this.group.add(trunk);

        // Stylized canopy foliage
        const folGeo = new THREE.DodecahedronGeometry(1.2, 1);
        const fol = new THREE.Mesh(folGeo, foliageMat);
        fol.position.set(tx, 3.2, s.z);
        fol.scale.set(1.1, 1.3, 1.1);
        this.group.add(fol);

        // Obstacle for planter
        const b = new THREE.Box3().setFromObject(pBox);
        this.obstacles.push(b);
      });

      // Protective stainless steel bollards along the curb edge
      for (let bx = -70; bx <= 70; bx += 7) {
        if (Math.abs(bx) < 14) continue; // Keep grand entrance crosswalk open
        const bolGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8);
        const bol = new THREE.Mesh(bolGeo, bollardMat);
        bol.position.set(bx, 0.425, s.curbZ + (s.dir > 0 ? 0.35 : -0.35));
        this.group.add(bol);
      }
    });

    // Grand Skyscraper Glass Canopies (North & South Entrance Porticos)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88bbdd,
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.85
    });
    const canopyFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1f2124,
      metalness: 0.9,
      roughness: 0.2
    });

    [-1, 1].forEach(dir => {
      const cz = dir * 21.5;
      const canopyGeo = new THREE.BoxGeometry(22, 0.25, 6.0);
      const canopy = new THREE.Mesh(canopyGeo, glassMat);
      canopy.position.set(0, 5.2, cz);
      this.group.add(canopy);

      // Support cantilever arms
      const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 6.0), canopyFrameMat);
      arm1.position.set(-10, 5.35, cz);
      const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 6.0), canopyFrameMat);
      arm2.position.set(10, 5.35, cz);
      this.group.add(arm1);
      this.group.add(arm2);
    });
  }

  createThoroughfareMarkings(width) {
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xededed });

    // 1. Broken central road divider line along z = 0
    const dashLength = 3.5;
    const dashGap = 2.5;
    const totalDashes = Math.floor(width / (dashLength + dashGap));
    const startX = -(totalDashes * (dashLength + dashGap)) / 2;

    for (let i = 0; i < totalDashes; i++) {
      const dx = startX + i * (dashLength + dashGap) + dashLength / 2;
      // Skip crosswalk areas
      if (Math.abs(dx - (-35)) < 4 || Math.abs(dx - 35) < 4 || Math.abs(dx) < 4) continue;

      const dashGeo = new THREE.PlaneGeometry(dashLength, 0.22);
      const dash = new THREE.Mesh(dashGeo, whiteMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(dx, 0.02, 0);
      this.group.add(dash);
    }

    // 2. Zebra Crossings (Pedestrian crosswalks connecting north and south plazas)
    [-35, 35].forEach(cx => {
      for (let z = -6.5; z <= 6.5; z += 1.3) {
        const stripeGeo = new THREE.PlaneGeometry(3.0, 0.65);
        const stripe = new THREE.Mesh(stripeGeo, whiteMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(cx, 0.02, z);
        this.group.add(stripe);
      }
    });

    // 3. Directional Road Arrows (Painted white arrows on asphalt)
    this.createRoadArrow(-15, -2.5, Math.PI / 2); // Westbound lane (right-hand traffic)
    this.createRoadArrow(15, 2.5, -Math.PI / 2);  // Eastbound lane
  }

  createRoadArrow(x, z, angle) {
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xededed });
    const arrowGroup = new THREE.Group();

    // Stem
    const stemGeo = new THREE.PlaneGeometry(2.2, 0.35);
    const stem = new THREE.Mesh(stemGeo, whiteMat);
    stem.rotation.x = -Math.PI / 2;
    stem.position.set(-0.4, 0.02, 0);
    arrowGroup.add(stem);

    // Tip
    const tipShape = new THREE.Shape();
    tipShape.moveTo(0, 0.9);
    tipShape.lineTo(1.4, 0);
    tipShape.lineTo(0, -0.9);
    tipShape.closePath();
    const tipGeo = new THREE.ShapeGeometry(tipShape);
    const tip = new THREE.Mesh(tipGeo, whiteMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0.7, 0.02, 0);
    arrowGroup.add(tip);

    arrowGroup.rotation.y = angle;
    arrowGroup.position.set(x, 0, z);
    this.group.add(arrowGroup);
  }

  createParkingBays() {
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf5c832 });
    const curbStopMat = new THREE.MeshStandardMaterial({
      color: 0xb5b8bc,
      roughness: 0.85
    });

    // North Row: perpendicular bays from z = -6.8 to z = -12.8
    // South Row: perpendicular bays from z = +6.8 to z = +12.8
    const bayConfigs = [
      { zStart: -6.8, zEnd: -12.8, stopZ: -12.8, side: -1 },
      { zStart: 6.8, zEnd: 12.8, stopZ: 12.8, side: 1 }
    ];

    const slotSpacing = 3.2; // Generous 3.2m executive parking slot width
    const stallDepth = 6.0;

    bayConfigs.forEach(cfg => {
      // Continuous white boundary limit line along road edge
      const lineGeo = new THREE.PlaneGeometry(130, 0.2);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xededed });
      const roadBoundary = new THREE.Mesh(lineGeo, lineMat);
      roadBoundary.rotation.x = -Math.PI / 2;
      roadBoundary.position.set(0, 0.02, cfg.zStart);
      this.group.add(roadBoundary);

      // Paint parking bay dividers & place concrete wheel stops
      for (let x = -60; x <= 60; x += slotSpacing) {
        // Skip crosswalk corridors
        if (Math.abs(x - (-35)) < 3.5 || Math.abs(x - 35) < 3.5) continue;

        // Stall yellow divider line
        const divGeo = new THREE.PlaneGeometry(0.18, stallDepth);
        const div = new THREE.Mesh(divGeo, yellowMat);
        div.rotation.x = -Math.PI / 2;
        div.position.set(x - slotSpacing / 2, 0.02, (cfg.zStart + cfg.zEnd) / 2);
        this.group.add(div);

        // Concrete tire bumper / wheel stop
        const stopGeo = new THREE.BoxGeometry(1.9, 0.14, 0.22);
        const stop = new THREE.Mesh(stopGeo, curbStopMat);
        stop.position.set(x, 0.07, cfg.stopZ + (cfg.side > 0 ? -0.35 : 0.35));
        stop.receiveShadow = true;
        this.group.add(stop);

        // Collision obstacle for wheel stop
        const box = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(x, 0.07, cfg.stopZ + (cfg.side > 0 ? -0.35 : 0.35)),
          new THREE.Vector3(1.9, 0.15, 0.25)
        );
        this.obstacles.push(box);
      }
    });

    // Parallel parking zone bay along south curb for Level 3
    const parallelDiv1 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.6), yellowMat);
    parallelDiv1.rotation.x = -Math.PI / 2;
    parallelDiv1.position.set(11.5, 0.02, 12.8);
    const parallelDiv2 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.6), yellowMat);
    parallelDiv2.rotation.x = -Math.PI / 2;
    parallelDiv2.position.set(18.5, 0.02, 12.8);
    this.group.add(parallelDiv1);
    this.group.add(parallelDiv2);
  }

  createEntranceFeatures() {
    // Modern Security Booth / Automated Parking Barrier Gate at East (x = +75) and West (x = -75)
    const boothMat = new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.8, roughness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x99ccff, transparent: true, opacity: 0.65 });
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xee2222 });

    [-76, 76].forEach(bx => {
      // Security booth
      const boothGeo = new THREE.BoxGeometry(2.4, 2.8, 2.0);
      const booth = new THREE.Mesh(boothGeo, boothMat);
      booth.position.set(bx, 1.4, -6.5);
      this.group.add(booth);

      // Glass window
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.0, 1.6), glassMat);
      win.position.set(bx, 1.6, -6.5);
      this.group.add(win);

      // Barrier arm post
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.2, 8), boothMat);
      post.position.set(bx, 0.6, -4.8);
      this.group.add(post);

      // Raised barrier arm (open so car can freely pass into city)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.8, 0.1), barrierMat);
      arm.position.set(bx, 2.3, -4.8);
      arm.rotation.z = Math.PI / 3;
      this.group.add(arm);

      // Signpost: Modern Parking 'P' Totem
      this.createParkingTotem(bx, 7.5);

      const ob = new THREE.Box3().setFromObject(booth);
      this.obstacles.push(ob);
    });
  }

  createParkingTotem(x, z) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x202225, metalness: 0.85, roughness: 0.2 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x0055cc, roughness: 0.3 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const group = new THREE.Group();
    // Totem pillar
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 0.4), poleMat);
    pillar.position.y = 2.1;
    group.add(pillar);

    // Blue signage box
    const signBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.5), blueMat);
    signBox.position.y = 3.6;
    group.add(signBox);

    // 'P' emblem on both faces
    [-0.26, 0.26].forEach(offsetZ => {
      const pFace = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), whiteMat);
      pFace.position.set(0, 3.6, offsetZ);
      if (offsetZ < 0) pFace.rotation.y = Math.PI;
      group.add(pFace);
    });

    group.position.set(x, 0, z);
    this.group.add(group);

    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, 2.1, z),
      new THREE.Vector3(0.6, 4.2, 0.6)
    );
    this.obstacles.push(box);
  }

  createParkedCars() {
    // Realistic stylized luxury parked cars in selected background bays
    // Leaves Level 1 (x: 0), Level 2 (x: -20), and Level 4 (x: 35) completely open!
    const carSlots = [
      { x: -44.8, z: -9.8, rot: 0, color: 0x222222 },  // Black Executive Sedan
      { x: -28.8, z: -9.8, rot: 0, color: 0x8899aa },  // Silver Metallic Coupe
      { x: -12.8, z: -9.8, rot: 0, color: 0x0a1a3a },  // Deep Blue Sportback
      { x: 12.8, z: -9.8, rot: 0, color: 0x771111 },   // Wine Red GT
      { x: 25.6, z: -9.8, rot: 0, color: 0xdddddd },   // Glacier White
      { x: -19.2, z: 9.8, rot: Math.PI, color: 0x111113 }, // Phantom Black
      { x: -3.2, z: 9.8, rot: Math.PI, color: 0x334455 }   // Daytona Grey
    ];

    carSlots.forEach(slot => {
      const carGroup = new THREE.Group();

      const bodyMat = new THREE.MeshStandardMaterial({
        color: slot.color,
        roughness: 0.25,
        metalness: 0.85
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x11161d,
        roughness: 0.1,
        metalness: 0.95
      });
      const tireMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9
      });
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffeecc });
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });

      // Lower chassis / body
      const bodyGeo = new THREE.BoxGeometry(2.0, 0.65, 4.8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      carGroup.add(body);

      // Cabin / greenhouse
      const cabinGeo = new THREE.BoxGeometry(1.7, 0.58, 2.6);
      const cabin = new THREE.Mesh(cabinGeo, glassMat);
      cabin.position.set(0, 1.0, -0.2);
      carGroup.add(cabin);

      // Headlights & Taillights
      const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), lightMat);
      hl1.position.set(-0.7, 0.55, 2.41);
      const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), lightMat);
      hl2.position.set(0.7, 0.55, 2.41);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.05), tailMat);
      tl.position.set(0, 0.6, -2.41);
      carGroup.add(hl1);
      carGroup.add(hl2);
      carGroup.add(tl);

      // 4 Wheels
      [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), tireMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.34, wz);
        carGroup.add(wheel);
      });

      carGroup.rotation.y = slot.rot;
      carGroup.position.set(slot.x, 0, slot.z);
      this.group.add(carGroup);

      // Physical collision obstacle for parked vehicle
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(slot.x, 0.75, slot.z),
        new THREE.Vector3(2.1, 1.5, 5.0)
      );
      this.obstacles.push(box);
    });
  }

  createSidewalkLamps() {
    // High-end twin-luminaire architectural street lamp poles placed strictly on sidewalks
    // Positioned at z = ±21m on pedestrian walkway, leaving 100% of driving corridors clear!
    const lampPositions = [
      { x: -55, z: -20.5 },
      { x: -18, z: -20.5 },
      { x: 18, z: -20.5 },
      { x: 55, z: -20.5 },
      { x: -55, z: 20.5 },
      { x: -18, z: 20.5 },
      { x: 18, z: 20.5 },
      { x: 55, z: 20.5 }
    ];

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f2226, metalness: 0.9, roughness: 0.2 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffaee });

    lampPositions.forEach(p => {
      // Slender pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), poleMat);
      pole.position.set(p.x, 3.75, p.z);
      this.group.add(pole);

      // Double overhang cross arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 2.4), poleMat);
      arm.position.set(p.x, 7.4, p.z);
      this.group.add(arm);

      // Dual LED fixture heads
      [-1, 1].forEach(dir => {
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.7), poleMat);
        fixture.position.set(p.x, 7.35, p.z + dir * 1.1);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.55), bulbMat);
        bulb.position.set(p.x, 7.28, p.z + dir * 1.1);
        this.group.add(fixture);
        this.group.add(bulb);
      });

      // Warm ambient street light
      const pl = new THREE.PointLight(0xfff2dc, 1.2, 38, 1.6);
      pl.position.set(p.x, 7.0, p.z);
      this.group.add(pl);

      // Collision obstacle strictly at the pole base
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(p.x, 3.75, p.z),
        new THREE.Vector3(0.4, 7.5, 0.4)
      );
      this.obstacles.push(box);
    });
  }

  createTargetMarker() {
    const shapeGroup = new THREE.Group();

    // Floor outline
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
    const w = 2.6;
    const l = 5.5;

    const points = [
      new THREE.Vector3(-w / 2, 0.05, -l / 2),
      new THREE.Vector3(w / 2, 0.05, -l / 2),
      new THREE.Vector3(w / 2, 0.05, l / 2),
      new THREE.Vector3(-w / 2, 0.05, l / 2),
      new THREE.Vector3(-w / 2, 0.05, -l / 2)
    ];

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, lineMat);
    shapeGroup.add(line);

    // Glowing translucent floor plane
    const planeGeo = new THREE.PlaneGeometry(w, l);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.03;
    shapeGroup.add(plane);

    // Overhead arrow pointing down
    const arrowGeo = new THREE.ConeGeometry(0.45, 1.1, 4);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = Math.PI; // Point down
    arrow.position.y = 3.0;
    shapeGroup.add(arrow);

    this.targetMarker = shapeGroup;
    this.targetArrow = arrow;
    this.group.add(this.targetMarker);
    this.targetMarker.visible = false;
  }

  spawnTrafficCone(x, z) {
    const coneGroup = new THREE.Group();

    // Base square
    const baseGeo = new THREE.BoxGeometry(0.38, 0.05, 0.38);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xdd4400, roughness: 0.6 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.025;
    coneGroup.add(base);

    // Cone body
    const bodyGeo = new THREE.ConeGeometry(0.16, 0.62, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.34;
    coneGroup.add(body);

    // Reflective white sleeve
    const sleeveGeo = new THREE.CylinderGeometry(0.10, 0.13, 0.18, 10);
    const sleeveMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeve.position.y = 0.36;
    coneGroup.add(sleeve);

    coneGroup.position.set(x, 0, z);
    this.group.add(coneGroup);

    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, 0.35, z),
      new THREE.Vector3(0.4, 0.7, 0.4)
    );
    this.obstacles.push(box);
    return coneGroup;
  }

  setTargetSlot(slot) {
    this.targetSlot = slot;
    if (slot && this.targetMarker) {
      this.targetMarker.position.set(slot.x, 0, slot.z);
      this.targetMarker.rotation.y = slot.heading || 0;
      this.targetMarker.visible = true;
    } else if (this.targetMarker) {
      this.targetMarker.visible = false;
    }
  }

  update(time) {
    // Pulse arrow and marker
    if (this.targetArrow && this.targetMarker.visible) {
      this.targetArrow.position.y = 3.0 + Math.sin(time * 4) * 0.3;
      this.targetArrow.rotation.y = time * 2;
    }
  }
}
