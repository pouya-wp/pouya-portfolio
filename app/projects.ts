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
  github?: string;
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
    id: 'atelier',
    number: '001',
    name: 'Atelier',
    domain: 'khaki-mocha.vercel.app',
    url: 'https://khaki-mocha.vercel.app',
    github: 'https://github.com/pouya-wp/atelier-intelligence',
    year: '2026',
    role: 'Lead Architect, 3D Graphics & AI Systems',
    kind: 'Luxury Gold Atelier AI Management Suite',
    tagline: 'Luxury Gold Atelier AI Management System & 3D Three.js Interactive Dashboard.',
    overview:
      'Atelier Intelligence is an enterprise AI management operating system and 3D interactive command center engineered for Aghigh Gold of Yazd (طلای عقیق یزد). Built with a regal Emerald & Champagne Gold design system, it orchestrates 13 specialized AI agents, interactive 3D bullion and coin inspection with studio HDRI reflection, role-based command views (Executive, Accounting, Vault, HR), and real-time fiat-to-gold weight conversion across inventory and payment deadlines.',
    challenge:
      'Traditional gold manufacturing and jewelry accounting systems are fragmented across disparate desktop databases, lacking real-time gold market valuation, 3D asset inspection, and automated inventory reconciliation for precious metals.',
    approach: [
      'Engineered real-time 3D Three.js gold bullion and coin rendering with studio HDRI environment maps and engraved hallmark stamping.',
      'Crafted interactive tactile entrance featuring a press-and-hold wax seal simulation with bespoke audio design and golden curtain role transitions.',
      'Architected real-time gold-indexed financial ledger: automatically converts cash receivables, supplier liabilities, and employee overtime into exact milligram gold equivalents.',
      'Unified 13 specialized autonomous AI agents overseeing manufacturing line costs, vault balances, and executive operational reports.',
    ],
    outcome:
      'An ultra-luxury, high-precision industrial management suite live at khaki-mocha.vercel.app and open-sourced on GitHub.',
    metric: '13 integrated operational AI agents · 60 FPS studio 3D bullion rendering · Real-time milligram gold ledger conversion',
    services: ['Creative Direction', '3D WebGL / Three.js', 'Enterprise UI/UX Architecture', 'AI Agent Orchestration'],
    stack: ['Three.js', 'WebGL', 'JavaScript', 'Vite', 'Tailwind CSS', 'Vercel'],
    embeddable: true,
  },
  {
    id: 'germanio',
    number: '002',
    name: 'Germanio',
    domain: 'github.com/pouya-wp/Germanio',
    url: 'https://github.com/pouya-wp/Germanio',
    github: 'https://github.com/pouya-wp/Germanio',
    year: '2026',
    role: 'Systems Architecture & Cognitive Engineering',
    kind: 'Local-First German Learning OS',
    tagline: 'Die Grenzen meiner Sprache — Cognitive vocabulary sky powered by FSRS & BKT.',
    overview:
      'Germanio is a personal, local-first German learning operating system (A1–B2) designed to integrate directly into the developer desktop workspace without paper or friction. Vocabulary is visualized as an astronomical celestial star chart where learned lemmas illuminate the sky. Engineered with FSRS (Free Spaced Repetition Scheduler) memory algorithms, Bayesian Knowledge Tracing (BKT) error profiling, and an adaptive i18n engine that progressively translates UI strings into German as lexical mastery advances.',
    challenge:
      'Traditional language apps rely on cloud-locked databases, gamified dark patterns, and rigid interval algorithms (SuperMemo SM-2) that ignore forgetting curves, context switching, and cognitive load while coding.',
    approach: [
      'Engineered local-first Brain service on 127.0.0.1:4317 using Hono, Drizzle ORM, and SQLite, indexing 22,000 lemmas and 118,000 example sentences with offline audio.',
      'Integrated modern FSRS spaced repetition algorithms alongside Bayesian Knowledge Tracing (BKT) to construct a real-time grammatical error profile (Fehlerprofil).',
      'Architected adaptive i18n (packages/i18n-adaptive) where application interface strings dynamically convert to German words as the learner demonstrates retention.',
      'Built cross-environment mining connectors including a WXT Firefox extension, VS Code companion, and terminal CLI.',
    ],
    outcome:
      'An autonomous, offline-first linguistic environment turning daily computer usage into passive German language immersion with verifiable B2 exam forecasting.',
    metric: '22k lemmas & 118k sentence corpus indexed · Sub-10ms local SQLite query latency · FSRS predictive retention accuracy',
    services: ['Cognitive Architecture', 'Full-Stack Engineering', 'Linguistic Data Modeling', 'Local-First Systems'],
    stack: ['Next.js 16', 'React 19', 'Hono', 'SQLite / Drizzle', 'WXT (Firefox)', 'FSRS Engine', 'Tailwind CSS v4', 'TypeScript'],
    embeddable: false,
  },
  {
    id: 'nebula-plus',
    number: '003',
    name: 'Nebula Plus',
    domain: 'github.com/pouya-wp/Nebula-Plus',
    url: 'https://github.com/pouya-wp/Nebula-Plus',
    github: 'https://github.com/pouya-wp/Nebula-Plus',
    year: '2026',
    role: 'Native Systems Engineering & Browser UI',
    kind: 'Glassmorphic Browser Suite & .NET Bridge',
    tagline: 'Compositor-first workstation for Zen Browser with C# WASAPI audio bridge & Gemini AI.',
    overview:
      'Nebula Plus is an advanced engineering evolution of Zen Browser (Firefox Gecko Engine), transforming the web browser from a passive document viewer into an intelligent, hardware-accelerated workstation. It bridges deep Firefox XPCOM/UserChrome scripting with a dedicated C# (.NET / Windows SDK) native companion process for real-time Windows system media telemetry and live WASAPI audio spectrum analysis.',
    challenge:
      'Capturing real-time system audio spectrum data and native OS media sessions inside Firefox without degrading compositor framerates or causing battery drain on laptop displays.',
    approach: [
      'Developed a lightweight C# (.NET) native Windows companion bridge capturing WASAPI loopback audio buffers and system transport sessions.',
      'Engineered a low-overhead IPC communication channel feeding audio spectrum matrices directly into Firefox XPCOM runtime.',
      'Designed a compositor-accelerated glassmorphic chrome with traveling comet glows and integrated media controls.',
      'Embedded Google Gemini AI directly into browser chrome alongside first-class Persian / RTL cultural layout tooling.',
    ],
    outcome:
      'A high-aesthetic, hardware-accelerated browser environment providing unified audio, AI, and workflow ergonomics with near-zero idle CPU footprint.',
    metric: 'Real-time WASAPI audio spectrum analysis · 60 FPS compositor fluidity · Sub-1% idle CPU consumption',
    services: ['Native Systems Programming', 'Browser Engine Hacking', 'UI/UX Glassmorphism', 'IPC Architecture'],
    stack: ['Firefox XPCOM', 'UserChrome CSS/JS', 'C# (.NET / Windows SDK)', 'WASAPI Audio', 'Google Gemini AI', 'Zen Browser'],
    embeddable: false,
  },
  {
    id: 'lumi',
    number: '004',
    name: 'Lumi',
    domain: 'lumi.beyondex.one',
    url: 'https://lumi.beyondex.one/en',
    github: 'https://github.com/pouya-wp/Lumi',
    year: '2026',
    role: 'Product Architecture & Lead UI Engineer',
    kind: 'Collaborative Team Workspace & Task Planning',
    tagline: 'Light up your teamwork ✦ Multi-platform workspace with real-time docs, OKRs, & Flutter app.',
    overview:
      'Lumi is an enterprise-grade collaborative workspace and team productivity platform by Beyondex. Built to eliminate fragmentation between task management, asynchronous docs, and execution frameworks, Lumi unifies Kanban boards, sprints, OKRs, Eisenhower matrices, Notion-style collaborative live documents, and team chats across Web, Android, and iOS.',
    challenge:
      'Synchronizing high-frequency collaborative editing, task states, Persian solar calendar calculations, and offline mobile clients without race conditions or database bottlenecks.',
    approach: [
      'Engineered a multi-tenant backend with NestJS, Prisma ORM, PostgreSQL with pgvector for AI semantic task categorization, Redis caching, and MinIO storage.',
      'Built cross-platform mobile apps in Flutter with offline-first local synchronization, biometric authentication, and push notifications.',
      'Architected Next.js web application utilizing CSS logical properties for 100% bidirectional RTL (Persian) and LTR (English) layout fidelity.',
      'Integrated OpenAI agents for automated task decomposition, daily work plan generation, and team standup summaries.',
    ],
    outcome:
      'A comprehensive, beautifully designed planning ecosystem deployed live at lumi.beyondex.one and open-sourced on GitHub.',
    metric: 'Sub-16ms UI response time · Zero layout shift across 6 locales · Full cross-platform parity (Web, Android, iOS)',
    services: ['Product Architecture', 'Enterprise Backend Design', 'Mobile Engineering', 'AI Workflow Automation'],
    stack: ['NestJS', 'Prisma', 'PostgreSQL / pgvector', 'Next.js 15', 'Flutter (Dart)', 'Docker', 'Redis', 'OpenAI API'],
    embeddable: true,
  },
  {
    id: 'directino',
    number: '005',
    name: 'Directino',
    domain: 'github.com/pouya-wp/directino',
    url: 'https://github.com/pouya-wp/directino',
    github: 'https://github.com/pouya-wp/directino',
    year: '2026',
    role: 'Distributed Systems & Go Architecture',
    kind: 'AI Omnichannel Messaging Platform',
    tagline: 'High-concurrency Go messaging engine & Claude AI agent with human pacing.',
    overview:
      'Directino is an AI-powered omnichannel messaging platform and conversational automation suite. Built with a high-concurrency Go backend and Next.js 16 frontend, it bridges WhatsApp, Telegram, and Instagram to an intelligent Claude-powered reply engine featuring variable reading pauses, typing duration simulation, and zero-knowledge session encryption.',
    challenge:
      'Preventing automated spam bans on messaging networks while orchestrating real-time AI responses with strict review workflows (draft, approve, auto) and secure credentials storage.',
    approach: [
      'Built high-throughput Go (1.22+) daemon utilizing whatsmeow for native multi-device WhatsApp socket connectivity without headless browser overhead.',
      'Implemented human behavioral simulation: variable reading pauses, realistic typing indicators, and account-specific jitter algorithms to safeguard channel reputation.',
      'Engineered cryptographic session vault using AES-256-GCM encryption with workspace-isolated HKDF key derivation.',
      'Crafted bilingual (FA/EN) web dashboard in Next.js 16 and Tailwind v4 featuring custom Persian typography (Peyda and Gofteh) with mock fallback for interactive exploration.',
    ],
    outcome:
      'An enterprise-grade messaging automation suite deployed with zero-knowledge security and seamless human-in-the-loop review policies.',
    metric: 'Sub-5ms socket dispatch latency · AES-256-GCM zero-knowledge session security · 100% human-pacing fidelity',
    services: ['Distributed Systems', 'Protocol Engineering', 'Go Microservices', 'AI Agent Orchestration'],
    stack: ['Go 1.22+', 'whatsmeow', 'Claude Messages API', 'Next.js 16', 'React 19', 'Tailwind CSS v4', 'AES-256-GCM'],
    embeddable: false,
  },
  {
    id: 'beyondex',
    number: '006',
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
    id: 'p26',
    number: '007',
    name: 'P26',
    domain: 'p26.vercel.app',
    url: 'https://p26.vercel.app',
    github: 'https://github.com/pouya-wp/p26',
    year: '2026',
    role: 'Creative Technologist & Spatial Architect',
    kind: 'Spatial WebGL & Physics Laboratory',
    tagline: '43 Voronoi fracture shards in real-time WebGL, driven by Kintsugi philosophy.',
    overview:
      'P26 is a creative technology and physics laboratory exploring the boundaries of real-time 3D in the browser—including precomputed rigid body fracture, custom GLSL illumination shaders, and an interactive spatial soundscape.',
    challenge:
      'Simulating and rendering thousands of fracture vertices simultaneously while maintaining 60 frames per second on mobile GPUs.',
    approach: [
      'Offline Voronoi simulation baked into a compact binary buffer for instantaneous client scrubbing with zero CPU overhead.',
      'Custom Gerstner wave mathematics, depth-of-field, and film-burn shaders.',
      'Adaptive hardware throttling: automatically cuts shader passes on low-power devices.',
    ],
    outcome:
      'The interactive spatial continuum you are experiencing right now, live at p26.vercel.app.',
    metric: 'Steady 60fps on modern mobile browsers · 100% custom GLSL pipeline · Zero external 3D libraries',
    services: ['Creative Coding', 'Shader Engineering', 'WebGL Optimization'],
    stack: ['Three.js', 'WebGL', 'GLSL', 'TypeScript', 'Next.js'],
    embeddable: true,
  },
  {
    id: 'sepehr',
    number: '008',
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
    number: '009',
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
    id: 'singclash',
    number: '010',
    name: 'SingClash',
    domain: 'singclash.vercel.app',
    url: 'https://singclash.vercel.app',
    github: 'https://github.com/pouya-wp/singclash',
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
];
