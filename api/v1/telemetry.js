import crypto from 'node:crypto';

// Telemetry Relay Engine with Authenticated AES-256-GCM Decryption & Rate Limiting
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SHARED_SECRET =
  process.env.TELEMETRY_SECRET ||
  process.env.NEXT_PUBLIC_TELEMETRY_KEY ||
  'kintsugi_arch_telemetry_secure_seed';

// In-memory sliding window rate limiting (max 15 requests per minute per IP)
const ipRateMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 15;

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const timestamps = (ipRateMap.get(ip) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRateMap.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  ipRateMap.set(ip, timestamps);

  // Evict stale entries periodically
  if (ipRateMap.size > 1000) {
    for (const [k, v] of ipRateMap.entries()) {
      if (v.every(ts => now - ts >= RATE_LIMIT_WINDOW_MS)) {
        ipRateMap.delete(k);
      }
    }
  }
  return false;
}

/** Escapes special HTML characters to prevent Telegram HTML injection */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Decrypts standard Web Crypto AES-256-GCM ciphertext using node:crypto
 */
function decryptPayload(payloadStr, secret) {
  const parts = payloadStr.split('.');
  if (parts.length !== 2) throw new Error('Malformed payload');

  const [ivHex, b64] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== 12) throw new Error('Invalid IV length');

  const buffer = Buffer.from(b64, 'base64url');
  if (buffer.length < 16) throw new Error('Ciphertext too short');

  const authTag = buffer.subarray(buffer.length - 16);
  const encrypted = buffer.subarray(0, buffer.length - 16);

  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function sendTelegram(html) {
  if (!BOT_TOKEN || !CHAT_ID) {
    // Graceful no-op when running without telegram env credentials
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatMessage(data) {
  if (!data || typeof data !== 'object') return null;

  if (data.type === 'arrival') {
    const v = data.visitor || {};
    const loc = v.country ? `${escapeHtml(v.country)} ${v.flag || ''} - ${escapeHtml(v.city || '')} (${escapeHtml(v.region || '')})` : 'نامشخص / VPN';
    return [
      '🚀 <b>ورود بازدیدکننده جدید به پورتفولیو</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌍 <b>موقعیت:</b> ${loc}`,
      `🌐 <b>آی‌پی:</b> <code>${escapeHtml(v.ip || 'نامشخص')}</code>`,
      `🏢 <b>سرویس‌دهنده (ISP):</b> ${escapeHtml(v.isp || 'N/A')}`,
      `💻 <b>دستگاه:</b> ${escapeHtml(v.deviceType || '')} | ${escapeHtml(v.os || '')}`,
      `🧭 <b>مرورگر:</b> ${escapeHtml(v.browser || '')}`,
      `🖥 <b>رزولوشن:</b> ${v.screenWidth || 0}×${v.screenHeight || 0} (DPR: ${v.dpr || 1})`,
      `⚙️ <b>سخت‌افزار:</b> ${escapeHtml(String(v.cores || 'N/A'))} هسته CPU | رم: ${escapeHtml(String(v.ram || 'N/A'))}`,
      `🎮 <b>کارت گرافیک (GPU):</b>\n<code>${escapeHtml(v.gpu || 'N/A')}</code>`,
      `🔋 <b>باتری:</b> ${escapeHtml(v.battery || 'N/A')}`,
      `📶 <b>اینترنت:</b> ${escapeHtml(v.network || 'N/A')}`,
      `🕒 <b>زمان محلی:</b> ${escapeHtml(v.localTime || '')} (${escapeHtml(v.timezone || '')})`,
      `🔗 <b>ارجاع‌دهنده:</b> ${escapeHtml(v.referrer || 'مستقیم')}`,
      v.utm && v.utm !== 'None' ? `🏷 <b>کمپین:</b> ${escapeHtml(v.utm)}` : '',
    ].filter(Boolean).join('\n');
  }

  if (data.type === 'ai_query') {
    const query = escapeHtml(String(data.query || '').slice(0, 1000));
    return [
      '💬 <b>پرسش جدید از دستیار هوشمند (AI)</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>کاربر:</b> ${escapeHtml(data.ip || 'ناشناس')} (${escapeHtml(data.city || '')})`,
      '❓ <b>متن سؤال:</b>',
      `<code>${query}</code>`,
    ].join('\n');
  }

  if (data.type === 'card_view') {
    return [
      '📂 <b>بررسی پروژه در Act IV</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>کاربر:</b> ${escapeHtml(data.ip || 'ناشناس')} (${escapeHtml(data.city || '')})`,
      `🗂 <b>کارت:</b> ${escapeHtml(String(data.cardName || '').slice(0, 200))}`,
    ].join('\n');
  }

  if (data.type === 'exit') {
    const v = data.visitor || {};
    const dwellSeconds = Math.max(0, parseInt(data.dwellSeconds, 10) || 0);
    const minutes = Math.floor(dwellSeconds / 60);
    const seconds = dwellSeconds % 60;
    const dwellStr = minutes > 0 ? `${minutes} دقیقه و ${seconds} ثانیه` : `${seconds} ثانیه`;

    const rawQueries = Array.isArray(data.aiQueries) ? data.aiQueries : [];
    const queries = rawQueries.slice(0, 10).map(q => `• ${escapeHtml(String(q).slice(0, 300))}`);

    return [
      '📊 <b>گزارش پایان فعالیت و خروج کاربر</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌐 <b>آی‌پی:</b> <code>${escapeHtml(v.ip || 'ناشناس')}</code> (${escapeHtml(v.city || '')}, ${escapeHtml(v.country || '')})`,
      `⏱ <b>مدت حضور:</b> ${dwellStr} (${dwellSeconds} ثانیه)`,
      `📜 <b>میزان پیمایش اسکرول:</b> ${Math.min(100, Math.max(0, parseInt(data.maxScrollPercent, 10) || 0))}%`,
      `🏁 <b>آخرین بخش بازدیدشده:</b> ${escapeHtml(String(data.furthestAct || 'N/A').slice(0, 100))}`,
      `🗺 <b>مسیر حرکت در بخش‌ها:</b>\n${escapeHtml(String(data.actsList || 'N/A').slice(0, 500))}`,
      `🃏 <b>کارت‌های بررسی‌شده:</b>\n${escapeHtml(String(data.cardsList || 'هیچ کارتی کلیک نشد').slice(0, 500))}`,
      `🔊 <b>پخش موسیقی/صدا:</b> ${data.soundToggled ? 'بله 🎵' : 'خیر 🔇'}`,
      queries.length > 0 ? `🤖 <b>سؤالات از هوش مصنوعی (${queries.length}):</b>\n${queries.join('\n')}` : '',
    ].filter(Boolean).join('\n');
  }

  if (data.type === 'raw' && data.text) {
    return escapeHtml(String(data.text).slice(0, 2000));
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Engine-Signature');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  // Rate limit check
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = { d: body }; }
    } else if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const str = Buffer.concat(chunks).toString('utf8');
      if (str.length > 65536) {
        return res.status(413).end(); // Payload Too Large
      }
      try { body = JSON.parse(str); } catch { body = { d: str }; }
    }

    const cipher = body?.d || body?.payload || (typeof body === 'string' ? body : null);
    if (!cipher || typeof cipher !== 'string' || cipher.length > 32768) {
      return res.status(204).end();
    }

    // Timestamp verification (within 5 minutes window)
    if (body?.t && typeof body.t === 'number') {
      const delta = Math.abs(Date.now() - body.t);
      if (delta > 5 * 60 * 1000) {
        return res.status(204).end();
      }
    }

    const data = decryptPayload(cipher, SHARED_SECRET);
    const message = formatMessage(data);

    if (message) {
      await sendTelegram(message);
    }

    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
}
