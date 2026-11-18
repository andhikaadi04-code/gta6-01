// missions.js — story missions for SOLMAR BAY (worker 3: systems).
// Contract: createMissions(scene, G) -> { index, current, update(dt), startMission(i), marker }
// Marco Reyes, fixer Lena Voss. Objectives complete inside a 6u radius unless stated.
import * as THREE from 'three';

const RADIUS = 6;
const GARAGE = { x: -52, z: -52 }; // Lena's garage
const PIER = { x: 0, z: 156 }; // south pier, by the beach
const DROP = { x: 104, z: 52 }; // second drop for "The Pickup"
const CLUB = { x: 52, z: -104 }; // Meridian Club
const SAFEHOUSE = { x: -104, z: 104 }; // safehouse

const DEFS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 300,
    brief: "Steal a car and bring it to Lena's garage.",
    dialogue: [
      "Lena: Marco! You made it to Solmar Bay. First rule — wheels. Grab any car and bring it to my garage.",
      'Marco: Any car? Say less. Try not to get spotted.',
    ],
  },
  {
    id: 'courier-run',
    title: 'Courier Run',
    reward: 500,
    brief: 'Deliver the package to the pier in 90 seconds.',
    timeLimit: 90,
    dialogue: [
      'Lena: Package job. Pier, south end. Ninety seconds — the boat does not wait.',
      'Marco: Ninety seconds? I drive fast. Hold the boat.',
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    reward: 400,
    brief: 'Lose the cops. Get your wanted level back to zero.',
    dialogue: [
      'Lena: You picked up heat, Marco. Two stars. Lay low, break line of sight, let it cool off.',
      'Marco: Two stars? I barely did anything. Fine — ghost mode.',
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    reward: 700,
    brief: 'Pick Lena up at the garage, then drive her contact to the east drop — with the cops on you.',
    dialogue: [
      'Lena: Change of plan. Pick me up at the garage, then we run my contact east. Cops will be on us.',
      'Marco: With the cops on us? Lena, you know how to make a morning interesting.',
    ],
  },
  {
    id: 'bay-heist',
    title: 'Bay Heist',
    reward: 2500,
    brief: 'Hit the Meridian Club, grab the cash (hold the marker 3s), then escape to the safehouse.',
    dialogue: [
      'Lena: The big one. Meridian Club keeps its cash upstairs. Grab it, then vanish. Guards will shoot.',
      'Marco: The Meridian Club... alright. In, cash, gone. Like we rehearsed.',
    ],
  },
];

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function createMissions(scene, G) {
  // ---- Marker: tall pulsing yellow beacon cylinder + ground ring ----
  const marker = new THREE.Group();
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd21f, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true), beaconMat);
  beacon.position.y = 15;
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd21f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, RADIUS, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe45c }),
  );
  core.position.y = 0.6;
  marker.add(beacon, ring, core);
  marker.visible = false;
  if (scene && typeof scene.add === 'function') scene.add(marker);

  const state = {
    index: 0,
    current: null,
    stage: 0,
    timer: 0,
    holdTimer: 0,
    dialogueIdx: 0,
    dialogueTimer: 0,
    lastShownSecond: -1,
    done: false,
    elapsed: 0,
  };

  function playerPos() {
    if (!G || !G.player) return null;
    if (G.player.pos) return G.player.pos;
    if (G.player.mesh && G.player.mesh.position) return G.player.mesh.position;
    return null;
  }

  function showMessage(text, dur) {
    if (G && G.hud && typeof G.hud.showMessage === 'function') {
      try { G.hud.showMessage(text, dur || 4); } catch { /* HUD is optional */ }
    }
  }

  function setObjective(text) {
    if (G && G.hud && typeof G.hud.setObjective === 'function') {
      try { G.hud.setObjective(text); } catch { /* HUD is optional */ }
    }
  }

  function moveMarker(target) {
    if (!target) { marker.visible = false; return; }
    marker.position.set(target.x, 0, target.z);
    marker.visible = true;
  }

  function stageTarget(mission, stage) {
    switch (mission.id) {
      case 'first-wheels': return GARAGE;
      case 'courier-run': return PIER;
      case 'heat': return null; // no marker — the objective is losing the heat
      case 'the-pickup': return stage === 0 ? GARAGE : DROP;
      case 'bay-heist': return stage === 2 ? SAFEHOUSE : CLUB;
      default: return null;
    }
  }

  function stageObjective(mission, stage) {
    switch (mission.id) {
      case 'first-wheels': return 'Steal a car — drive to the garage';
      case 'courier-run': return 'Deliver the package to the pier';
      case 'heat': return 'Lose the cops — wanted level to zero';
      case 'the-pickup': return stage === 0 ? 'Pick Lena up at the garage' : 'Drive to the east drop';
      case 'bay-heist':
        if (stage === 0) return 'Reach the Meridian Club';
        if (stage === 1) return 'Grab the cash — hold the marker';
        return 'Escape to the safehouse';
      default: return mission.brief;
    }
  }

  function startMission(i) {
    if (typeof i !== 'number' || i < 0 || i >= DEFS.length) return;
    state.index = i;
    state.current = DEFS[i];
    state.stage = 0;
    state.timer = state.current.timeLimit || 0;
    state.holdTimer = 0;
    state.dialogueIdx = 0;
    state.dialogueTimer = 0;
    state.lastShownSecond = -1;
    state.done = false;
    const m = state.current;
    moveMarker(stageTarget(m, 0));
    setObjective(`${m.title}: ${stageObjective(m, 0)}`);
    if (m.dialogue && m.dialogue.length > 0) showMessage(m.dialogue[0], 5);
    // Mission-specific setup.
    if (m.id === 'heat' && G && G.police && typeof G.police.setWanted === 'function') {
      try { G.police.setWanted(2); } catch { /* police is optional */ }
    }
    if (m.id === 'the-pickup' && G && G.police && typeof G.police.setWanted === 'function') {
      try { G.police.setWanted(2); } catch { /* police is optional */ }
    }
    // Keep the shared G.missions slot in sync when main.js owns a different object.
    if (G && G.missions && G.missions !== api) {
      try { G.missions.index = state.index; G.missions.current = state.current; } catch { /* ignore */ }
    }
  }

  function completeMission() {
    const m = state.current;
    if (!m) return;
    if (G && G.player && typeof G.player.money === 'number') {
      G.player.money += m.reward;
    }
    if (G && G.hud && typeof G.hud.setMoney === 'function') {
      try { G.hud.setMoney(G.player ? G.player.money : 0); } catch { /* ignore */ }
    }
    if (G && G.audio && typeof G.audio.jingle === 'function') {
      try { G.audio.jingle(); } catch { /* audio is optional */ }
    }
    showMessage(`Mission complete: ${m.title}  +$${m.reward}`, 5);
    if (G && G.save && typeof G.save.save === 'function') {
      try { G.save.save(); } catch { /* save is optional */ }
    }
    state.index += 1;
    if (state.index < DEFS.length) {
      startMission(state.index);
    } else {
      state.current = null;
      state.done = true;
      marker.visible = false;
      setObjective('All missions complete — Solmar Bay is yours, Marco.');
      showMessage('All missions complete! Solmar Bay is yours, Marco.', 6);
      if (G && G.missions && G.missions !== api) {
        try { G.missions.index = state.index; G.missions.current = null; } catch { /* ignore */ }
      }
    }
  }

  function failMission(reason) {
    showMessage(reason, 5);
    startMission(state.index); // retry the same mission, no game over
  }

  function advanceStage() {
    state.stage += 1;
    state.holdTimer = 0;
    const m = state.current;
    moveMarker(stageTarget(m, state.stage));
    setObjective(`${m.title}: ${stageObjective(m, state.stage)}`);
    if (m.id === 'bay-heist' && state.stage === 2
      && G && G.police && typeof G.police.setWanted === 'function') {
      try { G.police.setWanted(3); } catch { /* police is optional */ }
      showMessage('Lena: Cash is ours — now run! Three stars, get to the safehouse!', 5);
    }
  }

  function update(dt) {
    state.elapsed += dt || 0;
    // Pulse the beacon + ring.
    const t = state.elapsed;
    beaconMat.opacity = 0.25 + 0.15 * Math.sin(t * 3);
    const s = 1 + 0.08 * Math.sin(t * 3);
    ring.scale.set(s, s, 1);
    ring.rotation.z += (dt || 0) * 0.5;

    const mode = G ? G.mode : undefined;
    if (mode && mode !== 'playing') return;
    if (!state.current) {
      if (!state.done && state.index < DEFS.length) startMission(state.index);
      return;
    }
    const m = state.current;
    const pos = playerPos();
    if (!pos) return;

    // Roll through dialogue lines, one every 5s.
    if (m.dialogue && state.dialogueIdx < m.dialogue.length - 1) {
      state.dialogueTimer += dt || 0;
      if (state.dialogueTimer >= 5) {
        state.dialogueTimer = 0;
        state.dialogueIdx += 1;
        showMessage(m.dialogue[state.dialogueIdx], 5);
      }
    }

    switch (m.id) {
      case 'first-wheels': {
        const inCar = !!(G.player && G.player.inCar);
        if (inCar && dist2D(pos, GARAGE) <= RADIUS) completeMission();
        break;
      }
      case 'courier-run': {
        state.timer -= dt || 0;
        const secs = Math.max(0, Math.ceil(state.timer));
        if (secs !== state.lastShownSecond) {
          state.lastShownSecond = secs;
          setObjective(`${m.title}: Deliver the package to the pier — ${secs}s left`);
        }
        if (dist2D(pos, PIER) <= RADIUS) {
          completeMission();
        } else if (state.timer <= 0) {
          failMission('Too slow — the boat left without the package. Try again.');
        }
        break;
      }
      case 'heat': {
        if (G && G.police && typeof G.police.wanted === 'number') {
          if (G.police.wanted <= 0) completeMission();
        } else {
          // No police module: fall back to laying low for 15s.
          state.timer += dt || 0;
          if (state.timer >= 15) completeMission();
        }
        break;
      }
      case 'the-pickup': {
        if (state.stage === 0) {
          if (dist2D(pos, GARAGE) <= RADIUS) {
            showMessage("Lena: That's my wheelman. East drop — and keep it smooth, the cops are watching.", 5);
            advanceStage();
          }
        } else if (dist2D(pos, DROP) <= RADIUS) {
          completeMission();
        }
        break;
      }
      case 'bay-heist': {
        if (state.stage === 0) {
          if (dist2D(pos, CLUB) <= RADIUS) {
            showMessage('Marco: Cash room. Grab it and hold still — three seconds.', 4);
            advanceStage();
          }
        } else if (state.stage === 1) {
          if (dist2D(pos, CLUB) <= RADIUS) {
            state.holdTimer += dt || 0;
            setObjective(`${m.title}: Grabbing the cash… ${Math.max(0, 3 - state.holdTimer).toFixed(1)}s`);
            if (state.holdTimer >= 3) advanceStage();
          } else {
            state.holdTimer = 0;
            setObjective(`${m.title}: Grab the cash — hold the marker`);
          }
        } else if (dist2D(pos, SAFEHOUSE) <= RADIUS) {
          completeMission();
        }
        break;
      }
      default:
        break;
    }
  }

  const api = {
    get index() { return state.index; },
    get current() { return state.current; },
    update,
    startMission,
    marker,
    list: DEFS,
  };
  return api;
}
