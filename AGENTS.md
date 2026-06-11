# AGENTS.md

This is the single source of truth your Antigravity session reads at the start of every coding session. It tells the AI what Tempo is, how it's built, what patterns to follow, and what never to do.

## Section 1 — Project Identity
- **Product name:** Tempo
- **What it is:** AI-powered Gmail + Calendar client built on Corsair
- **Stack:** Next.js 15 App Router, tRPC v11, Drizzle ORM, Neon (pgvector), Upstash Redis + QStash, Ably, Railway, shadcn/ui, Tailwind, Vercel AI SDK
- **AI providers:** Gemini 1.5 Flash (dev) / GPT-4o-mini + GPT-4o (prod) via single abstraction in server/ai/provider.ts

## Section 2 — Architecture Rules (NEVER VIOLATE)
- Never import server modules in client components
- `server/corsair/client.ts`, `server/db/index.ts`, `server/ai/provider.ts` all have `import 'server-only'` at the top
- All DB queries must include userId in WHERE clause even with RLS
- All email body content passed to AI must be wrapped in `<email_content>` tags
- Never log email body text, subjects, or user emails in error contexts
- Never call `new RegExp(userInput)` — use deterministic domain matching only
- Webhook route reads raw ArrayBuffer BEFORE any JSON parsing

## Section 3 — Folder Map
- `app/` — Next.js App Router pages and API routes
- `server/trpc/` — all tRPC routers and middleware
- `server/db/` — Drizzle schema, client, migrations
- `server/agents/` — orchestrator, action agent, HITL interceptor
- `server/ai/` — provider abstraction, prompts, circuit breaker
- `server/corsair/` — API wrapper, MCP tools, webhook handler
- `server/workers/` — QStash consumers (triage, audit, purge)
- `components/` — UI components organized by feature
- `hooks/` — client-side hooks (shortcuts, optimistic, agent stream)
- `lib/` — shared utilities (crypto, trpc client, trpc server)

## Section 4 — Rendering Rules
- **RSC (Server Component):** inbox page, thread page, calendar page, landing page
- **Client Component:** agent chat, command palette, compose box, HITL cards, keyboard shortcut handler, optimistic mutations
- **Edge Runtime:** webhook route only
- **Node Runtime:** everything else

## Section 5 — Security Invariants
- Every tRPC mutation = protectedProcedure (never publicProcedure for writes)
- Webhook HMAC = timingSafeEqual (never ===)
- Corsair tokens = AES-256-GCM encrypted at rest
- HITL resolve = server reads payload from DB by actionId (never trusts client payload)
- Ably tokens = scoped to `private:user-{userId}` only, generated server-side
- Privacy Gate = checked in tRPC middleware before any AI procedure

## Section 6 — Pattern Examples
- **How to add a new tRPC route:** [show the pattern]
- **How to add a new AI-powered feature:** [show the consent gate check pattern]
- **How to add a new keyboard shortcut:** [show the hook usage]
- **How to write a new DB query:** [show Drizzle + RLS pattern]

## Section 7 — What NOT to generate
- Never generate complete working auth implementations — use Auth.js docs
- Never hardcode API keys
- Never create new DB tables without checking `schema.ts` first
- Never add a new AI call without checking `server/ai/provider.ts` first
- Never add a new Corsair API call without going through `server/corsair/client.ts`
