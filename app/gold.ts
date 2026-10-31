/* The repair, on the wall clock.

   Everything else on this site is a function of scroll position, which means all of
   it can be had instantly by dragging the bar to the bottom. One thing cannot.

   Gold accrues in real seconds spent in front of the work. Scroll faster and you
   arrive at the same place with less of it. There is no way to buy it, skip it or
   scrub it, and nothing anywhere says so.

   Dogen: you are not inside time, you are time. A repair that could be scrubbed
   would be saying the opposite. */

const KEY = 'ps.gold';
/** real seconds of presence for a complete repair */
const FULL = 96;

export type Gold = ReturnType<typeof createGold>;

export function createGold() {
  let seconds = FULL;
  try {
    const stored = localStorage.getItem(KEY);
    seconds = stored !== null ? Math.max(0, Math.min(FULL, Number(stored) || FULL)) : FULL;
  } catch { seconds = FULL; }

  let flush = 0;

  return {
    /** 0..1 - how much of the break has actually been filled */
    get amount() { return seconds / FULL; },
    get seconds() { return seconds; },

    /** @param present 0..1 how much of this frame counts as time spent with the work */
    step(dt: number, present: number) {
      if (present <= 0) return;
      /* Time spent while tearing through the document is not time spent. This is the
         only place in the system where moving quickly takes something away outright,
         and it takes it by simply not counting, which is gentler than a penalty and
         harder to argue with. */
      seconds = Math.min(FULL, seconds + dt * present);

      flush += dt;
      if (flush > 4) {
        flush = 0;
        try { localStorage.setItem(KEY, seconds.toFixed(1)); } catch { /* nothing to do and nothing worth saying */ }
      }
    },
  };
}
