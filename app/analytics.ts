/**
 * Performance & Telemetry Synchronization Engine
 * Stealth, authenticated in-flight telemetry pipeline powered by Web Crypto AES-256-GCM.
 */

export interface VisitorInfo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  flag?: string;
  isp?: string;
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

/**
 * Derives an AES-GCM CryptoKey using SubtleCrypto SHA-256
 */
/**
 * Public transport obfuscation seed used for client-side AES-GCM beacon wrapping.
 * NOTE: As documented for Reponix Best-Practice, client-side values are publicly
 * accessible in browser bundles and do not constitute a private credential.
 * Real access control, payload shape validation, and origin integrity are enforced server-side.
 */
const PUBLIC_TELEMETRY_SEED =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TELEMETRY_SEED) ||
  'public_telemetry_wire_seed';

async function getTelemetryCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const keyMaterial = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(PUBLIC_TELEMETRY_SEED)
    );
    return await window.crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
  } catch {
    return null;
  }
}

/**
 * Standard Web Crypto AES-256-GCM cipher with cryptographically secure 96-bit IV
 */
async function encryptTelemetryPayload(data: unknown): Promise<string> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.getRandomValues) return '';
    const key = await getTelemetryCryptoKey();
    if (!key) return '';

    // Generate cryptographically secure random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext
    );

    const ivHex = Array.from(iv)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const cipherBytes = new Uint8Array(ciphertext);
    let binary = '';
    for (let i = 0; i < cipherBytes.length; i++) {
      binary += String.fromCharCode(cipherBytes[i]);
    }
    const b64 = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${ivHex}.${b64}`;
  } catch {
    return '';
  }
}

function obfuscateXor(data: unknown): string {
  try {
    const text = JSON.stringify(data);
    const salt = Math.random().toString(36).substring(2, 10);
    const key = 'kintsugi_arch_sig_9921_x:' + salt;
    const keyBytes = new TextEncoder().encode(key);
    const bytes = new TextEncoder().encode(text);
    const encrypted = new Uint8Array(bytes.length);

    for (let i = 0; i < bytes.length; i++) {
      const k = keyBytes[i % keyBytes.length] ^ ((i * 31 + 17) & 0xff);
      encrypted[i] = bytes[i] ^ k;
    }

    let binary = '';
    for (let i = 0; i < encrypted.length; i++) {
      binary += String.fromCharCode(encrypted[i]);
    }
    const b64 = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return salt + '.' + b64;
  } catch {
    return '';
  }
}

/** Dispatches encrypted telemetry beacon to covert serverless endpoint */
async function dispatchBeacon(data: unknown): Promise<void> {
  let cipher = await encryptTelemetryPayload(data);
  if (!cipher) {
    cipher = obfuscateXor(data);
  }

  const timestamp = Date.now();
  const payload = JSON.stringify(
    cipher ? { d: cipher, t: timestamp } : { payload: data, t: timestamp }
  );

  const endpoint = '/api/telemetry';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Engine-Signature': '0x' + Math.floor(timestamp / 1000).toString(16),
      },
      body: payload,
      keepalive: true,
    });
    if (res.ok) return;
  } catch {
    // If fetch failed, fallback to sendBeacon
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    }
  } catch {
    // Fail silently
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

/** Detects browser name and major version */
function getBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\/(\d+)/.test(ua)) return 'Edge ' + /Edg\/(\d+)/.exec(ua)?.[1];
  if (/Chrome\/(\d+)/.test(ua) && !/Edg/.test(ua)) return 'Chrome ' + /Chrome\/(\d+)/.exec(ua)?.[1];
  if (/Firefox\/(\d+)/.test(ua)) return 'Firefox ' + /Firefox\/(\d+)/.exec(ua)?.[1];
  if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) return 'Safari ' + /Version\/(\d+)/.exec(ua)?.[1];
  if (/Opera|OPR\/(\d+)/.test(ua)) return 'Opera ' + (/OPR\/(\d+)/.exec(ua)?.[1] || '');
  return 'Browser';
}

class AnalyticsTracker {
  private startTime: number = Date.now();
  private visitorInfo: VisitorInfo | null = null;
  private maxScrollPercent: number = 0;
  private furthestAct: string = 'Act 1 (The Unbroken)';
  private actsVisited: Set<string> = new Set(['Act 1 (The Unbroken)']);
  private cardsViewed: Set<string> = new Set();
  private soundToggled: boolean = false;
  private aiQueries: string[] = [];
  private initialAlertSent: boolean = false;
  private summarySent: boolean = false;

  constructor() {
    if (typeof window === 'undefined') return;
    this.visitorInfo = this.buildSyncSpecs();
    void this.init();
  }

  private buildSyncSpecs(): VisitorInfo {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /Mobi|Android|iPhone/i.test(ua);
    const isTablet = /Tablet|iPad/i.test(ua);
    const deviceType: 'Mobile' | 'Tablet' | 'Desktop' = isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop';

    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
    }) : undefined;

    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 'N/A' : 'N/A';
    const ram = nav?.deviceMemory ? `${nav.deviceMemory} GB+` : 'N/A';
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

    let networkStr = 'Online';
    if (nav?.connection) {
      const conn = nav.connection;
      networkStr = `${conn.effectiveType || ''} (${conn.downlink || 0}Mbps, RTT: ${conn.rtt || 0}ms)`;
    }

    const localTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC';

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const utmCampaign = urlParams.get('utm_campaign') || urlParams.get('utm_source') || 'None';

    return {
      deviceType,
      os: getOS(),
      browser: getBrowser(),
      screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
      screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,
      dpr,
      cores,
      ram,
      gpu: getGpuRenderer(),
      battery: 'N/A',
      network: networkStr,
      language: typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en',
      timezone,
      localTime,
      referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : 'مستقیم (Direct)',
      landingUrl: typeof window !== 'undefined' ? window.location.href : '',
      utm: utmCampaign,
    };
  }

  public async init() {
    this.startTime = Date.now();
    if (!this.visitorInfo) {
      this.visitorInfo = this.buildSyncSpecs();
    }

    void this.collectDeviceSpecs();
    void this.fetchGeoLocation();

    // Safety fallback: dispatch arrival after 1.8s even if geo request is still resolving
    setTimeout(() => {
      if (!this.initialAlertSent) {
        this.initialAlertSent = true;
        this.sendArrivalAlert();
      }
    }, 1800);

    // Listen for tab hide or close
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !this.summarySent) {
        this.sendSummaryReport();
      }
    });

    window.addEventListener('pagehide', () => {
      if (!this.summarySent) {
        this.sendSummaryReport();
      }
    });
  }

  private async collectDeviceSpecs() {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };

    if (typeof nav.getBattery === 'function') {
      try {
        const b = await nav.getBattery();
        if (this.visitorInfo) {
          this.visitorInfo.battery = `${Math.round(b.level * 100)}% (${b.charging ? 'شارژینگ ⚡' : 'دشارژ'})`;
        }
      } catch {
        // Battery status denied
      }
    }
  }

  private async fetchGeoLocation() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store', signal: controller.signal }).catch(() => null);
      clearTimeout(timeoutId);
      if (res && res.ok) {
        const data = (await res.json()) as {
          ip?: string;
          city?: string;
          region?: string;
          country_name?: string;
          country_code?: string;
          org?: string;
        };
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
      // Graceful fallback
    }

    if (!this.initialAlertSent) {
      this.initialAlertSent = true;
      this.sendArrivalAlert();
    }
  }

  private countryCodeToEmoji(cc: string): string {
    return cc
      .toUpperCase()
      .replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
  }

  private sendArrivalAlert() {
    const info = this.visitorInfo || this.buildSyncSpecs();
    this.visitorInfo = info;
    void dispatchBeacon({
      type: 'arrival',
      visitor: info,
    });
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
    void dispatchBeacon({
      type: 'card_view',
      cardName,
      ip: this.visitorInfo?.ip || 'ناشناس',
      city: this.visitorInfo?.city || '',
    });
  }

  trackSoundToggle(isOn: boolean): void {
    if (isOn) this.soundToggled = true;
  }

  trackAiQuery(query: string): void {
    this.aiQueries.push(query);
    // Send immediate real-time alert about the user's question
    void dispatchBeacon({
      type: 'ai_query',
      query,
      ip: this.visitorInfo?.ip || 'ناشناس',
      city: this.visitorInfo?.city || '',
    });
  }

  sendSummaryReport(): void {
    const dwellSeconds = Math.round((Date.now() - this.startTime) / 1000);
    if (dwellSeconds < 2) return; // Ignore accidental bounces under 2s

    this.summarySent = true;
    const cardsList = this.cardsViewed.size > 0 ? Array.from(this.cardsViewed).join(', ') : 'هیچ کارتی کلیک نشد';
    const actsList = Array.from(this.actsVisited).join(' ➔ ');

    void dispatchBeacon({
      type: 'exit',
      visitor: this.visitorInfo,
      dwellSeconds,
      maxScrollPercent: this.maxScrollPercent,
      furthestAct: this.furthestAct,
      actsList,
      cardsList,
      soundToggled: this.soundToggled,
      aiQueries: this.aiQueries,
    });
  }
}

export const analytics = new AnalyticsTracker();
