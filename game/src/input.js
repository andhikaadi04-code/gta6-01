// Keyboard + pointer input for SOLMAR BAY. Key state lives in `keys` (by
// e.code, e.g. 'KeyW'); `pressed(code)` is an edge trigger that is true
// once per physical press; mouse deltas accumulate only while pointer lock
// is held, and `update()` clears the per-frame state.

export function createInput() {
  const input = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    pressed,
    update,
  };
  const pressedSet = new Set();

  function pressed(code) {
    return pressedSet.has(code);
  }

  function update() {
    input.mouseDX = 0;
    input.mouseDY = 0;
    pressedSet.clear();
  }

  function findCanvas() {
    try {
      return document.getElementById('game') || document.querySelector('canvas') || null;
    } catch {
      return null;
    }
  }

  function requestLock() {
    try {
      const canvas = findCanvas();
      if (!canvas) return;
      if (document.pointerLockElement === canvas) return;
      if (typeof canvas.requestPointerLock === 'function') {
        const r = canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
    } catch { /* pointer lock is best-effort */ }
  }

  window.addEventListener('keydown', (e) => {
    if (!e || typeof e.code !== 'string') return;
    input.keys.add(e.code);
    if (!e.repeat) pressedSet.add(e.code);
    // Keep game keys from scrolling the page / activating buttons.
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Tab') {
      try { e.preventDefault(); } catch { /* ignore */ }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!e || typeof e.code !== 'string') return;
    input.keys.delete(e.code);
  });

  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur so no key sticks.
  window.addEventListener('blur', () => {
    input.keys.clear();
    pressedSet.clear();
    input.mouseDown = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.keys.clear();
      pressedSet.clear();
      input.mouseDown = false;
    }
  });

  // Clicking the canvas requests pointer lock for mouse-look.
  window.addEventListener('click', (e) => {
    try {
      const canvas = findCanvas();
      if (!canvas) return;
      const t = e && e.target;
      if (t === canvas || (canvas.contains && canvas.contains(t))) requestLock();
    } catch { /* pointer lock is best-effort */ }
  });

  window.addEventListener('mousedown', (e) => {
    if (e && e.button === 0) input.mouseDown = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (e && e.button === 0) input.mouseDown = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!e) return;
    if (document.pointerLockElement) {
      input.mouseDX += typeof e.movementX === 'number' ? e.movementX : 0;
      input.mouseDY += typeof e.movementY === 'number' ? e.movementY : 0;
    }
  });

  return input;
}
