// WebAudio-only sound for SOLMAR BAY: engine hum, police siren, gunshot,
// punch, pickup blip, mission jingle, and a quiet Am-F-C-G music loop.
// No audio files. The AudioContext is created lazily on the first user
// gesture (ensure() is called inside every method).

export function createAudio(G) {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  let engOsc1 = null;
  let engOsc2 = null;
  let engGain = null;
  let engFilter = null;

  let sirenOsc = null;
  let sirenGain = null;
  let sirenOn = false;
  let sirenTimer = 0;
  let sirenHigh = false;

  // Music sequencer state (~100 BPM, one bar = 4 beats = 2.4 s).
  const CHORDS = [
    { bass: 55.0, pad: [220.0, 261.63, 329.63] }, // Am
    { bass: 43.65, pad: [174.61, 220.0, 261.63] }, // F
    { bass: 65.41, pad: [196.0, 261.63, 329.63] }, // C
    { bass: 49.0, pad: [196.0, 246.94, 293.66] }, // G
  ];
  const BEAT = 0.6;
  let musicStarted = false;
  let nextBarTime = 0;
  let chordIndex = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.4;
      master.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch {
      ctx = null;
      return null;
    }
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    if (!ctx) return null;
    try {
      const len = Math.floor(ctx.sampleRate * 1);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return noiseBuf;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, type, vol, when, dest) {
    if (!ctx || !master) return;
    try {
      const t0 = typeof when === 'number' ? when : ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(dest || master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch { /* a failed blip must never break the game */ }
  }

  function engine(s01) {
    const c = ensure();
    if (!c) return;
    try {
      if (!engOsc1) {
        engFilter = c.createLowpassFilter();
        engFilter.type = 'lowpass';
        engFilter.frequency.value = 400;
        engFilter.Q.value = 1;
        engGain = c.createGain();
        engGain.gain.value = 0;
        engOsc1 = c.createOscillator();
        engOsc1.type = 'sawtooth';
        engOsc1.frequency.value = 60;
        engOsc2 = c.createOscillator();
        engOsc2.type = 'square';
        engOsc2.frequency.value = 30;
        const subGain = c.createGain();
        subGain.gain.value = 0.5;
        engOsc1.connect(engFilter);
        engOsc2.connect(subGain);
        subGain.connect(engFilter);
        engFilter.connect(engGain);
        engGain.connect(master);
        engOsc1.start();
        engOsc2.start();
      }
      const s = Math.max(0, Math.min(1, Number(s01) || 0));
      const freq = 60 + s * 100; // 60 Hz .. 160 Hz
      const t = c.currentTime;
      engOsc1.frequency.setTargetAtTime(freq, t, 0.05);
      engOsc2.frequency.setTargetAtTime(freq / 2, t, 0.05);
      engFilter.frequency.setTargetAtTime(300 + s * 900, t, 0.05);
      let inCar = false;
      try {
        inCar = !!(G && G.player && G.player.inCar);
      } catch { inCar = false; }
      engGain.gain.setTargetAtTime(inCar ? 0.09 : 0.025, t, 0.1);
    } catch { /* engine hum is decorative */ }
  }

  function siren(on) {
    const c = ensure();
    if (!c) return;
    try {
      if (on && !sirenOsc) {
        sirenOsc = c.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 700;
        sirenGain = c.createGain();
        sirenGain.gain.value = 0.05;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenOn = true;
        sirenHigh = false;
        sirenTimer = 0;
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); } catch { /* already stopped */ }
        try { sirenOsc.disconnect(); } catch { /* already gone */ }
        sirenOsc = null;
        sirenGain = null;
        sirenOn = false;
      }
    } catch { /* siren is decorative */ }
  }

  function shot() {
    const c = ensure();
    if (!c) return;
    try {
      const buf = getNoise();
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.2);
    } catch { /* a failed shot sound must never break combat */ }
  }

  function punch() {
    const c = ensure();
    if (!c) return;
    try {
      const buf = getNoise();
      if (buf) {
        const src = c.createBufferSource();
        src.buffer = buf;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        const g = c.createGain();
        const t = c.currentTime;
        g.gain.setValueAtTime(0.6, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        src.connect(filter);
        filter.connect(g);
        g.connect(master);
        src.start(t);
        src.stop(t + 0.15);
      }
      tone(90, 0.12, 'sine', 0.5);
    } catch { /* a failed thump must never break combat */ }
  }

  function pickup() {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime;
      tone(880, 0.12, 'sine', 0.25, t);
      tone(1318.5, 0.18, 'sine', 0.25, t + 0.1);
    } catch { /* pickup blip is decorative */ }
  }

  function jingle() {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      for (let i = 0; i < notes.length; i += 1) {
        tone(notes[i], 0.28, 'triangle', 0.3, t + i * 0.13);
      }
    } catch { /* jingle is decorative */ }
  }

  function setMuted(b) {
    muted = !!b;
    if (ctx && master) {
      try {
        master.gain.setTargetAtTime(muted ? 0 : 0.4, ctx.currentTime, 0.02);
      } catch { /* mute toggle is best-effort */ }
    }
  }

  function scheduleBar(when, chord) {
    // Bass: one soft triangle note per beat on the chord root.
    for (let beat = 0; beat < 4; beat += 1) {
      tone(chord.bass, BEAT * 0.9, 'triangle', 0.12, when + beat * BEAT);
    }
    // Pad: two detuned saws through a lowpass, whole bar, slow swell.
    try {
      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, when);
      padGain.gain.linearRampToValueAtTime(0.035, when + 0.4);
      padGain.gain.setValueAtTime(0.035, when + BEAT * 4 - 0.4);
      padGain.gain.linearRampToValueAtTime(0.0001, when + BEAT * 4);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(padGain);
      padGain.connect(master);
      for (const f of chord.pad) {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;
          osc.detune.value = detune;
          osc.connect(filter);
          osc.start(when);
          osc.stop(when + BEAT * 4 + 0.05);
        }
      }
    } catch { /* a failed pad bar must never break the loop */ }
  }

  function update(dt) {
    // M toggles mute (edge-triggered, only if the input module exists).
    try {
      if (G && G.input && typeof G.input.pressed === 'function' && G.input.pressed('KeyM')) {
        setMuted(!muted);
      }
    } catch { /* mute toggle is best-effort */ }

    // Siren two-tone alternation (700 / 950 Hz, ~0.4 s each side).
    if (sirenOn && sirenOsc && ctx) {
      sirenTimer += typeof dt === 'number' ? dt : 0;
      if (sirenTimer >= 0.4) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        try {
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.02);
        } catch { /* siren wobble is decorative */ }
      }
    }

    // Music lookahead scheduler: keep ~0.3 s of bars queued. The context is
    // only created by a gesture-driven method (engine/shot/...); update()
    // never creates it, so music starts after the first user gesture.
    if (!ctx || muted) return;
    if (ctx.state !== 'running') return;
    const c = ctx;
    try {
      if (!musicStarted) {
        musicStarted = true;
        nextBarTime = c.currentTime + 0.1;
        chordIndex = 0;
      }
      while (nextBarTime < c.currentTime + 0.3) {
        scheduleBar(nextBarTime, CHORDS[chordIndex % CHORDS.length]);
        chordIndex += 1;
        nextBarTime += BEAT * 4;
      }
    } catch { /* music is decorative */ }
  }

  return { update, engine, siren, shot, punch, pickup, jingle, setMuted };
}
