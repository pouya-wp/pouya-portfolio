<div align="center">

# 💎 Pouya — Architecting Possibilities

### Seven-Act Scroll-Driven 3D WebGL Portfolio & Interactive Sculpture

[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20WebGL-black?style=flat-square&logo=webgl)](https://pouya-portfolio.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-15%20%2B%20React%2019-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/3D-Three.js%20r186-049EF4?style=flat-square&logo=threedotjs)](https://threejs.org/)
[![GSAP](https://img.shields.io/badge/Animation-GSAP%20%2B%20Lenis-88CE02?style=flat-square&logo=greensock)](https://greensock.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Pouya%20Sadeghpour-181717?style=flat-square&logo=github)](https://github.com/pouya-wp)

<p align="center">
  A high-end, luxury interactive WebGL showcase featuring a machined obsidian superellipse disc, Voronoi cell fracture physics, kintsugi golden repair animations, per-pixel motion blur, custom cutting cursor dynamics, and procedural audio synthesis.
</p>

</div>

---

## ✨ Highlights

- 🌑 **The Obsidian Disc** — Machined superellipse of revolution ($r(s) = R (1 - |s|^n)^{1/n}$) carved into 41 Voronoi shards with kintsugi glowing seams.
- 🎭 **The Seven Acts** — Seamless scroll-driven journey: *Hero → Fracture → Drop & Repair → The Sheet → Manifesto → Metamorphosis → Colophon*.
- 🗡️ **Incision Cursor** — Interactive drafting crosshair that parts canvas pixels along movement trails with dynamic cooling filaments.
- 🌪️ **Per-Pixel Motion Blur** — Camera-reprojected depth buffer velocity vector smearing with synchronized SVG DOM blur.
- 🎵 **Procedural Soundscape** — Real-time FM synthesis, convolution reverb, pink noise base, and reactive contact sounds (zero audio files needed).

---

## 🏗️ Technical Architecture

| Module | Responsibility | Technologies |
|:---|:---|:---|
| `app/sculpture.tsx` | WebGL canvas orchestration, material shaders, camera tracks | Three.js, GLSL, WebGL2 |
| `app/stone-geometry.ts` | Implicit superellipse math, 41-cell Voronoi fracture, seam meshes | Procedural Geometry, SIMD |
| `app/physics.ts` | Baked rigid-body collision solver and reversible playback engine | Physics Engine, JSON stream |
| `app/postfx.ts` | Depth-based motion blur, film grain shaders, cursor bloom | Custom Post-Processing Shaders |
| `app/soundscape.ts` | Web Audio API procedural sound generation and FM bell triggers | Web Audio API, Convolver |

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/pouya-wp/pouya-portfolio.git
cd pouya-portfolio

# Install dependencies
pnpm install

# Build preview and start local server
node scripts/build-preview.mjs
node scripts/preview-server.mjs
```

Open `http://127.0.0.1:5173` to explore the experience.

---

## 📄 License

Distributed under the MIT License.

---

<div align="center">
  <sub>Crafted with precision & passion by <b><a href="https://github.com/pouya-wp">Pouya Sadeghpour</a></b></sub>
</div>
