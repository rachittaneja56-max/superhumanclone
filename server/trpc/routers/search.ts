import { z } from 'zod';
import { router, protectedProcedure, createRateLimitMiddleware } from '../trpc';
import { emails } from '../../db/schema';
import { eq, and, ilike, or, isNotNull, sql, desc } from 'drizzle-orm';
import { generateEmbedding } from '../../ai/provider';

const vectorSearchLimit = createRateLimitMiddleware('search:vector', 60, 60);
const textSearchLimit = createRateLimitMiddleware('search:text', 200, 60);
const searchContactsLimit = createRateLimitMiddleware('search:contacts', 100, 60);

import { vectorSearchSchema, textSearchSchema, searchContactsSchema } from '@/lib/schemas';

export const searchRouter = router({
  vectorSearch: protectedProcedure
    .use(vectorSearchLimit)
    .input(vectorSearchSchema)
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;
      
      // 1. Fallback condition
      if (query.length < 3 || /[^a-zA-Z0-9\s@._-]/.test(query)) {
        return ctx.db.query.emails.findMany({
          where: and(
            eq(emails.userId, ctx.userId!),
            eq(emails.is_deleted, false),
            or(
              ilike(emails.subject, `%${query}%`),
              ilike(emails.from_name, `%${query}%`)
            )
          ),
          limit
        });
      }

      // 2. generateEmbedding
      const queryEmbedding = await generateEmbedding(query, { userId: ctx.userId! });

      // 3. Drizzle cosine distance query
      // ORDER BY cosine distance ASC
      const embeddingStr = JSON.stringify(queryEmbedding);

      // We use SQL template literals for distance
      return ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_archived, false),
          eq(emails.is_deleted, false),
          isNotNull(emails.embedding)
        ),
        extras: {
          similarity: sql<number>`1 - (${emails.embedding} <=> ${embeddingStr})`.as('similarity')
        },
        orderBy: sql`${emails.embedding} <=> ${embeddingStr} ASC`,
        limit
      });
    }),

  textSearch: protectedProcedure
    .use(textSearchLimit)
    .input(textSearchSchema)
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;
      return ctx.db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId!),
          eq(emails.is_deleted, false),
          or(
            ilike(emails.subject, `%${query}%`),
            ilike(emails.from_name, `%${query}%`),
            ilike(emails.from_address, `%${query}%`),
            ilike(emails.to_address, `%${query}%`),
            ilike(emails.snippet, `%${query}%`)
          )
        ),
        orderBy: [desc(emails.created_at)],
        limit
      });
    }),

  searchContacts: protectedProcedure
    .use(searchContactsLimit)
    .input(searchContactsSchema)
    .query(async ({ ctx, input }) => {
      const { query } = input;
      
      const results = await ctx.db
        .selectDistinctOn([emails.from_address], {
          from_address: emails.from_address,
          from_name: emails.from_name
        })
        .from(emails)
        .where(
          and(
            eq(emails.userId, ctx.userId!),
            or(
              ilike(emails.from_name, `%${query}%`),
              ilike(emails.from_address, `%${query}%`)
            )
          )
        )
        .limit(10);
      
      return results;
    })
});
