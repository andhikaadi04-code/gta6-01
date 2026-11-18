// Seeded random numbers (mulberry32) so the city and the screenshots are
// deterministic for a given seed. One job: randomness, nothing else.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  // A callable function (rng()) with the helpers attached, so callers can
  // use either style: rng() for a raw 0..1 draw, rng.pick(list), and so on.
  function rng() {
    return next();
  }
  rng.next = next;
  rng.range = (min, max) => min + next() * (max - min);
  rng.int = (min, max) => Math.floor(min + next() * (max - min + 1));
  rng.pick = (list) => list[Math.floor(next() * list.length)];
  rng.chance = (p) => next() < p;
  return rng;
}
