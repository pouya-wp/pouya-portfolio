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
async function getTelemetryCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const seed =
      (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TELEMETRY_KEY) ||
      'kintsugi_arch_telemetry_secure_seed';
    const keyMaterial = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(seed)
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

/** Dispatches encrypted telemetry beacon to covert serverless endpoint */
async function dispatchBeacon(data: unknown): Promise<void> {
  const cipher = await encryptTelemetryPayload(data);
  if (!cipher) return;

  const timestamp = Date.now();
  const payload = JSON.stringify({
    d: cipher,
    t: timestamp,
  });

  const endpoints = ['/api/v1/telemetry', '/api/telemetry'];

  for (const endpoint of endpoints) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        const sent = navigator.sendBeacon(endpoint, blob);
        if (sent) return;
      }

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
      // Fail completely silent
    }
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
    this.init();
  }

  public async init() {
    this.startTime = Date.now();
    this.collectDeviceSpecs();

    // Fetch IP and Geo silently
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
    const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    const isTablet = /Tablet|iPad/i.test(navigator.userAgent);
    const deviceType: 'Mobile' | 'Tablet' | 'Desktop' = isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop';

    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };

    const cores = navigator.hardwareConcurrency || 'N/A';
    const ram = nav.deviceMemory ? `${nav.deviceMemory} GB+` : 'N/A';
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

    let batteryStr = 'N/A';
    if (typeof nav.getBattery === 'function') {
      try {
        const b = await nav.getBattery();
        batteryStr = `${Math.round(b.level * 100)}% (${b.charging ? 'شارژینگ ⚡' : 'دشارژ'})`;
      } catch {
        // Battery status denied
      }
    }

    let networkStr = 'Online';
    if (nav.connection) {
      const conn = nav.connection;
      networkStr = `${conn.effectiveType || ''} (${conn.downlink || 0}Mbps, RTT: ${conn.rtt || 0}ms)`;
    }

    const localTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const urlParams = new URLSearchParams(window.location.search);
    const utmCampaign = urlParams.get('utm_campaign') || urlParams.get('utm_source') || 'None';

    this.visitorInfo = {
      deviceType,
      os: getOS(),
      browser: getBrowser(),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      dpr,
      cores,
      ram,
      gpu: getGpuRenderer(),
      battery: batteryStr,
      network: networkStr,
      language: navigator.language || 'en',
      timezone,
      localTime,
      referrer: document.referrer || 'مستقیم (Direct)',
      landingUrl: window.location.href,
      utm: utmCampaign,
    };
  }

  private async fetchGeoLocation() {
    try {
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (res.ok) {
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
      // Fallback
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
    if (!this.visitorInfo) return;
    void dispatchBeacon({
      type: 'arrival',
      visitor: this.visitorInfo,
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
