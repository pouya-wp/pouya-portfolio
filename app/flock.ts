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
      const n = Math.max(2, trace.length);
      for (let i = 0; i < SURVIVORS; i++) {
        const t = i / SURVIVORS;
        const angle = t * Math.PI * 1.87 - Math.PI * .42;

        const at = t * (n - 1);
        const lo = Math.floor(at), hi = Math.min(lo + 1, n - 1);
        const f = at - lo;
        const a = trace[lo] ?? { x: .5, y: .5, grip: 1, p: 0 };
        const b = trace[hi] ?? a;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        const g = a.grip + (b.grip - a.grip) * f;

        const wander = Math.hypot(x - .5, y - .5) * 2;
        const radius = 2.45 + wander * 1.6;

        out.push([
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * .82,
          (t - .5) * 2.6 * (1 - g) + (y - .5) * 1.4,
        ]);
      }
      return out;
    },

    /**
     * Generates a continuous, celestial Golden Ensō point cloud with thirty radiant star
     * nodes, organic calligraphic dust ribbon, and helical filigree filaments.
     * Replaces discrete square box clusters with fluid, organic starlight.
     */
    generateArrivalCloud(count: number, random: () => number): Float32Array {
      const target = new Float32Array(count * 3);
      const n = Math.max(2, trace.length);

      const getCurvePoint = (t: number) => {
        const angle = t * Math.PI * 1.88 - Math.PI * 0.44;
        const at = t * (n - 1);
        const lo = Math.floor(at), hi = Math.min(lo + 1, n - 1);
        const f = at - lo;
        const a = trace[lo] ?? { x: .5, y: .5, grip: 1, p: 0 };
        const b = trace[hi] ?? a;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        const g = a.grip + (b.grip - a.grip) * f;

        const wander = Math.hypot(x - .5, y - .5) * 2;
        const radius = 2.45 + wander * 1.5;

        const cx = Math.cos(angle) * radius;
        const cy = Math.sin(angle) * radius * 0.84;
        const cz = (t - .5) * 2.2 * (1 - g) + (y - .5) * 1.2;

        const tx = -Math.sin(angle) * radius;
        const ty = Math.cos(angle) * radius * 0.84;
        const len = Math.hypot(tx, ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;

        return { cx, cy, cz, nx, ny, radius, angle };
      };

      // 1. The 30 Radiant Star Jewels (~2,700 particles, 90 per star)
      // Uses true 3D spherical Gaussian dispersion for soft luminous star cores
      const STAR_PARTICLES = 2700;
      const PARTICLES_PER_STAR = Math.floor(STAR_PARTICLES / SURVIVORS);
      for (let s = 0; s < SURVIVORS; s++) {
        const starT = s / (SURVIVORS - 1);
        const { cx, cy, cz } = getCurvePoint(starT);
        for (let p = 0; p < PARTICLES_PER_STAR; p++) {
          const idx = s * PARTICLES_PER_STAR + p;
          const u1 = Math.max(1e-5, random());
          const u2 = random();
          const u3 = random();
          const rSpread = 0.09 * Math.sqrt(-2 * Math.log(u1));
          const theta = Math.acos(2 * u2 - 1);
          const phi = u3 * Math.PI * 2;

          target[idx * 3]     = cx + rSpread * Math.sin(theta) * Math.cos(phi);
          target[idx * 3 + 1] = cy + rSpread * Math.sin(theta) * Math.sin(phi);
          target[idx * 3 + 2] = cz + rSpread * Math.cos(theta);
        }
      }

      // 2. The Continuous Calligraphic Golden Ensō Ribbon (~6,500 particles)
      // Smooth flowing river of golden dust with natural brush taper
      const RIBBON_START = STAR_PARTICLES;
      const RIBBON_COUNT = 6500;
      for (let i = 0; i < RIBBON_COUNT; i++) {
        const idx = RIBBON_START + i;
        const t = i / (RIBBON_COUNT - 1);
        const { cx, cy, cz, nx, ny } = getCurvePoint(t);

        const brushWidth = 0.22 * Math.pow(Math.sin(t * Math.PI), 0.65) + 0.05;
        const u1 = Math.max(1e-5, random());
        const u2 = random();
        const lateralSpread = (Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)) * brushWidth * 0.45;
        const zSpread = (random() + random() - 1) * 0.08;

        target[idx * 3]     = cx + nx * lateralSpread;
        target[idx * 3 + 1] = cy + ny * lateralSpread;
        target[idx * 3 + 2] = cz + zSpread;
      }

      // 3. Orbital Filaments & Stardust Halo (remaining particles)
      const FILAMENT_START = RIBBON_START + RIBBON_COUNT;
      const FILAMENT_COUNT = count - FILAMENT_START;
      for (let i = 0; i < FILAMENT_COUNT; i++) {
        const idx = FILAMENT_START + i;
        const t = i / Math.max(1, FILAMENT_COUNT - 1);
        const { cx, cy, cz } = getCurvePoint(t);

        if (i % 3 === 0) {
          const helixAngle = t * Math.PI * 20;
          const helixRadius = 0.16 * Math.sin(t * Math.PI);
          target[idx * 3]     = cx + Math.cos(helixAngle) * helixRadius;
          target[idx * 3 + 1] = cy + Math.sin(helixAngle) * helixRadius;
          target[idx * 3 + 2] = cz + Math.sin(helixAngle * 0.5) * helixRadius * 0.8;
        } else {
          const u1 = Math.max(1e-5, random());
          const u2 = random();
          const mistR = 0.26 * Math.sqrt(-2 * Math.log(u1));
          const mistAngle = u2 * Math.PI * 2;
          target[idx * 3]     = cx + Math.cos(mistAngle) * mistR;
          target[idx * 3 + 1] = cy + Math.sin(mistAngle) * mistR;
          target[idx * 3 + 2] = cz + (random() - 0.5) * 0.18;
        }
      }

      return target;
    },
  };
}
