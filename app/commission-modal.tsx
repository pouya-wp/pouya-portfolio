'use client';

import React, { useRef, useEffect, useState } from 'react';

interface CommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommissionModal({ isOpen, onClose }: CommissionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

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

    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        onClose();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      dialog.removeEventListener('click', handleClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!message.trim() || !contact.trim()) return;
    setStatus('sending');

    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'commission_inquiry',
          name: name.trim() || 'Collector / Studio',
          contact: contact.trim(),
          message: message.trim(),
          timestamp: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setStatus('sent');
        setName('');
        setContact('');
        setMessage('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="commission-dialog"
      aria-label="Direct Commission Dispatch — Pouya Sadeghpour"
      data-native-scroll="true"
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="commission-container">
        {/* Top Control Bar */}
        <div className="commission-bar">
          <div className="commission-bar-meta">
            <span className="commission-glyph">✦</span>
            <div>
              <span className="commission-badge">COMMISSION // DISPATCH</span>
              <h2 className="commission-title">Establish Architectural Contact</h2>
            </div>
          </div>
          <button
            type="button"
            className="commission-close"
            onClick={onClose}
            aria-label="Close Commission Modal"
            data-cursor="CLOSE"
          >
            <span>ESC</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="commission-body">
          {status === 'sent' ? (
            <div className="commission-success">
              <span className="commission-success-glyph">✦</span>
              <h3 className="commission-success-title">TRANSMISSION LOGGED &amp; SECURED</h3>
              <p className="commission-success-desc">
                Your dispatch has been registered directly with Pouya Sadeghpour. You will receive a response via your provided contact coordinates shortly.
              </p>
              <div className="commission-success-actions">
                <button
                  type="button"
                  className="pill is-gold"
                  onClick={onClose}
                  data-cursor="CLOSE"
                >
                  <span className="pill-dot" />Close Window
                </button>
                <button
                  type="button"
                  className="pill is-dashed"
                  onClick={() => setStatus('idle')}
                  data-cursor="RESET"
                >
                  Send Another Transmission
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="commission-form">
              <p className="commission-intro">
                Direct channel to Pouya Sadeghpour. Open for selective creative development, bespoke WebGL architectures, and design leadership commissions.
              </p>

              <div className="commission-inputs">
                <div className="commission-field">
                  <label htmlFor="comm-name" className="commission-lbl">NAME / ORGANIZATION</label>
                  <input
                    id="comm-name"
                    type="text"
                    className="commission-input"
                    placeholder="e.g. Studio Mono / Brand / Individual"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="commission-field">
                  <label htmlFor="comm-contact" className="commission-lbl">CONTACT (EMAIL / TELEGRAM) *</label>
                  <input
                    id="comm-contact"
                    type="text"
                    required
                    className="commission-input"
                    placeholder="e.g. pouya@studio.com or @handle"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="commission-field">
                <label htmlFor="comm-message" className="commission-lbl">PROJECT PARAMETERS &amp; SCOPE *</label>
                <textarea
                  id="comm-message"
                  required
                  rows={4}
                  className="commission-textarea"
                  placeholder="Outline your project scope, target timeline, or architectural objectives..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div className="commission-footer">
                <button
                  type="submit"
                  className="pill is-gold commission-submit"
                  disabled={status === 'sending'}
                  data-cursor="TRANSMIT"
                >
                  <span className="pill-dot" />
                  {status === 'sending' ? 'TRANSMITTING...' : 'DISPATCH TRANSMISSION →'}
                </button>
                {status === 'error' && (
                  <span className="commission-err">
                    Dispatch failed. Please contact via direct email: pouyas.one@outlook.com
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </dialog>
  );
}
