// Screenshot scenes for SOLMAR BAY: ?shot=start|play|end (with &seed=N).
// Deterministic via an inline mulberry32 (seed param, default 1) — the
// coordinator's random.js is NOT imported. localStorage is never touched in
// shot mode. After ~2.2 s, window.__shotReady is set (only if a renderer
// exists, i.e. the scene is actually rendering); any error sets
// window.__shotError instead. Returns nothing.

import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAR_COLORS = ['red', 'yellow', 'blue', 'white', 'black', 'teal'];
const ROAD_COORDS = [-104, -52, 0, 52, 104];

function el(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function showEl(id, display) {
  const e = el(id);
  if (e) e.style.display = display;
}

function setCamera(G, px, py, pz, lx, ly, lz) {
  try {
    if (!G || !G.camera) return;
    if (G.camera.position && typeof G.camera.position.set === 'function') {
      G.camera.position.set(px, py, pz);
    } else if (G.camera.position) {
      G.camera.position.x = px;
      G.camera.position.y = py;
      G.camera.position.z = pz;
    }
    if (typeof G.camera.lookAt === 'function') {
      G.camera.lookAt(new THREE.Vector3(lx, ly, lz));
    }
  } catch { /* camera framing is best-effort */ }
}

function setPlayerPos(G, x, z, heading) {
  try {
    if (!G || !G.player) return;
    if (G.player.pos) {
      G.player.pos.x = x;
      if (typeof G.player.pos.z === 'number') G.player.pos.z = z;
      if (typeof G.player.pos.y === 'number') G.player.pos.y = 0;
    }
    if (typeof heading === 'number') G.player.heading = heading;
    if (G.player.mesh && G.player.mesh.position) {
      G.player.mesh.position.x = x;
      G.player.mesh.position.z = z;
    }
  } catch { /* player placement is best-effort */ }
}

// Put the player in a car on an avenue (the road at x=avenue, running along
// Z) and return the car (or null). Everything is guarded: other modules
// may not exist yet when this runs.
function placePlayerInCar(G, rng, avenue, zOverride) {
  let car = null;
  let x = typeof avenue === 'number' ? avenue : 0;
  let z = 30;
  try {
    if (G && G.world && Array.isArray(G.world.carSpawns) && G.world.carSpawns.length) {
      const s = G.world.carSpawns[Math.floor(rng() * G.world.carSpawns.length)];
      if (s && typeof s.x === 'number') { z = s.z; }
    }
  } catch { /* fall back to the avenue default */ }
  // An explicit z stages the car at a chosen point on the avenue (the end
  // shot parks north of the club so the beacon is ahead, down the road).
  if (typeof zOverride === 'number') z = zOverride;
  // Keep the player on the chosen avenue: snap x to its road.
  x = typeof avenue === 'number' ? avenue : 0;
  // Nudge along the avenue until the spot is clear of other cars.
  for (let tries = 0; tries < 6 && tooClose(G, x, z, 10); tries += 1) z += 15;
  const heading = 0; // facing along -Z down the avenue (main.js camera follow takes over)
  try {
    if (G && G.vehicles && typeof G.vehicles.spawnCar === 'function') {
      const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      try {
        car = G.vehicles.spawnCar({ x, z }, color, { driver: 'player' });
      } catch {
        try {
          car = G.vehicles.spawnCar({ x, z }, color);
        } catch {
          car = null;
        }
      }
    }
  } catch { car = null; }
  if (!car) {
    try {
      const cars = (G && Array.isArray(G.cars)) ? G.cars : [];
      for (const c of cars) {
        if (!c) continue;
        const p = c.pos || (c.group && c.group.position);
        if (p && Math.abs(p.x - x) < 5 && Math.abs(p.z - z) < 5) { car = c; break; }
      }
    } catch { car = null; }
  }
  setPlayerPos(G, x, z, heading);
  try {
    if (car) {
      if (G.player && typeof G.player.enterCar === 'function') {
        G.player.enterCar(car);
      } else if (G.player) {
        G.player.inCar = car;
      }
      if (typeof car.speed === 'number') car.speed = 9;
      if (typeof car.heading === 'number') car.heading = heading;
    }
  } catch { /* entering the car is best-effort */ }
  // Third-person camera behind the car; main.js's follow takes over after.
  setCamera(G, x + 9, 5, z + 13, x, 1.5, z - 10);
  return car;
}

function spawnTraffic(G, rng, count) {
  for (let i = 0; i < count; i += 1) {
    try {
      if (!G || !G.vehicles || typeof G.vehicles.spawnCar !== 'function') return;
      const axis = rng() < 0.5 ? 'x' : 'z';
      const road = ROAD_COORDS[Math.floor(rng() * ROAD_COORDS.length)];
      const along = (rng() * 2 - 1) * 140;
      const pos = axis === 'x' ? { x: along, z: road } : { x: road, z: along };
      if (tooClose(G, pos.x, pos.z, 10)) continue;
      const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      G.vehicles.spawnCar(pos, color);
    } catch { /* one failed traffic car must not stop the rest */ }
  }
}

function spawnPeds(G, rng, count) {
  for (let i = 0; i < count; i += 1) {
    try {
      if (!G || !G.pedestrians || typeof G.pedestrians.spawnPed !== 'function') return;
      const road = ROAD_COORDS[Math.floor(rng() * ROAD_COORDS.length)];
      const along = (rng() * 2 - 1) * 140;
      const off = (rng() < 0.5 ? -1 : 1) * (8 + rng() * 4);
      const pos = rng() < 0.5 ? { x: along, z: road + off } : { x: road + off, z: along };
      if (tooClose(G, pos.x, pos.z, 12)) continue;
      G.pedestrians.spawnPed(pos);
    } catch { /* one failed ped must not stop the rest */ }
  }
}

function showHudHideMenu(G) {
  try {
    if (G && G.hud && typeof G.hud.hideMenu === 'function') G.hud.hideMenu();
    else showEl('menu', 'none');
  } catch { showEl('menu', 'none'); }
  // NOTE: #hud starts with class "hidden", whose CSS is `display:none !important`,
  // so an inline display alone cannot reveal it — the class must come off.
  const hud = el('hud');
  if (hud) { hud.classList.remove('hidden'); hud.style.display = 'block'; }
  const menu = el('menu');
  if (menu) menu.classList.add('hidden');
  showEl('minimap', 'block');
}

// True when (x, z) is too close to any car or to the player (keeps staged
// traffic and peds out of the camera and out of each other).
function tooClose(G, x, z, minDist) {
  try {
    const cars = (G && Array.isArray(G.cars)) ? G.cars : [];
    for (const c of cars) {
      const p = c && (c.pos || (c.group && c.group.position));
      if (p && Math.hypot(p.x - x, p.z - z) < minDist) return true;
    }
    if (G && G.player && G.player.pos) {
      if (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < minDist) return true;
    }
  } catch { /* treat as clear */ }
  return false;
}

// The staged player starts with the same $250 a new game does, so the HUD
// reads like real play instead of a broke $0.
function setShotMoney(G) {
  try {
    if (G && G.player && typeof G.player.money === 'number') {
      G.player.money = 250;
      if (G.hud && typeof G.hud.setMoney === 'function') G.hud.setMoney(250);
    }
  } catch { /* money is decorative */ }
}

export function setupShots(G) {
  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  const shot = params.get('shot');
  if (!shot) return;

  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 1;
  const rng = mulberry32(seed);

  try {
    if (shot === 'start') {
      if (G) G.mode = 'menu';
      // Menu over a scenic vista: high above the south edge, beach in the
      // foreground (z > +150), skyline beyond to the north.
      setCamera(G, 55, 105, 265, 0, 8, -60);
      try {
        if (G && G.hud && typeof G.hud.showMenu === 'function') G.hud.showMenu();
        else showEl('menu', 'block');
      } catch { showEl('menu', 'block'); }
      showEl('hud', 'none');
      showEl('pause', 'none');
      showEl('busted', 'none');
      showEl('wasted', 'none');
    } else if (shot === 'play') {
      if (G) G.mode = 'playing';
      showHudHideMenu(G);
      setShotMoney(G);
      placePlayerInCar(G, rng, 0);
      spawnTraffic(G, rng, 6);
      spawnPeds(G, rng, 8);
      try {
        if (G && G.hud && typeof G.hud.setObjective === 'function') {
          G.hud.setObjective("First Wheels — steal a car, drive to Lena's garage");
        }
      } catch { /* objective text is decorative */ }
    } else if (shot === 'end') {
      if (G) G.mode = 'playing';
      showHudHideMenu(G);
      setShotMoney(G);
      // Stage on the club's avenue (x=52), north of the club (z=-104) so the
      // heist beacon is ahead down the road. Cars face +Z at heading 0, so
      // "ahead" is +Z: the player drives south toward the club.
      const car = placePlayerInCar(G, rng, 52, -140);
      void car;
      // Wanted 3.
      try {
        if (G && G.police && typeof G.police.setWanted === 'function') G.police.setWanted(3);
        else if (G && G.police) G.police.wanted = 3;
      } catch {
        try { if (G && G.police) G.police.wanted = 3; } catch { /* ignore */ }
      }
      try {
        if (G && G.hud && typeof G.hud.setWanted === 'function') G.hud.setWanted(3);
      } catch { /* stars are decorative */ }
      // Three police cars ahead on the same avenue (+Z is forward), closing
      // in — visible in frame, head-on, as a roadblock chase.
      const avenueX = 52;
      const playerZ = (G && G.player && G.player.pos) ? G.player.pos.z : -140;
      for (let i = 0; i < 3; i += 1) {
        try {
          if (!G || !G.vehicles || typeof G.vehicles.spawnCar !== 'function') break;
          const cop = G.vehicles.spawnCar({ x: avenueX + (rng() * 2 - 1) * 5, z: playerZ + 28 + i * 14 }, i % 2 ? 'white' : 'black', { isPolice: true, driver: 'police' });
          if (cop) {
            try { cop.isPolice = true; } catch { /* ignore */ }
            try {
              if (G.police && Array.isArray(G.police.cops)) G.police.cops.push(cop);
            } catch { /* the police module owns its own list */ }
          }
        } catch { /* one failed cop car must not stop the rest */ }
      }
      // Mission 5 ("Bay Heist") active with its marker visible.
      try {
        if (G && G.missions && typeof G.missions.startMission === 'function') {
          G.missions.startMission(4);
        } else if (G && G.missions) {
          G.missions.index = 4;
        }
      } catch {
        try { if (G && G.missions) G.missions.index = 4; } catch { /* ignore */ }
      }
      try {
        if (G && G.hud && typeof G.hud.setObjective === 'function') {
          G.hud.setObjective('Bay Heist — reach the Meridian Club, grab the cash, escape!');
        }
      } catch { /* objective text is decorative */ }
      spawnTraffic(G, rng, 4);
      spawnPeds(G, rng, 5);
    } else {
      // Unknown shot name: fall back to the menu vista.
      if (G) G.mode = 'menu';
      setCamera(G, 55, 105, 265, 0, 8, -60);
      showEl('menu', 'block');
      showEl('hud', 'none');
    }
  } catch (err) {
    try {
      window.__shotError = err && err.message ? String(err.message) : String(err);
    } catch { /* nothing left to report through */ }
    return;
  }

  // Ready signal: only once the scene is actually rendering. The settle is
  // long on purpose: under software rendering only a few frames run per
  // second, so the camera and traffic need real seconds to reach their
  // staged positions.
  setTimeout(() => {
    try {
      if (G && G.renderer) {
        window.__shotReady = true;
      } else {
        window.__shotError = 'shots: no renderer — scene is not rendering';
      }
    } catch (err) {
      try {
        window.__shotError = err && err.message ? String(err.message) : String(err);
      } catch { /* nothing left to report through */ }
    }
  }, 6000);
}
