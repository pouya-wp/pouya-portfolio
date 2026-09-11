# oryzo.ai — full teardown (inspected 2026-09-09)

Inspected live at 1440x900 in a real browser: DOM, computed styles, the complete
stylesheet (`/_astro/index.TL6TuoJb.css`, 69 KB) and the client bundle
(`/_astro/hoisted.CRsATKbF.js`, 1.09 MB). Built by Lusion.
Astro + an in-house WebGL2 engine (`__THREE__` is present) + Rive.

## 1. Page architecture

```
<body>
  <canvas>                    position:fixed, inset 0, 100vw x 100vh  <- the whole scene
  <svg style="display:none">  <symbol> sprite (logo, hand icon) referenced by <use>
  <div id="ui">               fixed chrome: header, footer, scroll indicator, preloader
  <div id="video-overlay">    fullscreen video modal, cursor:none
</body>
```

Content lives in `#ui > #site-content > #pages-container > #home.page`, which is
**307 KB of HTML**. Everything is rendered up front; nothing is lazily mounted.

### The section / pin pattern (the single most important structural idea)

```
.section        { position:relative; width:100% }        height = N x 100vh
.section__inner { position:relative }                    -> JS switches it to
                  position:fixed; top:0; height:100vh    while the section is on screen
```

Each `.section` is a tall scroll runway. Its `__inner` is pinned to the viewport by
JS (not `sticky`) for the duration, and the section exposes a custom property
`--active-ratio` (0 -> 1) that CSS reads for micro details. Example: the hero dot is
`transform: scale(var(--active-ratio))`.

Measured runway lengths (900 px viewport, 56691 px of total scroll):

| section | height (px) | x viewport |
| --- | --- | --- |
| `#hero` | 900 | 1 |
| `#ai` | 7200 | 8 |
| `#wearable` | 11925 | 13.25 |
| `#features` | 9450 | 10.5 |
| `#encryption` | 3600 | 4 |
| `#grip` | 3600 | 4 |
| `#sustainability` | 5091 | 5.7 |
| `#testimonies` | 2292 | 2.5 |
| `#social-content` | 7625 | 8.5 |
| `#product` | 2918 | 3.2 |
| `#open-weight` | 1109 | 1.2 |
| `#footer` | 981 | 1.1 |

## 2. Design tokens (read straight off `:root`)

```
--color-white          #ffedd7   warm cream, used for all body text
--color-black          #100904   near black with a brown bias, the ground
--color-brown          #382416
--color-grey-brown     #6c5f51
--color-green          #445231   the cutting-mat green
--color-green-light    #5d6c49
--color-green-lightest #f6e0c6
--color-orange         #dc5000   the single accent: blueprints, links, glows
--display-font "halyard-display-variable"   (Typekit geometric grotesk)
--text-font    "halyard-text-variable"
               Literata (serif, magazine covers) + DM Mono, both self hosted woff2
```

### Fluid type: one scalar drives the entire scale

```
--screen-unit: min( (100vw - 3.125vw*2) / (1920 - 120),
                    (var(--vh)*100) / 1024 * 1.25 );
--h1: calc(164 * var(--screen-unit));   --body1: calc(38 * ...)
--h2: calc( 68 * ...)                   --body2: calc(24 * ...)
--h3: calc( 45 * ...)                   --body3: calc(18 * ...)
--h4: calc( 32 * ...)                   --sub1:  calc(24 * ...)
--h5: calc( 20 * ...)                   --sub2:  calc(16 * ...)
--quote: calc(30 * ...)  --btn: calc(16 * ...)  --link-header: calc(16 * ...)
```

At 1440x900 the unit resolves to 0.75, so `h1` renders at 123 px. Viewport height is
clamped into the same `min()`, so the layout never overflows a short screen. There is
no media-query type scale anywhere in the stylesheet.

### 16 column grid, gap expressed as a ratio of the column

```
--grid-columns: 16;  --grid-gap-scale: calc(24/90);
--grid-gap-width:    calc(inner-width / ((16/gap-scale) + 16 - 1));   -> inner / 75
--grid-column-width: calc(gap-width / gap-scale);                     -> gap x 3.75
--grid-span-width:   calc(gap-width + column-width);
--grid-span-N:       calc(span-width * (N-1) + column-width);
--site-padding-x: 3.125vw;  --site-row-height: calc(3.125vw * 8/60);
--site-padding-y: calc(row-height * 4);
```

Elements are absolutely positioned with span arithmetic rather than dropped into a
grid container, for example
`left: calc(var(--site-padding-x) + var(--grid-span-width)*10 + var(--grid-column-width)*.4)`.

## 3. Component vocabulary

**Dashed rule**, used everywhere as a hairline divider:

```css
.o-dashline { height:1px;
  background:repeating-linear-gradient(90deg,var(--dashline-color) 0 2px,transparent 0 4px) }
```

**Pill button**: uppercase, `border-radius:3em`, `padding:1.2em 2em`. The colours live
in local custom properties and are simply swapped on hover.

```css
.btn { --btn-color:var(--color-white); --btn-active-color:var(--color-black); }
.btn:hover:not(.is-active), .btn.is-active:not(:hover) {
  transition:background-color .18s ease-in-out,color .18s;
  background-color:var(--btn-active-color); color:var(--btn-active-text-color) }
.btn.is-dark  { --glow-color:rgba(220,80,0,0); border:2px solid var(--glow-color) }
.btn.is-dark:hover { --glow-color:rgba(220,80,0,1) }   /* plus an inset box-shadow glow */
```

**Letter flipper**: every glyph of a link is wrapped twice and duplicated.

```html
<a class="is-flipper-target">
  <div style="overflow:clip"><div>I<div style="position:absolute;top:100%">I</div></div></div>
  <!-- one wrapper per character -->
</a>
```

On hover the inner stack translates by `-100%` with a per-letter delay. This is why the
page's extracted text reads `I I N N T T R R O O`.

**Nav focus dimming**: hovering the nav dims every item and darkens the whole page.

```css
#site-header-nav:hover li { opacity:.5 }
#site-header-nav:hover li.is-active,
#site-header-nav:hover li:hover { opacity:1 }
#site-header-nav:hover ~ #site-header-blocker { opacity:1 }   /* fullscreen #201914bf */
```

**Word reveal**: text is split into words at runtime, each wrapped in an
`overflow:clip` box whose inner element animates from
`transform:translate3d(0,1em,0); opacity:0`, staggered.

**Right edge scroll indicator**: a cream 60x200 px bar fixed to the right edge with its
label rotated 90 degrees plus a travelling dot. It reads `ORYZO-1 MODEL`.

**Everything else**: dotted crosshair frames around hero objects, tiny uppercase
annotations in the corners (`* ADOBE ILLUSTRATOR`), spec read-outs
(`FRICTION COEFFICIENT (0.87)`), formula plates (`dh = t`), a `WARNING` strip laid over
video, and `SCROLL TO CONTINUE` with an animated chevron at bottom centre.

The only cubic-bezier in the entire stylesheet is `cubic-bezier(.3,0,.66,-.3)`, an
anticipation ease that pulls back before it moves. Everything else is driven from JS.

## 4. WebGL and render stack

A single fixed WebGL2 canvas draws every scene; the DOM only ever contributes type and
chrome on top of it. Keyword census of the bundle:

| feature | hits | feature | hits |
| --- | --- | --- | --- |
| FXAA | 211 | LUT colour grading | 296 |
| TAA | 123 | noise | 193 |
| bloom | 88 | velocity | 105 |
| Gaussian splats (`SplatsWorker`) | 63 | vignette | 39 |
| Rive (logo, preloader, stickers) | 202 | dither | 28 |

Assets are `.webp` throughout with explicit `_MOBILE` variants, spherical-harmonic
textures for the smoke (`harmonics_0/1`), and `.riv` for vector animation.

**There is no custom cursor.** `cursor` computes to `auto` on `html`, `body` and `#ui`.
That is the one place this redesign deliberately goes further.

## 5. What the redesign takes, and what it changes

Taken (structure and craft, not appearance):

- the tall-section / pinned-inner / `--active-ratio` scroll architecture
- one scalar fluid type system and the 16 column ratio grid
- the component vocabulary: dashed rules, colour-swap pills, letter flippers, masked
  word reveals, corner annotations, rotated edge indicator
- nav dimming with a page blocker, `SCROLL TO CONTINUE`, spec read-out plates
- one fixed WebGL canvas carrying every scene with the DOM as a pure overlay

Changed so that it is not a copy:

- the palette moves from cork and orange to bone / obsidian / kintsugi gold, keeping the
  cutting-mat green only as the working-surface motif
- type moves from Halyard to Space Grotesk (structure) and Italiana (poetry)
- the narrative is the supplied seven-act screenplay, not a product page
- **added: real per-pixel motion blur** over the whole 3D frame (depth reprojection plus
  scroll velocity), with an SVG-filter equivalent over the DOM layer
- **added: a WebGL cursor** with a refracting lens, spring trail and state morphs
