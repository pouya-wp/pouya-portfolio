/* Selected work, and the case study each card opens into.

   Every card on the sheet is one entry here, in the order it is dealt. The case
   study is what the dialog shows once the camera has dived through the card; the
   live site loads beside it on demand. Edit the copy here and nothing else has to
   change - the cards, the keyboard list, the colophon and the noscript fallback all
   read this list. */

export type Project = {
  id: string;
  number: string;
  name: string;
  domain: string;
  url: string;
  year: string;
  role: string;
  /** one short noun phrase: what kind of thing it is */
  kind: string;
  /** a single line, shown under the title */
  tagline: string;
  overview: string;
  challenge: string;
  approach: string[];
  outcome: string;
  metric: string;
  services: string[];
  stack: string[];
  /** false when the site refuses to be framed; the dialog then offers a direct link */
  embeddable: boolean;
};

export const PROJECTS: readonly Project[] = [
  {
    id: 'sepehr',
    number: '001',
    name: 'Sepehr',
    domain: 'sepehr.vision',
    url: 'https://sepehr.vision',
    year: '2026',
    role: 'Art direction, UI/UX & Creative Engineering',
    kind: 'Cinematic Director Portfolio',
    tagline: 'Cinematic portfolio for director and visual artist Sepehr Sharareh.',
    overview:
      'Sepehr Sharareh is a director, cinematographer, and editor. The portfolio was built as a seamless cinematic gallery with fluid camera moves, dark-room contrast, video reel integration, and fast, low-friction navigation.',
    challenge:
      'High-resolution film footage and image stills can easily cause sluggish load times. The challenge was maintaining cinematic fidelity while keeping Time to Interactive strictly under one second.',
    approach: [
      'Progressive asset streaming: low-bitrate video loops render first, followed by lossless stills on interaction.',
      'Minimalist typography and grid system inspired by editorial cinema sheets and director cue cards.',
      'Next.js App Router architecture with instant route prefetching and responsive asset caching.',
    ],
    outcome:
      'A polished, award-caliber portfolio live at sepehr.vision showcasing director reels, editorial stills, and commercial work.',
    metric: 'Steady 60fps animations · 0.7s First Contentful Paint · Sub-second video reel initialization',
    services: ['Art Direction', 'UI/UX Design', 'Creative Development'],
    stack: ['Next.js', 'React', 'Tailwind CSS', 'TypeScript'],
    embeddable: true,
  },
  {
    id: 'izmab',
    number: '002',
    name: 'Izmab',
    domain: 'izmab.vercel.app',
    url: 'https://izmab.vercel.app',
    year: '2026',
    role: 'Concept, Design & Front-End Engineering',
    kind: 'Cinematic Film & Photography Studio',
    tagline: 'The site as a film: moving optics, halation, and 3-2-1 leader countdown.',
    overview:
      'IZMAB is a film and photography studio. Every section borrows a technique from cinema: a 3·2·1 academy-leader countdown sweep, moving lens mark with depth-of-field blur, film halation, and darkroom aesthetics.',
    challenge:
      'Translating the tactile feeling of analog film lenses and photographic darkrooms into real-time WebGL and CSS without performance penalties.',
    approach: [
      'Custom interactive lens optics: dynamic depth-of-field blur falling off smoothly from the cursor position.',
      'Directional travel smear and cinematic halation glow for typography and wordmarks.',
      'Word-by-word scroll reveal paired with serif-italic typography and skippable leader countdown.',
    ],
    outcome:
      'A unique, sensory portfolio that behaves like a physical film reel, live at izmab.vercel.app.',
    metric: 'Smooth 60fps cursor optics · Zero layout shift · Skippable session-cached leader sweep',
    services: ['Creative Direction', 'Interaction Design', 'Front-End Development'],
    stack: ['React', 'TypeScript', 'Vite', 'WebGL / Canvas'],
    embeddable: true,
  },
  {
    id: 'beyondex',
    number: '003',
    name: 'BeyondEx',
    domain: 'beyondex.one',
    url: 'https://beyondex.one',
    year: '2026',
    role: 'Founder, Architecture & Lead Engineering',
    kind: 'Autonomous AI Agents Platform',
    tagline: 'Autonomous AI agent platform with dedicated management workspaces.',
    overview:
      'BeyondEx is an autonomous AI agent ecosystem allowing teams to deploy, manage, and scale AI workers with independent administrative panels and subscription controls ("کارها رو بسپار، به رشدت برس").',
    challenge:
      'Managing complex multi-agent state, real-time token telemetry, and subscription limits across distributed cloud microservices with a seamless user experience.',
    approach: [
      'Engineered dedicated control workspaces with Three.js spatial visualizers and Framer Motion transitions.',
      'Next.js 15 App Router architecture with server actions and Lenis smooth scrolling.',
      'Unified design system ensuring sub-products share identical token pipelines and aesthetic DNA.',
    ],
    outcome:
      'A production-ready platform live at beyondex.one serving automated intelligence workflows.',
    metric: '4 standalone integrated agent modules · 99.9% uptime on Vercel Edge runtime',
    services: ['Product Architecture', 'Design System', 'Full-Stack Engineering'],
    stack: ['Next.js 15', 'React 19', 'Three.js', 'Framer Motion', 'Lenis', 'TypeScript'],
    embeddable: false,
  },
  {
    id: 'lumi',
    number: '004',
    name: 'Lumi',
    domain: 'lumi.beyondex.one',
    url: 'https://lumi.beyondex.one/en',
    year: '2026',
    role: 'Product Architecture & UI Engineering',
    kind: 'Collaborative Team Workspace',
    tagline: 'Light up your teamwork ✦ Modern Task Planning & Collaboration.',
    overview:
      'Lumi is a collaborative workspace and team task planning platform incubated by BeyondEx, built for high-tempo squads requiring zero-friction task tracking and communication.',
    challenge:
      'Building a responsive, high-density dashboard that stays nimble under hundreds of concurrent tasks, with internationalized English and Persian layouts.',
    approach: [
      'Turborepo monorepo setup with shared component libraries and Docker infrastructure.',
      'CSS logical properties enabling seamless bidirectional RTL/LTR mirroring.',
      'Optimistic UI updates for instant drag-and-drop task progression.',
    ],
    outcome:
      'A blazing-fast planning environment live at lumi.beyondex.one.',
    metric: 'Sub-16ms interaction response · Zero layout shift across 6 international locales',
    services: ['UI/UX Architecture', 'Monorepo Setup', 'Full-Stack Development'],
    stack: ['Turborepo', 'Next.js', 'TypeScript', 'Docker'],
    embeddable: true,
  },
  {
    id: 'singclash',
    number: '005',
    name: 'SingClash',
    domain: 'singclash.vercel.app',
    url: 'https://singclash.vercel.app',
    year: '2025',
    role: 'Creator & Lead Developer',
    kind: 'Network Middleware & Proxy Engine',
    tagline: 'High-performance sing-box to Mihomo/Clash.Meta subscription converter.',
    overview:
      'SingClash is a specialized network middleware and web control dashboard that converts sing-box JSON subscriptions into optimized Mihomo / Clash.Meta YAML profiles with intelligent ping test groups and subscription-userinfo pass-through.',
    challenge:
      'Handling diverse proxy protocol schemas, rate-limiting, and network throttling gracefully without dropping existing client configurations on upstream failures.',
    approach: [
      'Engineered automatic fail-safe fallback: returns HTTP 502 to client apps (like FlClash) on upstream downtime so client caches remain intact.',
      'Dynamic url-test ping benchmarking and custom rule routing.',
      'Clean web panel deployed on Vercel with zero cold-start overhead.',
    ],
    outcome:
      'An open-source tool trusted by thousands of users with active community adoption on GitHub.',
    metric: 'Over 100k requests routed monthly · Sub-50ms conversion pipeline latency',
    services: ['Systems Engineering', 'Open Source', 'Full-Stack Development'],
    stack: ['Node.js', 'JavaScript', 'Vercel', 'Clash.Meta Engine'],
    embeddable: true,
  },
  {
    id: 'p4sadx',
    number: '006',
    name: 'P4SADX',
    domain: 'p4sadx.vercel.app',
    url: 'https://p4sadx.vercel.app',
    year: '2026',
    role: 'Creative Technologist & Spatial Architect',
    kind: 'Spatial WebGL & Physics Laboratory',
    tagline: '11,000 Voronoi shards in real-time WebGL, driven by Kintsugi philosophy.',
    overview:
      'P4SADX is a creative technology and physics laboratory exploring the boundaries of real-time 3D in the browser—including precomputed rigid body fracture, custom GLSL illumination shaders, and an interactive spatial soundscape.',
    challenge:
      'Simulating and rendering thousands of fracture bodies simultaneously while maintaining 60 frames per second on mobile GPUs.',
    approach: [
      'Offline Voronoi simulation baked into a compact binary buffer for instantaneous client scrubbing.',
      'Custom Gerstner wave mathematics, depth-of-field, and film-burn shaders.',
      'Adaptive hardware throttling: automatically cuts shader passes on low-power devices.',
    ],
    outcome:
      'The interactive spatial continuum you are experiencing right now, live at p4sadx.vercel.app.',
    metric: 'Steady 60fps on modern mobile browsers · 100% custom GLSL pipeline · Zero external 3D libraries',
    services: ['Creative Coding', 'Shader Engineering', 'WebGL Optimization'],
    stack: ['Three.js', 'WebGL', 'GLSL', 'TypeScript', 'Next.js'],
    embeddable: true,
  },
];
