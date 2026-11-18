// SOLMAR BAY — boot and the one loop. The game moves between menu, playing,
// paused, busted and wasted. ?seed=N fixes the city. ?shot=start|play|end
// (with &seed=N) stages that scene instead of the menu and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng } from './random.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createMissions } from './missions.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { createInput } from './input.js';
import { setupShots } from './shots.js';

const MAX_FRAME = 0.05;

window.addEventListener('error', (e) => {
  window.__shotError = String((e && e.message) || e);
});
window.addEventListener('unhandledrejection', (e) => {
  window.__shotError = String((e && e.reason && e.reason.message) || e.reason || e);
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');

// --- Renderer, scene, camera -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shared state ------------------------------------------------------------
const G = {
  scene,
  camera,
  renderer,
  clock: new THREE.Clock(),
  input: null,
  world: null,
  player: null,
  vehicles: null,
  peds: null,
  police: null,
  missions: null,
  combat: null,
  hud: null,
  audio: null,
  save: null,
  mode: 'menu',
  time: 0,
  cameraYaw: Math.PI * 0.75,
  cameraPitch: 0.32,
  cameraHeading: Math.PI * 0.75,
  shotMode: Boolean(shot),
  fixedCamera: null, // shots.js may set { pos: Vector3, lookAt: Vector3 }
  lastMouseMove: -10,
  onPlayerDown: null,
};

// Debug/test handle: lets automated play-tests inspect the live game state.
// (Harmless in the shipped game — read-only state, no cheats.)
window.__game = G;

// --- Build the world ---------------------------------------------------------
const rng = makeRng(seed);
G.input = createInput();
G.world = buildCity(scene, rng);
G.player = createPlayer(scene, G);
G.vehicles = createVehicles(scene, G);
G.peds = createPedestrians(scene, G);
G.police = createPolice(scene, G);
G.missions = createMissions(scene, G);
G.combat = createCombat(scene, G);
G.hud = createHud(G);
G.audio = createAudio(G);
G.save = createSave(G);

// Populate the streets: traffic cars and pedestrians.
for (let i = 0; i < 10; i++) {
  const at = G.world.carSpawns[i % G.world.carSpawns.length];
  G.vehicles.spawnCar(new THREE.Vector3(at.x, 0, at.z), undefined, {});
}
for (let i = 0; i < 16; i++) {
  const at = G.world.pedSpawns[i % G.world.pedSpawns.length];
  G.peds.spawnPed(new THREE.Vector3(at.x, 0, at.z));
}

// --- Modes, menus, save ------------------------------------------------------
const $ = (id) => document.getElementById(id);

function showOverlay(id) {
  for (const other of ['menu', 'pause', 'busted', 'wasted']) $(other).classList.toggle('hidden', other !== id);
  $('hud').classList.toggle('hidden', id !== null);
}

function startPlaying() {
  G.mode = 'playing';
  showOverlay(null);
  $('hud').classList.remove('hidden');
}

function newGame() {
  G.save.clear();
  G.player.money = CONFIG.MONEY_START;
  G.player.health = CONFIG.PLAYER_HEALTH;
  if (G.player.pos) G.player.pos.copy(G.world.playerSpawn);
  if (G.player.inCar) G.player.exitCar();
  G.police.setWanted(0);
  G.missions.startMission(0);
  G.time = 0;
  startPlaying();
  G.hud.showMessage('Welcome to Solmar Bay, Marco. Steal a car.', 5);
  G.hud.setObjective('MISSION 1 — FIRST WHEELS: steal a car and drive to the marker.');
}

function continueGame() {
  const data = G.save.load();
  if (!data) { newGame(); return; }
  G.player.money = data.money ?? CONFIG.MONEY_START;
  G.player.health = data.health ?? CONFIG.PLAYER_HEALTH;
  if (data.pos && G.player.pos) G.player.pos.set(data.pos.x, 0, data.pos.z);
  if (G.player.inCar) G.player.exitCar();
  G.police.setWanted(data.wanted ?? 0);
  G.missions.startMission(data.missionIndex ?? 0);
  G.time = data.time ?? 0;
  startPlaying();
  G.hud.showMessage('Back on the streets.', 3);
}

function respawn() {
  G.player.health = CONFIG.PLAYER_HEALTH;
  G.player.money = Math.max(0, G.player.money - CONFIG.BUST_FINE);
  if (G.player.pos) G.player.pos.copy(G.world.playerSpawn);
  if (G.player.inCar) G.player.exitCar();
  G.police.setWanted(0);
  startPlaying();
  G.hud.showMessage('The hospital patched you up. $200 lighter.', 4);
}

G.onPlayerDown = (kind) => {
  if (G.mode !== 'playing') return;
  G.mode = kind;
  showOverlay(kind);
  if (G.audio) G.audio.siren(false);
};

$('btn-new').addEventListener('click', newGame);
$('btn-continue').addEventListener('click', continueGame);
$('btn-howto').addEventListener('click', () => $('howto').classList.toggle('hidden'));
$('btn-resume').addEventListener('click', () => { G.mode = 'playing'; showOverlay(null); });
$('btn-quit').addEventListener('click', () => { G.mode = 'menu'; showOverlay('menu'); });
$('btn-busted').addEventListener('click', respawn);
$('btn-wasted').addEventListener('click', respawn);

if (G.save.hasSave()) $('btn-continue').classList.remove('hidden');

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'playing') {
    G.mode = 'paused';
    showOverlay('pause');
  }
});

// --- Camera ------------------------------------------------------------------
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
let menuOrbit = 0;

function updateCamera(dt) {
  const player = G.player;
  const inCar = player.inCar;
  const anchor = inCar ? inCar.pos : player.pos;
  if (!anchor) return;

  if (G.fixedCamera) {
    camera.position.copy(G.fixedCamera.pos);
    camera.lookAt(G.fixedCamera.lookAt);
    return;
  }

  if (G.mode === 'menu') {
    menuOrbit += dt * 0.05;
    const r = 230;
    camDesired.set(Math.sin(menuOrbit) * r, 70, Math.cos(menuOrbit) * r);
    camera.position.lerp(camDesired, 1 - Math.pow(0.001, dt));
    camera.lookAt(0, 10, 0);
    return;
  }

  // Mouse look: pointer-lock deltas turn the camera.
  const dx = G.input.mouseDX || 0;
  const dy = G.input.mouseDY || 0;
  if (dx !== 0 || dy !== 0) {
    G.cameraYaw -= dx * 0.0032;
    G.cameraPitch = Math.max(0.08, Math.min(0.9, G.cameraPitch + dy * 0.0022));
    G.lastMouseMove = G.time;
  }
  if (G.input.keys.has('ArrowLeft')) G.cameraYaw += 1.8 * dt;
  if (G.input.keys.has('ArrowRight')) G.cameraYaw -= 1.8 * dt;

  // Behind a driven car the camera swings back behind it unless the player
  // recently looked around with the mouse. In shot mode the camera snaps
  // behind the car at once so the framing is deterministic.
  if (inCar && G.time - G.lastMouseMove > 1.5) {
    const behind = inCar.heading + Math.PI;
    if (G.shotMode) {
      G.cameraYaw = behind;
    } else {
      let diff = behind - G.cameraYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      G.cameraYaw += diff * Math.min(1, dt * 1.6);
    }
  }
  G.cameraHeading = G.cameraYaw;

  const dist = inCar ? 11 : 7.5;
  const height = inCar ? 4.6 : 3.4;
  camTarget.copy(anchor);
  camTarget.y += inCar ? 1.6 : 1.7;
  camDesired.set(
    camTarget.x + Math.sin(G.cameraYaw) * dist,
    camTarget.y + height * G.cameraPitch * 2.2,
    camTarget.z + Math.cos(G.cameraYaw) * dist,
  );
  // In shot mode the camera snaps to its staged position at once: under
  // software rendering only a few frames run per second, so a slow lerp
  // would still be mid-flight when the screenshot is taken.
  camera.position.lerp(camDesired, G.shotMode ? 1 : 1 - Math.pow(0.0001, dt));
  camera.lookAt(camTarget);
}

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
let saveTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  if (G.mode === 'playing') {
    G.time += dt;
    if (G.input.pressed('KeyP')) {
      G.mode = 'paused';
      showOverlay('pause');
    } else {
      G.player.update(dt);
      G.vehicles.update(dt);
      G.peds.update(dt);
      G.police.update(dt);
      G.missions.update(dt);
      G.combat.update(dt);
      if (G.world.update) G.world.update(dt);
      if (G.player.health <= 0) G.onPlayerDown('wasted');
      saveTimer += dt;
      if (saveTimer > 30) {
        saveTimer = 0;
        G.save.save();
      }
    }
  } else if (G.mode === 'menu') {
    if (G.world.update) G.world.update(dt);
  }

  updateCamera(dt);
  G.hud.update(dt);
  if (G.audio) {
    const s01 = G.player.inCar ? Math.min(1, Math.abs(G.player.inCar.speed) / CONFIG.CAR_MAX_SPEED) : 0;
    G.audio.engine(s01);
    G.audio.update(dt);
  }
  G.input.update();
  renderer.render(scene, camera);
}

// --- Shots / start -----------------------------------------------------------
if (shot) {
  try {
    setupShots(G);
  } catch (e) {
    window.__shotError = String((e && e.message) || e);
  }
}

requestAnimationFrame(frame);
