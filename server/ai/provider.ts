import 'server-only';
import { generateObject, generateText, embed } from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import * as prompts from './prompts';
import { createCorsairMCPClient, sendEmail, createCalendarEvent } from '../corsair/client';
import { db } from '../db';
import { emails } from '../db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { streamText, tool } from 'ai';

console.log('[AI] Provider:', process.env.NODE_ENV === 'development' ? 'Gemini' : 'OpenAI');

function getModel(capability: 'fast' | 'smart') {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    return capability === 'fast'
      ? google('gemini-1.5-flash')
      : google('gemini-1.5-pro');
  } else {
    return capability === 'fast'
      ? openai('gpt-4o-mini')
      : openai('gpt-4o');
  }
}

export async function classifyEmail(
  subject: string,
  snippet: string
): Promise<{ tag: 'work' | 'personal' | 'finance' | 'travel' | 'newsletter' | 'update' | 'social' | 'other'; priority: 'low' | 'medium' | 'high' | 'urgent'; confidence: number }> {
  const model = getModel('fast');
  const input = `<email_content>Subject: ${subject}\nSnippet: ${snippet}</email_content>`;

  const { object } = await generateObject({
    model,
    system: prompts.emailClassifier,
    prompt: input,
    schema: z.object({
      tag: z.enum(['work', 'personal', 'finance', 'travel', 'newsletter', 'update', 'social', 'other']),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
      confidence: z.number(),
    }),
  });

  return object;
}

export async function generateTLDR(subject: string, bodyText: string): Promise<string> {
  const model = getModel('fast');
  const slicedText = bodyText.slice(0, 3000);
  const input = `<email_content>${slicedText}</email_content>`;

  const { text } = await generateText({
    model,
    system: prompts.tldrGenerator,
    prompt: input,
    maxOutputTokens: 80,
  });

  return text;
}

export async function generateAutoReplies(
  subject: string,
  bodyText: string
): Promise<{ direct: string; warm: string; boundary: string }> {
  const model = getModel('fast');
  const slicedText = bodyText.slice(0, 2000);
  const input = `<email_content>${slicedText}</email_content>`;

  const { object } = await generateObject({
    model,
    system: prompts.autoReplyGenerator,
    prompt: input,
    schema: z.object({
      direct: z.string(),
      warm: z.string(),
      boundary: z.string(),
    }),
  });

  return object;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const isDev = process.env.NODE_ENV === 'development';
  let embeddingModel;

  if (isDev) {
    embeddingModel = google.textEmbeddingModel('text-embedding-004');
  } else {
    embeddingModel = openai.embedding('text-embedding-3-small');
  }

  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    ...(!isDev ? {
      providerOptions: {
        openai: {
          dimensions: 768,
        },
      },
    } : {}),
  });

  if (embedding.length !== 768) {
    throw new Error('Embedding dimension mismatch');
  }

  return embedding;
}

export async function generateDigest(
  emails: { from: string; subject: string; snippet: string; priority: string }[],
  events: { title: string; startTime: Date; endTime: Date; location: string | null }[]
): Promise<string> {
  const model = getModel('smart');

  const emailList = emails
    .map((e) => `- [${e.priority.toUpperCase()}] From: ${e.from}, Subject: ${e.subject}\n  Snippet: ${e.snippet}`)
    .join('\n');

  const eventList = events
    .map(
      (e) =>
        `- ${e.title} (${e.startTime.toLocaleTimeString()} - ${e.endTime.toLocaleTimeString()}) ${
          e.location ? `@ ${e.location}` : ''
        }`
    )
    .join('\n');

  const prompt = `Here are the unread emails and events for today. Provide a concise morning digest.

<email_content>
Emails:
${emailList}
</email_content>

Events:
${eventList}`;

  const { text } = await generateText({
    model,
    system: prompts.morningDigest,
    prompt,
  });

  return text;
}

export async function rewriteDraft(
  draft: string,
  instruction: 'improve_tone' | 'make_shorter' | 'make_formal' | 'convert_to_bullets' | 'translate',
  translateTo?: string
): Promise<string> {
  const model = getModel('fast');
  const input = `<email_content>${draft}</email_content>`;

  let promptInstruction = instruction.replace(/_/g, ' ');
  if (instruction === 'translate' && translateTo) {
    promptInstruction = `translate to ${translateTo}`;
  }

  const { text } = await generateText({
    model,
    system: prompts.rewriteDraft,
    prompt: `Rewrite this draft to satisfy this instruction: ${promptInstruction}.\n\n${input}`,
    maxOutputTokens: 1000,
  });

  return text;
}

export async function smartFillFromThread(content: string): Promise<{
  suggestedTitle: string;
  suggestedTime: string;
  suggestedDuration: number;
  confidence: number;
}> {
  const model = getModel('fast');
  const input = `<email_content>${content}</email_content>`;

  const { object } = await generateObject({
    model,
    system: prompts.calendarSmartFill,
    prompt: input,
    schema: z.object({
      suggestedTitle: z.string(),
      suggestedTime: z.string(),
      suggestedDuration: z.number(),
      confidence: z.number(),
    }),
  });

  return object;
}

export async function generateContactSummary(snippets: string[]): Promise<string> {
  const model = getModel('fast');
  const content = snippets.join('\n');
  const input = `<email_content>${content}</email_content>`;

  const { text } = await generateText({
    model,
    system: prompts.contactRelationship,
    prompt: input,
    maxOutputTokens: 60,
  });

  return text;
}

async function vectorSearchInternal(userId: string, query: string) {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = JSON.stringify(queryEmbedding);

  return db.query.emails.findMany({
    where: and(
      eq(emails.userId, userId),
      eq(emails.is_archived, false),
      eq(emails.is_deleted, false),
      isNotNull(emails.embedding)
    ),
    extras: {
      similarity: sql<number>`1 - (${emails.embedding} <=> ${embeddingStr})`.as('similarity'),
    },
    orderBy: sql`${emails.embedding} <=> ${embeddingStr} ASC`,
    limit: 10,
  });
}

export async function streamAgentResponse(
  userId: string,
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  hitlInterceptor: (action: any) => Promise<boolean>
) {
  // Create Corsair MCP client for this tenant
  const mcpClient = await createCorsairMCPClient(userId);

  // CRITICAL from docs: await tools() before streamText
  const corsairTools = await mcpClient.tools();

  // Build our custom tools that wrap HITL
  const aethraTools: any = {
    searchEmails: tool({
      description: 'Search emails semantically using local search',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }: { query: string }) => {
        // Use our pgvector search — NOT Corsair for search
        // Filters out ai_triage_skipped emails (Privacy Gate respected)
        const results = await vectorSearchInternal(userId, query);
        return results
          .filter(e => !e.ai_triage_skipped)
          .map(e => ({
            id: e.id,
            subject: e.subject,
            from: e.from_name || e.from_address,
            // Wrap in XML tags — prompt injection defense
            snippet: '<email_content>' + e.snippet + '</email_content>',
          }));
      },
    } as any),
    sendEmail: tool({
      description: 'Send an email. ALWAYS requires user approval first.',
      parameters: z.object({
        to: z.array(z.string().email()),
        subject: z.string(),
        body: z.string(),
      }),
      execute: async (params: { to: string[], subject: string, body: string }) => {
        // HITL intercept — agent parks here until approved/rejected
        const approved = await hitlInterceptor({
          actionType: 'send_email',
          payload: { to: params.to, subject: params.subject },
          // body NOT in payload sent to client — privacy
          humanReadable: `Send to ${params.to.join(', ')}: "${params.subject}"`,
        });
        if (!approved) return { status: 'cancelled by user' };
        const result = await sendEmail(userId, params);
        if (result.needsConnect) return { error: 'Gmail not connected' };
        return { status: 'sent' };
      },
    } as any),
    createCalendarEvent: tool({
      description: 'Create a calendar event. Requires user approval.',
      parameters: z.object({
        title: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        attendees: z.array(z.string().email()),
      }),
      execute: async (params: { title: string, startTime: string, endTime: string, attendees: string[] }) => {
        const approved = await hitlInterceptor({
          actionType: 'create_event',
          payload: params,
          humanReadable: `Create "${params.title}" on ${params.startTime}`,
        });
        if (!approved) return { status: 'cancelled by user' };
        const result = await createCalendarEvent(userId, params);
        if (result.needsConnect) return { error: 'Calendar not connected' };
        return { status: 'created' };
      },
    } as any),
  };


  const result = streamText({
    model: getModel('smart'),
    system: prompts.agentSystem,
    messages: messages as any, // Cast messages for type matching
    // Combine our HITL tools with Corsair's MCP tools
    tools: { ...aethraTools, ...(corsairTools as any) },
  });

  // ALWAYS close MCP client after use (from Corsair docs warning)
  Promise.resolve(result.text).catch(() => {}).finally(() => mcpClient.close?.());

  return result;
}
