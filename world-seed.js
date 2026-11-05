// World construction is synchronous. Keep its randomness separate from combat
// and restore the caller's generator even when construction fails.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function withWorldSeed(seed, construct) {
  const previous = Math.random;
  Math.random = seededRandom(seed);
  try { return construct(); } finally { Math.random = previous; }
}
export function newWorldSeed() { return Math.floor(Math.random() * 4294967296) >>> 0; }
