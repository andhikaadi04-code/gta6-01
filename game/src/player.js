import * as THREE from 'three';

// Third-person on-foot controller for Marco Reyes.
// Movement is relative to the camera heading kept on G.cameraHeading
// (radians, same convention as object rotation.y: forward = (sin h, 0, cos h)).

const WALK_SPEED = 5;
const RUN_SPEED = 9;
const JUMP_VELOCITY = 6.5;
const GRAVITY = -18;
const PLAYER_RADIUS = 0.5;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function keyDown(G, code) {
  const input = G && G.input;
  if (!input) return false;
  if (input.keys && typeof input.keys.has === 'function') return input.keys.has(code);
  return false;
}

function pressedEdge(G, code, prev) {
  const input = G && G.input;
  if (input && typeof input.pressed === 'function') {
    try { return input.pressed(code); } catch { return false; }
  }
  const down = keyDown(G, code);
  const hit = down && !prev;
  return hit;
}

function buildPersonMesh(shirtColor, scale) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3440 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

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
  armL.castShadow = true;
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armR.position.set(0.36, 1.05, 0);
  armR.castShadow = true;
  group.add(armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pants);
  legL.position.set(-0.14, 0.37, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pants);
  legR.position.set(0.14, 0.37, 0);
  legR.castShadow = true;
  group.add(legR);

  group.scale.setScalar(scale || 1);
  group.userData.limbs = { armL, armR, legL, legR };
  return group;
}

// Resolve a circle (x, z, radius) against building AABBs by pushing it out
// along the smallest penetration axis. Returns nothing; mutates pos.
function resolveColliders(pos, radius, colliders) {
  if (!colliders) return;
  for (const c of colliders) {
    if (!c) continue;
    const minX = c.minX, maxX = c.maxX, minZ = c.minZ, maxZ = c.maxZ;
    if (pos.x + radius <= minX || pos.x - radius >= maxX ||
        pos.z + radius <= minZ || pos.z - radius >= maxZ) continue;
    const pushL = (pos.x + radius) - minX;
    const pushR = maxX - (pos.x - radius);
    const pushB = (pos.z + radius) - minZ;
    const pushF = maxZ - (pos.z - radius);
    const m = Math.min(pushL, pushR, pushB, pushF);
    if (m === pushL) pos.x = minX - radius;
    else if (m === pushR) pos.x = maxX + radius;
    else if (m === pushB) pos.z = minZ - radius;
    else pos.z = maxZ + radius;
  }
}

export function createPlayer(scene, G) {
  const world = (G && G.world) || {};
  const spawn = world.playerSpawn;
  const startPos = spawn
    ? new THREE.Vector3(spawn.x || 0, spawn.y || 0, spawn.z || 0)
    : new THREE.Vector3(0, 0, 0);

  const mesh = buildPersonMesh(0x2e6f8e, 1);
  mesh.position.copy(startPos);
  scene.add(mesh);

  const player = {
    mesh,
    pos: startPos,
    heading: 0,
    speed: 0,
    health: 100,
    money: 0,
    inCar: null,
    vy: 0,
    grounded: true,
    lastDamageAt: -100,

    damage(n) {
      this.health = Math.max(0, this.health - (n || 0));
      this.lastDamageAt = (G && typeof G.time === 'number') ? G.time : 0;
      return this.health <= 0;
    },

    enterCar(car) {
      if (!car) return;
      // Stealing a traffic car: the driver flees on foot.
      if (car.driver === 'traffic' && G && G.vehicles && typeof G.vehicles.jackCar === 'function') {
        G.vehicles.jackCar(car);
      } else {
        car.driver = 'player';
      }
      this.inCar = car;
      car.driver = 'player';
      this.mesh.visible = false;
      this.pos.copy(car.pos);
      this.mesh.position.copy(car.pos);
      this.speed = 0;
    },

    exitCar() {
      const car = this.inCar;
      if (!car) return;
      // Step out to the car's right side.
      const sideX = Math.cos(car.heading || 0);
      const sideZ = -Math.sin(car.heading || 0);
      this.pos.set(car.pos.x + sideX * 2.2, 0, car.pos.z + sideZ * 2.2);
      if (world.bounds) {
        this.pos.x = Math.min(world.bounds.maxX, Math.max(world.bounds.minX, this.pos.x));
        this.pos.z = Math.min(world.bounds.maxZ, Math.max(world.bounds.minZ, this.pos.z));
      }
      resolveColliders(this.pos, PLAYER_RADIUS, world.colliders);
      car.driver = null;
      car.speed = 0;
      this.inCar = null;
      this.heading = car.heading || 0;
      this.mesh.visible = true;
      this.mesh.position.copy(this.pos);
      this.vy = 0;
      this.grounded = true;
    },

    update(dt) {
      if (!dt || dt <= 0) return;
      dt = Math.min(dt, 0.05);

      // Riding in a car: just follow it, mesh hidden.
      if (this.inCar) {
        this.pos.copy(this.inCar.pos);
        this.pos.y = 0;
        this.heading = this.inCar.heading || 0;
        this.speed = Math.abs(this.inCar.speed || 0);
        this.mesh.position.copy(this.pos);
        this.mesh.rotation.y = this.heading;
        return;
      }

      if (this.health <= 0) {
        this.speed = 0;
        return;
      }

      const camHeading = (G && typeof G.cameraHeading === 'number')
        ? G.cameraHeading
        : this.heading;
      const fwdX = Math.sin(camHeading), fwdZ = Math.cos(camHeading);
      const rightX = Math.cos(camHeading), rightZ = -Math.sin(camHeading);

      let ix = 0, iz = 0;
      if (keyDown(G, 'KeyW') || keyDown(G, 'ArrowUp')) { ix += fwdX; iz += fwdZ; }
      if (keyDown(G, 'KeyS') || keyDown(G, 'ArrowDown')) { ix -= fwdX; iz -= fwdZ; }
      if (keyDown(G, 'KeyD') || keyDown(G, 'ArrowRight')) { ix += rightX; iz += rightZ; }
      if (keyDown(G, 'KeyA') || keyDown(G, 'ArrowLeft')) { ix -= rightX; iz -= rightZ; }

      const running = keyDown(G, 'ShiftLeft') || keyDown(G, 'ShiftRight');
      const targetSpeed = (ix !== 0 || iz !== 0) ? (running ? RUN_SPEED : WALK_SPEED) : 0;

      // E: enter / exit nearest car (edge-triggered).
      const eHit = pressedEdge(G, 'KeyE', this._prevE);
      this._prevE = keyDown(G, 'KeyE');
      if (eHit) {
        const nearest = (G && G.vehicles && typeof G.vehicles.nearestCar === 'function')
          ? G.vehicles.nearestCar(this.pos, 3)
          : null;
        if (nearest) this.enterCar(nearest);
      }

      // Jump (edge-triggered via Space held check + grounded).
      if ((keyDown(G, 'Space')) && this.grounded) {
        this.vy = JUMP_VELOCITY;
        this.grounded = false;
      }

      // Move with per-axis slide against building colliders.
      let moveX = 0, moveZ = 0;
      if (ix !== 0 || iz !== 0) {
        const len = Math.hypot(ix, iz);
        moveX = (ix / len) * targetSpeed * dt;
        moveZ = (iz / len) * targetSpeed * dt;
        const wantHeading = Math.atan2(ix, iz);
        this.heading = angleLerp(this.heading, wantHeading, Math.min(1, dt * 12));
      }
      this.speed = (ix !== 0 || iz !== 0) ? targetSpeed : 0;

      this.pos.x += moveX;
      resolveColliders(this.pos, PLAYER_RADIUS, world.colliders);
      this.pos.z += moveZ;
      resolveColliders(this.pos, PLAYER_RADIUS, world.colliders);

      // Vertical: jump / gravity.
      if (!this.grounded) {
        this.vy += GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= 0) {
          this.pos.y = 0;
          this.vy = 0;
          this.grounded = true;
        }
      }

      // Stay inside city bounds.
      if (world.bounds) {
        this.pos.x = Math.min(world.bounds.maxX, Math.max(world.bounds.minX, this.pos.x));
        this.pos.z = Math.min(world.bounds.maxZ, Math.max(world.bounds.minZ, this.pos.z));
      }

      // Animate limbs while moving.
      const limbs = mesh.userData.limbs;
      if (limbs) {
        const swing = this.speed > 0 ? Math.sin((G && G.time ? G.time : 0) * (running ? 13 : 9)) * 0.55 : 0;
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
        limbs.armL.rotation.x = -swing * 0.8;
        limbs.armR.rotation.x = swing * 0.8;
      }

      mesh.position.copy(this.pos);
      mesh.rotation.y = this.heading;
    },
  };

  if (G) G.player = player;
  return player;
}
