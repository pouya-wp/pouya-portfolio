/* The acts, and the scroll runway each one owns.

   Several were added after the original seven were already timed frame by frame: the
   single light, the anamorph, the gold sea and the butterflies. Inserting them moves every act that
   follows, which would ordinarily mean re-tuning about forty hand-set beat numbers
   in the WebGL timeline against new frames.

   None of them moved. HEAD_END and TAIL_AT below mark where the original timeline
   is squeezed into and where it picks up again, and the scene remaps its own
   progress through those two numbers - so the beats still read the positions they
   were composed at. See the `legacy` term in sculpture.tsx.

   `span` is the share of total scroll the act occupies. The DOM sections are sized
   from these numbers, so a section boundary in the page and an act boundary in the
   WebGL timeline are always the same scroll position. `at` is the cumulative start. */

export const ACTS = [
  { id: 'hero',       roman: 'ACT I',    name: 'The unbroken',        edge: 'PS-01 / SPECIMEN',      span: .085 },
  { id: 'fracture',   roman: 'ACT II',   name: 'Suspended time',      edge: 'PS-02 / ZERO GRAVITY',  span: .090 },
  { id: 'drop',       roman: 'ACT III',  name: 'Fall and repair',     edge: 'PS-03 / KINTSUGI',      span: .105 },
  { id: 'blueprint',  roman: 'ACT IV',   name: 'The working surface', edge: 'PS-04 / SELECTED WORK', span: .115 },
  { id: 'light',      roman: 'ACT V',    name: 'What the light makes',edge: 'PS-05 / ILLUMINATION',  span: .090 },
  { id: 'bewilder',   roman: 'ACT VI',   name: 'One station only',    edge: 'PS-06 / BEWILDERMENT',  span: .110 },
  { id: 'sea',        roman: 'ACT VII',  name: 'Everything it cost',  edge: 'PS-07 / GOLD',          span: .110 },
  { id: 'butterfly',  roman: 'ACT VIII', name: 'One reads the light', edge: 'PS-08 / THREE WINGS',   span: .105 },
  { id: 'manifesto',  roman: 'ACT IX',   name: 'The signal',          edge: 'PS-09 / POINT CLOUD',   span: .125 },
  { id: 'finale',     roman: 'ACT X',    name: 'Taking the square',   edge: 'PS-10 / METAMORPHOSIS', span: .048 },
  { id: 'contact',    roman: 'COLOPHON', name: 'The connection',      edge: 'PS-11 / CONTACT',       span: .017 },
] as const;

/** Where the original seven acts' opening stretch is compressed to, and where their
    closing stretch resumes. Everything between belongs to the three new acts. */
export const HEAD_END = .395;
export const TAIL_AT = .810;
/* The two positions in the *original* timeline that those map onto - and they are
   not the same position, deliberately. The old timeline has an optical flare across
   .731 to .746 that covers the hand-off out of the bench act. Freezing the seam on
   .735, which is the obvious choice, parks the whole three-act middle inside that
   flare and every one of them renders pure white. The head stops just short of it and
   the tail picks up just past it. */
export const LEGACY_HEAD = .726;
export const LEGACY_TAIL_FROM = .746;
export const LEGACY_TAIL_SPAN = 1 - LEGACY_TAIL_FROM;

export const TOTAL_VH = 2800;

/** `at` and `span` keyed by act id, for the scene, which asks for them by name. */
export const ACT_AT = Object.fromEntries(
  ACTS.map((act, i) => [act.id, ACTS.slice(0, i).reduce((sum, a) => sum + a.span, 0)]),
) as Record<typeof ACTS[number]['id'], number>;
export const ACT_SPAN = Object.fromEntries(
  ACTS.map(act => [act.id, act.span]),
) as Record<typeof ACTS[number]['id'], number>;

export const ACT_LAYOUT = ACTS.map((act, i) => {
  const at = ACTS.slice(0, i).reduce((sum, a) => sum + a.span, 0);
  return { ...act, at, height: Math.round(act.span * (TOTAL_VH - 100)) + (i === ACTS.length - 1 ? 100 : 0) };
});

/* The cast, and how it comes apart. Shared by the runtime and the offline bake, so
   the shards a visitor sees are the shards that were simulated.

   The seed count went from 26 to 44 so the cloud in act five has enough distinct
   bodies to converge out of. Change it and re-run `pnpm physics:bake`, or the drop
   plays back poses for shards that no longer exist. */
export const SCULPTURE = {
  url: '/sculpture.glb',
  /** world units from the base of the cast to the top of the head */
  height: 3.5,
  /** how many fragments leave the fracture. Most of these do not arrive. */
  shards: 44,
  /** wall thickness of the plaster shell */
  thickness: .055,
} as const;

/** How many shells the fracture actually produced. `shards` above is the number of
    seeds offered to the Voronoi; a few always collapse into their neighbours, so this
    is the count the bake reported and the count the page is allowed to print. Re-run
    `pnpm physics:bake` and put its number here if the seed count ever changes. */
export const FRAGMENTS = 43;

/** Thirty spokes share one hub. Lao Tzu, ch. 11 - and Attar's count, which is not
    a coincidence worth wasting. This number is an outcome, never an input. */
export const SURVIVORS = 30;

export const PROJECTS = [
  { id: 'sepehr', name: 'Sepehr', domain: 'sepehr.vision', url: 'https://sepehr.vision', number: '001', role: 'Design and build', year: '2026', live: true },
  { id: 'p4sadx', name: 'P4SADX', domain: 'p4sadx.vercell.app', url: 'https://p4sadx.vercell.app', number: '002', role: 'Design and build', year: '2025', live: false },
] as const;

/* The years the fragments carry. Bare numerals, no captions - anyone who wants to
   do the arithmetic can do it, and the silence is louder than the sentence would be.
   Wittgenstein 7, applied to a biography. */
export const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

/* What did not survive the making. Every portfolio ends with a small brag about its
   stack; this one ends with the wreckage. It is the only place the cost is admitted,
   and it is admitted flatly, without a single adjective. */
export const KILLED = [
  { what: 'A CRT the whole interface lived inside',        lived: '3 days' },
  { what: 'A night room, moonlight, a hand lifting a cup', lived: '1 day'  },
  { what: 'The history of the web, collapsing by decade',  lived: '4 hours'},
  { what: 'Nine acts',                                     lived: '2 days' },
  { what: 'A Pentium Gold, 2GB, a hard drive that howled', lived: '4 years'},
] as const;

export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const smooth = (p: number, a: number, b: number) => { const t = range(p, a, b); return t * t * (3 - 2 * t); };
export const windowOpacity = (p: number, a: number, b: number, fade = .025) => smooth(p, a, a + fade) * (1 - smooth(p, b - fade, b));
