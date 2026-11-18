// HUD for SOLMAR BAY: health bar, money, wanted stars, objective, message
// toast, start-menu toggle, and a 2D minimap (redrawn at ~10 Hz).
// All DOM lookups happen at call time (the coordinator writes index.html),
// and every element access is guarded so a missing element is a no-op.

export function createHud(G) {
  let msgTimer = 0;
  let msgDur = 2;
  let mapTimer = 0;
  let pulse = 0;

  function el(id) {
    try {
      return document.getElementById(id);
    } catch {
      return null;
    }
  }

  function posOf(p) {
    if (!p) return null;
    if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
    if (p.position && typeof p.position.x === 'number') return { x: p.position.x, z: p.position.z };
    if (p.pos && typeof p.pos.x === 'number') return { x: p.pos.x, z: p.pos.z };
    return null;
  }

  function setHealth(n) {
    const bar = el('health-bar');
    if (bar) {
      const v = Math.max(0, Math.min(100, Number(n) || 0));
      bar.style.width = v + '%';
    }
  }

  function setMoney(n) {
    const m = el('money');
    if (m) m.textContent = '$' + (Math.round(Number(n) || 0)).toLocaleString('en-US');
  }

  function setWanted(n) {
    const w = el('wanted');
    if (w) {
      const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
      w.textContent = '★'.repeat(v) + '☆'.repeat(5 - v);
    }
  }

  function setObjective(text) {
    const o = el('objective');
    if (o) o.textContent = text == null ? '' : String(text);
  }

  function showMessage(text, dur) {
    const m = el('message');
    msgDur = typeof dur === 'number' && dur > 0 ? dur : 2.5;
    msgTimer = msgDur;
    if (m) {
      m.textContent = text == null ? '' : String(text);
      m.style.opacity = '1';
      m.style.display = 'block';
    }
  }

  function showMenu() {
    const menu = el('menu');
    if (menu) { menu.classList.remove('hidden'); menu.style.display = 'block'; }
  }

  function hideMenu() {
    const menu = el('menu');
    if (menu) { menu.classList.add('hidden'); menu.style.display = 'none'; }
  }

  function drawMinimap() {
    const canvas = el('minimap');
    if (!canvas) return;
    let ctx = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;
    const W = canvas.width || 180;
    const H = canvas.height || 180;

    let bounds = { minX: -180, maxX: 180, minZ: -180, maxZ: 180 };
    try {
      if (G && G.world && G.world.bounds) {
        const b = G.world.bounds;
        if (typeof b.minX === 'number') bounds = b;
      }
    } catch { /* keep defaults */ }
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    const sx = (x) => ((x - bounds.minX) / spanX) * W;
    const sz = (z) => ((z - bounds.minZ) / spanZ) * H;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0e2a1e';
    ctx.fillRect(0, 0, W, H);

    // Roads: grey lines along the city grid.
    try {
      const roads = (G && G.world && Array.isArray(G.world.roads)) ? G.world.roads : null;
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 3;
      if (roads && roads.length) {
        for (const r of roads) {
          ctx.beginPath();
          if (r.axis === 'x') {
            ctx.moveTo(sx(r.from != null ? r.from : bounds.minX), sz(r.coord));
            ctx.lineTo(sx(r.to != null ? r.to : bounds.maxX), sz(r.coord));
          } else {
            ctx.moveTo(sx(r.coord), sz(r.from != null ? r.from : bounds.minZ));
            ctx.lineTo(sx(r.coord), sz(r.to != null ? r.to : bounds.maxZ));
          }
          ctx.stroke();
        }
      } else {
        // Fallback grid (DESIGN.md: roads at -104, -52, 0, 52, 104).
        for (const c of [-104, -52, 0, 52, 104]) {
          ctx.beginPath(); ctx.moveTo(sx(bounds.minX), sz(c)); ctx.lineTo(sx(bounds.maxX), sz(c)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx(c), sz(bounds.minZ)); ctx.lineTo(sx(c), sz(bounds.maxZ)); ctx.stroke();
        }
      }
    } catch { /* roads are decorative */ }

    // Buildings: dark blocks from world colliders.
    try {
      const colliders = (G && G.world && Array.isArray(G.world.colliders)) ? G.world.colliders : [];
      ctx.fillStyle = '#1f2937';
      for (const c of colliders) {
        if (!c || typeof c.minX !== 'number') continue;
        ctx.fillRect(sx(c.minX), sz(c.minZ), Math.max(1, sx(c.maxX) - sx(c.minX)), Math.max(1, sz(c.maxZ) - sz(c.minZ)));
      }
    } catch { /* buildings are decorative */ }

    // Mission marker: pulsing yellow star.
    try {
      let markerPos = null;
      if (G && G.missions) {
        if (G.missions.marker) markerPos = posOf(G.missions.marker);
        else if (G.missions.current && G.missions.current.target) markerPos = posOf(G.missions.current.target);
      }
      if (markerPos) {
        const r = 5 + 2.5 * Math.sin(pulse * 4);
        drawStar(ctx, sx(markerPos.x), sz(markerPos.z), r, '#facc15');
      }
    } catch { /* marker is decorative */ }

    // Traffic: yellow dots.
    try {
      const cars = (G && Array.isArray(G.cars)) ? G.cars : [];
      ctx.fillStyle = '#facc15';
      for (const car of cars) {
        if (!car || car.isPolice) continue;
        const p = posOf(car);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(sx(p.x), sz(p.z), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } catch { /* traffic dots are decorative */ }

    // Police: red/blue dots.
    try {
      let cops = [];
      if (G && G.police && Array.isArray(G.police.cops)) cops = G.police.cops;
      for (let i = 0; i < cops.length; i += 1) {
        const p = posOf(cops[i]);
        if (!p) continue;
        ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(sx(p.x), sz(p.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } catch { /* police dots are decorative */ }

    // Player: white arrow rotated by heading.
    try {
      const p = G && G.player ? posOf(G.player) : null;
      if (p) {
        const heading = (G.player && typeof G.player.heading === 'number') ? G.player.heading : 0;
        const cx = sx(p.x);
        const cy = sz(p.z);
        ctx.save();
        ctx.translate(cx, cy);
        // Canvas y grows downward while world -z is "north": heading is
        // measured around Y, so rotate by -heading to match the map.
        ctx.rotate(-heading);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 5);
        ctx.lineTo(0, 2);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } catch { /* player arrow is decorative */ }
  }

  function drawStar(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function update(dt) {
    const d = typeof dt === 'number' && dt > 0 ? dt : 0;
    pulse += d;

    if (msgTimer > 0) {
      msgTimer -= d;
      if (msgTimer <= 0) {
        const m = el('message');
        if (m) {
          m.style.opacity = '0';
          m.style.display = 'none';
        }
      }
    }

    // Keep the HUD in sync with live state when it is available.
    try {
      if (G && G.player) {
        if (typeof G.player.health === 'number') setHealth(G.player.health);
        if (typeof G.player.money === 'number') setMoney(G.player.money);
      }
      if (G && G.police && typeof G.police.wanted === 'number') setWanted(G.police.wanted);
    } catch { /* setters already guard */ }

    mapTimer += d;
    if (mapTimer >= 0.1) {
      mapTimer = 0;
      drawMinimap();
    }
  }

  return { update, showMessage, setObjective, setWanted, setMoney, setHealth, showMenu, hideMenu };
}
