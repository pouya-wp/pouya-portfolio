/* The curtain, and how it comes apart.

   The first version split it down a zigzag. A zigzag is a diagram of a crack, not a
   crack: it is regular, it has one width everywhere, and the eye reads it as a graphic
   device in about a fifth of a second.

   This breaks the pane the same way the cast breaks - into Voronoi cells around
   scattered seeds - so the loader is speaking the language the whole piece is written
   in before the piece has started. The shards are real polygons, generated once, and
   they leave on a GSAP timeline that throws each one on its own vector.

   WHY THE CELLS ARE BUILT BY CLIPPING RATHER THAN BY A VORONOI LIBRARY

   A cell of a Voronoi diagram is the set of points closer to its own seed than to any
   other, which is the intersection of one half-plane per rival seed. So: start each
   cell as the whole screen and clip it against the perpendicular bisector to every
   other seed. That is Sutherland-Hodgman, it is forty lines, it is exact, and it runs
   once at module load for twenty-odd cells. A dependency for this would be heavier
   than the code. */

type Point = [number, number];

/** clip a convex polygon to the half-plane on the near side of a bisector */
function clipToBisector(poly: Point[], seed: Point, rival: Point): Point[] {
  /* The bisector of two points, as a line: every x with dot(n, x) <= d is nearer to
     `seed` than to `rival`. n is the direction between them, d the midpoint along it. */
  const nx = rival[0] - seed[0];
  const ny = rival[1] - seed[1];
  const d = (nx * (seed[0] + rival[0]) + ny * (seed[1] + rival[1])) / 2;

  const inside = (p: Point) => nx * p[0] + ny * p[1] <= d;
  const out: Point[] = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      // where the edge crosses the bisector
      const da = nx * a[0] + ny * a[1] - d;
      const db = nx * b[0] + ny * b[1] - d;
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export type Shard = {
  /** a CSS clip-path polygon, in percentages of the viewport */
  clip: string;
  /** the cell's centre, 0..100, which is where it is thrown from */
  cx: number;
  cy: number;
};

/* Seeds are jittered off a grid rather than uniformly random.

   Pure random gives clumps, and a clump of seeds makes a cluster of slivers next to
   one enormous cell - which looks like a mistake rather than like a break. A jittered
   grid keeps the cells within a size of each other while leaving every edge irregular,
   which is what a real fracture pattern looks like. */
export function shatterCells(columns = 6, rows = 4, jitter = .62, random = Math.random): Shard[] {
  const seeds: Point[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const cellW = 100 / columns;
      const cellH = 100 / rows;
      seeds.push([
        (x + .5 + (random() - .5) * jitter) * cellW,
        (y + .5 + (random() - .5) * jitter) * cellH,
      ]);
    }
  }

  /* A generous margin on the starting rectangle. Cells on the edge of the screen are
     unbounded in a true Voronoi diagram; clipping them to a box that is larger than
     the viewport and letting overflow hide the rest is both correct and free. */
  const M = 40;
  return seeds.map(seed => {
    let poly: Point[] = [[-M, -M], [100 + M, -M], [100 + M, 100 + M], [-M, 100 + M]];
    for (const rival of seeds) {
      if (rival === seed) continue;
      poly = clipToBisector(poly, seed, rival);
      if (poly.length < 3) break;
    }
    const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
    const cy = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
    return {
      clip: `polygon(${poly.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`,
      cx, cy,
    };
  });
}
