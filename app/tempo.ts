/* The tempo engine.

   The site does not respond to where you are. It responds to how you are moving.

   An ensō is drawn in one breath and cannot be corrected, and Fletcher only ever
   says two things to a player. Both come down to the same mechanic: there is a
   pocket, you are either in it or you are not, and being told you are in it is not
   one of the things that happens.

   Three deliberate fairness rules, because a mechanic that punishes reading is not
   a philosophy, it is a bad website:

     1. Stillness is never dragging. Someone who has stopped to read is not playing
        and is not judged. Dragging is inching - moving continuously, slowly, the way
        a person scrubs a timeline looking for the end.
     2. A verdict needs the deviation to be *held*. One flick of a trackpad is not a
        tempo. HOLD is how long it has to last before the system says anything.
     3. Nothing is ever blocked and nothing is ever rewound. The only currency is
        fragments, and fragments are allowed to be lost. */

export type Verdict = 'rushing' | 'dragging' | null;

/* viewport heights per second */
const IDLE = .06;   // below this the reader has stopped; not playing, not judged
const DRAG = .24;   // between IDLE and here: inching
const RUSH = 1.18;  // above here: skimming

const HOLD = 1.05;      // seconds a deviation must persist before it is named
const COOLDOWN = 2.6;   // seconds before the same thing can be said again
const GRACE = 6;        // seconds at the top of the document where nothing is judged

export type Tempo = ReturnType<typeof createTempo>;

export function createTempo(strictness = 0) {
  /* Heraclitus, and Fletcher's real position: it is never enough. A reader who has
     been here before gets a narrower pocket. The band closes from both ends, but
     never past the point where an ordinary reading pace stops fitting inside it. */
  const squeeze = Math.min(strictness, 3) * .12;
  const drag = DRAG * (1 + squeeze);
  const rush = RUSH * (1 - squeeze * 1.35);

  let held = 0;            // seconds the current deviation has lasted
  let side: Verdict = null; // which way it is deviating right now
  let spoken: Verdict = null;
  let cooling = 0;
  let age = 0;
  let grip = 1;            // 0..1, how well the pocket is being held

  return {
    /** the two words, or null. Only non-null on the frame it is first earned. */
    verdict: null as Verdict,
    /** 0..1 for anything that wants to show the tempo without words */
    get grip() { return grip; },
    get pocket() { return [drag, rush] as const; },

    /** @param v signed scroll velocity in viewport heights per second */
    step(v: number, dt: number) {
      this.verdict = null;
      age += dt;
      cooling = Math.max(0, cooling - dt);

      const speed = Math.abs(v);
      const now: Verdict =
        speed < IDLE ? null            // stopped: not playing
          : speed < drag ? 'dragging'
            : speed > rush ? 'rushing'
              : null;                  // in the pocket

      const inPocket = now === null && speed >= IDLE;
      grip += ((inPocket || speed < IDLE ? 1 : 0) - grip) * (1 - Math.exp(-dt * (inPocket ? 2.2 : 5.5)));

      if (now !== side) { side = now; held = 0; }
      if (now === null) { spoken = null; return; }

      held += dt;
      if (age < GRACE) return;
      if (held < HOLD || cooling > 0) return;
      /* Saying the same word twice in a row is nagging, and nagging reads as a
         broken site rather than a strict one. It has to be earned again by leaving
         the deviation and coming back to it. */
      if (now === spoken) return;

      spoken = now;
      cooling = COOLDOWN;
      held = 0;
      this.verdict = now;
    },

    /** the reader left the pocket in a way that costs something */
    reset() { held = 0; side = null; spoken = null; },
  };
}

/* How strict this visit is. Heraclitus: the site does not reset, it continues.
   Stored as a plain count so a reader who clears storage simply starts again -
   there is nothing here worth defending against. */
const KEY = 'ps.visits';

export function readVisits(): number {
  try { return Math.max(0, Math.min(9, Number(localStorage.getItem(KEY)) || 0)); }
  catch { return 0; }
}

export function markVisit(): number {
  const next = readVisits() + 1;
  try { localStorage.setItem(KEY, String(next)); } catch { /* private mode; the visit is simply the first one, forever */ }
  return next;
}
