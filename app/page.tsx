'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Sculpture from './sculpture';
import { ACT_LAYOUT, FRAGMENTS, KILLED, PROJECTS, clamp, windowOpacity } from './story';
import { Soundscape, type Effect } from './soundscape';
import { attachPointer, onCursorLabel, pointer, stepPointer } from './pointer';
import { attachSmoothScroll, scrollToY, stepSmoothScroll } from './smooth-scroll';
import { createTempo, markVisit, type Verdict } from './tempo';
import { createGold } from './gold';
import { signals } from './signals';
import gsap from 'gsap';
import { analytics } from './analytics';
import { AssistantWidget } from './assistant';
import { ResumeModal } from './resume';
import { CommissionModal } from './commission-modal';

/* Fill these in and the matching capsules appear in the colophon. Nothing here is
   invented: an empty value simply renders nothing. */
const CONTACT: { email: string; links: { label: string; handle: string; url: string }[] } = {
  email: 'pouyas.one@outlook.com',
  links: [
    { label: 'LinkedIn', handle: 'in/onepouya', url: 'https://linkedin.com/in/onepouya' },
    { label: 'GitHub', handle: '@pouya-wp', url: 'https://github.com/pouya-wp' },
    { label: 'Telegram', handle: '@pouya_dmg', url: 'https://t.me/pouya_dmg' },
    { label: 'Instagram', handle: '@pouya.sadeghpour', url: 'https://www.instagram.com/pouya.sadeghpour/' },
  ],
};

/* ------------------------------------------------------------------ helpers */

/** Two stacked copies of every glyph; the stack slides up on hover. */
function Flip({ children }: { children: string }) {
  /* The glyph stack is hidden from assistive tech, so the word itself has to be
     spoken by something: aria-label on a plain span is ignored, which left every
     link built on this with no accessible name at all. */
  return (
    <span className="flip">
      <span className="sr-only">{children}</span>
      {children.split('').map((ch, i) => (
        <i key={i} style={{ '--i': i } as React.CSSProperties} aria-hidden="true">
          <span>{ch === ' ' ? ' ' : ch}</span>
          <span>{ch === ' ' ? ' ' : ch}</span>
        </i>
      ))}
    </span>
  );
}

/** The live site beside a case study. Keyed by project, so moving to the next case
    starts it fresh. If framed previews are restricted by CSP or network latency exceeds
    threshold, smoothly presents a bespoke architectural telemetry dashboard. */
function LivePreview({ project }: { project: typeof PROJECTS[number] }) {
  const [shouldEmbed, setShouldEmbed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    return project.embeddable && !saveData && matchMedia('(min-width: 1024px)').matches;
  });
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shouldEmbed || loaded) return;

    // 5.5s timeout: if live framing is stalled or blocked by origin policy, reveal architectural card
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 5500);

    return () => clearTimeout(timer);
  }, [shouldEmbed, loaded]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(project.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* ignored */ }
  };

  const showIframe = shouldEmbed && !timedOut;

  return (
    <aside className="case-preview" aria-label={`${project.name}, live deployment preview`}>
      {showIframe ? (
        <div className="case-frame-container">
          <div className="case-frame-header" aria-hidden="true">
            <span className="case-frame-dot" />
            <span className="case-frame-origin">{project.domain}</span>
            <span className="case-frame-status">{loaded ? 'LIVE // SECURE' : 'INITIALIZING STREAM...'}</span>
          </div>
          <iframe
            className={`case-frame ${loaded ? 'is-ready' : 'is-loading'}`}
            src={project.url}
            title={`${project.name} website, live`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setTimedOut(true)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          {!loaded && (
            <div className="case-loading" aria-hidden="true">
              <span className="case-loading-spin" />
              <span className="case-loading-domain">{project.domain}</span>
              <span className="case-loading-sub">Connecting to production edge...</span>
            </div>
          )}
        </div>
      ) : (
        <div className="case-blueprint-card">
          <div className="blueprint-top">
            <span className="blueprint-status">
              <i className="blueprint-pulse" /> VERIFIED PRODUCTION DEPLOYMENT
            </span>
            <span className="blueprint-edition">{project.year} &middot; PS-{project.number}</span>
          </div>

          <div className="blueprint-center">
            <span className="blueprint-label">DIRECT PRODUCTION ARTIFACT</span>
            <h3 className="blueprint-domain">{project.domain}</h3>
            <p className="blueprint-desc">{project.tagline}</p>
          </div>

          <div className="blueprint-telemetry">
            <div className="blueprint-telemetry-row">
              <span className="t-micro t-dim">STATUS</span>
              <span className="t-mono t-gold">ACTIVE // PRODUCTION</span>
            </div>
            <div className="blueprint-telemetry-row">
              <span className="t-micro t-dim">TECH STACK</span>
              <span className="t-mono">{project.stack.slice(0, 4).join(' · ')}</span>
            </div>
            {project.metric && (
              <div className="blueprint-telemetry-row">
                <span className="t-micro t-dim">BENCHMARK</span>
                <span className="t-mono">{project.metric.split('·')[0].trim()}</span>
              </div>
            )}
          </div>

          <div className="blueprint-actions">
            <a
              className="pill is-gold"
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="LAUNCH"
            >
              <span className="pill-dot" />Launch {project.domain}{' '}
              <span className="pill-arrow" aria-hidden="true">&#8599;</span>
            </a>
            <button
              className="pill is-dashed"
              onClick={copyUrl}
              data-cursor="COPY"
            >
              {copied ? 'Copied Link ✓' : 'Copy Clean URL'}
            </button>
            {project.embeddable && (
              <button
                className="pill is-ghost"
                onClick={() => { setTimedOut(false); setShouldEmbed(true); }}
                data-cursor="EMBED"
              >
                Mount Live Frame ⟳
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/** The case study a card opens into. */
function CaseStudy({ project, index, total, onClose, onStep }: {
  project: typeof PROJECTS[number]; index: number; total: number;
  onClose: () => void; onStep: (delta: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /* A real modal: the page behind goes inert, focus stays inside, and Escape is the
     browser's own cancel. */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const cancel = (e: Event) => { e.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, [onClose]);


  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <dialog className="case" ref={ref} aria-labelledby="case-title">
      <div className="case-bar">
        <button className="pill is-dashed" onClick={onClose} data-cursor="BACK" autoFocus>
          <span aria-hidden="true">&#8601;</span> Back to the sheet
        </button>
        <span className="case-count" aria-hidden="true">Case {pad(index + 1)} / {pad(total)}</span>
        <div className="case-steps">
          <button className="pill is-ghost" onClick={() => onStep(-1)} aria-label="Previous project">&larr;</button>
          <button className="pill is-ghost" onClick={() => onStep(1)} aria-label="Next project">&rarr;</button>
        </div>
      </div>

      <div className="case-body" key={project.id}>
        <article className="case-copy">
          <p className="t-label t-gold case-rise" style={{ '--d': 0 } as React.CSSProperties}>
            {project.number} &middot; {project.kind} &middot; {project.year}
          </p>
          <h2 id="case-title" className="t-h1 case-title case-rise" style={{ '--d': 1 } as React.CSSProperties}>{project.name}</h2>
          <p className="case-tagline case-rise" style={{ '--d': 2 } as React.CSSProperties}>{project.tagline}</p>

          <dl className="case-meta case-rise" style={{ '--d': 3 } as React.CSSProperties}>
            <div><dt>Role</dt><dd>{project.role}</dd></div>
            <div><dt>Services</dt><dd>{project.services.join(', ')}</dd></div>
            <div><dt>Stack</dt><dd>{project.stack.join(', ')}</dd></div>
            <div><dt>Live</dt><dd><a href={project.url} target="_blank" rel="noopener noreferrer">{project.domain}<span className="sr-only"> (opens in a new tab)</span></a></dd></div>
            {project.github && (
              <div><dt>Source</dt><dd><a href={project.github} target="_blank" rel="noopener noreferrer">{project.github.replace('https://github.com/', 'github.com/')}<span className="sr-only"> (opens in a new tab)</span></a></dd></div>
            )}
          </dl>

          {project.metric && (
            <div className="case-metric-box case-rise" style={{ '--d': 3.5 } as React.CSSProperties}>
              <div className="case-metric-header">
                <span className="case-metric-spark">✦</span>
                <span className="case-metric-label">MEASURABLE IMPACT &amp; BENCHMARK</span>
              </div>
              <p className="case-metric-val">{project.metric}</p>
            </div>
          )}

          <section className="case-part case-rise" style={{ '--d': 4 } as React.CSSProperties}>
            <h3>Overview</h3>
            <p>{project.overview}</p>
          </section>
          <section className="case-part case-rise" style={{ '--d': 5 } as React.CSSProperties}>
            <h3>The problem</h3>
            <p>{project.challenge}</p>
          </section>
          <section className="case-part case-rise" style={{ '--d': 6 } as React.CSSProperties}>
            <h3>The approach</h3>
            <ol>{project.approach.map(step => <li key={step}>{step}</li>)}</ol>
          </section>
          <section className="case-part case-rise" style={{ '--d': 7 } as React.CSSProperties}>
            <h3>The result</h3>
            <p>{project.outcome}</p>
          </section>

          <div className="case-actions case-rise" style={{ '--d': 8 } as React.CSSProperties}>
            <a className="pill is-gold" href={project.url} target="_blank" rel="noopener noreferrer" data-cursor="VISIT">
              <span className="pill-dot" />Visit {project.domain}<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {project.github && (
              <a className="pill is-dashed" href={project.github} target="_blank" rel="noopener noreferrer" data-cursor="CODE">
                <span className="pill-dot" />GitHub Source<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            <button className="pill is-dashed" onClick={() => onStep(1)}>
              Next case <span className="pill-arrow" aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </article>

        <LivePreview project={project} key={project.id} />
      </div>
    </dialog>
  );
}

/** Word-by-word masked reveal; lights up when the parent block gets .is-lit.
    Non-text children (a <br/>, say) pass through and keep the stagger going. */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  const push = (node: React.ReactNode, key: string) => {
    if (typeof node === 'string' || typeof node === 'number') {
      String(node).split(/(\s+)/).filter(Boolean).forEach((w, k) => {
        if (/^\s+$/.test(w)) { out.push(<span key={`${key}-${k}`}>{' '}</span>); return; }
        out.push(
          <span className="w" key={`${key}-${k}`} style={{ '--i': i++ } as React.CSSProperties}>
            <span>{w}</span>
          </span>);
      });
    } else out.push(<span key={key}>{node}</span>);
  };
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((k, n) => push(k, `k${n}`));
  return <span className="reveal" style={{ '--delay': `${delay}ms` } as React.CSSProperties}>{out}</span>;
}

/** Every act carries the piece of geometry that actually built it. */
function Formula({ label, expr, note }: { label: string; expr: string; note?: string }) {
  return (
    <div className="formula">
      <span className="f-label">{label}</span>
      <span className="f-expr" dangerouslySetInnerHTML={{ __html: expr }} />
      {note && <span className="f-note">{note}</span>}
    </div>
  );
}

const magnetise = (e: React.PointerEvent<HTMLElement>) => {
  if (e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${(e.clientX - r.left - r.width / 2) * .16}px`);
  e.currentTarget.style.setProperty('--my', `${(e.clientY - r.top - r.height / 2) * .22}px`);
};
const release = (e: React.PointerEvent<HTMLElement>) => {
  e.currentTarget.style.setProperty('--mx', '0px');
  e.currentTarget.style.setProperty('--my', '0px');
};

/* The orbits.

   Eight concentric rings, each carrying one line of the piece's own vocabulary. The
   outer ring holds the thesis and the inner one holds the only honest word a loader
   has - and between them the acts, the material, and the arithmetic, so a reader who
   is only waiting has already been told what they are waiting for.

   `radius` also sets the pace: the outer rings breathe slowly and the inner ones
   quickly, the way anything turning on a common axis does. */
const ORBITS = [
  { r: 450, offset: 30, from: 1200, to: 1800, text: 'ARCHITECTING POSSIBILITIES — BORN IN LIMITATIONS — BUILT ALONG THE SEAMS — ' },
  { r: 400, offset: 15, from: 1050, to: 1550, text: 'GYPSUM — 3.5 M — ONE PIECE — A VORONOI SHELL — FORTY-THREE FRAGMENTS — ' },
  { r: 350, offset: 40, from: 900, to: 1350, text: 'THE UNBROKEN — SUSPENDED TIME — FALL AND REPAIR — THE WORKING SURFACE — ' },
  { r: 300, offset: 25, from: 780, to: 1150, text: 'KINTSUGI — THE METAL GOES WHERE THE BREAK WAS — NOTHING IS HIDDEN — ' },
  { r: 250, offset: 10, from: 650, to: 950, text: 'WHAT THE LIGHT MAKES — ONE STATION ONLY — EVERYTHING IT COST — ' },
  { r: 200, offset: 35, from: 520, to: 780, text: 'ONE READS THE LIGHT — ONE READS THE HEAT — THREE WINGS — ' },
  { r: 150, offset: 20, from: 380, to: 580, text: 'THIRTY OF FORTY-THREE ARRIVE — ' },
  { r: 100, offset: 5, from: 260, to: 420, text: 'LOADING — WAIT — ' },
] as const;

/** the arc command for a full circle of radius r, written twice so a textPath can run
    past the join without the glyphs bunching at the seam */
const orbitPath = (r: number) =>
  `M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r} M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r}`;



/* ========================================================================== */

export default function Home() {
  const driver = useRef({ progress: 0, velocity: 0 });
  const [ready, setReady] = useState(false);
  const [light, setLight] = useState(false);
  const [sound, setSound] = useState(false);
  const [focus, setFocus] = useState(-1);
  const [portalOpen, setPortalOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [oracleOpen, setOracleOpen] = useState(false);
  const currentActRef = useRef(0);
  const [activeAct, setActiveAct] = useState(0);
  const [hoverCard, setHoverCard] = useState(-1);
  const [copied, setCopied] = useState('');
  /* The only two things this site ever says. Held in state because they are the one
     piece of chrome that has to interrupt; everything else is written straight to
     the DOM from inside the loop. */
  const [said, setSaid] = useState<Verdict>(null);
  const [actsOpen, setActsOpen] = useState(false);

  const audio = useRef<Soundscape | null>(null);
  const prevProgress = useRef(0);
  const portalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const perfRef = useRef<HTMLPreElement>(null);
  const [showPerf] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf'));
  const labelRef = useRef<HTMLDivElement>(null);
  const goldRef = useRef<HTMLSpanElement>(null);
  const impactRef = useRef<HTMLSpanElement>(null);
  const tiltRef = useRef<HTMLSpanElement>(null);
  const alignRef = useRef<HTMLSpanElement>(null);
  const mastheadActRef = useRef<HTMLSpanElement>(null);
  const mastheadActNameRef = useRef<HTMLSpanElement>(null);
  const alignBarRef = useRef<HTMLElement>(null);
  /* Focus goes back to whatever opened the case study. Declared up here with the
     rest rather than beside the handlers, because the compiler will not accept a ref
     being written by a function defined above it. */
  const returnFocus = useRef<HTMLElement | null>(null);

  const go = useCallback((fraction: number) => {
    scrollToY(fraction * (document.documentElement.scrollHeight - innerHeight));
  }, []);

  const actionsRef = useRef({
    toggleSound: () => {},
    go: (_fraction: number) => {},
    toggleActs: () => {},
    closeModals: () => {},
  });

  /* ------------------------------------------------ the single animation loop */
  useEffect(() => {
    history.scrollRestoration = 'manual';
    scrollTo(0, 0);
    const detachPointer = attachPointer();
    const detachScroll = attachSmoothScroll();
    onCursorLabel(label => {
      const el = labelRef.current;
      if (!el) return;
      if (label) el.textContent = label;
      el.style.setProperty('--cs', label ? '1' : '.3');
      el.style.setProperty('--co', label ? '1' : '0');
    });

    /* Heraclitus. The site does not start again, it goes on - and asks for more of
       the reader than it did last time. */
    const visits = markVisit();
    signals.strictness = visits - 1;
    const tempo = createTempo(visits - 1);
    const gold = createGold();

    /* On a phone the URL bar collapses as the page scrolls, which moves innerHeight
       by up to 15% mid-gesture. Writing that straight into --vh would resize every
       section underneath the finger, so the timeline would lurch while the reader is
       still moving. The stored height therefore only follows a real layout change. */
    let vhBase = innerHeight, vwBase = innerWidth;
    const setVh = (force = false) => {
      const isChrome = innerWidth === vwBase && Math.abs(innerHeight - vhBase) < vhBase * .22;
      if (!force && isChrome) return;
      vhBase = innerHeight; vwBase = innerWidth;
      document.documentElement.style.setProperty('--vh', `${innerHeight / 100}px`);
    };
    setVh(true);

    /* Written straight into its text node: as state, the clock re-rendered all eleven
       acts every twenty seconds to change four characters. */
    const tickClock = () => {
      if (clockRef.current) clockRef.current.textContent = new Date().toLocaleTimeString('en-GB',
        { hour: '2-digit', minute: '2-digit' });
    };
    tickClock();
    const clockTimer = setInterval(tickClock, 20000);

    /* Section geometry only changes when the page is laid out again, so it is measured
       on resize rather than read every frame: offsetTop and offsetHeight force a
       synchronous layout, and five of those inside the render loop cost more than
       everything else the loop does put together. */
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.section'))
      .map(el => ({ el, top: 0, height: 1, runway: 1, ratio: 0, written: '' }));
    const measure = () => {
      for (const section of sections) {
        section.top = section.el.offsetTop;
        section.height = section.el.offsetHeight;
        section.runway = section.height - innerHeight;
      }
    };
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-lit]')).map(el => {
      const [a, b] = (el.dataset.lit ?? '0,1').split(',').map(Number);
      const host = el.closest('.section');
      return { el, a, b, section: sections.find(s => s.el === host)!, on: el.classList.contains('is-lit') };
    });
    const onResize = () => { setVh(); measure(); };
    measure();
    addEventListener('resize', onResize);
    void analytics.init();

    /* measure() reads offsetTop and offsetHeight, which only mean anything once the
       stylesheet has actually applied. Measuring a single time at mount is a race,
       so an observer re-measures whenever the real layout changes instead. */
    const layout = new ResizeObserver(measure);
    const container = document.getElementById('pages-container');
    if (container) layout.observe(container);
    document.fonts?.ready.then(measure).catch(() => { });

    let lastY = 0, lastNow = performance.now(), raf = 0;
    let wasLight = false, currentAct = -1;
    let lastGold = '', lastImpact = '', lastTilt = '', lastAlign = '', lastLabel = '', lastPerf = 0;
    const cues: [number, Effect][] = [
      [.082, 'fracture'],
      [.168, 'whoosh'],
      [.198, 'impact'],
      [.235, 'assemble'],
      [.395, 'whoosh'],
      [.812, 'rise'],
      [.965, 'place'],
    ];

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - lastNow) / 1000, .05) || 1 / 60;
      lastNow = now;
      stepSmoothScroll(dt);
      stepPointer(now);

      const max = document.documentElement.scrollHeight - innerHeight || 1;
      const y = scrollY;
      const p = clamp(y / max);
      /* Clamped so a jump cannot smear the whole frame away, and kept finite on the
         way in and on the way out: a viewport that measures zero for a frame used to
         divide by it, and the NaN stayed in the smoothed term for the session. */
      const measured = (y - lastY) / (innerHeight || 1) / dt;
      const v = Number.isFinite(measured) ? Math.max(-4, Math.min(4, measured)) : 0;
      lastY = y;
      driver.current.progress = p;
      const eased = driver.current.velocity + (v - driver.current.velocity) * (1 - Math.exp(-dt * 14));
      driver.current.velocity = Number.isFinite(eased) ? eased : 0;

      /* ------------------------------------------------------------- tempo */
      tempo.step(driver.current.velocity, dt);
      if (tempo.verdict) {
        setSaid(tempo.verdict);
        if (saidTimer.current) clearTimeout(saidTimer.current);
        saidTimer.current = setTimeout(() => setSaid(null), 1700);
        audio.current?.effect('cut');
      }

      /* Dogen. Presence is real seconds in front of the work, and only counts while
         the reader is moving at a pace a person could actually read at. There is no
         way to scrub this, and nothing anywhere says so. */
      const nearWork = p > .225 && p < .955 ? 1 : .25;
      gold.step(dt, nearWork * tempo.grip);

      signals.progress = p;
      signals.velocity = driver.current.velocity;
      signals.grip = tempo.grip;
      signals.verdict = tempo.verdict;
      signals.gold = gold.amount;
      signals.px = pointer.x;
      signals.py = pointer.y;

      /* per section runway ratio, and the block windows that ride on it. The custom
         property is only written when it changes, and only to sections that are on or
         next to the screen: a write invalidates style for the whole subtree, and doing
         it to eleven sections sixty times a second was most of the page's style work. */
      for (const section of sections) {
        const r = clamp(section.runway > 0 ? (y - section.top) / section.runway : (y >= section.top ? 1 : 0));
        section.ratio = r;
        const near = y + innerHeight * 2 > section.top && y < section.top + section.height + innerHeight;
        const written = r.toFixed(3);
        if (near && written !== section.written) {
          section.written = written;
          section.el.style.setProperty('--active-ratio', written);
        }
      }
      for (const b of blocks) {
        // A completed section keeps ratio=1 forever. Gate it by its physical
        // scroll range as well, otherwise its last blocks can overlap the next act.
        const inSection = y >= b.section.top && y < b.section.top + b.section.height;
        const on = inSection && b.section.ratio >= b.a && b.section.ratio <= b.b;
        if (on !== b.on) { b.on = on; b.el.classList.toggle('is-lit', on); }
      }

      /* There used to be a DOM half of the motion blur here: an SVG feGaussianBlur on
         the pinned section, its deviation rewritten every frame. SVG filters on HTML
         are rasterised on the CPU, so every scrolling frame repainted the whole act
         in software. The WebGL pass keeps its own blur; the type now stays sharp. */

      /* No travel indicator of any kind. The two variables that remain are read by
         the type and the grain, and neither of them says how far there is to go. */
      /* --grip and --scroll-velocity were written to the root here every frame and no
         stylesheet read either of them - two full-document style invalidations a
         frame for nothing. */

      /* the live instrument read-outs the acts print */
      const fracSection = sections[1];
      if (fracSection && tiltRef.current) {
        const tilt = `${Math.round(fracSection.ratio * FRAGMENTS)} / ${FRAGMENTS}`;
        if (tilt !== lastTilt) { lastTilt = tilt; tiltRef.current.textContent = tilt; }
      }
      const dropSection = sections[2];
      if (dropSection && impactRef.current) {
        const impact = `${(Math.min(dropSection.ratio / .55, 1) * 41.6).toFixed(1)} J`;
        if (impact !== lastImpact) { lastImpact = impact; impactRef.current.textContent = impact; }
      }

      let index = 0;
      for (let i = 0; i < ACT_LAYOUT.length; i++) if (p >= ACT_LAYOUT[i].at) index = i;
      if (index !== currentAct) {
        currentAct = index;
        currentActRef.current = index;
        setActiveAct(index);
        if (mastheadActRef.current) {
          mastheadActRef.current.textContent = ACT_LAYOUT[index]?.roman || 'ACT I';
        }
        if (mastheadActNameRef.current) {
          mastheadActNameRef.current.textContent = ACT_LAYOUT[index]?.name || '';
        }
        const bpNav = document.querySelector('.bp-keyboard');
        if (bpNav) bpNav.classList.toggle('is-active', index === 3);
        analytics.trackActProgress(index, ACT_LAYOUT[index]?.name || '', p * 100);
      }

      /* How near the reader is to the one station, and nothing about which way. A
         direction would turn a valley into a fetch quest. */
      if (alignRef.current) {
        const shown = `${Math.round(signals.aligned * 100)}`;
        if (shown !== lastAlign) {
          lastAlign = shown;
          alignRef.current.textContent = shown;
          if (alignBarRef.current) alignBarRef.current.style.setProperty('--a', signals.aligned.toFixed(3));
        }
      }

      if (goldRef.current) {
        const shown = `${Math.round(gold.amount * 100)} %`;
        if (shown !== lastGold) { lastGold = shown; goldRef.current.textContent = shown; }
      }

      if (labelRef.current && pointer.active) {
        const transform =
          `translate3d(${(pointer.x * innerWidth).toFixed(1)}px,${((1 - pointer.y) * innerHeight - 44).toFixed(1)}px,0) translate(-50%,-50%) scale(var(--cs,0))`;
        if (transform !== lastLabel) { lastLabel = transform; labelRef.current.style.transform = transform; }
      }

      /* ?perf - the governor's own numbers, for testing on a real machine */
      if (perfRef.current && now - lastPerf > 500) {
        lastPerf = now;
        const f = signals.perf;
        perfRef.current.textContent =
          `${f.idle ? 'IDLE' : 'LIVE'}  ${f.fps.toFixed(0)} fps  ${f.ms.toFixed(1)} ms cpu\n` +
          `tier ${f.tier}  pr ${f.pr.toFixed(2)}  ${(f.pixels / 1e6).toFixed(2)} MP\n` +
          `heap ${((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6 | 0} MB`;
      }

      /* Two daylight passages: the studio the cast is photographed in before it
         breaks, and the bench it is repaired and laid out on. Everything else is the
         dark theatre.

         These two windows are in *document* progress, and they were still the numbers
         from the seven act cut. Three acts went in ahead of them and moved everything
         along, so .486 to .700 - which used to be the lit workbench - is now the
         single lamp act and the panes, both of which are as close to pure black as
         this piece gets. The interface was painting ink on black in there and the
         headings simply were not there. If the act spans in story.ts move again,
         these move with them. */
      const isLight = false;
      if (isLight !== wasLight) { wasLight = isLight; setLight(isLight); }

      /* The bowl. Heat is the burn itself, bright is the ring that follows it and
         carries into the cloud - so the sound arrives with the flame and leaves with
         the last of the powder. */
      audio.current?.resonance(
        windowOpacity(p, .745, .830, .03),
        windowOpacity(p, .800, .935, .05),
      );
      audio.current?.update(p);
      for (const [at, event] of cues) {
        if (prevProgress.current < at && p >= at && p - prevProgress.current < .1) audio.current?.effect(event);
      }
      prevProgress.current = p;
    };
    raf = requestAnimationFrame(frame);

    const cut = () => audio.current?.effect('cut');
    const tick = () => audio.current?.effect('tick');
    const interactive = 'a, button, [role="button"], [data-cursor]';
    const onInteractiveOver = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest(interactive);
      if (!target || target.contains(event.relatedTarget as Node | null)) return;
      audio.current?.effect('tick');
    };
    const onInteractiveDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest(interactive)) audio.current?.effect('click');
    };
    /* Hold Z and the materials stand down.

       It is not a debug view. Everything in this piece is a surface pretending to be
       stone or metal or water, and underneath all of it is the same thing: a few
       thousand triangles and the arithmetic that places them. Holding the key shows
       that, in gold, and letting go puts the world back. Nothing announces it. */
    /* It used to be the space bar, which is also how a keyboard scrolls a page by a
       screen - so holding it here took page-down away from anyone not using a mouse. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        actionsRef.current.closeModals();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Hold Z for Zen wireframe
      if (e.code === 'KeyZ' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        signals.zen = e.type === 'keydown' ? 1 : 0;
        return;
      }

      if (e.type !== 'keydown' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;

      // Toggle Sound with M
      if (e.code === 'KeyM') {
        actionsRef.current.toggleSound();
        return;
      }

      // Toggle Oracle with O
      if (e.code === 'KeyO') {
        setOracleOpen(o => !o);
        return;
      }

      // Sitemap / Directory toggle with I or K
      if (e.code === 'KeyI' || e.code === 'KeyK') {
        actionsRef.current.toggleActs();
        return;
      }

      // Quick teleport with keys 1 to 9 (Acts I to IX) and 0 (Act X)
      if (e.key >= '1' && e.key <= '9') {
        const actIndex = parseInt(e.key, 10) - 1;
        if (ACT_LAYOUT[actIndex]) {
          actionsRef.current.go(ACT_LAYOUT[actIndex].at + 0.005);
        }
        return;
      }
      if (e.key === '0') {
        if (ACT_LAYOUT[9]) {
          actionsRef.current.go(ACT_LAYOUT[9].at + 0.005);
        }
        return;
      }
    };
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);
    // a key held while the tab is left would stay held forever
    const dropZen = () => { signals.zen = 0; };
    addEventListener('blur', dropZen);

    addEventListener('cutter-hover', cut);
    addEventListener('card-hover', tick);
    document.addEventListener('pointerover', onInteractiveOver);
    document.addEventListener('pointerdown', onInteractiveDown);

    return () => {
      cancelAnimationFrame(raf);
      detachPointer(); detachScroll();
      removeEventListener('resize', onResize);
      layout.disconnect();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('blur', dropZen);
      removeEventListener('cutter-hover', cut);
      removeEventListener('card-hover', tick);
      document.removeEventListener('pointerover', onInteractiveOver);
      document.removeEventListener('pointerdown', onInteractiveDown);
      clearInterval(clockTimer);
      if (portalTimer.current) clearTimeout(portalTimer.current);
      if (saidTimer.current) clearTimeout(saidTimer.current);
      audio.current?.close();
      audio.current = null;
    };
  }, []);

  /* ------------------------------------------------------------- preloader

     The orbit animation lives entirely in GSAP and the count is written directly to
     one text node. Neither asks React to redraw the eleven acts while WebGL is warming
     up. The rings keep breathing at 92%; the final eight points are earned only when
     the sculpture reports that its first frame is ready. */
  const countRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLElement>(null);
  const ruleRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLOutputElement>(null);
  const orbitRef = useRef<SVGSVGElement>(null);
  const count = useRef(0);

  const dismissLoader = useCallback(() => {
    const shell = shellRef.current;
    const orbit = orbitRef.current;
    if (!shell || !orbit || shell.dataset.leaving === 'true') return;
    shell.dataset.leaving = 'true';

    const paths = Array.from(orbit.querySelectorAll<SVGTextPathElement>('textPath'));
    const finish = () => {
      gsap.killTweensOf([orbit, ...paths]);
      shell.classList.add('is-done');
      shell.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('is-loading');
    };

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.to(shell, { autoAlpha: 0, duration: .25, onComplete: finish });
      return;
    }

    gsap.timeline({ onComplete: finish })
      .to('.pre-center', { yPercent: -12, autoAlpha: 0, duration: .4, ease: 'power3.in' })
      .to(paths, {
        autoAlpha: 0,
        duration: .22,
        stagger: { each: .035, from: 'end' },
        ease: 'power2.in',
      }, '-=.12')
      .to(paths, {
        autoAlpha: 1,
        duration: .2,
        stagger: { each: .03, from: 'start' },
        ease: 'power2.out',
      })
      .to(orbit, { scale: .82, rotation: -14, autoAlpha: 0, duration: .9, ease: 'power3.inOut' }, '-=.05')
      .to('.pre-edge', { autoAlpha: 0, duration: .3 }, '<')
      .to(shell, { autoAlpha: 0, duration: .65, ease: 'power2.inOut' }, '-=.45');
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const orbit = orbitRef.current;
    if (!shell || !orbit) return;
    document.documentElement.classList.add('is-loading');

    const paths = Array.from(orbit.querySelectorAll<SVGTextPathElement>('textPath'));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const context = gsap.context(() => {
      if (reduced) return;
      paths.forEach((path, i) => {
        const ring = ORBITS[i];
        const pathLength = 4 * Math.PI * ring.r;
        const targetOffset = ring.offset - ((ring.to - ring.from) / 2 / pathLength) * 100;
        const ratio = ring.r / ORBITS[0].r;

        gsap.to(path, {
          attr: { textLength: ring.to, startOffset: `${targetOffset}%` },
          duration: 2.5 + ratio * 2,
          delay: i * .08,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      });

      gsap.to(orbit, {
        rotation: 18,
        duration: 6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    }, shell);

    return () => {
      context.revert();
      document.documentElement.classList.remove('is-loading');
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let shown = -1;
    let completed = false;
    const startTime = performance.now();

    // Narrative stages that educate, intrigue and retain the visitor
    const getStageText = (pct: number, isSceneReady: boolean) => {
      if (pct >= 99.5) return 'SYNCHRONIZED // ENTERING ARCHIVE';
      if (isSceneReady) return 'SCENE READY // FINALIZING PASSES';
      if (pct > 86) return 'WARMING GLSL ILLUMINATION';
      if (pct > 66) return 'INFUSING KINTSUGI GOLD SEAMS';
      if (pct > 44) return 'SOLVING VORONOI FRACTURE';
      if (pct > 22) return 'PRE-WARMING SHADER PIPELINE';
      return 'INITIALIZING ARCHITECTURAL SPACE';
    };

    const step = (now: number) => {
      if (completed) return;
      const elapsed = (now - startTime) / 1000;
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.1);
      last = now;

      // Safety guarantee: If 3D scene takes more than 5.5s on slow mobile networks, auto-proceed
      const effectiveReady = ready || elapsed > 5.5;

      // Pacing designed for maximum user engagement and zero stalls:
      let targetSpeed = 0;
      if (effectiveReady) {
        // Accelerate swiftly to 100 once scene is initialized
        targetSpeed = Math.max(34, (100.5 - count.current) * 5.2);
      } else {
        if (count.current < 38) {
          // Swift initial ramp to confirm immediate response
          targetSpeed = 44;
        } else if (count.current < 72) {
          // Steady progression during asset parsing
          targetSpeed = 22;
        } else if (count.current < 88) {
          // Measured cadence during shader compilation
          targetSpeed = 12;
        } else if (count.current < 98) {
          // Asymptotic micro-crawling: NEVER stops dead, keeps ticking frame-by-frame
          targetSpeed = Math.max(1.8, (98.5 - count.current) * 0.42);
        } else {
          // Continuous micro-ticks until ready
          targetSpeed = 0.35;
        }
      }

      // Strictly monotonic increase: never goes down, never negative, never exceeds 100
      count.current = Math.min(100, Math.max(count.current, count.current + dt * targetSpeed));

      const whole = Math.max(0, Math.min(100, Math.floor(count.current)));
      if (whole !== shown) {
        shown = whole;
        if (countRef.current) countRef.current.textContent = String(whole);
        if (ruleRef.current) ruleRef.current.style.setProperty('--progress', `${whole}%`);
      }

      const statusText = getStageText(count.current, effectiveReady);
      if (wordRef.current && wordRef.current.textContent !== statusText) {
        wordRef.current.textContent = statusText;
      }

      if (count.current >= 99.9 && !completed) {
        completed = true;
        if (countRef.current) countRef.current.textContent = '100';
        if (ruleRef.current) ruleRef.current.style.setProperty('--progress', '100%');
        if (wordRef.current) wordRef.current.textContent = 'SYNCHRONIZED // ENTERING ARCHIVE';
        
        // Satisfying cinematic moment at 100% before transition
        setTimeout(() => {
          dismissLoader();
        }, 140);
        return;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dismissLoader, ready]);

  /* --------------------------------------------------------------- actions */
  async function toggleSound() {
    try {
      audio.current ??= new Soundscape();
      const next = await audio.current.toggle();
      setSound(next);
      analytics.trackSoundToggle(next);
    }
    catch { setSound(false); }
  }

  useEffect(() => {
    actionsRef.current = {
      toggleSound: () => { void toggleSound(); },
      go,
      toggleActs: () => setActsOpen(o => !o),
      closeModals: () => {
        setActsOpen(false);
        setResumeOpen(false);
        setCommissionOpen(false);
        setOracleOpen(false);
      },
    };
  });
  const openProject = useCallback((index: number) => {
    if (!PROJECTS[index]) return;
    analytics.trackCardView(`Drawing ${PROJECTS[index].number}: ${PROJECTS[index].name} (${PROJECTS[index].domain})`);
    if (portalTimer.current) clearTimeout(portalTimer.current);
    returnFocus.current = document.activeElement as HTMLElement | null;
    setFocus(index);
    audio.current?.effect('portal');
    /* The camera dives through the card first; the case study takes over as the lens
       reaches its face. Opened from the colophon, the bench is not on screen and there
       is nothing to dive through, so it opens at once. */
    const onBench = currentActRef.current === 3;
    portalTimer.current = setTimeout(() => setPortalOpen(true),
      !onBench || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1080);
  }, []);
  const leavePortal = useCallback(() => {
    if (portalTimer.current) clearTimeout(portalTimer.current);
    setPortalOpen(false); setFocus(-1);
    audio.current?.effect('portal');
  }, []);
  const stepProject = useCallback((delta: number) => {
    setFocus(f => (f + delta + PROJECTS.length) % PROJECTS.length);
    audio.current?.effect('tick');
  }, []);
  /* The native cursor comes back inside the case study: the drawn one lives in the
     WebGL frame, and the frame is paused underneath the dialog. */
  useEffect(() => {
    document.documentElement.classList.toggle('is-portal', portalOpen);
    /* Focus goes home only once the modal is gone: while it is still in the top
       layer everything behind it is inert and refuses the focus. */
    if (!portalOpen && returnFocus.current) {
      returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [portalOpen]);

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2200); }
    catch { /* clipboard refused; the text is still on the page */ }
  }

  const chrome = portalOpen ? 'is-hidden' : '';

  return (
    <>
      <Sculpture
        driver={driver}
        onReady={() => setReady(true)}
        paused={portalOpen}
        focus={focus}
        onCardHover={setHoverCard}
        onCardSelect={openProject}
      />

      <div id="ui" className={light ? 'is-light' : ''}>
        {/* Architectural Floating Masthead / Quick Navigation */}
        <header id="masthead" className={chrome} aria-label="Main Navigation">
          <div className="masthead-left">
            <button className="masthead-brand" onClick={() => go(0)} data-cursor="HOME" aria-label="Return to Beginning">
              <span className="masthead-mark">✦</span>
              <span className="masthead-name">POUYA SADEGHPOUR</span>
            </button>

            {/* Live Act Telemetry Pill */}
            <button className="masthead-act-pill" onClick={() => setActsOpen(true)} data-cursor="INDEX" aria-label="Current Act / Open Index">
              <span className="masthead-pulse" />
              <span className="masthead-act-code" ref={mastheadActRef}>ACT I</span>
              <span className="masthead-act-sep">&middot;</span>
              <span className="masthead-act-name" ref={mastheadActNameRef}>THE UNBROKEN</span>
            </button>
          </div>

          <nav className="masthead-nav" aria-label="Quick Navigation">
            <button className="masthead-link" onClick={() => go(ACT_LAYOUT[3].at + 0.02)} data-cursor="WORK">
              WORK
            </button>
            <button className="masthead-link" onClick={() => setResumeOpen(true)} data-cursor="CV" aria-label="Resume">
              CV
            </button>
            <button className="masthead-link is-oracle" onClick={() => setOracleOpen(true)} data-cursor="ORACLE" aria-label="Kintsugi Oracle">
              <span className="oracle-dot">✦</span>
              <span>ORACLE</span>
            </button>
            <button className="masthead-link" onClick={() => setActsOpen(o => !o)} data-cursor="INDEX" aria-label="Site Index">
              INDEX
            </button>

            {/* Compact Architectural Sound Control */}
            <button
              id="sound-toggle"
              className={`masthead-sound ${sound ? 'is-on' : ''}`}
              onClick={toggleSound}
              data-cursor={sound ? 'MUTE' : 'LISTEN'}
              aria-pressed={sound}
              aria-label={sound ? 'Mute the score' : 'Play the score'}
            >
              <span className="sound-visualizer" aria-hidden="true">
                {[0, 1, 2, 3].map(i => (
                  <i key={i} style={{ '--i': i } as React.CSSProperties} />
                ))}
              </span>
            </button>

            <button className="masthead-cta" onClick={() => go(1)} data-cursor="CONTACT" aria-label="Contact">
              <span>TALK &rarr;</span>
            </button>
          </nav>
        </header>

        {/* ---------------------------------------------------------- the two words
            Discipline & Tempo feedback: A poetic, non-intrusive interactive dialogue. */}
        <div id="verdict" className={said ? 'is-on' : ''} aria-live="polite" aria-atomic="true">
          {said && (
            <div className="verdict-box">
              <span className="verdict-discipline">✦ TEMPO // DISCIPLINE</span>
              <span className="verdict-word">{said === 'rushing' ? 'YOU’RE RUSHING' : 'YOU’RE DRAGGING'}</span>
              <span className="verdict-sub">
                {said === 'rushing'
                  ? 'Breathe. The sculpture unfolds at human reading pace.'
                  : 'Move forward. Presence requires continuous momentum.'}
              </span>
            </div>
          )}
        </div>

        {/* Full Architectural Site Map Modal */}
        {actsOpen && (
          <dialog className="sitemap-modal" open aria-label="System Sitemap & Acts">
            <button
              type="button"
              className="sitemap-backdrop"
              aria-label="Close directory"
              onClick={() => setActsOpen(false)}
            />
            <div className="sitemap-container">
              <div className="sitemap-header">
                <div className="sitemap-header-left">
                  <span className="sitemap-glyph">◈</span>
                  <div>
                    <h2 className="sitemap-title">SYSTEM SITEMAP // ARCHITECTURAL DIRECTORY</h2>
                    <p className="sitemap-subtitle">11 NARRATIVE ACTS &middot; 6 TECHNICAL SHIPMENTS &middot; CHRONOLOGICAL TRAJECTORY</p>
                  </div>
                </div>
                <button className="sitemap-close" onClick={() => setActsOpen(false)} aria-label="Close Site Map" data-cursor="CLOSE">
                  <span>CLOSE</span>
                  <span className="sitemap-esc">ESC</span>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>

              <div className="sitemap-body">
                {/* 11 Acts Timeline Grid */}
                <div className="sitemap-main-col">
                  <div className="sitemap-sec-head">
                    <span className="sitemap-sec-title">THE ELEVEN ACTS (SPATIAL CHRONOLOGY)</span>
                    <span className="sitemap-sec-meta">DIRECT TELEPORT</span>
                  </div>
                  <div className="sitemap-acts-grid">
                    {ACT_LAYOUT.map((a, i) => {
                      const isCurrent = activeAct === i;
                      return (
                        <button
                          key={a.id}
                          className={`sitemap-act-card ${isCurrent ? 'is-active' : ''}`}
                          onClick={() => { setActsOpen(false); go(a.at + 0.004); }}
                          data-cursor="JUMP"
                        >
                          <div className="sitemap-act-top">
                            <span className="sitemap-act-roman">{a.roman}</span>
                            <span className="sitemap-act-edge">{a.edge}</span>
                          </div>
                          <div className="sitemap-act-name">{a.name}</div>
                          <div className="sitemap-act-footer">
                            <span className="sitemap-act-pct">{Math.round(a.at * 100)}%</span>
                            {isCurrent ? (
                              <span className="sitemap-act-badge">● CURRENT</span>
                            ) : (
                              <span className="sitemap-act-jump">JUMP &rarr;</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Technical Shipments & Direct Navigation */}
                <div className="sitemap-side-col">
                  <div className="sitemap-sec-head">
                    <span className="sitemap-sec-title">FLAGSHIP SHIPMENTS</span>
                    <span className="sitemap-sec-meta">CASE STUDIES</span>
                  </div>
                  <div className="sitemap-proj-list">
                    {PROJECTS.map((p, i) => (
                      <button
                        key={p.id}
                        className="sitemap-proj-item"
                        onClick={() => { setActsOpen(false); openProject(i); }}
                        data-cursor="CASE"
                      >
                        <div className="sitemap-proj-top">
                          <span className="sitemap-proj-idx">0{i + 1}</span>
                          <span className="sitemap-proj-name">{p.name}</span>
                        </div>
                        <span className="sitemap-proj-kind">{p.kind}</span>
                      </button>
                    ))}
                  </div>

                  <div className="sitemap-sec-head" style={{ marginTop: '20px' }}>
                    <span className="sitemap-sec-title">SYSTEM PORTALS</span>
                  </div>
                  <div className="sitemap-quick-links">
                    <button className="sitemap-quick-btn" onClick={() => { setActsOpen(false); setResumeOpen(true); }} data-cursor="RESUME">
                      <span>Executive CV (PDF)</span>
                      <span className="sitemap-arrow">&rarr;</span>
                    </button>
                    <button className="sitemap-quick-btn" onClick={() => { setActsOpen(false); setOracleOpen(true); }} data-cursor="ORACLE">
                      <span>Kintsugi Oracle (AI Guide)</span>
                      <span className="sitemap-arrow">&rarr;</span>
                    </button>
                    <button className="sitemap-quick-btn" onClick={() => { setActsOpen(false); setCommissionOpen(true); }} data-cursor="DISPATCH">
                      <span>Commission Inquiry</span>
                      <span className="sitemap-arrow">&rarr;</span>
                    </button>
                    <button className="sitemap-quick-btn" onClick={() => { setActsOpen(false); go(1); }} data-cursor="CONTACT">
                      <span>Colophon &amp; Links</span>
                      <span className="sitemap-arrow">&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="sitemap-footer">
                <span className="sitemap-hint"><kbd>Z</kbd> Hold wireframe</span>
                <span className="sitemap-hint"><kbd>M</kbd> Toggle score</span>
                <span className="sitemap-hint"><kbd>1-9</kbd> Teleport acts</span>
                <span className="sitemap-hint"><kbd>I / K</kbd> Directory</span>
                <span className="sitemap-hint"><kbd>ESC</kbd> Close</span>
              </div>
            </div>
          </dialog>
        )}

        <div id="cursor-label" ref={labelRef} aria-hidden="true" />
        {showPerf && <pre id="perf" ref={perfRef} aria-hidden="true" />}
        <div id="grain" aria-hidden="true" />

        {/* ============================================================ content */}
        <div id="site-content">
          <div id="pages-container">

            {/* ------------------------------------------------------- ACT I */}
            <section id="hero" className="section" style={{ '--h': ACT_LAYOUT[0].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="hero-left" className="blk is-lit" data-lit="0,1">
                    <div id="hero-tag" className="t-sub2">
                      <Reveal>Born in limitations. Built along the seams.</Reveal>
                    </div>
                    <h1 id="hero-word" className="t-h1">
                      <Reveal delay={180}>Pouya</Reveal>
                    </h1>
                    <div id="hero-sub" className="t-label">
                      <Reveal delay={420}>Sadeghpour &mdash; designer and creative developer</Reveal>
                    </div>
                  </div>
                  <div id="hero-copy" className="blk is-lit" data-lit="0,1">
                    <p className="t-body2 rise" style={{ '--delay': '600ms' } as React.CSSProperties}>
                      I design and build immersive websites and digital products: WebGL, motion
                      and interface, from first sketch to launch.
                    </p>
                    <p className="t-body3 t-dim rise hero-seam" style={{ '--delay': '680ms' } as React.CSSProperties}>
                      Every constraint leaves a seam, and the seam is where the work becomes
                      worth looking at.
                    </p>
                    <div className="hero-jump rise" style={{ '--delay': '720ms' } as React.CSSProperties}>
                      <button className="pill is-gold" onClick={() => go(ACT_LAYOUT[3].at + .02)} data-cursor="WORK">
                        <span className="pill-dot" />Selected work <span className="pill-arrow" aria-hidden="true">&darr;</span>
                      </button>
                      <button className="pill is-ghost" onClick={() => setResumeOpen(true)} data-cursor="RESUME">
                        Executive CV (PDF)
                      </button>
                    </div>
                    <div className="hero-divider rise" style={{ '--delay': '780ms' } as React.CSSProperties} />
                    <div className="hero-blueprint-card rise" style={{ '--delay': '860ms' } as React.CSSProperties}>
                      <div className="blueprint-formula-head">
                        <span className="blueprint-formula-pip" />
                        <span className="blueprint-formula-tag">FIG 01 // RADIAL PROFILE</span>
                      </div>
                      <div className="blueprint-formula-math">
                        r(s) = R &middot; (1 &minus; |s|<sup>n</sup>)<sup>1/n</sup>
                      </div>
                      <div className="blueprint-formula-meta">
                        <span>R = 1.72</span>
                        <span className="formula-bullet">&middot;</span>
                        <span>n = 4.2</span>
                        <span className="formula-bullet">&middot;</span>
                        <span>VORONOI PROFILE SEED</span>
                      </div>
                    </div>
                  </div>
                  <div id="hero-card" className="specimen-tag blk is-lit rise" data-lit="0,1" style={{ '--delay': '900ms' } as React.CSSProperties}>
                    <div className="specimen-header">
                      <span className="specimen-pip" />
                      <span className="specimen-code">SPECIMEN NO. 001</span>
                    </div>
                    <div className="specimen-title">Plaster Cast, Unbroken</div>
                    <div className="specimen-meta">Gypsum &middot; 3.5 m &middot; One Piece &middot; Studio Bench</div>
                  </div>
                  <div id="hero-annot" className="hero-scroll-cue blk is-lit" data-lit="0,1">
                    <span className="scroll-cue-pulse" />
                    <span className="scroll-cue-text">SCROLL TO FRACTURE</span>
                    <span className="scroll-cue-arrow" aria-hidden="true">&darr;</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------------ ACT II */}
            <section id="fracture" className="section" style={{ '--h': ACT_LAYOUT[1].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="frac-head" className="blk" data-lit="0.02,0.42">
                    <div className="t-label t-gold"><Reveal>Act II &mdash; the space between</Reveal></div>
                    <h2 className="t-h2"><Reveal delay={140}>It isn&rsquo;t damage.</Reveal></h2>
                    <p className="t-body3 rise" style={{ '--delay': '520ms' } as React.CSSProperties}>
                      The piece comes apart along lines that were already there. Nothing is
                      added. Nothing is lost. Time simply stops holding it together.
                    </p>
                    <div className="rise" style={{ '--delay': '680ms' } as React.CSSProperties}>
                      <Formula label="Fracture" expr="V&#7522; = { x : &#8214;x &minus; p&#7522;&#8214; &le; &#8214;x &minus; p&#11388;&#8214; }" note={`${FRAGMENTS} cells, one seed each`} />
                    </div>
                  </div>
                  <div id="frac-huge" className="blk" data-lit="0.44,1">
                    <h2 className="t-h1"><Reveal>it&rsquo;s suspended</Reveal></h2>
                  </div>
                  <div id="frac-hint" className="blk annot" data-lit="0.46,1">
                    <svg className="hand" viewBox="0 0 32 40" aria-hidden="true">
                      <path fill="currentColor" d="M7 23v-6c-2 2-3 4-3 6 0 6 4 13 8 15h11c4-2 6-7 6-13V12a2 2 0 0 0-4 0v6h-1V5a2 2 0 0 0-4 0v12h-1V3a2 2 0 0 0-4 0v14h-1V8a2 2 0 0 0-4 0v15Z" />
                    </svg>
                    Move the cursor to look between the pieces
                  </div>
                  <div id="frac-spec" className="blk" data-lit="0.4,1">
                    <div className="spec">
                      <span className="spec-k">Fragments</span>
                      <span className="spec-v" ref={tiltRef}>0 / {FRAGMENTS}</span>
                    </div>
                    <div className="spec">
                      <span className="spec-k">Gravity</span>
                      <span className="spec-v">0.00 m/s&sup2;</span>
                    </div>
                    <div className="spec">
                      <span className="spec-k">State</span>
                      <span className="spec-v">Held</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ----------------------------------------------------- ACT III */}
            <section id="drop" className="section" style={{ '--h': ACT_LAYOUT[2].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div className="drop-head blk" data-lit="0.06,0.46">
                    <div className="t-label t-gold"><Reveal>Act III &mdash; gravity returns</Reveal></div>
                    <h2 className="t-h2 t-caps"><Reveal delay={160}>Fall. Then be rebuilt.</Reveal></h2>
                    <p className="t-body3 rise" style={{ '--delay': '520ms' } as React.CSSProperties}>
                      Forty-three pieces meet a cutting mat at full weight. What happens next is
                      not a repair. It is a decision about where the metal goes.
                    </p>
                  </div>
                  <div className="drop-head blk" data-lit="0.52,1">
                    <div className="t-label t-gold"><Reveal>The kintsugi protocol</Reveal></div>
                    <h2 className="t-h2 t-caps"><Reveal delay={160}>Made whole. Made different.</Reveal></h2>
                    <p className="t-body3 rise" style={{ '--delay': '520ms' } as React.CSSProperties}>
                      Every break is filled rather than hidden, so the object ends up carrying a
                      record of everything that happened to it.
                    </p>
                  </div>
                  <div id="drop-readout" className="blk" data-lit="0.14,1">
                    <div className="spec">
                      <span className="spec-k">Impact</span>
                      <span className="spec-v" ref={impactRef}>0.0 J</span>
                    </div>
                    {/* The one read-out that scroll cannot buy: it is a function of real
                        seconds spent with the work, and nothing anywhere says so. */}
                    <div className="spec">
                      <span className="spec-k">Seam integrity</span>
                      <span className="spec-v" ref={goldRef}>0 %</span>
                    </div>
                  </div>
                  <div id="drop-formula" className="blk" data-lit="0.08,1">
                    <Formula label="Fall" expr="y(t) = y&#8320; &minus; &frac12; g t&sup2;" note="restitution e = 0.27" />
                  </div>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------------ ACT IV */}
            <section id="blueprint" className="section" style={{ '--h': ACT_LAYOUT[3].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="bp-head" className="blk" data-lit="0.16,0.86">
                    <div className="t-label"><Reveal>Act IV &mdash; the working surface</Reveal></div>
                    <h2 className="t-h2"><Reveal delay={140}>Limitations are just raw materials.</Reveal></h2>
                  </div>
                  <div id="bp-stamp" className="blk" data-lit="0.16,0.84">
                    <Formula label="Sheet" expr="1 &divide; &radic;2" note="scale 1 : 1" />
                  </div>
                  <div id="bp-note" className="blk" data-lit="0.20,0.92">
                    <span className="t-label">
                      {hoverCard >= 0
                        ? <>Drawing {PROJECTS[hoverCard].number} &mdash; {PROJECTS[hoverCard].domain}</>
                        : <>{PROJECTS.length} cards on the sheet &middot; click one to open its case study</>}
                    </span>
                  </div>
                  {/* The cards live in WebGL, so the keyboard needs its own way in. It is
                      off screen until it takes focus, then it shows where the focus is. */}
                  <nav className="bp-keyboard" aria-label="Selected work">
                    <h3 className="sr-only">Selected work</h3>
                    {PROJECTS.map((p, i) => (
                      <button key={p.id} onClick={() => openProject(i)} className="pill is-ghost">
                        {p.number} {p.name}<span className="sr-only">, {p.kind}, {p.year}. Open the case study</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------- ACT V

                What the light makes. The page says almost nothing here, because the
                act is a question the reader answers with their hand. */}
            <section id="light" className="section" style={{ '--h': ACT_LAYOUT[4].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="lit-head" className="blk" data-lit="0.04,0.5">
                    <div className="t-label t-gold"><Reveal>Act V &mdash; illumination</Reveal></div>
                    <h2 className="t-h2"><Reveal delay={140}>Nothing here is dark.</Reveal></h2>
                    <p className="t-body3 rise" style={{ '--delay': '520ms' } as React.CSSProperties}>
                      There is no unlit half of this. Move the light and what it reaches
                      begins; take it away and there is nothing behind it to find.
                    </p>
                  </div>
                  <div id="lit-hint" className="blk annot" data-lit="0.06,0.42">
                    <span className="tick" />You are holding the only light in the room
                  </div>
                  <div id="lit-tail" className="blk" data-lit="0.72,1">
                    <h2 className="t-h2 t-dim"><Reveal>And then it is everywhere,</Reveal></h2>
                    <h2 className="t-h2"><Reveal delay={200}>and there is nothing to see.</Reveal></h2>
                  </div>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------------- ACT VI */}
            <section id="bewilder" className="section" style={{ '--h': ACT_LAYOUT[5].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="bew-head" className="blk" data-lit="0.03,0.52">
                    <div className="t-label t-gold"><Reveal>Act VI &mdash; one station only</Reveal></div>
                    <h2 className="t-h2"><Reveal delay={140}>It is not in pieces.</Reveal></h2>
                    <p className="t-body3 rise" style={{ '--delay': '520ms' } as React.CSSProperties}>
                      You are not standing where it is whole. There is one place, it is
                      not the middle, and nothing here will tell you where it is.
                    </p>
                  </div>
                  {/* The only instrument in the act, and it is deliberately not a
                      direction - it says how near, never which way. */}
                  <div id="bew-meter" className="blk" data-lit="0.05,1">
                    <span className="t-label t-dim">ALIGNMENT</span>
                    <span className="bew-value" ref={alignRef}>0</span>
                    <i className="bew-bar" ref={alignBarRef} />
                  </div>
                  <div id="bew-tail" className="blk" data-lit="0.78,1">
                    <h2 className="t-h2 t-dim"><Reveal>And it was never in pieces.</Reveal></h2>
                  </div>
                </div>
              </div>
            </section>

            <section id="sea" className="section" style={{ '--h': ACT_LAYOUT[6].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="sea-head" className="blk" data-lit="0.04,0.34">
                    <div className="t-label t-gold"><Reveal>Act VII &mdash; gold</Reveal></div>
                    <h2 className="t-h2"><Reveal delay={140}>Everything it cost,</Reveal><br /><Reveal delay={300}>in one place.</Reveal></h2>
                  </div>
                  {/* The only instruction the site gives, and it is an invitation
                      rather than a direction: what happens when it is followed is
                      left entirely alone. */}
                  <div id="sea-hint" className="blk annot" data-lit="0.22,0.62">
                    <span className="tick" />Touch the water
                  </div>
                  <div id="sea-tail" className="blk" data-lit="0.66,1">
                    <p className="t-sub2 t-dim">
                      <Reveal>What is in the water was never repaired.</Reveal>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------------------------------------------------- ACT VIII

                Two of them leave the seams. One reads light and circles it; one reads
                heat and finds it. Nothing here says which is the better instinct - the
                act just shows what each rule does when it is followed all the way. */}
            <section id="butterfly" className="section" style={{ '--h': ACT_LAYOUT[7].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="fly-head" className="blk" data-lit="0.04,0.40">
                    <div className="t-label t-gold"><Reveal>Act VIII &mdash; three wings</Reveal></div>
                    <h2 className="t-h2"><Reveal delay={140}>One reads the light.</Reveal><br /><Reveal delay={300}>One reads the heat.</Reveal></h2>
                  </div>
                  <div id="fly-rules" className="blk" data-lit="0.16,0.62">
                    <span><i />Keep a fixed angle to the light &mdash; and orbit it forever</span>
                    <span><i />Climb the gradient &mdash; and arrive</span>
                  </div>
                  <div id="fly-tail" className="blk" data-lit="0.74,1">
                    <p className="t-sub2 t-dim">
                      <Reveal>Only one of them was wrong, and it is the one that got there.</Reveal>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ----------------------------------------------------- ACT VIII */}
            <section id="manifesto" className="section" style={{ '--h': ACT_LAYOUT[8].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="man-head" className="blk" data-lit="0.04,0.62">
                    <div className="t-label t-gold"><Reveal>Act IX &mdash; the manifesto lab</Reveal></div>
                    <h3 className="t-h3" style={{ marginTop: '.4em' }}>
                      <Reveal delay={140}>A statement,</Reveal><br />
                      <Reveal delay={280}>written in light.</Reveal>
                    </h3>
                  </div>
                  <div id="man-readout" className="blk" data-lit="0.06,0.62">
                    <Formula label="Cloud" expr="N = 11 000" note="points sampled on r(s)" />
                  </div>
                  <div id="man-lines" className="blk" data-lit="0.14,1">
                    <p className="t-sub2">
                      Born in limitations, bred in isolation. We don&rsquo;t just survive the
                      restrictions; we architect them into golden opportunities.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------------- ACT IX */}
            <section id="finale" className="section" style={{ '--h': ACT_LAYOUT[9].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div id="fin-top" className="blk" data-lit="0.08,0.62">
                    <div className="t-label t-gold"><Reveal>Act X &mdash; taking the square</Reveal></div>
                    <h2 className="t-serif"><Reveal delay={180}>A board is only a set of rules</Reveal></h2>
                  </div>
                  <div id="fin-bottom" className="blk" data-lit="0.30,1">
                    <h2 className="t-serif"><em><Reveal>and the rules are where the piece goes.</Reveal></em></h2>
                    <div className="rise" style={{ '--delay': '420ms' } as React.CSSProperties}>
                      <Formula label="Placement" expr="e1 &mdash; the most defended square" note="thirty-two pieces, one of them repaired" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------------------------------------------------- COLOPHON */}
            <section id="contact" className="section" style={{ '--h': ACT_LAYOUT[10].height } as React.CSSProperties}>
              <div className="section__inner">
                <div className="section__stage">
                  <div className="ct-wrap">
                    <div id="ct-top" className="blk" data-lit="0.04,1">
                      <div className="ct-intro">
                        <h2 id="ct-statement" className="t-h3">
                          <Reveal>If a constraint can build this,</Reveal><br />
                          <em><Reveal delay={220}>imagine what it can build for you.</Reveal></em>
                        </h2>
                        <p className="annot t-dim ct-direct-note">
                          Inquiries &amp; Discovery: Direct via <a href="https://linkedin.com/in/onepouya" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>LinkedIn</a>, <a href="https://t.me/pouya_dmg" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Telegram</a>, or <a href="mailto:pouyas.one@outlook.com" style={{ textDecoration: 'underline' }}>pouyas.one@outlook.com</a>
                        </p>
                      </div>
                      <div className="ct-actions">
                        <button
                          type="button"
                          className="pill is-gold"
                          onClick={() => setCommissionOpen(true)}
                          data-cursor="DISPATCH"
                          onPointerMove={magnetise}
                          onPointerLeave={release}
                        >
                          <span className="pill-dot" />Start a project
                        </button>
                        <button className="pill is-dashed" onClick={() => setResumeOpen(true)} data-cursor="RESUME"
                          onPointerMove={magnetise} onPointerLeave={release}>
                          <span className="pill-dot" />Executive CV (PDF)
                        </button>
                        {CONTACT.email && (
                          <button className="pill is-ghost" onClick={() => copy(CONTACT.email, 'email')} data-cursor="COPY"
                            onPointerMove={magnetise} onPointerLeave={release}>
                            {copied === 'email' ? 'Email copied' : CONTACT.email}
                          </button>
                        )}
                      </div>
                    </div>

                    <div id="ct-mid" className="o-dash blk" data-lit="0.04,1" />

                    <div className="ct-body-grid">
                      <div id="ct-links" className="blk" data-lit="0.04,1">
                        <div>
                          <h3 className="ct-h">Selected work</h3>
                          {PROJECTS.map((p, i) => (
                            <button key={p.id} className="flip-host ct-link" onClick={() => openProject(i)} data-cursor="READ">
                              <Flip>{p.name.toUpperCase()}</Flip>
                              <span className="ct-sub">{p.kind}</span>
                            </button>
                          ))}
                        </div>
                        {CONTACT.links.length > 0 && (
                          <div>
                            <h3 className="ct-h">Contact</h3>
                            {CONTACT.links.map(l => l.url ? (
                              <a key={l.label} className="flip-host ct-link" href={l.url} target="_blank" rel="noopener noreferrer" data-cursor="OPEN">
                                <Flip>{l.label.toUpperCase()}</Flip>
                                <span className="ct-sub">{l.handle}<span className="sr-only"> (opens in a new tab)</span></span>
                              </a>
                            ) : (
                              <button key={l.label} className="flip-host ct-link" onClick={() => copy(l.handle, l.label)} data-cursor="COPY">
                                <Flip>{l.label.toUpperCase()}</Flip>
                                <span className="ct-sub">{copied === l.label ? 'Copied' : l.handle}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Every portfolio ends with a small brag about its stack. This one
                            also prints what died making it, flatly, with no adjective
                            anywhere - it is the only place the cost is admitted. */}
                        <div id="ct-killed">
                          <h3 className="ct-h">Did not live</h3>
                          <ul>
                            {KILLED.map(k => (
                              <li key={k.what}><span>{k.what}</span><i /><span className="t-dim">{k.lived}</span></li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div id="ct-made" className="blk" data-lit="0.04,1">
                        <h3 className="ct-h">How it is made</h3>
                        <p className="annot">
                          A plaster cast, carved into {FRAGMENTS} Voronoi shell shards, dropped once in an
                          offline solver and scrubbed by the scroll. Per-pixel motion blur, a cursor
                          that cuts, and an adaptive, recorded cinematic score.
                        </p>
                        <p className="annot">
                          Music: <a href="https://www.youtube.com/watch?v=OJj9nv78fOc"
                            target="_blank" rel="noopener noreferrer">Feeling Blue &mdash; Caleb Arredondo</a>.
                          {' '}Impact: &ldquo;Long Deep Impact&rdquo; by ROHHSA (CC BY-SA 4.0).
                          Interface sounds by Kenney (CC0).
                        </p>
                        {/* Nietzsche. The last thing the site does is put the road back in
                            front of the reader and ask nothing else. */}
                        <button id="ct-replay" className="pill is-dashed" data-cursor="AGAIN"
                          onClick={() => go(0)} onPointerMove={magnetise} onPointerLeave={release}>
                          Again? <span className="pill-arrow" aria-hidden="true">&#8635;</span>
                        </button>
                      </div>
                    </div>

                    <div className="o-dash blk" data-lit="0.04,1" />

                    {/* No name, no initials, no date. The only line about the maker is the
                        one that says the maker was not what was on offer. */}
                    <div id="ct-bottom" className="annot blk" data-lit="0.04,1">
                      <span id="ct-line">Not the maker. The made.</span>
                      <span><span ref={clockRef}>--:--</span> &middot; 2026 &copy; version 05</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>

        {/* ------------------------------------------------------- case study */}
        {portalOpen && focus >= 0 && PROJECTS[focus] && (
          <CaseStudy project={PROJECTS[focus]} index={focus} total={PROJECTS.length}
            onClose={leavePortal} onStep={stepProject} />
        )}

        {/* ---------------------------------------------------------- preloader

            Eight concentric lines introduce the same material, measurements and acts
            the visitor is about to encounter. Their breathing text lengths keep the
            waiting screen alive without competing with the WebGL scene underneath. */}
        <output id="preloader" ref={shellRef} aria-label="Loading">
          <div className="pre-edge pre-edge--top" aria-hidden="true">
            <span>PS / PORTFOLIO</span>
            <span>STUDIO &mdash; ARCHIVE</span>
          </div>

          <svg className="pre-orbits" ref={orbitRef} viewBox="-500 -500 1000 1000"
            aria-hidden="true" focusable="false">
            <defs>
              {ORBITS.map((orbit, i) => (
                <path key={orbit.r} id={`pre-path-${i + 1}`} d={orbitPath(orbit.r)} />
              ))}
            </defs>
            {ORBITS.map((orbit, i) => (
              <text key={orbit.r}>
                <textPath href={`#pre-path-${i + 1}`} startOffset={`${orbit.offset}%`}
                  textLength={orbit.from} lengthAdjust="spacingAndGlyphs">
                  {orbit.text}
                </textPath>
              </text>
            ))}
          </svg>

          <div className="pre-center" aria-hidden="true">
            <div className="pre-counter">
              <span className="pre-count" ref={countRef}>0</span>
              <span className="pre-unit">%</span>
            </div>
            <i className="pre-center-rule" ref={ruleRef} />
            <b className="pre-status" ref={wordRef}>SETTING OUT</b>
          </div>

          <div className="pre-edge pre-edge--bottom" aria-hidden="true">
            <span>GYPSUM / LIGHT / MOTION</span>
            <span>ARCHITECTING POSSIBILITIES</span>
          </div>
        </output>

        <ResumeModal isOpen={resumeOpen} onClose={() => setResumeOpen(false)} />
        <CommissionModal isOpen={commissionOpen} onClose={() => setCommissionOpen(false)} />
        <AssistantWidget isOpen={oracleOpen} onClose={() => setOracleOpen(false)} />
      </div>
    </>
  );
}
