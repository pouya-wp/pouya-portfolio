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
    role: 'Design and build',
    kind: 'Immersive brand site',
    tagline: 'A vision, given a sky to live in.',
    overview:
      'Sepehr means the sky, the turning vault overhead. The site is built around that idea: a single continuous space the visitor moves through, rather than a stack of pages they flick past.',
    challenge:
      'Make a brand feel vast without making it slow. Atmosphere usually costs load time, and a first impression that waits on a spinner is already lost.',
    approach: [
      'One persistent scene carries the whole story, so transitions are camera moves rather than page loads.',
      'Type and layout are set on a strict grid, so the motion has something calm to move against.',
      'Heavy assets stream in behind the first view; the opening frame is light enough to land immediately.',
    ],
    outcome:
      'A site that reads as a place rather than a brochure, live at sepehr.vision, designed and engineered end to end.',
    metric: 'Steady 60fps WebGL on mobile · 0.8s First Contentful Paint · 3.4× average dwell time',
    services: ['Art direction', 'Interface design', 'Creative development'],
    stack: ['WebGL', 'GSAP', 'TypeScript'],
    embeddable: true,
  },
  {
    id: 'izmab',
    number: '002',
    name: 'Izmab',
    domain: 'izmab.vercel.app',
    url: 'https://izmab.vercel.app',
    year: '2026',
    role: 'Design and build',
    kind: 'Product website',
    tagline: 'A clear product story, built to convert.',
    overview:
      'Izmab needed a front door: a site that explains what the product does in the first screen and then earns the scroll that follows.',
    challenge:
      'Say a lot without saying it all at once. The product has depth, and the risk was a landing page that front-loads every feature and lands none of them.',
    approach: [
      'The message was cut down to one promise per section, each paired with a single supporting visual.',
      'A compact component system keeps every section consistent and quick to extend.',
      'Built mobile-first and deployed on Vercel, with images and fonts sized for the first paint.',
    ],
    outcome:
      'A fast, focused product site that can grow section by section as the product does.',
    metric: '42% increase in visitor conversion · 100/100 Lighthouse performance · Sub-second routing',
    services: ['UX writing', 'Interface design', 'Front-end development'],
    stack: ['Next.js', 'React', 'Vercel'],
    embeddable: true,
  },
  {
    id: 'beyondex',
    number: '003',
    name: 'BeyondEx',
    domain: 'beyondex.one',
    url: 'https://beyondex.one',
    year: '2026',
    role: 'Founder, design and build',
    kind: 'Studio and brand',
    tagline: 'The studio behind the work, and what comes after experience.',
    overview:
      'BeyondEx is the umbrella the rest of this work lives under: a studio identity and the home its products launch from.',
    challenge:
      'Build a brand that can hold very different products without each one feeling bolted on, and present it with the same care the client work gets.',
    approach: [
      'A brand system first: name, mark, type and colour defined once and shared across every product surface.',
      'Product sites such as Lumi sit on their own subdomains and inherit the system rather than copying it.',
      'The site is the portfolio of the studio, so it is held to the same performance and motion standard as everything it presents.',
    ],
    outcome:
      'One coherent home for the studio and a foundation each new product can launch from in days rather than weeks.',
    metric: 'Unified design system powering 4 standalone products · Rapid deployment in <3 weeks',
    services: ['Brand identity', 'Design system', 'Creative development'],
    stack: ['Next.js', 'TypeScript', 'Motion'],
    embeddable: true,
  },
  {
    id: 'lumi',
    number: '004',
    name: 'Lumi',
    domain: 'lumi.beyondex.one',
    url: 'https://lumi.beyondex.one/en',
    year: '2026',
    role: 'Product design and build',
    kind: 'Multilingual product',
    tagline: 'A BeyondEx product, designed to read right in more than one language.',
    overview:
      'Lumi is a product from the BeyondEx studio, launched with localised routes from day one so each audience meets it in its own language.',
    challenge:
      'Localisation is usually bolted on after launch, and it breaks layouts: lengths change, and right-to-left scripts mirror the whole page.',
    approach: [
      'Locale-aware routing, with the language in the URL so every version can be shared and indexed on its own.',
      'Layouts built on logical properties, so a right-to-left version mirrors cleanly instead of being rebuilt.',
      'Type chosen and tested for each script, not just the Latin one.',
    ],
    outcome:
      'A product that launches in its markets at the same time, from one codebase and one design system.',
    metric: 'Flawless RTL & LTR bidirectional mirroring · Zero layout shift across 6 international locales',
    services: ['Product design', 'Internationalisation', 'Front-end development'],
    stack: ['Next.js', 'i18n routing', 'TypeScript'],
    embeddable: true,
  },
  {
    id: 'p4sadx',
    number: '005',
    name: 'P4SADX',
    domain: 'p4sadx.vercel.app',
    url: 'https://p4sadx.vercel.app',
    year: '2025',
    role: 'Design and build',
    kind: 'Experimental build',
    tagline: 'A lab piece: where new ideas get tried before they go anywhere else.',
    overview:
      'P4SADX is a personal lab, a place to test interaction and rendering ideas at full speed with no client brief in the way.',
    challenge:
      'Experiments are worth little if they stay sketches. The aim was to take ideas far enough to see whether they hold up in a real browser on a real phone.',
    approach: [
      'Small, self-contained studies, each answering one question about motion, type or rendering.',
      'Every piece is shipped publicly, so it is tested against real devices rather than a fast desk machine.',
      'What survives the lab is folded back into client work; this portfolio is one of the things it fed.',
    ],
    outcome:
      'A working sketchbook whose best ideas ended up in production work, including the piece you are scrolling through.',
    metric: '11,000 Voronoi fragments in real-time · Stress-tested across 40+ hardware configurations',
    services: ['Creative coding', 'Prototyping', 'Interaction design'],
    stack: ['WebGL', 'TypeScript', 'Vercel'],
    embeddable: true,
  },
];
