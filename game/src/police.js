// police.js — wanted level, police cars + foot cops, bust / respawn (worker 3: systems).
// Contract: createPolice(scene, G) -> { wanted, cops, update(dt), addHeat(n), setWanted(n) }
// Wanted 0-5. Crimes add heat; police chase and ram; foot cops bust on contact.
// Busted/wasted: G.onPlayerDown(kind) when present, else respawn locally.
import * as THREE from 'three';

const ROAD_COORDS = [-104, -52, 0, 52, 104];
const MAX_WANTED = 5;
const DECAY_SECONDS = 8;
const COP_SAFE_DIST = 40;
const CAR_SPEED = 20;
const FOOT_SPEED = 6.5;
const RAM_DIST = 4;
const BUST_DIST = 2;
const BUST_TIME = 2;

function clampWanted(n) {
  const v = Math.round(typeof n === 'number' && Number.isFinite(n) ? n : 0);
  return Math.max(0, Math.min(MAX_WANTED, v));
}

export function createPolice(scene, G) {
  const state = {
    wanted: 0,
    cops: [], // { kind:'car'|'foot', group, pos, heading, speed, car, ramCooldown, closeTimer }
    now: 0,
    lastCrimeAt: -1e9,
    decayTimer: 0,
    spawnTimer: 0,
    downCalled: false,
    sirenOn: false,
  };

  function playerPos() {
    if (!G || !G.player) return null;
    if (G.player.pos) return G.player.pos;
    if (G.player.mesh && G.player.mesh.position) return G.player.mesh.position;
    return null;
  }

  function syncWanted() {
    if (G && G.police && G.police !== api) {
      try { G.police.wanted = state.wanted; } catch { /* G.police is optional */ }
    }
    if (G && G.hud && typeof G.hud.setWanted === 'function') {
      try { G.hud.setWanted(state.wanted); } catch { /* HUD is optional */ }
    }
    const wantSiren = state.wanted > 0;
    if (wantSiren !== state.sirenOn) {
      state.sirenOn = wantSiren;
      if (G && G.audio && typeof G.audio.siren === 'function') {
        try { G.audio.siren(wantSiren); } catch { /* audio is optional */ }
      }
    }
  }

  function setWanted(n) {
    state.wanted = clampWanted(n);
    state.decayTimer = 0;
    if (state.wanted === 0) pruneCops(0, 0);
    syncWanted();
  }

  function addHeat(n) {
    if (state.wanted >= MAX_WANTED) return;
    state.wanted = clampWanted(state.wanted + (typeof n === 'number' ? n : 1));
    state.lastCrimeAt = state.now;
    state.decayTimer = 0;
    syncWanted();
  }

  // ---- Fallback police car mesh (used when G.vehicles.spawnCar is absent/fails) ----
  function buildPoliceCar() {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x10204a });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.2), navy);
    body.position.y = 0.55;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), white);
    cabin.position.set(0, 1.1, -0.2);
    group.add(body, cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.35, z);
      group.add(w);
    });
    // Roof light bar: red + blue flashing blocks.
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    red.position.set(-0.35, 1.5, -0.2);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    blue.position.set(0.35, 1.5, -0.2);
    group.add(red, blue);
    group.userData.lightBar = [red, blue];
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.15, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0 }),
    );
    head.position.set(0, 0.6, 2.12);
    group.add(head);
    return group;
  }

  function buildFootCop() {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f6e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), navy);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.72;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), dark);
    cap.position.y = 1.9;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), dark);
    legL.position.set(-0.14, 0.38, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    group.add(torso, head, cap, legL, legR);
    return group;
  }

  function pickSpawnPos() {
    const p = playerPos() || new THREE.Vector3(0, 0, 0);
    const bounds = (G && G.world && G.world.bounds) || { minX: -170, maxX: 170, minZ: -170, maxZ: 170 };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const coord = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.5) {
      // Along an X road: x offset from the player, z on the road line.
      return new THREE.Vector3(clamp(p.x + dir * 45, bounds.minX, bounds.maxX), 0, coord);
    }
    // Along a Z road: z offset from the player, x on the road line.
    return new THREE.Vector3(coord, 0, clamp(p.z + dir * 45, bounds.minZ, bounds.maxZ));
  }

  function spawnCopCar() {
    const pos = pickSpawnPos();
    let car = null;
    let group = null;
    if (G && G.vehicles && typeof G.vehicles.spawnCar === 'function') {
      try {
        car = G.vehicles.spawnCar(pos.clone(), 'black', { isPolice: true }) || null;
      } catch { car = null; }
      if (car) {
        if (car.group) group = car.group;
        try { car.driver = 'police'; car.isPolice = true; } catch { /* ignore */ }
      }
    }
    if (!group) {
      group = buildPoliceCar();
      group.position.copy(pos);
      if (scene && typeof scene.add === 'function') scene.add(group);
    }
    const cop = {
      kind: 'car', group, car,
      pos: (car && car.pos) ? car.pos : pos,
      heading: Math.random() * Math.PI * 2,
      speed: 0, ramCooldown: 0, closeTimer: 0,
    };
    if (car && car.pos) cop.pos.copy(pos);
    state.cops.push(cop);
    return cop;
  }

  function spawnFootCop() {
    const pos = pickSpawnPos();
    const group = buildFootCop();
    group.position.copy(pos);
    if (scene && typeof scene.add === 'function') scene.add(group);
    const cop = {
      kind: 'foot', group, car: null,
      pos, heading: 0, speed: 0, ramCooldown: 0, closeTimer: 0,
    };
    state.cops.push(cop);
    return cop;
  }

  function removeCop(cop) {
    const idx = state.cops.indexOf(cop);
    if (idx >= 0) state.cops.splice(idx, 1);
    if (cop.group && scene && typeof scene.remove === 'function') {
      try { scene.remove(cop.group); } catch { /* ignore */ }
    }
    // Drop a vehicles-spawned car from the shared car list so it stops updating.
    if (cop.car && G && Array.isArray(G.cars)) {
      const ci = G.cars.indexOf(cop.car);
      if (ci >= 0) G.cars.splice(ci, 1);
    }
  }

  function pruneCops(wantCars, wantFoot) {
    const cars = state.cops.filter((c) => c.kind === 'car');
    const feet = state.cops.filter((c) => c.kind === 'foot');
    while (cars.length > wantCars) removeCop(cars.pop());
    while (feet.length > wantFoot) removeCop(feet.pop());
  }

  function damagePlayer(n) {
    if (!G || !G.player) return;
    if (typeof G.player.damage === 'function') {
      try { G.player.damage(n); } catch { /* ignore */ }
    } else if (typeof G.player.health === 'number') {
      G.player.health = Math.max(0, G.player.health - n);
      if (G.hud && typeof G.hud.setHealth === 'function') {
        try { G.hud.setHealth(G.player.health); } catch { /* ignore */ }
      }
    }
  }

  // Busted / wasted: delegate to main when it owns the flow, else respawn locally.
  function down(kind) {
    if (state.downCalled) return;
    state.downCalled = true;
    if (G && typeof G.onPlayerDown === 'function') {
      try { G.onPlayerDown(kind); } catch { /* main owns the outcome */ }
      return;
    }
    if (G) {
      G.mode = kind;
      const spawn = (G.world && G.world.playerSpawn)
        ? G.world.playerSpawn
        : new THREE.Vector3(0, 0, 52);
      if (G.player) {
        if (G.player.pos) G.player.pos.copy(spawn);
        if (G.player.mesh) G.player.mesh.position.copy(spawn);
        if (G.player.inCar && typeof G.player.exitCar === 'function') {
          try { G.player.exitCar(); } catch { /* ignore */ }
        }
        G.player.inCar = null;
        G.player.health = 100;
        if (typeof G.player.money === 'number') G.player.money = Math.max(0, G.player.money - 200);
      }
      state.wanted = 0;
      pruneCops(0, 0);
      syncWanted();
      if (G.hud && typeof G.hud.showMenu === 'function') {
        try { G.hud.showMenu(); } catch { /* HUD is optional */ }
      }
    }
  }

  function update(dt) {
    state.now += dt || 0;
    const mode = G ? G.mode : undefined;
    if (mode && mode !== 'playing') return;
    const p = playerPos();
    if (!p) return;
    if (G && G.player && typeof G.player.health === 'number') {
      if (G.player.health > 0) state.downCalled = false;
      else if (G.player.health <= 0) { down('wasted'); return; }
    }

    // ---- Spawn / prune to match the wanted level ----
    const wantCars = state.wanted >= 1 ? state.wanted : 0;
    const wantFoot = state.wanted >= 2 ? Math.min(state.wanted, 3) : 0;
    const cars = state.cops.filter((c) => c.kind === 'car');
    const feet = state.cops.filter((c) => c.kind === 'foot');
    pruneCops(wantCars, wantFoot);
    state.spawnTimer -= dt || 0;
    if ((cars.length < wantCars || feet.length < wantFoot) && state.spawnTimer <= 0) {
      state.spawnTimer = 0.5;
      if (cars.length < wantCars) spawnCopCar();
      else if (feet.length < wantFoot) spawnFootCop();
    }

    // ---- Chase behaviour ----
    let nearestCopDist = Infinity;
    for (const cop of [...state.cops]) {
      const dx = p.x - cop.pos.x;
      const dz = p.z - cop.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestCopDist) nearestCopDist = dist;
      const desired = Math.atan2(dx, dz);
      let diff = desired - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = cop.kind === 'car' ? 2.5 : 4;
      cop.heading += Math.max(-turn * dt, Math.min(turn * dt, diff));
      const speed = cop.kind === 'car' ? CAR_SPEED : FOOT_SPEED;
      cop.speed = speed;
      cop.pos.x += Math.sin(cop.heading) * speed * dt;
      cop.pos.z += Math.cos(cop.heading) * speed * dt;
      if (cop.group) {
        cop.group.position.set(cop.pos.x, 0, cop.pos.z);
        cop.group.rotation.y = cop.heading;
      }
      if (cop.car) {
        try {
          cop.car.heading = cop.heading;
          cop.car.speed = speed;
        } catch { /* ignore */ }
      }
      // Flash the light bar.
      if (cop.group && cop.group.userData && cop.group.userData.lightBar) {
        const [red, blue] = cop.group.userData.lightBar;
        const phase = Math.floor(state.now * 4) % 2 === 0;
        if (red && red.material) red.material.color.setHex(phase ? 0xff2222 : 0x550000);
        if (blue && blue.material) blue.material.color.setHex(phase ? 0x000055 : 0x2244ff);
      }
      cop.ramCooldown = Math.max(0, (cop.ramCooldown || 0) - dt);
      if (cop.kind === 'car') {
        // Ram on contact: hurt the player a little and slow their car.
        if (dist < RAM_DIST && cop.ramCooldown <= 0) {
          cop.ramCooldown = 1.2;
          damagePlayer(5);
          if (G.player && G.player.inCar && typeof G.player.inCar.speed === 'number') {
            G.player.inCar.speed *= 0.4;
          }
        }
        cop.closeTimer = 0;
      } else {
        // Foot cop: within 2u continuously for 2s = busted.
        if (dist < BUST_DIST) {
          cop.closeTimer += dt;
          if (cop.closeTimer >= BUST_TIME) { down('busted'); return; }
        } else {
          cop.closeTimer = 0;
        }
      }
    }

    // ---- Wanted decay: -1 per 8s with no recent crime and no cop within 40u ----
    if (state.wanted > 0 && (state.now - state.lastCrimeAt) >= DECAY_SECONDS && nearestCopDist > COP_SAFE_DIST) {
      state.decayTimer += dt || 0;
      if (state.decayTimer >= DECAY_SECONDS) {
        state.decayTimer = 0;
        setWanted(state.wanted - 1);
      }
    } else {
      state.decayTimer = 0;
    }
  }

  const api = {
    get wanted() { return state.wanted; },
    get cops() { return state.cops; },
    update,
    addHeat,
    setWanted,
    down, // extra: lets combat trigger the wasted flow
  };
  syncWanted();
  return api;
}
