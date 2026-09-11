/* The reader's path, and the thirty places it becomes.

   Attar: thousands of birds set out and thirty arrive, and what they find at the end
   of the road is that the thing they were looking for was the thing they already
   were. Lao Tzu, chapter 11: thirty spokes share one hub, and it is the hole in the
   middle that makes the wheel work. The same number twice, from two directions, and
   it would be a waste not to use it.

   So: every frame this records where the reader was and how they were moving. At the
   end of act five the record is resampled to exactly thirty points and the eleven
   thousand particles of the manifesto cloud converge on those. The shape that
   resolves was being drawn by the person watching, the entire way, without ever
   being told that it was.

   Nothing in here can be failed. Thirty is what arrives whatever the reader does -
   a reader who barely moved gets a tight knot, a reader who wandered gets a long
   line, and both are true portraits. That is the whole point of it. */

import { SURVIVORS } from './story';

export type Flock = ReturnType<typeof createFlock>;

export function createFlock() {
  /* Sampled on a fixed interval rather than per frame, so a 120Hz display and a
     60Hz display record the same shape rather than one twice as dense. */
  const trace: { p: number; x: number; y: number; grip: number }[] = [];
  let clock = 0;

  return {
    get trace() { return trace; },

    step(p: number, dt: number, pointerX: number, pointerY: number, grip: number) {
      clock += dt;
      if (clock < .1) return;
      clock = 0;
      const last = trace[trace.length - 1];
      // only when the reader has actually gone somewhere new
      if (!last || Math.abs(p - last.p) > .0015) trace.push({ p, x: pointerX, y: pointerY, grip });
      if (trace.length > 900) trace.shift();
    },

    /** thirty places to stand, in world units */
    signature(): [number, number, number][] {
      const out: [number, number, number][] = [];

      /* A ring is the base, and it is not decoration - it is the guarantee.

         The first version of this read the portrait straight off the cursor track,
         which collapses to a single dot for anyone who scrolls without moving the
         mouse: a trackpad user who scrolls with two fingers, a keyboard user, anyone
         on a phone. Eleven thousand particles landing on one point is not a reading
         of their visit, it is a bug that happens to be philosophically excusable.

         So the ring is always there and always legible, and what the reader did
         deforms it: how far they wandered opens and closes the radius, how well they
         held tempo decides how far it leans out of plane. A reader who never touched
         the pointer gets a clean circle, deliberately left open, which is the right
         portrait of that visit and happens to be the oldest drawing in the book. */
      const n = Math.max(2, trace.length);
      for (let i = 0; i < SURVIVORS; i++) {
        const t = i / SURVIVORS;
        // deliberately short of a full turn: the ensō is not closed
        const angle = t * Math.PI * 1.87 - Math.PI * .42;

        const at = t * (n - 1);
        const lo = Math.floor(at), hi = Math.min(lo + 1, n - 1);
        const f = at - lo;
        const a = trace[lo] ?? { x: .5, y: .5, grip: 1, p: 0 };
        const b = trace[hi] ?? a;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        const g = a.grip + (b.grip - a.grip) * f;

        /* distance from the middle of the frame, so a reader who kept the cursor
           parked reads as a tight ring and one who ranged about reads as a loose,
           buckled one */
        const wander = Math.hypot(x - .5, y - .5) * 2;
        const radius = 2.45 + wander * 1.6;

        out.push([
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * .82,
          // held tempo sits the ring flat to the lens; a broken one twists it away
          (t - .5) * 2.6 * (1 - g) + (y - .5) * 1.4,
        ]);
      }
      return out;
    },
  };
}
