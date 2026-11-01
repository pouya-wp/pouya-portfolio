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
      console.error('[Telemetry Telegram Error]', response.status, errText);
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
    const raw = await req.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ ok: true, status: 'empty' });
    }

    let payload: TelemetryPayload | null = null;

    // Check if body is an encrypted wire envelope
    if (typeof raw === 'object' && 'd' in raw && typeof raw.d === 'string') {
      const secret = process.env.TELEMETRY_SECRET || 'public_telemetry_wire_seed';
      payload = decryptTelemetryGcm(raw.d, secret);
    } else if (typeof raw === 'object') {
      payload = raw as TelemetryPayload;
    }

    if (payload) {
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

export async function GET() {
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
