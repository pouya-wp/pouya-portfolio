/* Single source of truth for the pointer.
   The WebGL cursor, the DOM label and the magnetic pills all read from here, so
   they can never drift apart by a frame. */

export const TRAIL = 8;
/** how many model vertices the cursor tracks at once */
export const TRACKS = 6;

type State = {
  /** raw target in uv space (0..1, y up) */
  tx: number; ty: number;
  /** spring-smoothed head */
  x: number; y: number;
  /** tapered followers, [x0,y0,x1,y1,...] head first */
  trail: Float32Array;
  /** 0 idle, 1 over something interactive */
  hover: number; hoverTarget: number;
  press: number; pressTarget: number;
  /** ripple triggered on click, 0..1 then released */
  ripple: number;
  /** how fast the pointer is travelling, in uv units per second */
  speed: number;
  /** 0 while the pointer is off the window */
  presence: number; presenceTarget: number;
  /** label shown next to the cursor, '' hides it */
  label: string;
  /** true once a real mouse has moved: touch devices never get a WebGL cursor */
  active: boolean;
  /** raised by the 3D scene when the pointer is over something it owns */
  scene: number;
  /** screen-space vertices the cursor has latched on to: x, y in uv, then strength */
  tracks: Float32Array;
};

export const pointer: State = {
  tx: .5, ty: .5, x: .5, y: .5,
  trail: new Float32Array(TRAIL * 2).fill(.5),
  hover: 0, hoverTarget: 0,
  press: 0, pressTarget: 0,
  ripple: 0,
  speed: 0,
  presence: 0, presenceTarget: 0,
  label: '',
  active: false,
  scene: 0,
  tracks: new Float32Array(TRACKS * 3),
};

const damp = (a: number, b: number, lambda: number, dt: number) => b + (a - b) * Math.exp(-lambda * dt);

let onLabel: ((label: string) => void) | null = null;
export const onCursorLabel = (fn: (label: string) => void) => { onLabel = fn; };

/** Elements are tagged with data-cursor="LABEL" (empty string = plain hover state). */
const interactive = 'a,button,input,iframe,[data-cursor],.pointer';

export function attachPointer(): () => void {
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointer.active = true;
    pointer.tx = e.clientX / innerWidth;
    pointer.ty = 1 - e.clientY / innerHeight;
    pointer.presenceTarget = 1;
    const hit = (e.target as Element | null)?.closest?.(interactive) as HTMLElement | null;
    const label = hit ? (hit.dataset.cursor ?? '') : '';
    pointer.hoverTarget = hit ? 1 : 0;
    if (label !== pointer.label) { pointer.label = label; onLabel?.(label); }
  };
  const down = () => { pointer.pressTarget = 1; pointer.ripple = .0001; };
  const up = () => { pointer.pressTarget = 0; };
  const out = () => { pointer.presenceTarget = 0; pointer.hoverTarget = 0; if (pointer.label) { pointer.label = ''; onLabel?.(''); } };
  const enter = () => { if (pointer.active) pointer.presenceTarget = 1; };

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', down, { passive: true });
  window.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('pointerleave', out);
  document.addEventListener('pointerenter', enter);
  window.addEventListener('blur', out);

  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    document.removeEventListener('pointerleave', out);
    document.removeEventListener('pointerenter', enter);
    window.removeEventListener('blur', out);
  };
}

let lastNow = -1;

/** Safe to call from more than one rAF in the same frame: all callbacks in a frame
    receive the same timestamp, so the second call is a no-op. */
export function stepPointer(now: number): void {
  if (now === lastNow) return;
  const dt = lastNow < 0 ? 1 / 60 : Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  const px = pointer.x, py = pointer.y;
  // the head is the pointer, exactly: any smoothing here reads as the cursor
  // lagging the mouse, which is the one thing a cursor may never do
  pointer.x = pointer.tx;
  pointer.y = pointer.ty;
  const t = pointer.trail;
  t[0] = pointer.x; t[1] = pointer.y;
  for (let i = 1; i < TRAIL; i++) {
    const lambda = 34 - i * 2.4;
    t[i * 2] = damp(t[i * 2], t[i * 2 - 2], lambda, dt);
    t[i * 2 + 1] = damp(t[i * 2 + 1], t[i * 2 - 1], lambda, dt);
  }
  const travelled = Math.hypot(pointer.x - px, pointer.y - py);
  pointer.speed = damp(pointer.speed, dt > 0 ? travelled / dt : 0, 9, dt);
  pointer.hover = damp(pointer.hover, Math.max(pointer.hoverTarget, pointer.scene), 12, dt);
  pointer.press = damp(pointer.press, pointer.pressTarget, 20, dt);
  pointer.presence = damp(pointer.presence, pointer.presenceTarget, 10, dt);
  if (pointer.ripple > 0) { pointer.ripple += dt * 1.9; if (pointer.ripple > 1) pointer.ripple = 0; }
}
