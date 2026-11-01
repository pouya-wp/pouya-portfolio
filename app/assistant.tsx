'use client';

import React, { useState, useRef, useEffect } from 'react';
import { analytics } from './analytics';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
}

const CURATED_TOPICS = [
  { id: 'phil', label: '01 / PHILOSOPHY', query: 'What is the philosophy of Kintsugi and limitations in this work?' },
  { id: 'work', label: '02 / ARCHITECTURE', query: 'What are the selected works and technical drawings?' },
  { id: 'stack', label: '03 / SHADER STACK', query: 'Explain the 3D graphics and WebGL shader engineering.' },
  { id: 'hire', label: '04 / COMMISSION', query: 'How can I collaborate or hire Pouya Sadeghpour?' },
  { id: 'cv', label: '05 / EXECUTIVE CV', query: 'Summarize Pouya’s technical stack and experience for recruiters and HR.' },
];

const KNOWLEDGE_RESPONSES = [
  {
    triggers: ['who', 'pouya', 'about', 'bio', 'کیست', 'کیه', 'پویا', 'درباره', 'معرفی'],
    reply: `Pouya Sadeghpour is an architectural creative technologist, senior front-end architect, and spatial WebGL engineer.\n\nHis work synthesizes classical sculptural form, algorithmic physics, and bespoke GLSL shaders into high-precision digital artifacts that drive measurable conversion and refuse the disposable conventions of modern web design.`,
  },
  {
    triggers: ['philosophy', 'limitations', 'quote', 'motto', 'فلسفه', 'شعار', 'دیدگاه', 'کینتسوگی', 'kintsugi', 'suhrawardi'],
    reply: `“Born in limitations, bred in isolation. We don’t just survive the restrictions; we architect them into golden opportunities.”\n\nThe work is rooted in Suhrawardi’s Philosophy of Illumination (حکمت اشراق) and the Japanese craft of Kintsugi (金継ぎ). When gravity fractures the bust into 43 Voronoi shards, the damage is not masked—molten gold is poured into the seams, transforming structural catastrophe into luminous aesthetic truth.`,
  },
  {
    triggers: ['project', 'work', 'portfolio', 'drawing', 'پروژه', 'نمونه کار', 'کارها'],
    reply: `The portfolio archives five core technical shipments with measurable business impact:\n\n• SEPEHR (sepehr.vision): Steady 60fps WebGL on mobile · 0.8s First Contentful Paint · 3.4× dwell time.\n• IZMAB (izmab.vercel.app): 42% lift in conversion · 100/100 Lighthouse performance benchmark.\n• BEYONDEX (beyondex.one): Design system infrastructure powering 4 live products.\n• LUMI (lumi.beyondex.one): Zero layout shift across 6 localized RTL & LTR markets.\n• P4SADX (p4sadx.vercel.app): 11,000 Voronoi fragments in real-time · Stress-tested on 40+ hardware profiles.\n\nExplore Act IV (The Working Surface) to inspect the gilded case study cards.`,
  },
  {
    triggers: ['resume', 'cv', 'experience', 'background', 'رزومه', 'سابقه', 'تجربه', 'استخدام', 'recruiter', 'hr'],
    reply: `Pouya Sadeghpour — Senior Creative Technologist & Lead Front-End Architect:\n\n• Core Stack: Three.js, WebGL 2.0, GLSL Shaders, React 19, Next.js 15, TypeScript, GSAP.\n• Background: 6+ years designing and engineering high-impact digital products, spatial 3D flagships, and scalable design systems.\n• Leadership: Founder of BeyondEx Studio; led design & engineering for international clients across Europe, Middle East, and North America.\n• Availability: Open for selective commissions, fractional CTO/tech lead roles, and high-impact remote engagements worldwide.\n\nYou can click 'RESUME' in the top navigation bar to inspect or print the complete executive PDF.`,
  },
  {
    triggers: ['linkedin', 'github', 'social', 'لینکدین', 'گیت‌هاب', 'لینک'],
    reply: `Verified professional profiles & repositories:\n\n• LinkedIn: https://linkedin.com/in/onepouya (@onepouya)\n• GitHub: https://github.com/pouya-wp (@pouya-wp)\n• Telegram: https://t.me/pouya_dmg (@pouya_dmg)\n• Instagram: https://www.instagram.com/pouya.sadeghpour/\n• Direct Email: pouyas.one@outlook.com`,
  },
  {
    triggers: ['contact', 'email', 'hire', 'telegram', 'تماس', 'ایمیل', 'ارتباط', 'همکاری', 'commission', 'قیمت', 'سفارش'],
    reply: `Direct channels for creative direction, spatial WebGL development, and high-ticket commissions:\n\n• Primary Email: pouyas.one@outlook.com\n• LinkedIn: https://linkedin.com/in/onepouya\n• GitHub: https://github.com/pouya-wp\n• Telegram: @pouya_dmg (https://t.me/pouya_dmg)\n\n💡 Tip: If you have a specific brief or idea, feel free to drop your inquiry and contact info right here in this chat, and Pouya will receive it immediately.`,
  },
  {
    triggers: ['tech', 'stack', 'shader', 'webgl', 'three', 'تکنولوژی', 'فناوری', 'استک', 'code', 'gpu'],
    reply: `Engineered from raw principles with zero monolithic engine overhead:\n\n• Three.js + WebGL 2.0 with custom procedural GLSL passes\n• Offline Voronoi shell fracture solver with baked rigid-body momentum\n• Horizon Ambient Occlusion (AO) + Screen-space Depth-of-Field\n• Sub-pixel motion blur with velocity reprojection\n• Next.js 15, React 19, and TypeScript with zero runtime GC allocation during scroll.`,
  },
];

function generateResponse(input: string): string {
  const clean = input.toLowerCase().trim();

  for (const item of KNOWLEDGE_RESPONSES) {
    if (item.triggers.some(t => clean.includes(t))) {
      return item.reply;
    }
  }

  const isPersian = /[\u0600-\u06FF]/.test(clean);
  if (isPersian) {
    return `من اوراکل هوشمند و راهنمای ساختار معماری پورتفولیوی پویا صادق‌پور هستم.\nمی‌توانید درباره فلسفه اشراق و کینتسوگی، شیدرهای سه‌بعدی WebGL، بررسی ۵ پروژه شاخص، یا نحوه همکاری مستقیم (pouyas.one@outlook.com) از من سؤال بپرسید.`;
  }
  return `I am the architectural Oracle of Pouya Sadeghpour’s portfolio.\n\nYou may query me on the Kintsugi philosophy, real-time GLSL shader engineering, case studies in Act IV, or establishing direct contact for commissions.`;
}


function LiquidOrb({ isHovered }: { isHovered: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;
    const size = 38;
    const radius = size / 2;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const render = () => {
      time += isHovered ? 0.045 : 0.02;
      const lx = -0.45;
      const ly = -0.55;
      const lz = 0.70;
      const hx = lx;
      const hy = ly;
      const hz = lz + 1;
      const hlen = Math.hypot(hx, hy, hz);
      const nhx = hx / hlen;
      const nhy = hy / hlen;
      const nhz = hz / hlen;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const nx = (x - radius + 0.5) / radius;
          const ny = (y - radius + 0.5) / radius;
          const r2 = nx * nx + ny * ny;

          if (r2 <= 0.96) {
            let nz = Math.sqrt(Math.max(0, 1 - r2));

            // Fluid harmonic surface displacement (ripples like molten obsidian & gold)
            const wave =
              Math.sin(nx * 4.2 + time * 1.8) * Math.cos(ny * 4.2 - time * 1.4) * 0.12 +
              Math.sin((nx + ny) * 5.5 + time * 2.2) * 0.08;

            let snx = nx + wave * 0.35;
            let sny = ny + wave * 0.35;
            const slen = Math.hypot(snx, sny, nz);
            snx /= slen;
            sny /= slen;
            nz /= slen;

            // Diffuse & Specular lighting
            const diff = Math.max(0, snx * lx + sny * ly + nz * lz);
            const sdot = Math.max(0, snx * nhx + sny * nhy + nz * nhz);
            const spec = Math.pow(sdot, 28);
            const rim = Math.pow(1 - nz, 2.8);

            // Gilded molten dark obsidian palette with pure liquid gold & silver highlights
            const baseDark = 18;
            const r = Math.min(255, baseDark + diff * 45 + rim * 180 + spec * 255);
            const g = Math.min(255, baseDark + diff * 32 + rim * 140 + spec * 245);
            const b = Math.min(255, baseDark + diff * 20 + rim * 60 + spec * 220);

            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          } else {
            data[idx + 3] = 0;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isHovered]);

  return (
    <div className="oracle-orb-housing">
      <canvas ref={canvasRef} width={38} height={38} className="oracle-orb-canvas" />
      <div className="oracle-orb-specular-ring" />
    </div>
  );
}

export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      sender: 'assistant',
      text: `Greetings. I am the Kintsugi Oracle—an intelligence embedded within the architecture of this space.\n\nQuery any dimension of Pouya Sadeghpour’s work, philosophy, or engineering.`,
      time: '00:00',
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: q,
      time: timeStr,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Track question in real-time Telegram analytics
    analytics.trackAiQuery(q);

    // Natural architectural latency
    setTimeout(() => {
      const reply = generateResponse(q);
      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: reply,
        time: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 550);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Precision Obsidian & Gilded Capsule with 3D Molten Liquid Orb */}
      <button
        id="ai-assistant-toggle"
        className={`oracle-pill-btn ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Toggle Kintsugi Oracle"
        data-cursor="ORACLE"
      >
        <div className="oracle-pill-text-wrap">
          <span className="oracle-pill-label">TALK TO ORACLE</span>
          <span className="oracle-pill-sub">
            <span className="oracle-pill-pulsar" />
            AI ARCHITECT
          </span>
        </div>
        <LiquidOrb isHovered={isHovered} />
      </button>

      {/* Luxury Architectural Monolith Modal */}
      {isOpen && (
        <aside
          className="oracle-monolith"
          aria-label="Kintsugi Oracle Terminal"
          data-native-scroll="true"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Top Architectural Rail */}
          <div className="oracle-rail">
            <div className="oracle-meta">
              <span className="oracle-spec-tag">SYSTEM // 09</span>
              <div className="oracle-header-titles">
                <h3 className="oracle-brand">THE KINTSUGI ORACLE</h3>
                <span className="oracle-coords">
                  <span className="oracle-live-pip" />
                  LAT 35.6892° N &middot; GLSL ILLUMINATION
                </span>
              </div>
            </div>
            <button
              className="oracle-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close Oracle"
              data-cursor="CLOSE"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          {/* Curated Architectural Folios */}
          <div className="oracle-folios" role="toolbar" aria-label="Curated Prompts">
            {CURATED_TOPICS.map(topic => (
              <button
                key={topic.id}
                className="oracle-folio-btn"
                onClick={() => handleSend(topic.query)}
                data-cursor="QUERY"
              >
                {topic.label}
              </button>
            ))}
          </div>

          {/* Ledger / Transcript Stream */}
          <div
            className="oracle-ledger"
            data-native-scroll="true"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {messages.map(m => (
              <div key={m.id} className={`oracle-entry ${m.sender}`}>
                <div className="oracle-entry-header">
                  <span className="oracle-entry-author">
                    {m.sender === 'assistant' ? '✦ THE ORACLE' : '▸ VISITOR'}
                  </span>
                  <span className="oracle-entry-time">{m.time}</span>
                </div>
                <div className="oracle-entry-content">
                  <p className="oracle-entry-text">{m.text}</p>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="oracle-entry assistant is-computing">
                <div className="oracle-entry-header">
                  <span className="oracle-entry-author">✦ THE ORACLE</span>
                  <span className="oracle-entry-time">SYNTHESIZING...</span>
                </div>
                <div className="oracle-computing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Terminal Input Chamber */}
          <div className="oracle-terminal-input">
            <span className="oracle-prompt-symbol">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              className="oracle-text-field"
              placeholder="Query the architecture, philosophy, or commissions..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="oracle-transmit-btn"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              data-cursor="SEND"
              aria-label="Transmit Query"
            >
              TRANSMIT
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
