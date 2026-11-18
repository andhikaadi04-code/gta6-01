import * as THREE from 'three';

// Traffic + player-driven cars for Solmar Bay.
// Roads run along X or Z at centre lines ..., -104, -52, 0, 52, 104, ...
// (block 40, road width 12). Traffic stays in a lane offset +/-3 from its
// road centre line (right-hand traffic) and turns at intersections.

const ROAD_COORDS = [-104, -52, 0, 52, 104];
const LANE = 3;
const CAR_COLORS = {
  red: 0xc0392b,
  yellow: 0xf1c40f,
  blue: 0x2471a3,
  white: 0xecf0f1,
  black: 0x1c1c22,
  teal: 0x16a085,
};
const COLOR_NAMES = Object.keys(CAR_COLORS);
const CAR_RADIUS = 1.6;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function keyDown(G, code) {
  const input = G && G.input;
  if (!input) return false;
  if (input.keys && typeof input.keys.has === 'function') return input.keys.has(code);
  return false;
}

// Lane offset for right-hand traffic on a given road/direction.
function laneFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? LANE : -LANE;   // east: south side (+z); west: north side
  return dir > 0 ? -LANE : LANE;                    // south: west side (-x); north: east side
}

function buildCarMesh(colorName, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({
    color: isPolice ? 0xf4f6f7 : (CAR_COLORS[colorName] || CAR_COLORS.red),
  });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a33 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 4.2), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const cabinColor = isPolice ? 0x1c1c22 : glass;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.1),
    new THREE.MeshLambertMaterial({ color: cabinColor }),
  );
  cabin.position.set(0, 1.2, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  // Wheels (cylinders rotated so their axis is across the car).
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights (front, +z is forward) and taillights.
  const headMat = new THREE.MeshLambertMaterial({
    color: 0xfff6c0, emissive: 0xffe98a, emissiveIntensity: 0.9,
  });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
    h.position.set(hx, 0.62, 2.12);
    group.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0xaa0000, emissive: 0xcc0000, emissiveIntensity: 0.8,
  });
  for (const tx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat);
    t.position.set(tx, 0.62, -2.12);
    group.add(t);
  }

  if (isPolice) {
    // Black doors stripe + red/blue light bar on the roof.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.22, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x1c1c22 }),
    );
    stripe.position.set(0, 0.72, -0.2);
    group.add(stripe);
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.12, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    barBase.position.set(0, 1.55, -0.2);
    group.add(barBase);
    const redLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.2 }),
    );
    redLight.position.set(-0.28, 1.56, -0.2);
    group.add(redLight);
    const blueLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 1.2 }),
    );
    blueLight.position.set(0.28, 1.56, -0.2);
    group.add(blueLight);
    group.userData.policeLights = { red: redLight, blue: blueLight };
  }

  group.userData.wheels = wheels;
  return group;
}

export function createVehicles(scene, G) {
  const world = (G && G.world) || {};
  const roads = Array.isArray(world.roads) && world.roads.length > 0
    ? world.roads
    : ROAD_COORDS.flatMap((c) => [
        { axis: 'x', coord: c, from: -180, to: 180 },
        { axis: 'z', coord: c, from: -180, to: 180 },
      ]);
  const roadCoordsX = roads.filter((r) => r.axis === 'x').map((r) => r.coord);
  const roadCoordsZ = roads.filter((r) => r.axis === 'z').map((r) => r.coord);
  const allCoords = [...new Set([...roadCoordsX, ...roadCoordsZ])].sort((a, b) => a - b);
  const coords = allCoords.length > 0 ? allCoords : ROAD_COORDS;
  const bounds = world.bounds || { minX: -180, maxX: 180, minZ: -180, maxZ: 180 };

  const cars = [];

  function roadForAxis(axis) {
    const list = roads.filter((r) => r.axis === axis);
    return list.length > 0 ? randPick(list) : { axis, coord: randPick(coords), from: -180, to: 180 };
  }

  function spawnCar(pos, color, opts) {
    const o = opts || {};
    const p = pos instanceof THREE.Vector3
      ? pos.clone()
      : new THREE.Vector3((pos && pos.x) || 0, 0, (pos && pos.z) || 0);
    p.y = 0;
    const colorName = typeof color === 'string' && CAR_COLORS[color] ? color : randPick(COLOR_NAMES);
    const isPolice = !!o.isPolice;
    const group = buildCarMesh(colorName, isPolice);
    group.position.copy(p);
    scene.add(group);

    // Pick a road to start on: nearest road centre line to the spawn point.
    let axis = o.axis || 'x';
    let coord = o.coord;
    if (coord === undefined) {
      let best = Infinity;
      for (const c of coords) {
        const d = axis === 'x' ? Math.abs(p.z - c) : Math.abs(p.x - c);
        if (d < best) { best = d; coord = c; }
      }
    }
    const dir = o.dir || (Math.random() < 0.5 ? 1 : -1);
    const car = {
      group,
      pos: p,
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: 0,
      color: colorName,
      driver: o.driver || 'traffic',
      isPolice,
      cruise: 8 + Math.random() * 4,
      roadAxis: axis,
      roadCoord: coord,
      dir,
      lane: laneFor(axis, dir),
      turnCooldown: 1 + Math.random() * 2,
      _wheelSpin: 0,
    };
    // Snap onto the lane so traffic never starts off-road.
    if (axis === 'x') car.pos.z = coord + car.lane;
    else car.pos.x = coord + car.lane;
    group.position.copy(car.pos);
    group.rotation.y = car.heading;
    cars.push(car);
    return car;
  }

  function nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist === undefined ? Infinity : maxDist;
    for (const car of cars) {
      const dx = car.pos.x - pos.x;
      const dz = car.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function jackCar(car) {
    if (!car) return;
    if (car.driver === 'traffic' && G && G.peds && typeof G.peds.spawnPed === 'function') {
      try {
        const ped = G.peds.spawnPed(new THREE.Vector3(car.pos.x + 2, 0, car.pos.z + 2));
        if (ped) {
          ped.state = 'flee';
          if (typeof ped.heading === 'number') ped.heading = Math.atan2(2, 2);
        }
      } catch { /* fleeing ped is best-effort; the jack still happens */ }
    }
    car.driver = 'player';
    if (G && G.player) {
      G.player.inCar = car;
      if (G.player.mesh) G.player.mesh.visible = false;
      if (G.player.pos) G.player.pos.copy(car.pos);
    }
  }

  function carAhead(car, maxDist) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let nearest = null;
    let nearestD = maxDist;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= nearestD || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d > 0.7) { nearest = other; nearestD = d; }
    }
    return nearest ? { car: nearest, dist: nearestD } : null;
  }

  function nearestCoord(value) {
    let best = coords[0];
    let bestD = Infinity;
    for (const c of coords) {
      const d = Math.abs(value - c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { coord: best, dist: bestD };
  }

  function trafficStep(car, dt) {
    car.turnCooldown -= dt;
    // Target speed: cruise, slower for a car ahead, stop if bumper-to-bumper.
    let target = car.cruise;
    const ahead = carAhead(car, 8);
    if (ahead) {
      target = ahead.dist < 4 ? 0 : Math.min(target, Math.max(0, ahead.car.speed));
    }
    car.speed += clamp(target - car.speed, -10 * dt, 6 * dt);

    if (car.roadAxis === 'x') {
      car.pos.x += car.dir * car.speed * dt;
      car.pos.z = car.roadCoord + car.lane;
      // Intersection: maybe turn onto the crossing road.
      const cross = nearestCoord(car.pos.x);
      if (car.turnCooldown <= 0 && cross.dist < 2.5 && Math.random() < 0.35) {
        car.roadAxis = 'z';
        car.roadCoord = cross.coord;
        car.dir = Math.random() < 0.5 ? 1 : -1;
        car.lane = laneFor('z', car.dir);
        car.pos.x = car.roadCoord + car.lane;
        car.turnCooldown = 2 + Math.random() * 3;
      }
      // End of the road: turn around at the next intersection or the edge.
      const road = roads.find((r) => r.axis === 'x' && r.coord === car.roadCoord);
      const to = road && road.to !== undefined ? road.to : bounds.maxX;
      const from = road && road.from !== undefined ? road.from : bounds.minX;
      if ((car.dir > 0 && car.pos.x > to - 4) || (car.dir < 0 && car.pos.x < from + 4)) {
        const cross2 = nearestCoord(car.pos.x);
        if (cross2.dist < 6 && Math.random() < 0.7) {
          car.roadAxis = 'z';
          car.roadCoord = cross2.coord;
          car.dir = Math.random() < 0.5 ? 1 : -1;
          car.lane = laneFor('z', car.dir);
          car.pos.x = car.roadCoord + car.lane;
        } else {
          car.dir *= -1;
          car.lane = laneFor('x', car.dir);
        }
        car.turnCooldown = 2;
      }
    } else {
      car.pos.z += car.dir * car.speed * dt;
      car.pos.x = car.roadCoord + car.lane;
      const cross = nearestCoord(car.pos.z);
      if (car.turnCooldown <= 0 && cross.dist < 2.5 && Math.random() < 0.35) {
        car.roadAxis = 'x';
        car.roadCoord = cross.coord;
        car.dir = Math.random() < 0.5 ? 1 : -1;
        car.lane = laneFor('x', car.dir);
        car.pos.z = car.roadCoord + car.lane;
        car.turnCooldown = 2 + Math.random() * 3;
      }
      const road = roads.find((r) => r.axis === 'z' && r.coord === car.roadCoord);
      const to = road && road.to !== undefined ? road.to : bounds.maxZ;
      const from = road && road.from !== undefined ? road.from : bounds.minZ;
      if ((car.dir > 0 && car.pos.z > to - 4) || (car.dir < 0 && car.pos.z < from + 4)) {
        const cross2 = nearestCoord(car.pos.z);
        if (cross2.dist < 6 && Math.random() < 0.7) {
          car.roadAxis = 'x';
          car.roadCoord = cross2.coord;
          car.dir = Math.random() < 0.5 ? 1 : -1;
          car.lane = laneFor('x', car.dir);
          car.pos.z = car.roadCoord + car.lane;
        } else {
          car.dir *= -1;
          car.lane = laneFor('z', car.dir);
        }
        car.turnCooldown = 2;
      }
    }
    const wantHeading = car.roadAxis === 'x'
      ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.dir > 0 ? 0 : Math.PI);
    // Smooth the heading through turns instead of snapping.
    let d = wantHeading - car.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    car.heading += clamp(d, -2.2 * dt, 2.2 * dt);
  }

  function playerDriveStep(car, dt) {
    const accel = keyDown(G, 'KeyW') || keyDown(G, 'ArrowUp');
    const brake = keyDown(G, 'KeyS') || keyDown(G, 'ArrowDown');
    const handbrake = keyDown(G, 'Space');
    if (accel) car.speed += 14 * dt;
    if (brake) {
      car.speed -= (car.speed > 0.5 ? 22 : 9) * dt; // brake, then reverse
    }
    if (!accel && !brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, -8, 28);

    const steer = (keyDown(G, 'KeyA') || keyDown(G, 'ArrowLeft') ? 1 : 0)
      - (keyDown(G, 'KeyD') || keyDown(G, 'ArrowRight') ? 1 : 0);
    if (steer !== 0 && Math.abs(car.speed) > 0.3) {
      const grip = clamp(Math.abs(car.speed) / 8, 0, 1);
      car.heading += steer * 1.8 * grip * dt * Math.sign(car.speed);
    }
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.pos.x = clamp(car.pos.x, bounds.minX, bounds.maxX);
    car.pos.z = clamp(car.pos.z, bounds.minZ, bounds.maxZ);
  }

  function collideBuildings(car) {
    const colliders = world.colliders;
    if (!colliders) return;
    for (const c of colliders) {
      if (!c) continue;
      if (car.pos.x + CAR_RADIUS <= c.minX || car.pos.x - CAR_RADIUS >= c.maxX ||
          car.pos.z + CAR_RADIUS <= c.minZ || car.pos.z - CAR_RADIUS >= c.maxZ) continue;
      const pushL = (car.pos.x + CAR_RADIUS) - c.minX;
      const pushR = c.maxX - (car.pos.x - CAR_RADIUS);
      const pushB = (car.pos.z + CAR_RADIUS) - c.minZ;
      const pushF = c.maxZ - (car.pos.z - CAR_RADIUS);
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (m === pushL) car.pos.x = c.minX - CAR_RADIUS;
      else if (m === pushR) car.pos.x = c.maxX + CAR_RADIUS;
      else if (m === pushB) car.pos.z = c.minZ - CAR_RADIUS;
      else car.pos.z = c.maxZ + CAR_RADIUS;
      car.speed *= 0.5;
    }
  }

  function collideCars() {
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i], b = cars[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = 3.6;
        if (d >= minD || d < 0.001) continue;
        const push = (minD - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
        a.speed *= 0.9;
        b.speed *= 0.9;
      }
    }
  }

  function update(dt) {
    if (!dt || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    for (const car of cars) {
      if (car.driver === 'player') playerDriveStep(car, dt);
      else if (car.driver === 'traffic') trafficStep(car, dt);
      else {
        // Parked / driverless: slowly roll to a stop.
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        car.pos.z += Math.cos(car.heading) * car.speed * dt;
      }
      collideBuildings(car);
      // Keep the player glued to their car.
      if (car.driver === 'player' && G && G.player && G.player.inCar === car) {
        G.player.pos.copy(car.pos);
        G.player.heading = car.heading;
      }
      car.group.position.copy(car.pos);
      car.group.rotation.y = car.heading;
      // Spin the wheels with travel.
      car._wheelSpin += (car.speed * dt) / 0.38;
      const wheels = car.group.userData.wheels || [];
      for (const w of wheels) w.rotation.x = car._wheelSpin;
      // Police light bar flashes.
      if (car.isPolice && car.group.userData.policeLights) {
        const t = (G && G.time ? G.time : 0);
        const phase = Math.floor(t * 4) % 2 === 0;
        car.group.userData.policeLights.red.material.emissiveIntensity = phase ? 1.4 : 0.15;
        car.group.userData.policeLights.blue.material.emissiveIntensity = phase ? 0.15 : 1.4;
      }
    }
    collideCars();
  }

  // Seed initial traffic from the world's car spawns (or road positions).
  const spawns = Array.isArray(world.carSpawns) && world.carSpawns.length > 0
    ? world.carSpawns
    : coords.slice(0, 3).map((c) => new THREE.Vector3(c, 0, -52));
  const seedCount = Math.min(spawns.length, 10);
  for (let i = 0; i < seedCount; i += 1) {
    const s = spawns[i];
    const pos = s instanceof THREE.Vector3 ? s : new THREE.Vector3((s && s.x) || 0, 0, (s && s.z) || 0);
    spawnCar(pos, randPick(COLOR_NAMES), { driver: 'traffic' });
  }

  const api = { cars, update, spawnCar, nearestCar, jackCar };
  if (G) {
    G.vehicles = api;
    G.cars = cars;
  }
  return api;
}
