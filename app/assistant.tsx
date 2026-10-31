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
];

const KNOWLEDGE_RESPONSES = [
  {
    triggers: ['who', 'pouya', 'about', 'bio', 'کیست', 'کیه', 'پویا', 'درباره', 'معرفی'],
    reply: `Pouya Sadeghpour is an architectural creative technologist, senior design architect, and WebGL engineer.\n\nHis work synthesizes classical sculptural form, algorithmic physics, and bespoke GLSL shaders into high-precision digital artifacts that refuse the disposable conventions of modern web design.`,
  },
  {
    triggers: ['philosophy', 'limitations', 'quote', 'motto', 'فلسفه', 'شعار', 'دیدگاه', 'کینتسوگی', 'kintsugi', 'suhrawardi'],
    reply: `“Born in limitations, bred in isolation. We don’t just survive the restrictions; we architect them into golden opportunities.”\n\nThe work is rooted in Suhrawardi’s Philosophy of Illumination (حکمت اشراق) and the Japanese craft of Kintsugi (金継ぎ). When gravity fractures the bust into 43 Voronoi shards, the damage is not masked—molten gold is poured into the seams, transforming structural catastrophe into luminous aesthetic truth.`,
  },
  {
    triggers: ['project', 'work', 'portfolio', 'drawing', 'پروژه', 'نمونه کار', 'کارها'],
    reply: `The portfolio archives five core technical drawings:\n\n• DRAWING 01: Procedural typography engine & sub-pixel grid system.\n• DRAWING 02: Real-time GPU fluid mechanics & hydrodynamic simulation.\n• DRAWING 03: Distributed design infrastructure for global engineering teams.\n• DRAWING 04: Spatial WebGL product experience with physically-based metallic foil.\n• DRAWING 05: Mathematical layout compiler with deterministic 60fps pacing.\n\nExplore Act IV (The Working Surface) to inspect the gilded case study cards.`,
  },
  {
    triggers: ['contact', 'email', 'hire', 'telegram', 'تماس', 'ایمیل', 'ارتباط', 'همکاری', 'استخدام', 'commission'],
    reply: `Direct channels for creative direction, architectural WebGL development, and bespoke spatial commissions:\n\n• Primary Email: pouyas.one@outlook.com\n• Telegram: @pouya_dmg (https://t.me/pouya_dmg)\n• Instagram: @pouya.sadeghpour\n\nPouya is available for selective technical architecture and creative collaborations worldwide.`,
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

export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
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
      {/* Precision Obsidian & Gilded Trigger Button */}
      <button
        id="ai-assistant-toggle"
        className={`oracle-trigger ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Kintsugi Oracle"
        data-cursor="ORACLE"
      >
        <span className="oracle-trigger-glyph">✦</span>
        <span className="oracle-trigger-core">
          <span className="oracle-trigger-title">ORACLE // AI</span>
          <span className="oracle-trigger-status">ILLUMINATED</span>
        </span>
        <span className="oracle-trigger-bracket">]</span>
      </button>

      {/* Luxury Architectural Monolith Modal */}
      {isOpen && (
        <aside className="oracle-monolith" aria-label="Kintsugi Oracle Terminal">
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
          <div className="oracle-ledger">
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
