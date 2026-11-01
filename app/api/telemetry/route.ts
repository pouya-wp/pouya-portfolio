import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (body) {
      const type = (body as { type?: string }).type || 'telemetry';
      console.log(`[Telemetry ${type.toUpperCase()}]`, JSON.stringify(body));
    }
    return NextResponse.json({ ok: true, status: 'synced', timestamp: Date.now() });
  } catch {
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
