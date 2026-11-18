import * as THREE from 'three';

// Pedestrians for Solmar Bay. They walk the sidewalks (road edge +/- ~8),
// cross roads at intersections, and flee from fast/near cars and gunshots.
// Dead peds fall over and stay down.
//
// G.peds is the peds array itself (per DESIGN.md) with spawnPed/update
// attached to it, so other modules can call G.peds.spawnPed(...) and also
// iterate G.peds as an array.

const ROAD_COORDS = [-104, -52, 0, 52, 104];
const SIDEWALK = 8; // road half-width 6 + sidewalk offset
const SHIRT_COLORS = [0xd35400, 0x27ae60, 0x8e44ad, 0xe67e22, 0x16a085, 0xc0392b, 0x2e86c1, 0xf39c12, 0x7f8c8d, 0xe91e63];

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPedMesh(shirtColor, heightScale) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: randPick([0x2b3440, 0x5d4037, 0x37474f, 0x4a235a]) });
  const hair = new THREE.MeshLambertMaterial({ color: randPick([0x1c1410, 0x3b2f2f, 0x6e6259, 0x111111]) });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairMesh.position.y = 1.66;
  group.add(hairMesh);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armL.position.set(-0.36, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armR.position.set(0.36, 1.05, 0);
  group.add(armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pants);
  legL.position.set(-0.14, 0.37, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pants);
  legR.position.set(0.14, 0.37, 0);
  group.add(legR);

  group.scale.setScalar(heightScale);
  group.userData.limbs = { armL, armR, legL, legR };
  return group;
}

export function createPedestrians(scene, G) {
  const world = (G && G.world) || {};
  const roads = Array.isArray(world.roads) && world.roads.length > 0
    ? world.roads
    : ROAD_COORDS.flatMap((c) => [{ axis: 'x', coord: c }, { axis: 'z', coord: c }]);
  const coords = [...new Set(roads.map((r) => r.coord))].sort((a, b) => a - b);
  const bounds = world.bounds || { minX: -180, maxX: 180, minZ: -180, maxZ: 180 };

  // The peds array doubles as the module handle: array + methods.
  const peds = [];
  let walkPhase = 0;

  function nearestCoord(value) {
    let best = coords[0];
    let bestD = Infinity;
    for (const c of coords) {
      const d = Math.abs(value - c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { coord: best, dist: bestD };
  }

  function spawnPed(pos) {
    const p = pos instanceof THREE.Vector3
      ? pos.clone()
      : new THREE.Vector3((pos && pos.x) || 0, 0, (pos && pos.z) || 0);
    p.y = 0;
    const heightScale = 0.9 + Math.random() * 0.2;
    const group = buildPedMesh(randPick(SHIRT_COLORS), heightScale);
    group.position.copy(p);
    scene.add(group);

    // Start on the nearest sidewalk.
    let axis = Math.random() < 0.5 ? 'x' : 'z';
    let coord = nearestCoord(axis === 'x' ? p.z : p.x).coord;
    const side = Math.random() < 0.5 ? 1 : -1;
    if (axis === 'x') p.z = coord + side * SIDEWALK;
    else p.x = coord + side * SIDEWALK;

    const ped = {
      group,
      pos: p,
      heading: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.8,
      state: 'walk',
      health: 100,
      walkSpeed: 1.2 + Math.random() * 0.8,
      roadAxis: axis,
      roadCoord: coord,
      side,
      dir: Math.random() < 0.5 ? 1 : -1,
      turnCooldown: 1 + Math.random() * 3,
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      crossing: false,
      crossTarget: 0,
      _walkT: Math.random() * 10,
      damage(n) {
        this.health = Math.max(0, this.health - (n || 0));
        if (this.health <= 0 && this.state !== 'dead') {
          this.state = 'dead';
          this.speed = 0;
          this.group.rotation.x = -Math.PI / 2;
          this.group.position.y = 0.25;
        }
        return this.health <= 0;
      },
    };
    ped.heading = axis === 'x'
      ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.dir > 0 ? 0 : Math.PI);
    group.position.copy(p);
    group.rotation.y = ped.heading;
    peds.push(ped);
    return ped;
  }

  // What is this ped afraid of right now? Returns a flee-from {x, z} or null.
  function threatNear(ped) {
    // Fast / near cars (within 6u and speed > 5).
    const cars = (G && Array.isArray(G.cars)) ? G.cars : [];
    for (const car of cars) {
      if (!car || !car.pos) continue;
      const d = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
      if (d < 6 && Math.abs(car.speed || 0) > 5) return { x: car.pos.x, z: car.pos.z };
    }
    // Gunshots (combat module records the last shot position, if present).
    const combat = G && G.combat;
    const shot = combat && combat.shotFiredAt;
    if (shot && typeof shot.x === 'number' && typeof shot.z === 'number') {
      const d = Math.hypot(shot.x - ped.pos.x, shot.z - ped.pos.z);
      if (d < 25) return { x: shot.x, z: shot.z };
    }
    return null;
  }

  function walkStep(ped, dt) {
    ped.turnCooldown -= dt;
    if (ped.crossing) {
      // Crossing the road: walk straight across until the far sidewalk.
      const target = ped.crossTarget;
      const cur = ped.roadAxis === 'x' ? ped.pos.z : ped.pos.x;
      const step = Math.sign(target - cur) * ped.walkSpeed * 1.4 * dt;
      if (ped.roadAxis === 'x') ped.pos.z += step;
      else ped.pos.x += step;
      const done = ped.roadAxis === 'x'
        ? Math.sign(target - ped.pos.z) !== Math.sign(target - cur) || Math.abs(target - ped.pos.z) < 0.2
        : Math.sign(target - ped.pos.x) !== Math.sign(target - cur) || Math.abs(target - ped.pos.x) < 0.2;
      if (done) {
        ped.crossing = false;
        ped.side = -ped.side;
        if (ped.roadAxis === 'x') ped.pos.z = ped.roadCoord + ped.side * SIDEWALK;
        else ped.pos.x = ped.roadCoord + ped.side * SIDEWALK;
        ped.turnCooldown = 2;
      }
      return;
    }

    if (ped.roadAxis === 'x') {
      ped.pos.x += ped.dir * ped.walkSpeed * dt;
      ped.pos.z = ped.roadCoord + ped.side * SIDEWALK;
      const cross = nearestCoord(ped.pos.x);
      if (ped.turnCooldown <= 0 && cross.dist < 2) {
        if (Math.random() < 0.3) {
          // Cross the road at this intersection.
          ped.crossing = true;
          ped.crossTarget = ped.roadCoord - ped.side * SIDEWALK;
          ped.heading = ped.side > 0 ? Math.PI : 0;
        } else if (Math.random() < 0.5) {
          // Turn onto the crossing road.
          ped.roadAxis = 'z';
          ped.roadCoord = cross.coord;
          ped.side = Math.random() < 0.5 ? 1 : -1;
          ped.pos.x = ped.roadCoord + ped.side * SIDEWALK;
          ped.dir = Math.random() < 0.5 ? 1 : -1;
        }
        ped.turnCooldown = 2 + Math.random() * 3;
      }
      if (ped.pos.x > bounds.maxX - 4 || ped.pos.x < bounds.minX + 4) ped.dir *= -1;
    } else {
      ped.pos.z += ped.dir * ped.walkSpeed * dt;
      ped.pos.x = ped.roadCoord + ped.side * SIDEWALK;
      const cross = nearestCoord(ped.pos.z);
      if (ped.turnCooldown <= 0 && cross.dist < 2) {
        if (Math.random() < 0.3) {
          ped.crossing = true;
          ped.crossTarget = ped.roadCoord - ped.side * SIDEWALK;
          ped.heading = ped.side > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else if (Math.random() < 0.5) {
          ped.roadAxis = 'x';
          ped.roadCoord = cross.coord;
          ped.side = Math.random() < 0.5 ? 1 : -1;
          ped.pos.z = ped.roadCoord + ped.side * SIDEWALK;
          ped.dir = Math.random() < 0.5 ? 1 : -1;
        }
        ped.turnCooldown = 2 + Math.random() * 3;
      }
      if (ped.pos.z > bounds.maxZ - 4 || ped.pos.z < bounds.minZ + 4) ped.dir *= -1;
    }
    const wantHeading = ped.roadAxis === 'x'
      ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.dir > 0 ? 0 : Math.PI);
    let d = wantHeading - ped.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ped.heading += clamp(d, -3 * dt, 3 * dt);
    ped.speed = ped.walkSpeed;
  }

  function update(dt) {
    if (!dt || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    walkPhase += dt;
    for (const ped of peds) {
      if (ped.state === 'dead') continue;

      const threat = threatNear(ped);
      if (threat) {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
        ped.fleeX = threat.x;
        ped.fleeZ = threat.z;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dx = ped.pos.x - ped.fleeX;
        const dz = ped.pos.z - ped.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        const fleeSpeed = 5.5;
        ped.pos.x += (dx / d) * fleeSpeed * dt;
        ped.pos.z += (dz / d) * fleeSpeed * dt;
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.speed = fleeSpeed;
        ped.pos.x = clamp(ped.pos.x, bounds.minX, bounds.maxX);
        ped.pos.z = clamp(ped.pos.z, bounds.minZ, bounds.maxZ);
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          // Re-anchor onto the nearest sidewalk.
          const axis = Math.random() < 0.5 ? 'x' : 'z';
          ped.roadAxis = axis;
          ped.roadCoord = nearestCoord(axis === 'x' ? ped.pos.z : ped.pos.x).coord;
          ped.side = Math.random() < 0.5 ? 1 : -1;
          ped.dir = Math.random() < 0.5 ? 1 : -1;
          ped.crossing = false;
          ped.turnCooldown = 1;
        }
      } else {
        walkStep(ped, dt);
      }

      // Keep out of buildings (sidewalk walkers should rarely hit one).
      const colliders = world.colliders;
      if (colliders) {
        for (const c of colliders) {
          if (!c) continue;
          if (ped.pos.x > c.minX - 0.4 && ped.pos.x < c.maxX + 0.4 &&
              ped.pos.z > c.minZ - 0.4 && ped.pos.z < c.maxZ + 0.4) {
            // Step back along the walking direction.
            ped.pos.x -= Math.sin(ped.heading) * ped.walkSpeed * dt * 2;
            ped.pos.z -= Math.cos(ped.heading) * ped.walkSpeed * dt * 2;
            ped.dir *= -1;
            ped.turnCooldown = 1;
            break;
          }
        }
      }

      // Limb swing while walking / fleeing.
      const limbs = ped.group.userData.limbs;
      if (limbs) {
        ped._walkT += dt * (ped.state === 'flee' ? 12 : 8);
        const swing = Math.sin(ped._walkT) * (ped.state === 'flee' ? 0.7 : 0.45);
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
        limbs.armL.rotation.x = -swing * 0.8;
        limbs.armR.rotation.x = swing * 0.8;
      }

      ped.group.position.copy(ped.pos);
      ped.group.rotation.y = ped.heading;
    }
  }

  // Attach the module methods to the array itself, then seed initial peds.
  peds.update = update;
  peds.spawnPed = spawnPed;

  const spawns = Array.isArray(world.pedSpawns) && world.pedSpawns.length > 0
    ? world.pedSpawns
    : coords.slice(0, 4).map((c) => new THREE.Vector3(c + SIDEWALK, 0, -52));
  const seedCount = Math.min(spawns.length, 12);
  for (let i = 0; i < seedCount; i += 1) {
    const s = spawns[i];
    const pos = s instanceof THREE.Vector3 ? s : new THREE.Vector3((s && s.x) || 0, 0, (s && s.z) || 0);
    spawnPed(pos);
  }

  const api = { peds, update, spawnPed };
  if (G) G.peds = peds; // array with .spawnPed/.update attached (see header note)
  return api;
}
