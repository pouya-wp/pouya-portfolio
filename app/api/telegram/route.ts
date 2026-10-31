import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { token, chatId, text } = await req.json();
    const botToken = token || '9057540574:AAE70LjodmFIi1isjDlzOQvfVdgqvMu1490';
    const targetChat = chatId || '6392891613';

    if (!botToken || !targetChat || !text) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
