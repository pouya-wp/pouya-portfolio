/* Smooth scrolling without a library and without hijacking the document.

   The native scrollbar, sticky pinning and anchor links all keep working: we only
   intercept the wheel and the keyboard, integrate a target position, and move the
   real scroll towards it each frame. Touch is left alone - phone scrolling is
   already smooth and fighting it only adds lag. */

type State = {
  target: number;
  current: number;
  enabled: boolean;
  /** the last position we wrote ourselves, so our own scroll events are ignored */
  written: number;
};

const state: State = { target: 0, current: 0, enabled: false, written: -1 };

const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
const clamp = (v: number) => Math.max(0, Math.min(maxScroll(), v));

/** Scroll to an absolute position through the same easing as the wheel. */
export function scrollToY(y: number, instant = false): void {
  if (!state.enabled) { scrollTo({ top: y, behavior: instant ? 'instant' : 'smooth' }); return; }
  state.target = clamp(y);
  if (instant) { state.current = state.target; state.written = state.target; scrollTo(0, state.target); }
}

function isModalActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('dialog[open], .case[open], .sitemap-modal, .commission-dialog[open], .cv-dialog[open]');
}

function isScrollableTarget(target: Element | null): boolean {
  if (!target) return false;
  if (isModalActive()) return true;
  if (target.closest('dialog, [role="dialog"], [data-native-scroll], .cv-dialog, .cv-container, .cv-document, .oracle-monolith, .oracle-ledger, .commission-dialog, .sitemap-modal, .case, .case-copy, #case-study, .portal')) {
    return true;
  }
  let el: Element | null = target;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function attachSmoothScroll(): () => void {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (coarse || reduced) return () => { };

  state.enabled = true;
  state.target = state.current = scrollY;

  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey) return;                       // pinch zoom
    if (isScrollableTarget(e.target as Element | null)) return;
    e.preventDefault();
    // deltaMode 1 is lines, 2 is pages
    const scale = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? innerHeight : 1.15;
    state.target = clamp(state.target + e.deltaY * scale);
  };

  const keys = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
    if (isScrollableTarget(target)) return;
    const page = innerHeight * .86;
    const step: Record<string, number> = {
      ArrowDown: 110, ArrowUp: -110,
      PageDown: page, PageUp: -page,
      ' ': e.shiftKey ? -page : page,
      Home: -maxScroll(), End: maxScroll(),
    };
    const delta = step[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    state.target = e.key === 'Home' ? 0 : e.key === 'End' ? maxScroll() : clamp(state.target + delta);
  };

  /* Dragging the scrollbar, find-in-page and anchor jumps have to be adopted, but our
     own scrollTo also raises this event - asynchronously, long after the flag a
     synchronous guard would have cleared. So the test is positional instead: a scroll
     that landed where we last put it is ours, and anything else is the user's. */
  const sync = () => {
    if (Math.abs(scrollY - state.written) < 1.5) { state.current = scrollY; return; }
    state.target = state.current = scrollY;
  };
  const resize = () => { state.target = clamp(state.target); };

  addEventListener('wheel', wheel, { passive: false });
  addEventListener('keydown', keys);
  addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', resize);

  return () => {
    state.enabled = false;
    removeEventListener('wheel', wheel);
    removeEventListener('keydown', keys);
    removeEventListener('scroll', sync);
    removeEventListener('resize', resize);
  };
}

/** Called once per frame from the page loop, before anything reads scrollY. */
export function stepSmoothScroll(dt: number): void {
  if (!state.enabled) return;
  const distance = state.target - state.current;
  if (Math.abs(distance) < .06) { state.current = state.target; return; }
  // a resize can move the ceiling under us
  state.target = clamp(state.target);
  state.current += distance * (1 - Math.exp(-dt * 13));
  state.written = state.current;
  scrollTo(0, state.current);
}
