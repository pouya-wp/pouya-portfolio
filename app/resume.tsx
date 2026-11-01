'use client';

import React, { useRef, useEffect } from 'react';

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ResumeModal({ isOpen, onClose }: ResumeModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <dialog
      ref={dialogRef}
      className="cv-dialog"
      aria-label="Curriculum Vitae — Pouya Sadeghpour"
      data-native-scroll="true"
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="cv-container">
        {/* Top Control Rail */}
        <div className="cv-bar no-print">
          <div className="cv-bar-meta">
            <span className="cv-tag">CURRICULUM VITAE</span>
            <span className="cv-version">EDITION 2026 // EXECUTIVE SUMMARY</span>
          </div>
          <div className="cv-bar-actions">
            <button
              className="pill is-gold"
              onClick={handlePrint}
              data-cursor="PRINT"
              aria-label="Print or Save Resume as PDF"
            >
              <span className="pill-dot" />Print / Save PDF
            </button>
            <button
              className="pill is-dashed"
              onClick={onClose}
              data-cursor="CLOSE"
              aria-label="Close CV Modal"
            >
              Close &times;
            </button>
          </div>
        </div>

        {/* Printable Resume Document */}
        <div className="cv-document" id="cv-printable">
          {/* Header */}
          <header className="cv-header">
            <div className="cv-header-primary">
              <h1 className="cv-name">POUYA SADEGHPOUR</h1>
              <p className="cv-role">Senior Creative Technologist &amp; Lead Front-End Architect</p>
            </div>
            <div className="cv-header-contact">
              <div><span>Email:</span> <a href="mailto:pouyas.one@outlook.com">pouyas.one@outlook.com</a></div>
              <div><span>LinkedIn:</span> <a href="https://linkedin.com/in/onepouya" target="_blank" rel="noopener noreferrer">linkedin.com/in/onepouya</a></div>
              <div><span>GitHub:</span> <a href="https://github.com/pouya-wp" target="_blank" rel="noopener noreferrer">github.com/pouya-wp</a></div>
              <div><span>Telegram:</span> <a href="https://t.me/pouya_dmg" target="_blank" rel="noopener noreferrer">@pouya_dmg</a></div>
              <div><span>Location:</span> Global / Remote (UTC+3:30, Flexible Worldwide)</div>
            </div>
          </header>

          <hr className="cv-rule" />

          {/* Executive Summary */}
          <section className="cv-section">
            <h2 className="cv-sec-title">EXECUTIVE SUMMARY</h2>
            <p className="cv-summary-text">
              Architectural creative technologist and senior front-end engineer specializing in high-performance spatial WebGL, bespoke GLSL shaders, React 19, and Next.js digital flagships. Synthesizes sculptural aesthetic direction with mathematically rigorous 60fps interaction engineering to design products that captivate users, drive measurable conversion, and achieve industry-acclaimed performance standards.
            </p>
          </section>

          {/* Core Competencies (ATS-Friendly) */}
          <section className="cv-section">
            <h2 className="cv-sec-title">CORE TECHNICAL COMPETENCIES</h2>
            <div className="cv-skills-grid">
              <div className="cv-skill-col">
                <h3>3D &amp; Spatial Graphics</h3>
                <ul>
                  <li>Three.js &amp; WebGL 2.0 Engineering</li>
                  <li>Bespoke Procedural GLSL Shaders</li>
                  <li>Voronoi Shell Physics &amp; Rigidbody Solvers</li>
                  <li>Horizon Ambient Occlusion &amp; Depth-of-Field</li>
                  <li>Tone-mapping &amp; Custom Post-processing</li>
                  <li>3D Asset &amp; Texture Compression (GLB/KTX2)</li>
                </ul>
              </div>
              <div className="cv-skill-col">
                <h3>Front-End Architecture</h3>
                <ul>
                  <li>React 19 &amp; Next.js 15 (App Router, RSC)</li>
                  <li>TypeScript (Strict Type Safety)</li>
                  <li>GSAP Timeline &amp; Morphing Choreography</li>
                  <li>Zero-GC Scroll &amp; Interaction Engines</li>
                  <li>CSS Architecture &amp; Fluid Typography</li>
                  <li>Web Audio API &amp; Interactive Soundscapes</li>
                </ul>
              </div>
              <div className="cv-skill-col">
                <h3>Product &amp; Engineering</h3>
                <ul>
                  <li>Design Systems &amp; Component Infrastructure</li>
                  <li>Internationalization (Flawless RTL &amp; LTR)</li>
                  <li>Mobile-First WebGL Optimization</li>
                  <li>Core Web Vitals &amp; Performance Profiling</li>
                  <li>Technical Leadership &amp; Creative Direction</li>
                  <li>Full Lifecycle: First Sketch to Production</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Featured Case Studies & Measurable Commercial Impact */}
          <section className="cv-section">
            <h2 className="cv-sec-title">FEATURED PRODUCTION SHIPMENTS &amp; MEASURABLE IMPACT</h2>
            <div className="cv-projects-list">
              <div className="cv-project-item">
                <div className="cv-proj-header">
                  <strong>GERMANIO (github.com/pouya-wp/Germanio)</strong>
                  <span className="cv-proj-meta">Cognitive Architecture &middot; Local-First Systems Engineer</span>
                </div>
                <p>Architected local-first linguistic learning OS indexing 22k lemmas and 118k sentence corpus with FSRS and Bayesian Knowledge Tracing.</p>
                <div className="cv-proj-impact">
                  <em>Impact:</em> Sub-10ms local SQLite query latency &middot; Adaptive i18n dynamic UI progression &middot; Offline-first zero data-leak architecture.
                </div>
              </div>

              <div className="cv-project-item">
                <div className="cv-proj-header">
                  <strong>NEBULA PLUS (github.com/pouya-wp/Nebula-Plus)</strong>
                  <span className="cv-proj-meta">Native Systems Programming &middot; Zen Browser Mod Lead</span>
                </div>
                <p>Engineered high-performance workstation bridging Firefox XPCOM with dedicated C# (.NET) native Windows companion bridge.</p>
                <div className="cv-proj-impact">
                  <em>Impact:</em> Real-time WASAPI audio loopback spectrum analysis &middot; Locked 60 FPS compositor fluidity &middot; Sub-1% idle CPU footprint.
                </div>
              </div>

              <div className="cv-project-item">
                <div className="cv-proj-header">
                  <strong>LUMI (lumi.beyondex.one &amp; github.com/pouya-wp/Lumi)</strong>
                  <span className="cv-proj-meta">Multi-Platform Workspace &middot; Product Architect</span>
                </div>
                <p>Engineered collaborative workspace with NestJS, Prisma, PostgreSQL with pgvector, Next.js, and offline-first Flutter mobile apps (iOS &amp; Android).</p>
                <div className="cv-proj-impact">
                  <em>Impact:</em> Sub-16ms UI response time &middot; Zero layout shift across 6 international locales &middot; Real-time collaborative documents &amp; OKR engine.
                </div>
              </div>

              <div className="cv-project-item">
                <div className="cv-proj-header">
                  <strong>DIRECTINO (github.com/pouya-wp/directino)</strong>
                  <span className="cv-proj-meta">Distributed Systems &middot; Go Architecture &amp; AI</span>
                </div>
                <p>Developed high-throughput Go (1.22+) messaging daemon with whatsmeow multi-device WhatsApp protocol and Claude AI human-pacing engine.</p>
                <div className="cv-proj-impact">
                  <em>Impact:</em> Sub-5ms socket dispatch latency &middot; AES-256-GCM zero-knowledge session vault &middot; Account ban protection via typing jitter.
                </div>
              </div>

              <div className="cv-project-item">
                <div className="cv-proj-header">
                  <strong>P26 (p26.vercel.app)</strong>
                  <span className="cv-proj-meta">Creative Technologist &middot; Spatial WebGL Architect</span>
                </div>
                <p>Engineered real-time WebGL spatial continuum simulating 43 Voronoi rigid-body fracture shards governed by Kintsugi philosophy.</p>
                <div className="cv-proj-impact">
                  <em>Impact:</em> Precomputed binary buffer streaming (.bin) with zero CPU runtime overhead &middot; Steady 60fps on mobile GPUs.
                </div>
              </div>
            </div>
          </section>

          {/* Professional Experience */}
          <section className="cv-section">
            <h2 className="cv-sec-title">PROFESSIONAL EXPERIENCE</h2>
            <div className="cv-exp-list">
              <div className="cv-exp-item">
                <div className="cv-exp-head">
                  <strong>Founder &amp; Principal Creative Technologist</strong> &mdash; BeyondEx Studio
                  <span className="cv-exp-date">2024 &mdash; Present</span>
                </div>
                <p>Directing technical architecture, 3D WebGL engineering, and creative vision for select high-growth brands and interactive digital products worldwide.</p>
              </div>

              <div className="cv-exp-item">
                <div className="cv-exp-head">
                  <strong>Senior Front-End &amp; Spatial WebGL Engineer</strong> &mdash; Independent Practice
                  <span className="cv-exp-date">2022 &mdash; 2024</span>
                </div>
                <p>Delivered bespoke WebGL experiences, interactive design systems, and conversion-optimized web applications for international clients across Europe, Middle East, and North America.</p>
              </div>

              <div className="cv-exp-item">
                <div className="cv-exp-head">
                  <strong>Interactive UI/UX &amp; Creative Developer</strong> &mdash; Digital Agencies
                  <span className="cv-exp-date">2020 &mdash; 2022</span>
                </div>
                <p>Collaborated with multidisciplinary engineering and design teams to build high-traffic web interfaces, design tokens, and fluid animation pipelines.</p>
              </div>
            </div>
          </section>

          {/* Education & Studies */}
          <section className="cv-section">
            <h2 className="cv-sec-title">EDUCATION &amp; RECOGNITION</h2>
            <div className="cv-exp-item">
              <div className="cv-exp-head">
                <strong>Architectural Systems &amp; Computational Design</strong>
                <span className="cv-exp-date">Bachelor of Architecture (B.Arch)</span>
              </div>
              <p>Specialization in algorithmic spatial geometry, Voronoi tessellations, light physics, and tectonic structural systems.</p>
            </div>
          </section>
        </div>
      </div>
    </dialog>
  );
}
