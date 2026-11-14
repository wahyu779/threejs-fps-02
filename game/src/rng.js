// Satu-satunya sumber keacakan di game: mulberry32 yang di-seed dari URL (?seed=N).
// Semua yang memakai angka acak — penyebaran tembakan, bidikan bot, pilihan situs —
// lewat generator ini, jadi satu seed selalu menghasilkan ronde yang sama.
export function mulberry32(initialSeed) {
  let a = initialSeed | 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickRandom(random, list) {
  return list[Math.floor(random() * list.length)];
}

export function rangeRandom(random, low, high) {
  return low + random() * (high - low);
}
