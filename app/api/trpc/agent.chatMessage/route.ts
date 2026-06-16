import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const userId = session.userId;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { message, sessionId } = body;

    if (!message || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const workerUrl = process.env.RAILWAY_WORKER_URL || 'http://localhost:8080';
    const upstream = await fetch(workerUrl + '/agent/chat', {
      method: 'POST',
      headers: {
        'X-Worker-Secret': process.env.WORKER_SECRET || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionId,
        message,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return new Response(JSON.stringify({ error: `Upstream error: ${errorText}` }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Error in agent.chatMessage custom route:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
