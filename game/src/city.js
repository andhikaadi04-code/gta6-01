// SOLMAR BAY — city / world module.
// Builds the fictional sun-soaked coastal city: 7x7 grid of blocks, beach and
// ocean to the south, pier, palms, lamps, warm late-afternoon lighting.
// Exports exactly: buildCity(scene, rng) -> world object (see DESIGN.md).

import * as THREE from 'three';

// ---- grid constants (from DESIGN.md) --------------------------------------
const ROAD_CENTRES = [-156, -104, -52, 0, 52, 104, 156]; // road centre lines
const ROAD_WIDTH = 12;
const BLOCK_SIZE = 40; // pitch between road centre lines is 52; block face is 40
const CITY_HALF = 162; // road edge: 156 + 6
const BEACH_Z0 = CITY_HALF; // beach starts at the south road edge
const BEACH_Z1 = 208; // sand strip z-range
const OCEAN_Z1 = 560; // ocean extends far south
const PIER_X = 0;
const PIER_Z0 = 196;
const PIER_Z1 = 238;

// Pastel palette: cream, terracotta, teal, coral, sand (+ a few accents).
const PALETTE = [
  0xf2e3c6, // cream
  0xe8d9b0, // sand
  0xd97b54, // terracotta
  0xc96f4a, // terracotta deep
  0x4fa8a0, // teal
  0x3f8f96, // teal deep
  0xf08a6b, // coral
  0xe87a5d, // coral deep
  0xf6ead2, // pale cream
  0x9fc3c0, // pale teal
  0xd9a441, // warm ochre
];

const PLAZA_TINTS = [0xd8d2c4, 0xcfc9b8, 0xdcd6c8, 0xc9c2ae];

function mulberryHelpers(rng) {
  const rand = (a, b) => a + rng() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;
  return { rand, randi, pick, chance };
}

export function buildCity(scene, rng) {
  const { rand, randi, pick, chance } = mulberryHelpers(rng);

  const colliders = [];
  const roads = [];
  const carSpawns = [];
  const pedSpawns = [];

  // Materials (shared where possible to keep draw state small).
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const groundMat = lambert(0xb9b3a4); // warm concrete base
  const asphaltMat = lambert(0x3a3a40);
  const sidewalkMat = lambert(0xcfc9bb);
  const sandMat = lambert(0xe6cf9e);
  const woodMat = lambert(0x8a6b4a);
  const woodDarkMat = lambert(0x6e543a);
  const trunkMat = lambert(0x7a5a3c);
  const frondMat = lambert(0x3f8f4f);
  const poleMat = lambert(0x2e2e34);
  const lampHeadMat = new THREE.MeshLambertMaterial({
    color: 0xfff2c0,
    emissive: 0xffdf80,
    emissiveIntensity: 0.9,
  });
  const buildingMats = PALETTE.map((c) => lambert(c));
  const roofMats = [lambert(0x8a7a68), lambert(0x6e6258), lambert(0xa89a80)];

  const addBox = (parent, w, h, d, x, y, z, mat, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    parent.add(m);
    return m;
  };

  // ---- sky, fog, lighting ---------------------------------------------------
  scene.background = new THREE.Color(0x9ec8e8); // warm late-afternoon sky
  scene.fog = new THREE.Fog(0xa8c8e0, 320, 720); // light-blue haze

  const sun = new THREE.DirectionalLight(0xffd9a3, 1.9); // warm low sun
  sun.position.set(180, 170, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75);
  scene.add(hemi);

  // ---- ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    groundMat
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 120); // covers the city, beach and near ocean
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- roads (dark asphalt strips) + dashed centre lines --------------------
  // Dashed centre line texture: one shared canvas texture, repeated along
  // the road length, so each road needs a single thin plane.
  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 8;
  dashCanvas.height = 64;
  const dctx = dashCanvas.getContext('2d');
  dctx.fillStyle = '#3a3a40';
  dctx.fillRect(0, 0, 8, 64);
  dctx.fillStyle = '#f5d76e'; // warm yellow dash
  dctx.fillRect(3, 8, 2, 32);
  const dashTex = new THREE.CanvasTexture(dashCanvas);
  dashTex.wrapS = THREE.RepeatWrapping;
  dashTex.wrapT = THREE.RepeatWrapping;
  dashTex.repeat.set(1, 40); // ~one dash per 8 units over 320 length
  // Canvas dash runs along V; X-roads need it along U, so rotate 90 deg.
  dashTex.center.set(0.5, 0.5);
  dashTex.rotation = Math.PI / 2;

  const dashMatX = new THREE.MeshLambertMaterial({ map: dashTex });
  // Z-running roads need the texture unrotated (dash along V = along the road).
  const dashTexZ = dashTex.clone();
  dashTexZ.rotation = 0;
  dashTexZ.needsUpdate = true;
  const dashMatZ = new THREE.MeshLambertMaterial({ map: dashTexZ });

  const roadLen = CITY_HALF * 2; // -162..162

  for (const c of ROAD_CENTRES) {
    // Road running along X at z = c.
    const rx = new THREE.Mesh(
      new THREE.PlaneGeometry(roadLen, ROAD_WIDTH),
      asphaltMat
    );
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.02, c);
    rx.receiveShadow = true;
    scene.add(rx);
    const dx = new THREE.Mesh(
      new THREE.PlaneGeometry(roadLen, 0.6),
      dashMatX
    );
    dx.rotation.x = -Math.PI / 2;
    dx.position.set(0, 0.04, c);
    scene.add(dx);
    roads.push({ axis: 'x', coord: c, from: -CITY_HALF, to: CITY_HALF });

    // Road running along Z at x = c.
    const rz = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, roadLen),
      asphaltMat
    );
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(c, 0.02, 0);
    rz.receiveShadow = true;
    scene.add(rz);
    const dz = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, roadLen),
      dashMatZ
    );
    dz.rotation.x = -Math.PI / 2;
    dz.position.set(c, 0.04, 0);
    scene.add(dz);
    roads.push({ axis: 'z', coord: c, from: -CITY_HALF, to: CITY_HALF });
  }

  // ---- sidewalks: light strips flanking every road ---------------------------
  const walkGeoX = new THREE.PlaneGeometry(roadLen, 3);
  const walkGeoZ = new THREE.PlaneGeometry(3, roadLen);
  for (const c of ROAD_CENTRES) {
    for (const off of [-7.5, 7.5]) {
      const sx = new THREE.Mesh(walkGeoX, sidewalkMat);
      sx.rotation.x = -Math.PI / 2;
      sx.position.set(0, 0.03, c + off);
      sx.receiveShadow = true;
      scene.add(sx);
      const sz = new THREE.Mesh(walkGeoZ, sidewalkMat);
      sz.rotation.x = -Math.PI / 2;
      sz.position.set(c + off, 0.03, 0);
      sz.receiveShadow = true;
      scene.add(sz);
    }
  }

  // ---- palm tree factory (defined before the block loop uses it) --------------
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6);
  const frondGeo = new THREE.ConeGeometry(0.9, 2.6, 5);
  function addPalm(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.7;
    trunk.rotation.z = rand(-0.08, 0.08);
    trunk.castShadow = true;
    g.add(trunk);
    const nFronds = 6;
    for (let i = 0; i < nFronds; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / nFronds) * Math.PI * 2 + rand(-0.2, 0.2);
      f.position.set(Math.cos(a) * 0.9, 5.6, Math.sin(a) * 0.9);
      f.rotation.z = Math.cos(a) * 1.1;
      f.rotation.x = -Math.sin(a) * 1.1;
      f.castShadow = true;
      g.add(f);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    scene.add(g);
  }

  // ---- blocks: plaza tiles + buildings ---------------------------------------
  const blockCentres = [-130, -78, -26, 26, 78, 130];
  const plazaGeo = new THREE.BoxGeometry(BLOCK_SIZE, 0.2, BLOCK_SIZE);

  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const distCentre = Math.hypot(bx, bz);
      // A couple of blocks stay open as plazas / parks (no buildings).
      const isPlaza =
        (bx === -26 && bz === 26) || (bx === 78 && bz === -78);
      const plaza = new THREE.Mesh(plazaGeo, lambert(pick(PLAZA_TINTS)));
      plaza.position.set(bx, 0.06, bz);
      plaza.receiveShadow = true;
      scene.add(plaza);

      if (isPlaza) {
        // Park palms in the plaza.
        for (let i = 0; i < 3; i++) {
          addPalm(bx + rand(-12, 12), bz + rand(-12, 12), rand(0.9, 1.2));
        }
        continue;
      }

      // Taller towers near the centre, low pastel blocks toward the edges.
      const heightBias = Math.max(0, 1 - distCentre / 220);
      const nBuildings = chance(0.45) ? 2 : 1;

      if (nBuildings === 1) {
        const w = rand(18, 30);
        const d = rand(18, 30);
        const h = rand(8, 14) + heightBias * rand(10, 31);
        addBuilding(bx, bz, w, d, h);
      } else {
        // Two buildings side by side along X inside the block.
        const w1 = rand(13, 17);
        const w2 = rand(13, 17);
        const d = rand(18, 28);
        const h1 = rand(8, 14) + heightBias * rand(8, 26);
        const h2 = rand(8, 14) + heightBias * rand(8, 26);
        addBuilding(bx - (w1 / 2 + 2), bz, w1, d, h1);
        addBuilding(bx + (w2 / 2 + 2), bz, w2, d, h2);
      }
    }
  }

  function addBuilding(cx, cz, w, d, h) {
    const mat = pick(buildingMats);
    const b = addBox(scene, w, h, d, cx, h / 2, cz, mat);
    b.castShadow = true;
    b.receiveShadow = true;
    // Rooftop box on some buildings (AC unit / penthouse).
    if (chance(0.55)) {
      const rw = w * rand(0.35, 0.55);
      const rd = d * rand(0.35, 0.55);
      const rh = rand(1.5, 3.5);
      addBox(
        scene,
        rw,
        rh,
        rd,
        cx + rand(-w / 6, w / 6),
        h + rh / 2,
        cz + rand(-d / 6, d / 6),
        pick(roofMats)
      );
    }
    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  }

  // ---- street lamps -----------------------------------------------------------
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6);
  const lampHeadGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampArmGeo = new THREE.BoxGeometry(1.4, 0.12, 0.12);
  function addLamp(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(lampPoleGeo, poleMat);
    pole.position.y = 2.6;
    pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(lampArmGeo, poleMat);
    arm.position.set(0.6, 5.1, 0);
    g.add(arm);
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(1.25, 5.0, 0);
    g.add(head);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }
  // Lamps at intersection corners, alternating sides.
  for (const cx of ROAD_CENTRES) {
    for (const cz of ROAD_CENTRES) {
      if ((Math.round(cx / 52) + Math.round(cz / 52)) % 2 !== 0) continue;
      const sx = cx >= 0 ? 1 : -1;
      const sz = cz >= 0 ? 1 : -1;
      addLamp(cx + sx * 7.5, cz + sz * 7.5, sx > 0 ? Math.PI : 0);
    }
  }

  // ---- palm tree placement -----------------------------------------------------
  // Palms lining the beach and a few along the main avenue.
  for (let x = -150; x <= 150; x += 30) {
    addPalm(x + rand(-4, 4), 172 + rand(-3, 3), rand(0.9, 1.3));
  }
  for (let z = -130; z <= 130; z += 52) {
    addPalm(7.5, z + 26, rand(0.8, 1.1));
    addPalm(-7.5, z, rand(0.8, 1.1));
  }

  // ---- beach + ocean -------------------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, BEACH_Z1 - BEACH_Z0),
    sandMat
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (BEACH_Z0 + BEACH_Z1) / 2);
  sand.receiveShadow = true;
  scene.add(sand);

  // Ocean: canvas texture with painted wave streaks, scrolled in
  // onBeforeRender so it animates without any per-frame hook from main.js.
  const waveCanvas = document.createElement('canvas');
  waveCanvas.width = 128;
  waveCanvas.height = 128;
  const wctx = waveCanvas.getContext('2d');
  wctx.fillStyle = '#2f7fb8';
  wctx.fillRect(0, 0, 128, 128);
  wctx.strokeStyle = 'rgba(255,255,255,0.35)';
  wctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = randi(0, 128);
    wctx.beginPath();
    wctx.moveTo(0, y);
    wctx.bezierCurveTo(40, y + rand(-8, 8), 90, y + rand(-8, 8), 128, y);
    wctx.stroke();
  }
  wctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 40; i++) {
    wctx.fillRect(randi(0, 128), randi(0, 128), randi(4, 14), 2);
  }
  const waveTex = new THREE.CanvasTexture(waveCanvas);
  waveTex.wrapS = THREE.RepeatWrapping;
  waveTex.wrapT = THREE.RepeatWrapping;
  waveTex.repeat.set(10, 14);

  const oceanMat = new THREE.MeshLambertMaterial({ map: waveTex });
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 220, OCEAN_Z1 - BEACH_Z1),
    oceanMat
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.08, (BEACH_Z1 + OCEAN_Z1) / 2);
  let lastT = 0;
  ocean.onBeforeRender = () => {
    const now = performance.now() / 1000;
    if (lastT > 0) {
      const dt = Math.min(now - lastT, 0.1);
      waveTex.offset.y += dt * 0.02; // slow drift toward shore
      waveTex.offset.x += dt * 0.004;
    }
    lastT = now;
  };
  scene.add(ocean);

  // ---- pier (wooden, at the end of the main avenue x = 0) -----------------------
  const pierLen = PIER_Z1 - PIER_Z0;
  const pierDeck = addBox(
    scene,
    6,
    0.5,
    pierLen,
    PIER_X,
    0.6,
    (PIER_Z0 + PIER_Z1) / 2,
    woodMat
  );
  pierDeck.castShadow = true;
  // Plank seams across the deck.
  for (let z = PIER_Z0 + 2; z < PIER_Z1; z += 3) {
    addBox(scene, 6.2, 0.12, 0.25, PIER_X, 0.88, z, woodDarkMat, false);
  }
  // Support posts and rails.
  for (let z = PIER_Z0 + 3; z <= PIER_Z1; z += 7) {
    for (const sx of [-2.6, 2.6]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 1.4, 6),
        woodDarkMat
      );
      post.position.set(PIER_X + sx, 0.3, z);
      post.castShadow = true;
      scene.add(post);
    }
  }
  for (const sx of [-2.9, 2.9]) {
    addBox(scene, 0.18, 0.18, pierLen, PIER_X + sx, 1.5, (PIER_Z0 + PIER_Z1) / 2, woodDarkMat);
  }
  // End platform with a lamp.
  addBox(scene, 10, 0.5, 8, PIER_X, 0.6, PIER_Z1 - 2, woodMat);
  addLamp(PIER_X + 4, PIER_Z1 - 4, Math.PI / 2);

  // ---- spawns ----------------------------------------------------------------------
  const playerSpawn = new THREE.Vector3(9, 0, 9); // sidewalk by the central intersection

  // Car spawns: on road lanes (offset 3 from the centre line), y = 0.
  const carLane = [
    // along the main avenue x = 0 (lane offset in x)
    [3, -130], [3, -78], [-3, -26], [3, 26], [-3, 78], [3, 130],
    // along the main avenue z = 0 (lane offset in z)
    [-130, 3], [-78, -3], [78, 3], [130, -3],
    // side streets
    [55, -104], [-107, 52], [107, -52], [-55, 104],
  ];
  for (const [x, z] of carLane) carSpawns.push(new THREE.Vector3(x, 0, z));

  // Ped spawns: on sidewalks, just off the road edges.
  const pedSpots = [
    [9, 20], [-9, -20], [20, 9], [-20, -9],
    [61, 9], [-61, -9], [9, 61], [-9, -61],
    [113, 20], [-113, -20], [20, 113], [-20, -113],
    [9, 130], // sidewalk along the south avenue
    [9, -130], [-130, 9], [130, -9],
    [59, 59], [-59, -59],
  ];
  for (const [x, z] of pedSpots) pedSpawns.push(new THREE.Vector3(x, 0, z));

  return {
    colliders,
    roads,
    bounds: { minX: -CITY_HALF, maxX: CITY_HALF, minZ: -CITY_HALF, maxZ: PIER_Z1 },
    playerSpawn,
    carSpawns,
    pedSpawns,
  };
}
