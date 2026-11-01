import { NextResponse } from 'next/server';
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
  type: 'arrival' | 'ai_query' | 'card_view' | 'exit' | 'commission_inquiry' | 'raw';
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
  name?: string;
  contact?: string;
  message?: string;
  timestamp?: string;
  text?: string;
}

function sanitizeHtml(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decryptTelemetryGcm(wireCipher: string, secretKey: string): TelemetryPayload | null {
  try {
    const parts = wireCipher.split('.');
    if (parts.length !== 2) return null;

    const [ivHex, b64] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 12) return null;

    const buffer = Buffer.from(b64, 'base64url');
    if (buffer.length < 16) return null;

    const authTag = buffer.subarray(buffer.length - 16);
    const encryptedBytes = buffer.subarray(0, buffer.length - 16);

    const derivedKey = crypto.createHash('sha256').update(secretKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as TelemetryPayload;
  } catch {
    return null;
  }
}

function decryptTelemetry(wireCipher: string, secretKey: string): TelemetryPayload | null {
  // 1. Try AES-GCM with secretKey
  let res = decryptTelemetryGcm(wireCipher, secretKey);
  if (res) return res;

  // 2. Try AES-GCM with standard public seed
  if (secretKey !== 'public_telemetry_wire_seed') {
    res = decryptTelemetryGcm(wireCipher, 'public_telemetry_wire_seed');
    if (res) return res;
  }

  // 3. Try legacy XOR obfuscation
  try {
    const parts = wireCipher.split('.');
    if (parts.length === 2) {
      const [salt, b64] = parts;
      const binary = Buffer.from(b64, 'base64url').toString('binary');
      const candidateKeys = ['kintsugi_arch_sig_9921_x', secretKey, 'public_telemetry_wire_seed'];
      for (const k of candidateKeys) {
        try {
          const key = k + ':' + salt;
          const keyBytes = Buffer.from(key, 'utf8');
          const dec = Buffer.alloc(binary.length);
          for (let i = 0; i < binary.length; i++) {
            const kb = keyBytes[i % keyBytes.length] ^ ((i * 31 + 17) & 0xff);
            dec[i] = binary.charCodeAt(i) ^ kb;
          }
          const parsed = JSON.parse(dec.toString('utf8'));
          if (parsed && typeof parsed === 'object') return parsed as TelemetryPayload;
        } catch {
          // Continue to next candidate
        }
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

async function transmitTelegramMessage(htmlText: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '9057540574:AAE70LjodmFIi1isjDlzOQvfVdgqvMu1490';
  const chatId = process.env.TELEGRAM_CHAT_ID || '6392891613';

  if (!botToken || !chatId) {
    console.warn('[Telemetry] Telegram credentials missing');
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

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn('[Telemetry Telegram HTML Error, falling back to plain text]', response.status, errText);

      // Retry without HTML parse_mode in case tags caused Bad Request
      const plainText = htmlText.replace(/<[^>]+>/g, '');
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: plainText,
          disable_web_page_preview: true,
        }),
      });

      return retryRes.ok;
    }

    return response.ok;
  } catch (err) {
    console.error('[Telemetry Telegram Network Error]', err);
    return false;
  }
}

function buildTelegramReport(payload: TelemetryPayload): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.type === 'commission_inquiry') {
    return [
      '⚡️ <b>درخواست همکاری و سفارش جدید (Direct Commission)</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>نام / استودیو:</b> ${sanitizeHtml(payload.name || 'نامشخص')}`,
      `📫 <b>راه‌ ارتباطی:</b> <code>${sanitizeHtml(payload.contact || 'ثبت نشده')}</code>`,
      '📝 <b>متن پیام / شرح پروژه:</b>',
      `<blockquote>${sanitizeHtml(payload.message || '')}</blockquote>`,
      `⏱ <b>زمان:</b> ${sanitizeHtml(payload.timestamp || new Date().toISOString())}`,
    ].join('\n');
  }

  if (payload.type === 'arrival') {
    const v = payload.visitor || {};
    const loc = v.country
      ? `${sanitizeHtml(v.country)} ${v.flag || ''} - ${sanitizeHtml(v.city || '')} (${sanitizeHtml(v.region || '')})`
      : 'نامشخص / VPN';

    return [
      '🚀 <b>ورود بازدیدکننده جدید به پورتفولیو</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌍 <b>موقعیت:</b> ${loc}`,
      `🌐 <b>آی‌پی:</b> <code>${sanitizeHtml(v.ip || 'نامشخص')}</code>`,
      `🏢 <b>سرویس‌دهنده:</b> ${sanitizeHtml(v.isp || 'N/A')}`,
      `📱 <b>دستگاه:</b> ${sanitizeHtml(v.deviceType || 'Desktop')} | ${sanitizeHtml(v.os || '')} | ${sanitizeHtml(v.browser || '')}`,
      `🖥 <b>صفحه‌نمایش:</b> ${v.screenWidth || 0}x${v.screenHeight || 0} (@${v.dpr || 1}x)`,
      `⚙️ <b>سخت‌افزار:</b> ${sanitizeHtml(v.cores || '?')} هسته | ${sanitizeHtml(v.ram || '?')} RAM`,
      `🎮 <b>کارت گرافیک:</b> ${sanitizeHtml(v.gpu || 'N/A')}`,
      `🔋 <b>باتری:</b> ${sanitizeHtml(v.battery || 'N/A')}`,
      `📶 <b>اینترنت:</b> ${sanitizeHtml(v.network || 'N/A')}`,
      `🕒 <b>زمان محلی:</b> ${sanitizeHtml(v.localTime || '')} (${sanitizeHtml(v.timezone || '')})`,
      `🔗 <b>ارجاع‌دهنده:</b> ${sanitizeHtml(v.referrer || 'مستقیم')}`,
      v.utm && v.utm !== 'None' ? `🏷 <b>کمپین:</b> ${sanitizeHtml(v.utm)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
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
    ]
      .filter(Boolean)
      .join('\n');
  }

  return null;
}

export async function POST(req: Request) {
  try {
    let raw: unknown = null;
    try {
      raw = await req.json();
    } catch {
      try {
        const text = await req.text();
        raw = JSON.parse(text);
      } catch {
        raw = null;
      }
    }

    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ ok: true, status: 'empty' });
    }

    let payload: TelemetryPayload | null = null;
    const bodyObj = raw as Record<string, unknown>;

    // 1. Check if body contains cipher envelope 'd'
    if (typeof bodyObj.d === 'string') {
      const secret = process.env.TELEMETRY_SECRET || 'public_telemetry_wire_seed';
      payload = decryptTelemetry(bodyObj.d, secret);
    } else if (bodyObj.payload && typeof bodyObj.payload === 'object') {
      payload = bodyObj.payload as TelemetryPayload;
    } else if ('type' in bodyObj) {
      payload = bodyObj as unknown as TelemetryPayload;
    }

    if (payload) {
      // Enrich with Vercel edge geolocation headers if missing from client
      const vercelIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip');
      const vercelCity = req.headers.get('x-vercel-ip-city');
      const vercelCountry = req.headers.get('x-vercel-ip-country');
      const vercelRegion = req.headers.get('x-vercel-ip-country-region');

      if (payload.visitor) {
        if ((!payload.visitor.ip || payload.visitor.ip === 'نامشخص') && vercelIp) {
          payload.visitor.ip = vercelIp;
        }
        if ((!payload.visitor.city || payload.visitor.city === '') && vercelCity) {
          try { payload.visitor.city = decodeURIComponent(vercelCity); } catch { payload.visitor.city = vercelCity; }
        }
        if ((!payload.visitor.country || payload.visitor.country === '') && vercelCountry) {
          payload.visitor.country = vercelCountry;
        }
        if ((!payload.visitor.region || payload.visitor.region === '') && vercelRegion) {
          try { payload.visitor.region = decodeURIComponent(vercelRegion); } catch { payload.visitor.region = vercelRegion; }
        }
      }

      console.log(`[Telemetry ${payload.type?.toUpperCase()}]`, JSON.stringify(payload));
      const telegramReport = buildTelegramReport(payload);
      if (telegramReport) {
        await transmitTelegramMessage(telegramReport);
      }
    }

    return NextResponse.json({ ok: true, status: 'synced', timestamp: Date.now() });
  } catch (error) {
    console.error('[Telemetry Error]', error);
    return NextResponse.json({ ok: true, status: 'acknowledged' });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isTest = url.searchParams.get('test') === '1';

  if (isTest) {
    const success = await transmitTelegramMessage(
      '🧪 <b>تست تله‌متری پورتفولیو Pouya</b>\n━━━━━━━━━━━━━━━━━━━━\nارتباط با ربات تلگرام با موفقیت برقرار است! ✅\nپیام‌های تله‌متری و فرم تماس به درستی ارسال می‌شوند.'
    );
    return NextResponse.json({
      status: success ? 'telegram_delivered' : 'telegram_failed',
      telegram_ok: success,
      timestamp: Date.now(),
    });
  }

  return NextResponse.json({
    status: 'operational',
    service: 'Pouya Sadeghpour Telemetry & Inquiries',
    timestamp: Date.now(),
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Engine-Signature',
    },
  });
}
