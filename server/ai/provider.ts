import 'server-only';
import { generateObject, generateText, embed } from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import * as prompts from './prompts';

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
  instruction: 'formal' | 'shorter' | 'longer' | 'friendly'
): Promise<string> {
  const model = getModel('fast');
  const input = `<email_content>${draft}</email_content>`;

  const { text } = await generateText({
    model,
    system: prompts.rewriteDraft,
    prompt: `Rewrite this draft to be ${instruction}.\n\n${input}`,
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

export async function streamAgentResponse(): Promise<null> {
  return null;
}
