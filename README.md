# Pouya — Architecting Possibilities

A seven-act, scroll-driven WebGL portfolio. The structure is modelled on the
oryzo.ai teardown in [`docs/oryzo-analysis.md`](docs/oryzo-analysis.md): one fixed
WebGL canvas carries every scene, the DOM is a pure overlay, and each act is a tall
section with a pinned inner driven by `--active-ratio`. The palette and component
vocabulary are Oryzo's; the object, the narrative and the effects are this project's.

## Build and preview

```bash
pnpm install
node scripts/build-preview.mjs   # production bundle into dist/
node scripts/preview-server.mjs  # serves work/preview on http://127.0.0.1:5173
node scripts/build-dev.mjs       # unminified bundle into work/preview, for stack traces
node scripts/bake-physics.mjs    # re-run the offline solver after changing the geometry
```

Three.js, the fonts and the baked physics are bundled locally. Only the two external
project websites need the network.

## The object

A machined obsidian disc: one superellipse of revolution,
`r(s) = R (1 − |s|ⁿ)^(1/n)` with `R = 1.72`, `n = 4.2`. That single implicit function
gives the smooth intact mesh, the exact surface normal for every shard so the shards
keep the polish of the original, the convex body the fracture is carved out of, and
the test that decides which cut edges surface as kintsugi seams.

The fracture is 41 Voronoi cells. Cut faces are raw rock that turns to metal only
along the edge where the break meets the outside (`aRim`), so the seams read as
inlaid metal rather than a wireframe. Seam ribbons bend their normal across their
width, which is what puts a highlight down the length of every repair.

## The acts

1. **Hero** — the intact disc, raked and turning, seams cold.
2. **Fracture** — 41 shards on individual inertia, frozen in zero gravity.
3. **Drop and repair** — baked rigid-body playback onto the cutting mat, reverse
   assembly, seams ignite.
4. **The sheet** — the one passage in daylight: a drafting sheet on the bench, the
   projects dealt onto it as cards. Hover lifts a card; a click flies the camera down
   onto its face and hands over to a live iframe.
5. **Manifesto** — 11 000 sampled points morph through three passages; each point
   crosses on its own clock and bows outward on the way.
6. **Metamorphosis** — camera orbit, a drop of metal, macro, particle signature.
7. **Colophon**.

## What runs on top

- **Motion blur, per pixel.** `ScenePass` rebuilds world position from depth,
  reprojects with the previous frame's view-projection matrix and smears each pixel
  along its own velocity. A second uniform velocity comes from the scroller, and the
  DOM layer gets the matching treatment through an SVG `feGaussianBlur` whose
  deviation is written every frame.
- **A cursor that cuts.** At rest it is a drafting crosshair. Moving, it opens the
  frame along the path it travelled: pixels push apart either side, a filament burns
  down the middle, and the incision cools and closes behind it. Over a target the
  compass scribes a ring.
- **Smooth scrolling** without hijacking the document — the native scrollbar,
  sticky pinning and anchors all still work.
- **A generated score.** Pink-noise floor, a drifting low chord, a shimmer that lives
  in a generated convolution reverb, and one-shots built from noise bursts, pitch
  envelopes and an FM bell. No audio files.
- Film grain in the shader, and a second grain over the DOM.

## Content limits

- The sculpture is procedural. Drop a `.glb` in and load it in `app/sculpture.tsx` if
  you would rather use a modelled one.
- Contact details are empty on purpose. Fill in `CONTACT` at the top of
  `app/page.tsx` and the capsules appear; nothing is invented.
- `https://sepehr.vision` loads live in the portal. `https://p4sadx.vercell.app`
  returned no page, so its card shows an honest unavailable state with a direct link.
- Full cross-browser and mobile QA has not been done.

## Important files

- `app/story.ts` — act spans; the DOM section heights and the WebGL timeline share them.
- `app/stone-geometry.ts` — the disc, the fracture, the seam ribbons.
- `app/physics.ts` / `public/physics-baked.json` / `app/physics-playback.ts` — the
  offline solve and its reversible playback.
- `app/sculpture.tsx` — environment, materials, every act, the card interaction.
- `app/scene-elements.ts` — desk, mat, drafting sheet, cards, tools, particles.
- `app/postfx.ts` — motion blur, grade, cursor.
- `app/pointer.ts`, `app/smooth-scroll.ts`, `app/soundscape.ts`.
- `app/globals.css` — tokens, the 16 column grid, every act's layout.
