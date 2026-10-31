/* The one channel between the page and the scene.

   The DOM half owns the scroll loop and writes here; the WebGL half reads here and
   never touches React state. Everything in this object is written and read every
   frame, so it is a single mutable record rather than a store: a re-render at 60Hz
   would cost more than the entire render loop underneath it. */

export type Signals = {
  /** 0..1 through the whole document */
  progress: number;
  /** signed viewport heights per second, smoothed */
  velocity: number;
  /** 0..1 how well the reader is holding the pocket */
  grip: number;
  /** set for one frame when the system has something to say */
  verdict: 'rushing' | 'dragging' | null;
  /** how many fragments are still travelling */
  alive: number;
  /** 0..1 of the repair that real time has actually paid for */
  gold: number;
  /** 0..1 pointer across the viewport, y up */
  px: number;
  py: number;
  /** how strict this visit is: 0 on a first arrival */
  strictness: number;
  /** 0..1 how near the reader is to the one station the anamorph resolves from */
  aligned: number;
  /** 1 while the reader is holding the world's geometry open */
  zen: number;
  /** what the render governor is doing, read by the ?perf panel */
  perf: { fps: number; ms: number; tier: number; pr: number; pixels: number; idle: boolean };
};

export const signals: Signals = {
  progress: 0,
  velocity: 0,
  grip: 1,
  verdict: null,
  alive: 0,
  gold: 1,
  px: .5,
  py: .5,
  strictness: 0,
  aligned: 0,
  zen: 0,
  perf: { fps: 0, ms: 0, tier: 0, pr: 1, pixels: 0, idle: false },
};
