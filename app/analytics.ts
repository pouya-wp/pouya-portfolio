/**
 * Ultra-Comprehensive Visitor Analytics & Telegram Dispatcher
 * Tracks visitor hardware, GPU, network, IP/Geo, acts journey, cards inspected, and AI interactions.
 */

export interface VisitorInfo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  flag?: string;
  isp?: string;
  org?: string;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  os: string;
  browser: string;
  screenWidth: number;
  screenHeight: number;
  dpr: number;
  cores: number | string;
  ram: string;
  gpu: string;
  battery: string;
  network: string;
  language: string;
  timezone: string;
  localTime: string;
  referrer: string;
  landingUrl: string;
  utm: string;
}

export interface ActivityReport {
  dwellTimeSeconds: number;
  maxScrollPercent: number;
  furthestAct: string;
  actsVisited: string[];
  cardsViewed: string[];
  soundToggled: boolean;
  aiQueries: string[];
  avgFps?: number;
}

// Telegram credentials configuration
export const TELEGRAM_CONFIG = {
  BOT_TOKEN: typeof window !== 'undefined'
    ? ((window as unknown as { __TG_BOT_TOKEN__?: string }).__TG_BOT_TOKEN__ || localStorage.getItem('tg_bot_token') || '9057540574:AAE70LjodmFIi1isjDlzOQvfVdgqvMu1490')
    : '9057540574:AAE70LjodmFIi1isjDlzOQvfVdgqvMu1490',
  CHAT_ID: typeof window !== 'undefined'
    ? ((window as unknown as { __TG_CHAT_ID__?: string }).__TG_CHAT_ID__ || localStorage.getItem('tg_chat_id') || '6392891613')
    : '6392891613',
  ENABLED: true,
};

// Global helper so user can configure credentials from browser console
if (typeof window !== 'undefined') {
  (window as unknown as { setTelegramCredentials: (token: string, chatId: string) => void }).setTelegramCredentials = (token: string, chatId: string) => {
    TELEGRAM_CONFIG.BOT_TOKEN = token;
    TELEGRAM_CONFIG.CHAT_ID = chatId;
    localStorage.setItem('tg_bot_token', token);
    localStorage.setItem('tg_chat_id', chatId);
    console.log('%c[Analytics] Telegram credentials updated successfully!%c', 'color:#ffab52;font-weight:bold', '');
    void sendTelegramMessage(`🤖 <b>تست اتصال ربات آنالیتیکس</b>\nارتباط با ربات تلگرام پورتفولیو با موفقیت برقرار شد! ✅`);
  };
}

export async function sendTelegramMessage(htmlText: string): Promise<boolean> {
  const token = TELEGRAM_CONFIG.BOT_TOKEN || (typeof window !== 'undefined' ? localStorage.getItem('tg_bot_token') : '') || '9057540574:AAE70LjodmFIi1isjDlzOQvfVdgqvMu1490';
  const chatId = TELEGRAM_CONFIG.CHAT_ID || (typeof window !== 'undefined' ? localStorage.getItem('tg_chat_id') : '') || '6392891613';

  if (!token || !chatId) {
    console.info('[Analytics] Telegram bot credentials not set.');
    return false;
  }

  // 1. Try server proxy route first (bypasses ISP filters, VPN blocks & CORS in client)
  try {
    const proxyRes = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, chatId, text: htmlText }),
      keepalive: true,
    });
    if (proxyRes.ok) return true;
  } catch {
    // fallback to direct Telegram API
  }

  // 2. Direct Telegram API fallback
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      keepalive: true,
    });
    return res.ok;
  } catch (e) {
    console.warn('[Analytics] Failed to dispatch Telegram notification:', e);
    return false;
  }
}

/** Detects GPU renderer via WebGL */
function getGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'WebGL Not Supported';
    const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return 'Standard WebGL';
    return (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'Unknown GPU';
  } catch {
    return 'Undetected GPU';
  }
}

/** Detects OS name and version */
function getOS(): string {
  const ua = navigator.userAgent;
  if (/Windows NT 10.0/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6.1/.test(ua)) return 'Windows 7';
  if (/Mac OS X 10[._](\d+)/.test(ua)) return 'macOS ' + (/Mac OS X ([._\d]+)/.exec(ua)?.[1]?.replace(/_/g, '.') || '');
  if (/iPhone OS (\d+)/.test(ua)) return 'iOS ' + (/iPhone OS ([._\d]+)/.exec(ua)?.[1]?.replace(/_/g, '.') || '');
  if (/Android (\d+)/.test(ua)) return 'Android ' + (/Android ([._\d]+)/.exec(ua)?.[1] || '');
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}

/** Detects Browser */
function getBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\/(\d+)/.test(ua)) return 'Edge ' + (/Edg\/([.\d]+)/.exec(ua)?.[1] || '');
  if (/Chrome\/(\d+)/.test(ua) && !/Edg/.test(ua)) return 'Chrome ' + (/Chrome\/([.\d]+)/.exec(ua)?.[1] || '');
  if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) return 'Safari ' + (/Version\/([.\d]+)/.exec(ua)?.[1] || '');
  if (/Firefox\/(\d+)/.test(ua)) return 'Firefox ' + (/Firefox\/([.\d]+)/.exec(ua)?.[1] || '');
  return 'Browser';
}

/** Inspects Network status */
function getNetworkInfo(): string {
  const nav = navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } };
  if (!nav.connection) return 'Standard Web';
  const c = nav.connection;
  const parts = [];
  if (c.effectiveType) parts.push(c.effectiveType.toUpperCase());
  if (c.downlink) parts.push(`${c.downlink} Mbps`);
  if (c.rtt) parts.push(`RTT: ${c.rtt}ms`);
  if (c.saveData) parts.push('Data-Saver On');
  return parts.join(' | ') || 'Connected';
}

/** Inspects Battery */
async function getBatteryInfo(): Promise<string> {
  const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
  if (!nav.getBattery) return 'N/A';
  try {
    const b = await nav.getBattery();
    return `${Math.round(b.level * 100)}% (${b.charging ? '🔌 در حال شارژ' : '🔋 مصرف باتری'})`;
  } catch {
    return 'N/A';
  }
}

export class AnalyticsTracker {
  private startTime = Date.now();
  private maxScrollPercent = 0;
  private furthestAct = 'ACT I';
  private actsVisited = new Set<string>(['ACT I']);
  private cardsViewed = new Set<string>();
  private soundToggled = false;
  private aiQueries: string[] = [];
  private visitorInfo: VisitorInfo | null = null;
  private initialAlertSent = false;
  private summarySent = false;

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    const width = window.innerWidth;
    const deviceType: 'Mobile' | 'Tablet' | 'Desktop' = width < 768 ? 'Mobile' : width < 1024 ? 'Tablet' : 'Desktop';
    const battery = await getBatteryInfo();
    const nav = navigator as unknown as { deviceMemory?: number };

    // Format UTM parameters
    const params = new URLSearchParams(window.location.search);
    const utmList: string[] = [];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => {
      const v = params.get(k);
      if (v) utmList.push(`${k}: ${v}`);
    });

    this.visitorInfo = {
      deviceType,
      os: getOS(),
      browser: getBrowser(),
      screenWidth: screen.width,
      screenHeight: screen.height,
      dpr: Math.round(window.devicePixelRatio * 100) / 100,
      cores: navigator.hardwareConcurrency || 'N/A',
      ram: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'N/A',
      gpu: getGpuRenderer(),
      battery,
      network: getNetworkInfo(),
      language: navigator.language || 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      localTime: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      referrer: document.referrer || 'ورود مستقیم (Direct)',
      landingUrl: window.location.href,
      utm: utmList.length > 0 ? utmList.join(' | ') : 'None',
    };

    // Async fetch Geo IP in parallel (fast & free)
    void this.fetchGeoAndSendArrival();

    // Setup lifecycle listeners for departure report
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !this.summarySent) {
        this.sendSummaryReport();
      }
    });
    window.addEventListener('pagehide', () => {
      if (!this.summarySent) this.sendSummaryReport();
    });
  }

  private async fetchGeoAndSendArrival() {
    try {
      const res = await fetch('https://ipapi.co/json/').catch(() => null);
      if (res && res.ok) {
        const data = await res.json() as { ip?: string; city?: string; region?: string; country_name?: string; country_code?: string; org?: string };
        if (this.visitorInfo) {
          this.visitorInfo.ip = data.ip;
          this.visitorInfo.city = data.city;
          this.visitorInfo.region = data.region;
          this.visitorInfo.country = data.country_name;
          this.visitorInfo.countryCode = data.country_code;
          this.visitorInfo.isp = data.org;
          this.visitorInfo.flag = data.country_code ? this.countryCodeToEmoji(data.country_code) : '🌐';
        }
      }
    } catch {
      // Fallback
    }

    if (!this.initialAlertSent) {
      this.initialAlertSent = true;
      this.sendArrivalAlert();
    }
  }

  private countryCodeToEmoji(cc: string): string {
    return cc.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
  }

  private sendArrivalAlert() {
    if (!this.visitorInfo) return;
    const v = this.visitorInfo;
    const loc = v.country ? `${v.country} ${v.flag || ''} - ${v.city || ''} (${v.region || ''})` : 'نامشخص / VPN';

    const msg = [
      `🚀 <b>ورود بازدیدکننده جدید به پورتفولیو</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🌍 <b>موقعیت:</b> ${loc}`,
      `🌐 <b>آی‌پی:</b> <code>${v.ip || 'نامشخص'}</code>`,
      `🏢 <b>سرویس‌دهنده (ISP):</b> ${v.isp || 'N/A'}`,
      `💻 <b>دستگاه:</b> ${v.deviceType} | ${v.os}`,
      `🧭 <b>مرورگر:</b> ${v.browser}`,
      `🖥 <b>رزولوشن:</b> ${v.screenWidth}×${v.screenHeight} (DPR: ${v.dpr})`,
      `⚙️ <b>سخت‌افزار:</b> ${v.cores} هسته CPU | رم: ${v.ram}`,
      `🎮 <b>کارت گرافیک (GPU):</b>\n<code>${v.gpu}</code>`,
      `🔋 <b>باتری:</b> ${v.battery}`,
      `📶 <b>اینترنت:</b> ${v.network}`,
      `🕒 <b>زمان محلی:</b> ${v.localTime} (${v.timezone})`,
      `🔗 <b>ارجاع‌دهنده:</b> ${v.referrer}`,
      v.utm !== 'None' ? `🏷 <b>کمپین:</b> ${v.utm}` : '',
    ].filter(Boolean).join('\n');

    void sendTelegramMessage(msg);
  }

  trackActProgress(actIndex: number, actName: string, scrollPercent: number): void {
    const actLabel = `Act ${actIndex + 1} (${actName})`;
    this.actsVisited.add(actLabel);
    this.furthestAct = actLabel;
    if (scrollPercent > this.maxScrollPercent) {
      this.maxScrollPercent = Math.min(100, Math.round(scrollPercent));
    }
  }

  trackCardView(cardName: string): void {
    this.cardsViewed.add(cardName);
  }

  trackSoundToggle(isOn: boolean): void {
    if (isOn) this.soundToggled = true;
  }

  trackAiQuery(query: string): void {
    this.aiQueries.push(query);
    // Send immediate real-time alert about the user's question
    const alert = [
      `💬 <b>پرسش جدید از دستیار هوشمند (AI)</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>کاربر:</b> ${this.visitorInfo?.ip || 'ناشناس'} (${this.visitorInfo?.city || ''})`,
      `❓ <b>متن سؤال:</b>`,
      `<code>${query}</code>`,
    ].join('\n');
    void sendTelegramMessage(alert);
  }

  sendSummaryReport(): void {
    const dwellSeconds = Math.round((Date.now() - this.startTime) / 1000);
    if (dwellSeconds < 2) return; // Ignore accidental bounces under 2s

    this.summarySent = true;
    const minutes = Math.floor(dwellSeconds / 60);
    const seconds = dwellSeconds % 60;
    const dwellStr = minutes > 0 ? `${minutes} دقیقه و ${seconds} ثانیه` : `${seconds} ثانیه`;

    const v = this.visitorInfo;
    const cardsList = this.cardsViewed.size > 0 ? Array.from(this.cardsViewed).join(', ') : 'هیچ کارتی کلیک نشد';
    const actsList = Array.from(this.actsVisited).join(' ➔ ');

    const msg = [
      `📊 <b>گزارش پایان فعالیت و خروج کاربر</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🌐 <b>آی‌پی:</b> <code>${v?.ip || 'ناشناس'}</code> (${v?.city || ''}, ${v?.country || ''})`,
      `⏱ <b>مدت حضور:</b> ${dwellStr} (${dwellSeconds} ثانیه)`,
      `📜 <b>میزان پیمایش اسکرول:</b> ${this.maxScrollPercent}%`,
      `🏁 <b>آخرین بخش بازدیدشده:</b> ${this.furthestAct}`,
      `🗺 <b>مسیر حرکت در بخش‌ها:</b>\n${actsList}`,
      `🃏 <b>کارت‌های بررسی‌شده:</b>\n${cardsList}`,
      `🔊 <b>پخش موسیقی/صدا:</b> ${this.soundToggled ? 'بله 🎵' : 'خیر 🔇'}`,
      this.aiQueries.length > 0 ? `🤖 <b>سؤالات از هوش مصنوعی (${this.aiQueries.length}):</b>\n${this.aiQueries.map(q => `• ${q}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    void sendTelegramMessage(msg);
  }
}

export const analytics = new AnalyticsTracker();
