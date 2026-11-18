// Save/load for SOLMAR BAY. localStorage key 'solmar-bay-save-v1'; every
// access is wrapped in try/catch because file:// (and private windows) may
// restrict storage. load() returns the parsed object or null and applies
// nothing itself — main.js applies it.

const KEY = 'solmar-bay-save-v1';

export function createSave(G) {
  function readPlayerPos() {
    try {
      if (G && G.player && G.player.pos) {
        const p = G.player.pos;
        if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
      }
      if (G && G.player && G.player.mesh && G.player.mesh.position) {
        const p = G.player.mesh.position;
        if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
      }
    } catch { /* fall through to the default */ }
    return { x: 0, z: 0 };
  }

  function save() {
    try {
      let missionIndex = 0;
      try {
        if (G && G.missions && typeof G.missions.index === 'number') missionIndex = G.missions.index;
      } catch { missionIndex = 0; }
      let wanted = 0;
      try {
        if (G && G.police && typeof G.police.wanted === 'number') wanted = G.police.wanted;
      } catch { wanted = 0; }
      const data = {
        money: (G && G.player && typeof G.player.money === 'number') ? G.player.money : 0,
        missionIndex,
        pos: readPlayerPos(),
        health: (G && G.player && typeof G.player.health === 'number') ? G.player.health : 100,
        wanted,
        time: (G && typeof G.time === 'number') ? G.time : 0,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch {
      return null;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
      return true;
    } catch {
      return false;
    }
  }

  function hasSave() {
    try {
      return window.localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  }

  return { save, load, clear, hasSave };
}
