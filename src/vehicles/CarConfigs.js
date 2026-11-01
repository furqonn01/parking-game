export const CAR_CONFIGS = {
  r8: {
    id: 'r8',
    name: 'Audi R8 V10 Plus',
    type: 'Supercar',
    file: 'assets/cars/r8.glb',
    scale: 0.001,
    offset: { x: -0.983, y: 0.0, z: 2.212 },
    dimensions: { width: 1.96, height: 1.20, length: 4.42 },
    driverCam: { x: -0.35, y: 0.95, z: -0.14 },
    hoodCam: { x: 0.0, y: 0.82, z: 1.55 },
    chaseCam: { distance: 5.4, height: 1.7, lookAtHeight: 1.05 },
    headlights: [
      { x: -0.65, y: 0.55, z: 2.05 },
      { x: 0.65, y: 0.55, z: 2.05 }
    ],
    taillights: [
      { x: -0.65, y: 0.65, z: -2.05 },
      { x: 0.65, y: 0.65, z: -2.05 }
    ],
    physics: {
      maxSpeed: 48,          // ~172 km/h
      reverseMaxSpeed: 12,   // ~43 km/h
      acceleration: 20,      // m/s^2 (punchy supercar response)
      brakeForce: 30,        // m/s^2 (strong carbon-ceramic brakes)
      reverseAccel: 11,
      handbrakeDecel: 36,
      friction: 2.0,
      airResistance: 0.0016,
      steerSpeed: 3.5,
      maxSteerAngle: 0.38,   // ~21.8 degrees
      suspensionStiffness: 55.0
    }
  },
  audi_a7: {
    id: 'audi_a7',
    name: 'Audi A7 Sportback',
    type: 'Executive Coupe',
    file: 'assets/cars/audi_a7.glb',
    scale: 0.01,
    offset: { x: 0.019, y: 0.09, z: 0.07 },
    dimensions: { width: 2.13, height: 1.43, length: 4.96 },
    driverCam: { x: 0.38, y: 1.18, z: 0.02 }, // Exactly at driver's steering wheel position
    hoodCam: { x: 0.0, y: 0.92, z: 1.85 },
    chaseCam: { distance: 6.2, height: 2.0, lookAtHeight: 1.15 },
    headlights: [
      { x: -0.72, y: 0.68, z: 2.35 },
      { x: 0.72, y: 0.68, z: 2.35 }
    ],
    taillights: [
      { x: -0.72, y: 0.78, z: -2.35 },
      { x: 0.72, y: 0.78, z: -2.35 }
    ],
    physics: {
      maxSpeed: 45,          // ~162 km/h
      reverseMaxSpeed: 10,
      acceleration: 16,
      brakeForce: 26,
      reverseAccel: 9,
      handbrakeDecel: 30,
      friction: 2.2,
      airResistance: 0.0019,
      steerSpeed: 3.0,
      maxSteerAngle: 0.40,   // ~22.9 degrees
      suspensionStiffness: 45.0
    }
  }
};
