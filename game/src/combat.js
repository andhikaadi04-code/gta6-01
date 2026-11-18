// combat.js — punch, pistol, ammo crates, club guards, health regen (worker 3: systems).
// Contract: createCombat(scene, G) -> { update(dt), punch(), shoot(), ammo }
// F punches (2.2u, 25 dmg, knockback). Left mouse shoots (raycast, 34 dmg,
// muzzle flash + tracer, 12 ammo, R reloads in 1s). +6 ammo at two green crates.
// Mission 5 ("Bay Heist") spawns 3 club guards that shoot back.
import * as THREE from 'three';

const MAG_SIZE = 12;
const PUNCH_RANGE = 2.2;
const PUNCH_DMG = 25;
const SHOT_DMG = 34;
const SHOT_RANGE = 100;
const REGEN_DELAY = 5;
const REGEN_RATE = 4;
const CLUB = { x: 52, z: -104 }; // Meridian Club (same spot as missions.js)
const CRATE_SPOTS = [
  { x: -46, z: -46 }, // near Lena's garage
  { x: 6, z: 150 }, // near the pier
];
const CRATE_RESPAWN = 30;

export function createCombat(scene, G) {
  const state = {
    ammo: MAG_SIZE,
    reloading: false,
    reloadTimer: 0,
    punchCooldown: 0,
    now: 0,
    prevMouseDown: false,
    prevF: false,
    prevR: false,
    lastHealth: 100,
    lastDamageAt: -1e9,
    guardsSpawned: false,
    guardsMission: null,
    downCalled: false,
    tracers: [], // { line, life }
    flashTimer: 0,
  };

  // ---- Muzzle flash: small emissive quad at the player, shown briefly ----
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), flashMat);
  flash.visible = false;
  if (scene && typeof scene.add === 'function') scene.add(flash);

  // ---- Ammo crates: small green boxes at fixed spots ----
  const crates = CRATE_SPOTS.map((spot) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x0a4418 }),
    );
    mesh.position.set(spot.x, 0.4, spot.z);
    if (scene && typeof scene.add === 'function') scene.add(mesh);
    return { mesh, x: spot.x, z: spot.z, taken: false, respawnTimer: 0 };
  });

  const guards = []; // local list of guard ped objects (also in G.peds)

  function playerPos() {
    if (!G || !G.player) return null;
    if (G.player.pos) return G.player.pos;
    if (G.player.mesh && G.player.mesh.position) return G.player.mesh.position;
    return null;
  }

  function showMessage(text, dur) {
    if (G && G.hud && typeof G.hud.showMessage === 'function') {
      try { G.hud.showMessage(text, dur || 3); } catch { /* HUD is optional */ }
    }
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

  function downPlayer(kind) {
    if (state.downCalled) return;
    state.downCalled = true;
    if (G && G.police && typeof G.police.down === 'function') {
      try { G.police.down(kind); } catch { /* ignore */ }
    } else if (G && typeof G.onPlayerDown === 'function') {
      try { G.onPlayerDown(kind); } catch { /* ignore */ }
    } else if (G) {
      G.mode = kind;
    }
  }

  function alivePeds() {
    if (!G || !Array.isArray(G.peds)) return [];
    return G.peds.filter((p) => p && p.state !== 'dead' && p.group);
  }

  function findPedForObject(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.pedRef) return o.userData.pedRef;
      o = o.parent;
    }
    return null;
  }

  function hurtPed(ped, dmg, fromPos) {
    if (!ped || typeof ped.health !== 'number') return;
    ped.health -= dmg;
    if (fromPos && ped.pos) {
      const dx = ped.pos.x - fromPos.x;
      const dz = ped.pos.z - fromPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      ped.pos.x += (dx / len) * 1.5;
      ped.pos.z += (dz / len) * 1.5;
      if (ped.group) ped.group.position.set(ped.pos.x, 0, ped.pos.z);
    }
    if (ped.health <= 0) {
      ped.health = 0;
      ped.state = 'dead';
      if (ped.group) {
        ped.group.rotation.z = Math.PI / 2;
        ped.group.position.y = 0.3;
      }
      if (G && G.police && typeof G.police.addHeat === 'function') {
        try { G.police.addHeat(1); } catch { /* police is optional */ }
      }
      const gi = guards.indexOf(ped);
      if (gi >= 0) guards.splice(gi, 1);
    } else if (ped.state !== 'flee') {
      ped.state = 'flee';
    }
  }

  function addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    if (scene && typeof scene.add === 'function') scene.add(line);
    state.tracers.push({ line, life: 0.15 });
  }

  function updateTracers(dt) {
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      const tr = state.tracers[i];
      tr.life -= dt;
      if (tr.line.material) tr.line.material.opacity = Math.max(0, tr.life / 0.15) * 0.9;
      if (tr.life <= 0) {
        if (scene && typeof scene.remove === 'function') {
          try { scene.remove(tr.line); } catch { /* ignore */ }
        }
        if (tr.line.geometry) tr.line.geometry.dispose();
        if (tr.line.material) tr.line.material.dispose();
        state.tracers.splice(i, 1);
      }
    }
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      flashMat.opacity = Math.max(0, state.flashTimer / 0.06);
      if (state.flashTimer <= 0) flash.visible = false;
    }
  }

  function playerForward(out) {
    const v = out || new THREE.Vector3();
    if (G && G.player && G.player.mesh && typeof G.player.mesh.getWorldDirection === 'function') {
      try { G.player.mesh.getWorldDirection(v); v.y = 0; v.normalize(); return v; } catch { /* fall through */ }
    }
    const h = (G && G.player && typeof G.player.heading === 'number') ? G.player.heading : 0;
    v.set(Math.sin(h), 0, Math.cos(h));
    return v;
  }

  function punch() {
    if (state.punchCooldown > 0) return;
    const pos = playerPos();
    if (!pos) return;
    state.punchCooldown = 0.4;
    const fwd = playerForward(new THREE.Vector3());
    let best = null;
    let bestDist = PUNCH_RANGE;
    for (const ped of alivePeds()) {
      if (!ped.pos) continue;
      const dx = ped.pos.x - pos.x;
      const dz = ped.pos.z - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > bestDist) continue;
      // Must be in front of the player.
      const dot = d > 0.001 ? (dx * fwd.x + dz * fwd.z) / d : 1;
      if (dot < 0.3) continue;
      best = ped;
      bestDist = d;
    }
    if (best) {
      hurtPed(best, PUNCH_DMG, pos);
      if (G && G.audio && typeof G.audio.punch === 'function') {
        try { G.audio.punch(); } catch { /* audio is optional */ }
      }
    }
  }

  function shoot() {
    if (state.reloading) return;
    if (state.ammo <= 0) {
      showMessage('Out of ammo — press R to reload', 1.5);
      return;
    }
    const pos = playerPos();
    if (!pos) return;
    state.ammo -= 1;
    const muzzle = new THREE.Vector3(pos.x, 1.5, pos.z);
    const fwd = playerForward(new THREE.Vector3());
    muzzle.addScaledVector(fwd, 0.6);

    // Muzzle flash at the player.
    flash.position.copy(muzzle);
    if (G && G.camera) flash.lookAt(G.camera.position);
    flash.visible = true;
    flashMat.opacity = 1;
    state.flashTimer = 0.06;

    // Raycast from the camera centre; first ped hit takes the damage.
    let end = null;
    let hitPed = null;
    if (G && G.camera && typeof G.camera.updateMatrixWorld === 'function') {
      const ray = new THREE.Raycaster();
      try {
        ray.setFromCamera(new THREE.Vector2(0, 0), G.camera);
        ray.far = SHOT_RANGE;
        const groups = alivePeds().map((p) => p.group);
        const hits = groups.length > 0 ? ray.intersectObjects(groups, true) : [];
        if (hits.length > 0) {
          hitPed = findPedForObject(hits[0].object);
          end = hits[0].point.clone();
        }
      } catch { /* raycast failed — fall back to forward shot below */ }
    }
    if (!end) {
      // No camera raycast (or a miss): the shot flies straight ahead.
      end = muzzle.clone().addScaledVector(fwd, 50);
      // Still allow a close forward hit without a camera (e.g. headless/tests).
      if (!hitPed) {
        for (const ped of alivePeds()) {
          if (!ped.pos) continue;
          const dx = ped.pos.x - pos.x;
          const dz = ped.pos.z - pos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 12) continue;
          const dot = d > 0.001 ? (dx * fwd.x + dz * fwd.z) / d : 1;
          if (dot > 0.9) { hitPed = ped; end = new THREE.Vector3(ped.pos.x, 1.3, ped.pos.z); break; }
        }
      }
    }
    if (hitPed) hurtPed(hitPed, SHOT_DMG, pos);
    addTracer(muzzle, end);
    if (G && G.audio && typeof G.audio.shot === 'function') {
      try { G.audio.shot(); } catch { /* audio is optional */ }
    }
    if (G && G.police && typeof G.police.addHeat === 'function') {
      try { G.police.addHeat(1); } catch { /* police is optional */ }
    }
  }

  function reload() {
    if (state.reloading || state.ammo >= MAG_SIZE) return;
    state.reloading = true;
    state.reloadTimer = 1;
  }

  // ---- Club guards for mission 5 ----
  function buildGuardMesh() {
    const group = new THREE.Group();
    const suit = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const shirt = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.35), suit);
    torso.position.y = 1.15;
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.05), shirt);
    tie.position.set(0, 1.2, 0.19);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.72;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), suit);
    legL.position.set(-0.15, 0.38, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    group.add(torso, tie, head, legL, legR);
    return group;
  }

  function spawnGuards() {
    const offsets = [[-4, -3], [4, -4], [0, 5]];
    for (const [ox, oz] of offsets) {
      const group = buildGuardMesh();
      const px = CLUB.x + ox;
      const pz = CLUB.z + oz;
      group.position.set(px, 0, pz);
      if (scene && typeof scene.add === 'function') scene.add(group);
      const guard = {
        group,
        pos: new THREE.Vector3(px, 0, pz),
        heading: 0, speed: 0,
        state: 'walk', health: 100,
        isGuard: true, shootTimer: 0.5 + Math.random(),
      };
      group.userData.pedRef = guard;
      guards.push(guard);
      if (G && Array.isArray(G.peds)) G.peds.push(guard);
    }
    state.guardsSpawned = true;
    showMessage('Club guards! They are armed — take cover or take them out.', 4);
  }

  function losClear(a, b) {
    // Cheap line-of-sight: segment at chest height vs building AABBs (XZ only).
    const colliders = (G && G.world && Array.isArray(G.world.colliders)) ? G.world.colliders : [];
    for (const c of colliders) {
      if (typeof c.minX !== 'number') continue;
      // Slab test for the 2D segment against the rect.
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      let t0 = 0;
      let t1 = 1;
      let blocked = true;
      const axes = [
        { d: dx, min: c.minX - a.x, max: c.maxX - a.x },
        { d: dz, min: c.minZ - a.z, max: c.maxZ - a.z },
      ];
      for (const ax of axes) {
        if (Math.abs(ax.d) < 1e-9) {
          if (ax.min > 0 || ax.max < 0) { blocked = false; break; }
        } else {
          let ta = ax.min / ax.d;
          let tb = ax.max / ax.d;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { blocked = false; break; }
        }
      }
      if (blocked) return false;
    }
    return true;
  }

  function updateGuards(dt) {
    const pos = playerPos();
    if (!pos) return;
    for (const guard of [...guards]) {
      if (guard.state === 'dead') continue;
      guard.shootTimer -= dt;
      const dx = pos.x - guard.pos.x;
      const dz = pos.z - guard.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 25 || guard.shootTimer > 0) continue;
      guard.shootTimer = 1.5;
      if (!losClear(guard.pos, pos)) continue;
      const from = new THREE.Vector3(guard.pos.x, 1.4, guard.pos.z);
      const to = new THREE.Vector3(pos.x, 1.3, pos.z);
      addTracer(from, to);
      damagePlayer(8);
      if (G && G.audio && typeof G.audio.shot === 'function') {
        try { G.audio.shot(); } catch { /* audio is optional */ }
      }
    }
  }

  function update(dt) {
    state.now += dt || 0;
    state.punchCooldown = Math.max(0, state.punchCooldown - (dt || 0));
    updateTracers(dt || 0);
    const mode = G ? G.mode : undefined;
    if (mode && mode !== 'playing') return;
    if (!G || !G.player) return;

    // ---- Input edges: F punch, R reload, left mouse shoot ----
    const input = G.input || {};
    const fDown = typeof input.pressed === 'function'
      ? !!input.pressed('KeyF')
      : (!!input.keys && input.keys.has('KeyF') && !state.prevF);
    const rDown = typeof input.pressed === 'function'
      ? !!input.pressed('KeyR')
      : (!!input.keys && input.keys.has('KeyR') && !state.prevR);
    if (input.keys) {
      state.prevF = input.keys.has('KeyF');
      state.prevR = input.keys.has('KeyR');
    }
    if (fDown) punch();
    if (rDown) reload();
    const mouseDown = !!input.mouseDown;
    if (mouseDown && !state.prevMouseDown) shoot();
    state.prevMouseDown = mouseDown;

    // ---- Reload timer ----
    if (state.reloading) {
      state.reloadTimer -= dt || 0;
      if (state.reloadTimer <= 0) {
        state.reloading = false;
        state.ammo = MAG_SIZE;
      }
    }

    // ---- Health regen: +4/s after 5s without damage ----
    if (typeof G.player.health === 'number') {
      if (G.player.health < state.lastHealth) state.lastDamageAt = state.now;
      state.lastHealth = G.player.health;
      if (G.player.health <= 0) {
        downPlayer('wasted');
        return;
      }
      if (state.now - state.lastDamageAt > REGEN_DELAY && G.player.health < 100) {
        G.player.health = Math.min(100, G.player.health + REGEN_RATE * (dt || 0));
        if (G.hud && typeof G.hud.setHealth === 'function') {
          try { G.hud.setHealth(G.player.health); } catch { /* ignore */ }
        }
      }
      if (G.player.health > 0) state.downCalled = false;
    }

    // ---- Ammo crates: walk within 2u to collect +6 (respawn after 30s) ----
    const pos = playerPos();
    if (pos) {
      for (const crate of crates) {
        if (crate.taken) {
          crate.respawnTimer -= dt || 0;
          if (crate.respawnTimer <= 0) {
            crate.taken = false;
            if (crate.mesh) crate.mesh.visible = true;
          }
          continue;
        }
        const dx = pos.x - crate.x;
        const dz = pos.z - crate.z;
        if (Math.sqrt(dx * dx + dz * dz) <= 2) {
          crate.taken = true;
          crate.respawnTimer = CRATE_RESPAWN;
          if (crate.mesh) crate.mesh.visible = false;
          state.ammo = Math.min(MAG_SIZE, state.ammo + 6);
          if (G && G.audio && typeof G.audio.pickup === 'function') {
            try { G.audio.pickup(); } catch { /* audio is optional */ }
          }
          showMessage('Picked up ammo +6', 2);
        }
      }
    }

    // ---- Mission 5 guards: spawn once when Bay Heist becomes current ----
    const missionId = (G.missions && G.missions.current && G.missions.current.id)
      || (G.missions && typeof G.missions.index === 'number' && G.missions.index === 4 ? 'bay-heist' : null);
    if (missionId === 'bay-heist' && !state.guardsSpawned) spawnGuards();
    if (missionId !== 'bay-heist' && state.guardsSpawned && guards.length === 0) {
      state.guardsSpawned = false; // allow a fresh spawn on a retry
    }
    updateGuards(dt || 0);
  }

  return {
    update,
    punch,
    shoot,
    get ammo() { return state.ammo; },
  };
}
