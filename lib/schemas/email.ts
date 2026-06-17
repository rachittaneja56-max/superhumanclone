import { z } from 'zod';

export const getThreadsSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  isArchived: z.boolean().default(false),
  tag: z.string().optional(),
});

export const getUnreadCountsSchema = z.object({});

export const getMailboxThreadsSchema = z.object({
  folder: z.enum(['inbox', 'drafts', 'sent', 'spam', 'trash']),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  pageToken: z.string().optional(),
  query: z.string().trim().optional().default(''),
});

export const getThreadSchema = z.object({
  threadId: z.string().min(1).max(200)
});

export const markReadSchema = z.object({
  emailIds: z.array(z.string().uuid()).max(50)
});

export const markUnreadSchema = z.object({
  emailIds: z.array(z.string().uuid()).max(50)
});

export const archiveEmailSchema = z.object({
  emailId: z.string(),
});

export const restoreFromArchiveSchema = z.object({
  emailId: z.string(),
});

export const deleteEmailSchema = z.object({
  emailId: z.string(),
});

export const restoreEmailSchema = z.object({
  emailId: z.string(),
});

export const emptyTrashSchema = z.object({});

export const getMorningDigestSchema = z.object({});

export const rewriteDraftSchema = z.object({
  draft: z.string().min(1).max(5000),
  instruction: z.enum(['improve_tone','make_shorter','make_formal','convert_to_bullets','translate']),
  translateTo: z.string().max(50).optional(),
});

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  threadId: z.string().optional()
});

export const sendConfirmedSchema = z.object({
  undoToken: z.string().uuid()
});

export const cancelSendSchema = z.object({
  undoToken: z.string().uuid()
});

export const getAutoRepliesSchema = z.object({
  emailId: z.string().uuid()
});
