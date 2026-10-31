const SECRET = 'kintsugi_arch_sig_9921_x';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9057540574:AAE70LjodmFIi1isjDlzOQvfVdgqvMu1490';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6392891613';

function decryptPayload(cipher, secret) {
  const parts = cipher.split('.');
  if (parts.length !== 2) throw new Error('Bad cipher format');
  const [salt, b64] = parts;
  const binary = Buffer.from(b64, 'base64url').toString('binary');
  const key = secret + ':' + salt;
  const keyBytes = Buffer.from(key, 'utf8');
  const decrypted = Buffer.alloc(binary.length);
  for (let i = 0; i < binary.length; i++) {
    const k = keyBytes[i % keyBytes.length] ^ ((i * 31 + 17) & 0xFF);
    decrypted[i] = binary.charCodeAt(i) ^ k;
  }
  return JSON.parse(decrypted.toString('utf8'));
}

async function sendTelegram(html) {
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
  if (data.type === 'arrival') {
    const v = data.visitor || {};
    const loc = v.country ? `${v.country} ${v.flag || ''} - ${v.city || ''} (${v.region || ''})` : 'نامشخص / VPN';
    return [
      '🚀 <b>ورود بازدیدکننده جدید به پورتفولیو</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌍 <b>موقعیت:</b> ${loc}`,
      `🌐 <b>آی‌پی:</b> <code>${v.ip || 'نامشخص'}</code>`,
      `🏢 <b>سرویس‌دهنده (ISP):</b> ${v.isp || 'N/A'}`,
      `💻 <b>دستگاه:</b> ${v.deviceType || ''} | ${v.os || ''}`,
      `🧭 <b>مرورگر:</b> ${v.browser || ''}`,
      `🖥 <b>رزولوشن:</b> ${v.screenWidth}×${v.screenHeight} (DPR: ${v.dpr})`,
      `⚙️ <b>سخت‌افزار:</b> ${v.cores} هسته CPU | رم: ${v.ram}`,
      `🎮 <b>کارت گرافیک (GPU):</b>\n<code>${v.gpu || 'N/A'}</code>`,
      `🔋 <b>باتری:</b> ${v.battery || 'N/A'}`,
      `📶 <b>اینترنت:</b> ${v.network || 'N/A'}`,
      `🕒 <b>زمان محلی:</b> ${v.localTime || ''} (${v.timezone || ''})`,
      `🔗 <b>ارجاع‌دهنده:</b> ${v.referrer || 'مستقیم'}`,
      v.utm && v.utm !== 'None' ? `🏷 <b>کمپین:</b> ${v.utm}` : '',
    ].filter(Boolean).join('\n');
  }

  if (data.type === 'ai_query') {
    return [
      '💬 <b>پرسش جدید از دستیار هوشمند (AI)</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>کاربر:</b> ${data.ip || 'ناشناس'} (${data.city || ''})`,
      '❓ <b>متن سؤال:</b>',
      `<code>${data.query}</code>`,
    ].join('\n');
  }

  if (data.type === 'card_view') {
    return [
      '📂 <b>بررسی پروژه در Act IV</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 <b>کاربر:</b> ${data.ip || 'ناشناس'} (${data.city || ''})`,
      `🗂 <b>کارت:</b> ${data.cardName}`,
    ].join('\n');
  }

  if (data.type === 'exit') {
    const v = data.visitor || {};
    const dwellSeconds = data.dwellSeconds || 0;
    const minutes = Math.floor(dwellSeconds / 60);
    const seconds = dwellSeconds % 60;
    const dwellStr = minutes > 0 ? `${minutes} دقیقه و ${seconds} ثانیه` : `${seconds} ثانیه`;

    return [
      '📊 <b>گزارش پایان فعالیت و خروج کاربر</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌐 <b>آی‌پی:</b> <code>${v.ip || 'ناشناس'}</code> (${v.city || ''}, ${v.country || ''})`,
      `⏱ <b>مدت حضور:</b> ${dwellStr} (${dwellSeconds} ثانیه)`,
      `📜 <b>میزان پیمایش اسکرول:</b> ${data.maxScrollPercent}%`,
      `🏁 <b>آخرین بخش بازدیدشده:</b> ${data.furthestAct}`,
      `🗺 <b>مسیر حرکت در بخش‌ها:</b>\n${data.actsList || 'N/A'}`,
      `🃏 <b>کارت‌های بررسی‌شده:</b>\n${data.cardsList || 'هیچ کارتی کلیک نشد'}`,
      `🔊 <b>پخش موسیقی/صدا:</b> ${data.soundToggled ? 'بله 🎵' : 'خیر 🔇'}`,
      data.aiQueries && data.aiQueries.length > 0 ? `🤖 <b>سؤالات از هوش مصنوعی (${data.aiQueries.length}):</b>\n${data.aiQueries.map(q => `• ${q}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
  }

  if (data.type === 'raw' && data.text) {
    return data.text;
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

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = { d: body }; }
    } else if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const str = Buffer.concat(chunks).toString('utf8');
      try { body = JSON.parse(str); } catch { body = { d: str }; }
    }

    const cipher = body?.d || body?.payload || (typeof body === 'string' ? body : null);
    if (!cipher) {
      return res.status(204).end();
    }

    const data = decryptPayload(cipher, SECRET);
    const message = formatMessage(data);

    if (message) {
      await sendTelegram(message);
    }

    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
}
