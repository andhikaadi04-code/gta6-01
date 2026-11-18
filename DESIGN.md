# SOLMAR BAY — gta6-01 build contract

An original open-world crime game in the spirit of GTA 6. Fictional sun-soaked
coastal city **Solmar Bay**. Player: **Marco Reyes**, a wheelman new in town.
Fixer: **Lena Voss**. Nothing from Rockstar Games: no names, logos, characters,
maps, art or assets from any commercial game.

Tech: three.js r160, vendored as a single file `game/vendor/three.min.js`
(already downloaded, imports cleanly, no external imports). ES modules only.
Import map in `game/index.html`: `"three" -> "./vendor/three.min.js"`.
**No network request at runtime** — every file is local under `game/`.

## Coordinates and scale

- Y-up, ground y=0. City centred on the origin.
- Block size 40, road width 12, city 7x7 blocks (~360x360 units). Roads run
  along the X and Z axes at x,z = ..., -104, -52, 0, 52, 104, ... (road centre
  lines). The south edge (z > +150) is a beach + ocean.
- All positions are plain `{x, z}` or `THREE.Vector3` with y=0 on the ground.

## File owners (disjoint — nobody edits another owner's files)

| File | Owner |
|---|---|
| `game/index.html`, `game/src/main.js`, `game/src/config.js`, `game/src/random.js` | coordinator (me) |
| `game/src/city.js` | worker 1 — city/world |
| `game/src/player.js`, `game/src/vehicles.js`, `game/src/pedestrians.js` | worker 2 — actors |
| `game/src/missions.js`, `game/src/police.js`, `game/src/combat.js` | worker 3 — systems |
| `game/src/hud.js`, `game/src/audio.js`, `game/src/save.js`, `game/src/input.js`, `game/src/shots.js` | worker 4 — shell |
| `main.ts`, `README.md`, `.makefun/owner.json` | coordinator (me) |

Workers write code ONLY with the write/edit tools, never via shell heredocs,
echo, curl, cp from outside the repo, or by re-typing code a tool result
showed them. Syntax-check your files with:
`cp src/<file>.js /tmp/chk.mjs && node --check /tmp/chk.mjs`
Workers do NOT run git commands (no commit/push) — the coordinator commits.

## Shared state `G` (created by `main.js`, passed to every factory)

```js
G = {
  scene, camera, renderer, clock,
  input: { keys:Set, mouseDX, mouseDY, mouseDown, pressed(code) },
  world: { colliders:[{minX,maxX,minZ,maxZ}], roads:[{axis:'x'|'z', coord, from, to}],
           bounds:{minX,maxX,minZ,maxZ}, playerSpawn:Vector3, carSpawns:[Vector3], pedSpawns:[Vector3] },
  player: { mesh, pos:Vector3, heading, speed, health, money, inCar:null|car },
  cars: [],   // {group, pos, heading, speed, color, driver:'traffic'|'player'|null, isPolice, mesh parts}
  peds: [],   // {group, pos, heading, speed, state:'walk'|'flee'|'dead'|'driver', health}
  police: { wanted:0, cops:[] },
  missions: { index:0, current:null, marker },
  mode: 'menu'|'playing'|'paused'|'busted'|'wasted',
  time: 0, // seconds since game start
}
```

## Module contracts (exact exports — `main.js` calls these)

- `city.js`: `export function buildCity(scene, rng)` -> `world` object above.
  Adds to scene: ground plane, road strips (dark asphalt + dashed centre lines),
  sidewalks, buildings (BoxGeometry, MeshLambertMaterial, pastel palette:
  cream, terracotta, teal, coral, sand), street lamps (emissive), palm trees,
  beach sand + animated ocean plane at the south edge, a pier. Fills
  `colliders` (one AABB per building), `roads`, `bounds`, `playerSpawn`,
  `carSpawns` (8+ road positions), `pedSpawns` (12+ sidewalk positions).
  Sky: scene.background gradient colour + fog; sun directional light with
  shadows + hemisphere light (created here, warm late-afternoon sun).
- `player.js`: `export function createPlayer(scene, G)` -> player object above.
  Third-person on-foot controller: WASD moves relative to camera heading,
  Shift runs, Space jumps (small hop), E enters/exits nearest car (within 3u).
  `update(dt)`, `damage(n)`, `enterCar(car)`, `exitCar()`. Mesh: low-poly
  person (box torso, sphere head, limb boxes, coloured shirt). Collides with
  `world.colliders` (slide along walls) and stays in `world.bounds`.
- `vehicles.js`: `export function createVehicles(scene, G)` ->
  `{ cars, update(dt), spawnCar(pos, color, opts), nearestCar(pos, maxDist), jackCar(car) }`.
  Car mesh: group with body box, cabin box, 4 cylinder wheels, emissive
  headlights + taillights; colours: red, yellow, blue, white, black, teal.
  Traffic AI: cars drive along road lanes (axis + lane offset), turn at
  intersections, slow for a car ahead, never leave roads. Player-driven car:
  W/S accelerate/brake/reverse, A/D steer (speed-scaled), Space handbrake.
  Collisions: building AABBs push out + lose speed; car-car push apart.
  `jackCar(car)`: traffic driver ped flees on foot, car becomes player's.
- `pedestrians.js`: `export function createPedestrians(scene, G)` ->
  `{ peds, update(dt), spawnPed(pos) }`. Peds walk sidewalks, cross roads at
  intersections, flee from fast/near cars and from gunshots. Mesh like the
  player but varied shirt colours. `state` in `walk|flee|dead`; `health` 100.
- `missions.js`: `export function createMissions(scene, G)` ->
  `{ index, current, update(dt), startMission(i), marker }`. Five missions,
  story via short dialogue lines shown by the HUD:
  1. "First Wheels" — steal any car, drive to the yellow marker (Lena's garage).
  2. "Courier Run" — deliver a package to the pier in 90s (timed).
  3. "Heat" — lose a 2-star wanted level (survive until wanted hits 0).
  4. "The Pickup" — drive to Lena, then to the second marker while police
     chase at wanted 2.
  5. "Bay Heist" — reach the Meridian Club, grab the cash, escape with
     wanted 3 to the safehouse.
  Mission object: `{ id, title, brief, dialogue:[lines], reward }`. Marker: a
  tall pulsing yellow beacon cylinder + a ground ring at the target. Objective
  completes inside a 6u radius (or by the mission's own rule). On complete:
  money += reward, HUD jingle + message, next mission starts, autosave.
- `police.js`: `export function createPolice(scene, G)` ->
  `{ wanted, cops, update(dt), addHeat(n), setWanted(n) }`. Wanted 0-5.
  Crimes add heat: steal a car +1, kill a ped +1, shooting +1. At wanted>=1
  spawn up to `wanted` police cars at road edges; at wanted>=2 also foot cops.
  Police cars chase the player (steer toward player, ram); foot cops chase on
  foot and, within 2u for 2s, bust the player (`mode='busted'`). Wanted decays
  -1 per 8s when no crime and no cop within 40u. Busted/wasted: respawn at the
  hospital marker, money -200, wanted 0, health 100.
- `combat.js`: `export function createCombat(scene, G)` ->
  `{ update(dt), punch(), shoot(), ammo }`. F punches (range 2.2u, 25 dmg,
  knocks ped back). Left mouse shoots the pistol (raycast from camera centre,
  34 dmg, muzzle flash + tracer line, ammo 12, R reloads, +6 ammo at two
  pickup crates). Mission 5 spawns club-guard peds that shoot at the player.
  Health regens slowly after 5s without damage.
- `hud.js`: `export function createHud(G)` ->
  `{ update(dt), showMessage(text, dur), setObjective(text), setWanted(n), setMoney(n), setHealth(n), showMenu(), hideMenu() }`.
  DOM ids in `index.html`: `#hud`, `#health-bar`, `#money`, `#wanted`,
  `#objective`, `#minimap` (canvas 180x180), `#message`, `#menu` (start
  screen: title SOLMAR BAY, New Game / Continue / How to play), `#pause`,
  `#busted`, `#wasted`. Minimap (2D canvas, ~10Hz): roads as grey lines,
  buildings as dark blocks, player as a white arrow, traffic yellow dots,
  police red/blue dots, mission marker pulsing yellow star.
- `audio.js`: `export function createAudio(G)` ->
  `{ update(dt), engine(s01), siren(on), shot(), punch(), pickup(), jingle(), setMuted(b) }`.
  WebAudio only, context created on first user gesture. Engine: oscillators
  pitched by speed; siren: alternating two-tone; shot: noise burst; pickup:
  two-note blip; jingle: 4-note arpeggio; quiet music loop: bass + pad,
  Am-F-C-G, ~100 BPM. M toggles mute.
- `save.js`: `export function createSave(G)` ->
  `{ save(), load(), clear(), hasSave() }`. localStorage key
  `solmar-bay-save-v1`, all access in try/catch (file:// may restrict it).
  Saves money, missionIndex, player pos, health, wanted, time played.
  Autosave on mission complete and every 30s.
- `input.js`: `export function createInput()` ->
  `{ keys:Set, mouseDX, mouseDY, mouseDown, pressed(code), update() }`.
  Keydown/keyup listeners; click on the canvas requests pointer lock for
  mouse-look (Esc unlocks); arrow keys rotate the camera as a fallback.
  `pressed(code)` is an edge trigger (true once per physical press).
  `update()` clears per-frame mouse deltas.
- `shots.js`: `export function setupShots(G)` — reads `URLSearchParams`:
  `?shot=start` shows the menu over a scenic city vista (camera high,
  skyline + beach in frame); `?shot=play` starts the game immediately with
  the player driving a car down the main avenue amid traffic and peds, HUD
  and minimap visible; `?shot=end` sets wanted 3, three police cars in
  chase, mission 5 active with its marker visible, player in a car. Uses a
  seeded RNG (`seed` param, default 1) so shots are deterministic. Ignores
  localStorage in shot mode. After the scene has rendered for ~2s / 30 frames,
  sets `window.__shotReady = true`; on any error sets `window.__shotError`.
- `main.js` (coordinator): renderer (antialias, shadows, ACES tone mapping),
  camera (PerspectiveCamera 60), game loop (delta clamped to 0.05s), update
  order: input -> player -> vehicles -> peds -> police -> missions -> combat
  -> hud -> audio. Third-person camera follows behind the player/car with
  lerp + mouse orbit offset. Resize handler. Any uncaught error sets
  `window.__shotError`.

## Style

Sun-soaked late afternoon: warm directional sun, light-blue fog, pastel
buildings, palms, beach and ocean to the south. Keep the triangle count
modest (a few hundred meshes, MeshLambertMaterial, shadows only from the
sun). The judge sees the game mostly through its 3 screenshots — every
system must be VISIBLE: HUD, minimap, wanted stars, police, mission marker,
traffic, peds.

## Limits (scorer gate)

game/ <= 993 files/dirs and 48 MiB total; game/index.html <= 1 MiB;
3 screenshots <= 256 KiB each, long side <= 1280, short side >= 480;
dossier <= 1.5 MiB. Keep total source modest (dossier text caps at 160 KiB).
