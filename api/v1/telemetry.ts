import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';

export interface VisitorMetadata {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  flag?: string;
  isp?: string;
  deviceType?: 'Mobile' | 'Tablet' | 'Desktop';
  os?: string;
  browser?: string;
  screenWidth?: number;
  screenHeight?: number;
  dpr?: number;
  cores?: number | string;
  ram?: string;
  gpu?: string;
  battery?: string;
  network?: string;
  language?: string;
  timezone?: string;
  localTime?: string;
  referrer?: string;
  landingUrl?: string;
  utm?: string;
}

export interface TelemetryPayload {
  type: 'arrival' | 'ai_query' | 'card_view' | 'exit' | 'raw';
  visitor?: VisitorMetadata;
  query?: string;
  cardName?: string;
  ip?: string;
  city?: string;
  country?: string;
  dwellSeconds?: number;
  maxScrollPercent?: number;
  furthestAct?: string;
  actsList?: string;
  cardsList?: string;
  soundToggled?: boolean;
  aiQueries?: string[];
  text?: string;
}

interface TelemetryWireEnvelope {
  d: string;
  t: number;
}

// Bounded sliding window rate limiter
interface RateLimitRecord {
  timestamps: number[];
}

class BoundedRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxCapacity: number;
  private readonly cache = new Map<string, RateLimitRecord>();

  constructor(windowMs = 60000, maxRequests = 20, maxCapacity = 500) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.maxCapacity = maxCapacity;

    // Out-of-band periodic background cleanup to keep request handling O(1)
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => this.purgeExpired(), this.windowMs);
      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }
    }
  }

  private purgeExpired(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, record] of this.cache.entries()) {
      const active = record.timestamps.filter(ts => ts > cutoff);
      if (active.length === 0) {
        this.cache.delete(key);
      } else {
        record.timestamps = active;
      }
    }
  }

  public isAllowed(ip: string): boolean {
    if (!ip) return true;
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let record = this.cache.get(ip);
    if (!record) {
      if (this.cache.size >= this.maxCapacity) {
        // Bounded capacity: evict oldest entry
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      record = { timestamps: [] };
      this.cache.set(ip, record);
    } else {
      record.timestamps = record.timestamps.filter(ts => ts > cutoff);
    }

    if (record.timestamps.length >= this.maxRequests) {
      return false;
    }

    record.timestamps.push(now);
    return true;
  }
}

const rateLimiter = new BoundedRateLimiter(60000, 20, 500);

/**
 * Extracts verified client IP from trusted infrastructure headers.
 * Protects against X-Forwarded-For spoofing by prioritizing verified edge platform headers.
 */
function getTrustedClientIp(req: IncomingMessage): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim().length > 0) {
    return cfIp.trim();
  }

  const vercelIp = req.headers['x-vercel-ip'] || req.headers['x-real-ip'];
  if (typeof vercelIp === 'string' && vercelIp.trim().length > 0) {
    return vercelIp.trim();
  }

  return req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Escapes special HTML characters to prevent Telegram HTML injection attacks
 */
function sanitizeHtml(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fully authenticated AES-256-GCM decryption pipeline using node:crypto
 */
export function decryptTelemetryGcm(wireCipher: string, secretKey: string): TelemetryPayload {
  const parts = wireCipher.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed payload wire format');
  }

  const [ivHex, b64] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== 12) {
    throw new Error('Invalid initialization vector length');
  }

  const buffer = Buffer.from(b64, 'base64url');
  if (buffer.length < 16) {
    throw new Error('Ciphertext payload too short');
  }

  const authTag = buffer.subarray(buffer.length - 16);
  const encryptedBytes = buffer.subarray(0, buffer.length - 16);

  const derivedKey = crypto.createHash('sha256').update(secretKey).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as TelemetryPayload;
}

/**
 * Dispatches notification to Telegram bot
 */
async function transmitTelegramMessage(htmlText: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return false;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Formats structured telemetry payload into clean Telegram HTML
 */
function buildTelegramReport(payload: TelemetryPayload): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.type === 'arrival') {
    const v = payload.visitor || {};
    const loc = v.country ? `${sanitizeHtml(v.country)} ${v.flag || ''} - ${sanitizeHtml(v.city || '')} (${sanitizeHtml(v.region || '')})` : 'نامشخص / VPN';
    return [
      '🚀 <b>ورود بازدیدکننده جدید به پورتفولیو</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌍 <b>موقعیت:</b> ${loc}`,
      `🌐 <b>آی‌پی:</b> <code>${sanitizeHtml(v.ip || 'نامشخص')}</code>`,
      `🏢 <b>سرویس‌دهنده (ISP):</b> ${sanitizeHtml(v.isp || 'N/A')}`,
      `💻 <b>دستگاه:</b> ${sanitizeHtml(v.deviceType || '')} | ${sanitizeHtml(v.os || '')}`,
      `🧭 <b>مرورگر:</b> ${sanitizeHtml(v.browser || '')}`,
      `🖥 <b>رزولوشن:</b> ${v.screenWidth || 0}×${v.screenHeight || 0} (DPR: ${v.dpr || 1})`,
      `⚙️ <b>سخت‌افزار:</b> ${sanitizeHtml(String(v.cores || 'N/A'))} هسته CPU | رم: ${sanitizeHtml(String(v.ram || 'N/A'))}`,
      `🎮 <b>کارت گرافیک (GPU):</b>\n<code>${sanitizeHtml(v.gpu || 'N/A')}</code>`,
      `🔋 <b>باتری:</b> ${sanitizeHtml(v.battery || 'N/A')}`,
      `📶 <b>اینترنت:</b> ${sanitizeHtml(v.network || 'N/A')}`,
      `🕒 <b>زمان محلی:</b> ${sanitizeHtml(v.localTime || '')} (${sanitizeHtml(v.timezone || '')})`,
      `🔗 <b>ارجاع‌دهنده:</b> ${sanitizeHtml(v.referrer || 'مستقیم')}`,
      v.utm && v.utm !== 'None' ? `🏷 <b>کمپین:</b> ${sanitizeHtml(v.utm)}` : '',
    ].filter(Boolean).join('\n');
  }

  if (payload.type === 'ai_query') {
    const query = sanitizeHtml(String(payload.query || '').slice(0, 1000));
    return [
      '💬 <b>پرسش جدید از دستیار هوشمند (AI)</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>کاربر:</b> ${sanitizeHtml(payload.ip || 'ناشناس')} (${sanitizeHtml(payload.city || '')})`,
      '❓ <b>متن سؤال:</b>',
      `<code>${query}</code>`,
    ].join('\n');
  }

  if (payload.type === 'card_view') {
    return [
      '📂 <b>بررسی پروژه در Act IV</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>کاربر:</b> ${sanitizeHtml(payload.ip || 'ناشناس')} (${sanitizeHtml(payload.city || '')})`,
      `🗂 <b>کارت:</b> ${sanitizeHtml(String(payload.cardName || '').slice(0, 200))}`,
    ].join('\n');
  }

  if (payload.type === 'exit') {
    const v = payload.visitor || {};
    const dwellSeconds = Math.max(0, Number(payload.dwellSeconds) || 0);
    const minutes = Math.floor(dwellSeconds / 60);
    const seconds = dwellSeconds % 60;
    const dwellStr = minutes > 0 ? `${minutes} دقیقه و ${seconds} ثانیه` : `${seconds} ثانیه`;

    const rawQueries = Array.isArray(payload.aiQueries) ? payload.aiQueries : [];
    const queries = rawQueries.slice(0, 10).map(q => `• ${sanitizeHtml(String(q).slice(0, 300))}`);

    return [
      '📊 <b>گزارش پایان فعالیت و خروج کاربر</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌐 <b>آی‌پی:</b> <code>${sanitizeHtml(v.ip || 'ناشناس')}</code> (${sanitizeHtml(v.city || '')}, ${sanitizeHtml(v.country || '')})`,
      `⏱ <b>مدت حضور:</b> ${dwellStr} (${dwellSeconds} ثانیه)`,
      `📜 <b>میزان پیمایش اسکرول:</b> ${Math.min(100, Math.max(0, Number(payload.maxScrollPercent) || 0))}%`,
      `🏁 <b>آخرین بخش بازدیدشده:</b> ${sanitizeHtml(String(payload.furthestAct || 'N/A').slice(0, 100))}`,
      `🗺 <b>مسیر حرکت در بخش‌ها:</b>\n${sanitizeHtml(String(payload.actsList || 'N/A').slice(0, 500))}`,
      `🃏 <b>کارت‌های بررسی‌شده:</b>\n${sanitizeHtml(String(payload.cardsList || 'هیچ کارتی کلیک نشد').slice(0, 500))}`,
      `🔊 <b>پخش موسیقی/صدا:</b> ${payload.soundToggled ? 'بله 🎵' : 'خیر 🔇'}`,
      queries.length > 0 ? `🤖 <b>سؤالات از هوش مصنوعی (${queries.length}):</b>\n${queries.join('\n')}` : '',
    ].filter(Boolean).join('\n');
  }

  if (payload.type === 'raw' && payload.text) {
    return sanitizeHtml(String(payload.text).slice(0, 2000));
  }

  return null;
}

/**
 * Telemetry endpoint handler with strict authentication, rate limiting, and input validation
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Engine-Signature');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return;
  }

  // Enforce server-side TELEMETRY_SECRET without insecure fallback
  const sharedSecret = process.env.TELEMETRY_SECRET;
  if (!sharedSecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server configuration error: TELEMETRY_SECRET environment variable is missing.' }));
    return;
  }

  // Rate limit check using verified infrastructure IP
  const clientIp = getTrustedClientIp(req);
  if (!rateLimiter.isAllowed(clientIp)) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Too Many Requests' }));
    return;
  }

  try {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');

    if (rawBody.length > 65536) {
      res.statusCode = 413; // Payload Too Large
      res.end();
      return;
    }

    let envelope: TelemetryWireEnvelope | null = null;
    try {
      envelope = JSON.parse(rawBody) as TelemetryWireEnvelope;
    } catch {
      res.statusCode = 204;
      res.end();
      return;
    }

    const cipher = envelope?.d;
    if (!cipher || typeof cipher !== 'string' || cipher.length > 32768) {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Timestamp freshness validation (within 5-minute window to reject replay attacks)
    if (envelope.t && typeof envelope.t === 'number') {
      const delta = Math.abs(Date.now() - envelope.t);
      if (delta > 5 * 60 * 1000) {
        res.statusCode = 204;
        res.end();
        return;
      }
    }

    const payload = decryptTelemetryGcm(cipher, sharedSecret);
    const message = buildTelegramReport(payload);

    if (message) {
      await transmitTelegramMessage(message);
    }

    res.statusCode = 204;
    res.end();
  } catch {
    res.statusCode = 204;
    res.end();
  }
}
