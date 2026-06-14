import 'server-only';
import { db } from '../db';
import { agentSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { streamAgentResponse } from '../ai/provider';
import { hitlInterceptor } from './action-agent';
import { redis } from '../redis';

export async function runAgentTurn(
  userId: string,
  sessionId: string,
  userMessage: string,
  onChunk: (chunk: string) => void
) {
  // 1. Rate limit: 50 messages/hour per userId
  const dateStr = new Date().toISOString().slice(0, 13); // YYYY-MM-DD-HH
  const rateLimitKey = `agentmsg:${userId}:${dateStr}`;
  const count = await redis.incr(rateLimitKey);
  if (count === 1) {
    await redis.expire(rateLimitKey, 3600); // expire in 1 hour
  }
  if (count > 50) {
    onChunk("Rate limit exceeded. You can only send 50 messages per hour.");
    return;
  }

  // 2. Load session from agent_sessions table
  let session = await db.query.agentSessions.findFirst({
    where: eq(agentSessions.id, sessionId),
  });

  if (!session) {
    const [newSession] = await db.insert(agentSessions).values({
      id: sessionId,
      userId,
      history: [],
    }).returning();
    session = newSession;
  }

  if (session.userId !== userId) {
    throw new Error('Unauthorized access to session');
  }

  const history = Array.isArray(session.history) ? session.history : [];
  // Keep last 20 messages to prevent context overflow
  const recentHistory = history.slice(-20) as { role: 'user' | 'assistant'; content: string }[];
  
  const messages = [...recentHistory, { role: 'user' as const, content: userMessage }];

  // 3. Build curried hitlInterceptor with proper typing
  const hitlInterceptorForSession = (action: { actionType: string; payload: Record<string, unknown>; humanReadable: string }) =>
    hitlInterceptor(userId, sessionId, action);

  // 4. Call streamAgentResponse
  const result = await streamAgentResponse(userId, messages, hitlInterceptorForSession);
  
  // 5. Stream chunks
  let fullResponse = '';
  
  // The Vercel AI SDK textStream is an AsyncIterable
  for await (const chunk of result.textStream) {
    fullResponse += chunk;
    onChunk(chunk);
  }

  // Wait for the tool calls to finish and capture any tool results if needed
  // But generally appending the raw response text is what was asked
  const newHistory = [
    ...messages,
    { role: 'assistant' as const, content: fullResponse }
  ];

  // 6. Update agent_sessions
  await db.update(agentSessions)
    .set({
      history: newHistory,
      updated_at: new Date()
    })
    .where(eq(agentSessions.id, sessionId));
}
