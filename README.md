# Aethra

Live app: [https://aethra.rachittaneja.in/](https://aethra.rachittaneja.in/)

Railway deployment: [https://superhumanclone-production.up.railway.app/](https://superhumanclone-production.up.railway.app/)

API docs: [https://aethra.rachittaneja.in/api-docs](https://aethra.rachittaneja.in/api-docs)

OpenAPI spec: [https://aethra.rachittaneja.in/openapi.json](https://aethra.rachittaneja.in/openapi.json)

## Audit Summary

I reviewed the app structure, auth flow, inbox and calendar systems, AI and agent layers, settings, billing, admin tools, API routes, worker routes, database schema, Redis usage, webhook and realtime code, and the current Scalar docs integration.

What I found:

- Aethra is a Next.js app that combines Gmail, Calendar, AI email assistance, HITL review, admin tools, and simple billing controls.
- The app uses Clerk for sign-in and a local user record for product access and permissions.
- Gmail and Calendar integration are handled through Corsair.
- Most of the product API lives in tRPC routers under `server/trpc/routers`.
- A public OpenAPI spec now exists at `/openapi.json`, and Scalar docs are served at `/api-docs`.
- The app also has several Next.js route handlers for auth, Corsair callbacks, webhooks, worker endpoints, and docs.
- Voice input is present through a browser speech recognition hook.
- Billing is currently dummy mode only. There is no real payment provider wired in.

## What Aethra Is

Aethra is an AI-assisted Gmail and Calendar workspace. It is designed to help a user read, triage, search, draft, send, and organize email while also surfacing calendar context, meeting prep help, and admin controls for a higher-trust internal workspace.

The product is built around a few main ideas:

- Connect Gmail and Google Calendar through Corsair.
- Keep local copies of the user's mailbox and calendar data for fast product queries.
- Use AI for email triage, summarization, reply drafting, meeting prep, and search helpers.
- Protect sensitive senders and domains with privacy rules.
- Stop for human approval when an action is risky or needs confirmation.

## Core Product Capabilities

- Inbox management for threads, folders, drafts, sent mail, spam, and trash
- Calendar views and event CRUD
- AI triage for email classification, TL;DRs, embeddings, and reply suggestions
- Meeting prep briefs based on calendar and related email context
- Human-in-the-loop approval flows for sensitive agent actions
- Full-text and vector-style email search
- Contact intelligence summaries
- User settings for AI, privacy, digests, and preferences
- Dummy billing and usage limits
- Admin dashboard with user controls and system health
- Waitlist signup

## Main Screens And Modules

### Marketing

- Landing page
- Waitlist form
- Privacy page

### Auth

- Login page
- Logout page
- Legacy Google auth redirect routes

### Onboarding

- Connect Gmail and Calendar
- Configure privacy rules

### App

- Dashboard
- Inbox
- Thread detail page
- Calendar
- Search
- Settings
- Audit log
- Billing
- Agent workspace
- Admin dashboard

## Tech Stack

- Next.js 16 with App Router
- React 19
- TypeScript
- tRPC for most product APIs
- Zod for input validation
- Drizzle ORM with PostgreSQL
- Clerk for authentication
- Corsair for Gmail and Google Calendar integration
- Upstash Redis for cache, usage counters, and coordination
- QStash for delayed background work
- Ably for realtime updates
- OpenAI and Mistral through the AI provider layer
- Scalar for API documentation
- Tailwind CSS and small shared UI primitives

## Architecture Overview

Aethra uses a layered architecture:

1. Next.js pages and route handlers expose the web app and the public endpoints.
2. tRPC routers implement most authenticated product operations.
3. Server modules handle AI, auth, billing, cache, worker jobs, and Corsair integration.
4. PostgreSQL stores the product data.
5. Redis stores cache entries, rate limits, usage counters, and coordination keys.
6. QStash and worker routes handle delayed send and purge jobs.
7. Ably pushes mailbox and agent updates to the client.

The app does not use a separate monolithic backend service. The product logic lives inside the Next.js app and server modules.

## Folder Structure

Important folders in this repo:

- `app/` Next.js routes, pages, and API handlers
- `components/` UI and product screens
- `server/` database, AI, auth, billing, worker, Corsair, cache, and tRPC server code
- `lib/` shared client and server helpers, Zod schemas, OpenAPI generation, and utilities
- `hooks/` client hooks such as speech to text and Ably subscriptions
- `docs/` setup notes
- `scripts/` one-off maintenance scripts
- `tests/` Vitest tests

## Authentication

Authentication is built on Clerk.

The session helper in `lib/auth.ts` does three important things:

- Reads the Clerk session
- Resolves or creates the local Aethra user record
- Tracks whether the current session has been unlocked for admin work

After Clerk auth, the app uses a local user ID as the main product identity. That local user ID is what the tRPC context exposes to product code.

### Auth route behavior

- `/login` is the sign in entry point
- `/logout` signs the user out
- `/api/auth/google` and `/api/auth/google/callback` are legacy routes that now redirect back to login with an error state

## Gmail And Calendar Integration

Aethra uses Corsair for Gmail and Google Calendar access.

The key integration points are:

- `corsair.ts` sets up the Corsair client with Gmail and Google Calendar plugins
- `/api/corsair/connect` starts the OAuth connection flow
- `/api/corsair/callback` finishes the OAuth callback
- `/api/webhooks/corsair` receives webhook events from Corsair
- `server/corsair/*` handles URL construction, provisioning, syncing, webhook deduplication, and email mapping

### Gmail flow

- New email data is synced from Corsair into the local `emails` table
- Sent mail is queued through a delayed worker job and then persisted locally
- Drafts are stored in Redis and surfaced in the mailbox UI
- Archive, delete, restore, and read state changes are reflected in Corsair and then mirrored locally

### Calendar flow

- Calendar events are fetched from Corsair and also stored locally in `calendar_events`
- Event create, update, and delete operations go through Corsair first
- The local database is refreshed for fast reads and timeline views

## Inbox System

The inbox is one of the main product areas.

The inbox supports:

- Thread lists
- Folder views
- Thread detail views
- Drafts
- Sent mail
- Archive
- Trash
- Spam grouping
- Bulk read, archive, and delete actions
- Morning digest banners
- Auto reply suggestions
- Draft rewrite helper

### Important inbox routes and routers

- `app/(app)/inbox`
- `app/(app)/inbox/[threadId]`
- `server/trpc/routers/email.ts`

### Email data model

The `emails` table stores:

- Message and thread identifiers
- Sender and recipient fields
- Subject and snippet
- Body text and HTML
- Read, archived, and deleted state
- Triage metadata such as tag, priority, TL;DR, confidence, and embedding

## Calendar System

The calendar module supports:

- Event list and timeline views
- Create, update, delete
- Smart fill from a thread
- Meeting prep briefs

### Important calendar routes and routers

- `app/(app)/calendar`
- `app/(app)/dashboard/calendar`
- `server/trpc/routers/calendar.ts`

### Calendar data model

The `calendar_events` table stores:

- Corsair event ID
- Title and description
- Start and end timestamps
- Location
- Meeting link
- Attendee summary
- All-day flag
- Status

## AI And Agent System

Aethra has several AI-assisted features.

### AI features in the codebase

- Email classification and priority scoring
- TL;DR generation
- Auto reply suggestions
- Draft rewriting
- Morning digest generation
- Contact summary generation
- Meeting prep brief generation
- Search embedding generation
- Smart scheduling and calendar fill helpers
- Agent chat and HITL review flows

### Relevant files

- `server/ai/provider.ts`
- `server/ai/agents/*`
- `server/agents/*`
- `server/trpc/routers/agent.ts`
- `server/trpc/routers/email.ts`
- `server/trpc/routers/calendar.ts`
- `server/trpc/routers/search.ts`
- `server/trpc/routers/contacts.ts`

### How the agent layer works

The AI layer is split into smaller helpers instead of one giant agent.

- Triage agents classify messages and produce structured email metadata
- Reply agents create suggested responses
- Calendar agents help extract scheduling details and meeting prep notes
- Search agents help with search and embeddings
- The orchestrator and action helpers manage agent-side operations

## HITL

HITL means human in the loop.

This codebase uses HITL when an action is too sensitive or risky to run without confirmation.

### HITL behavior in the code

- Pending HITL records are stored in `hitl_actions`
- The agent router can fetch pending actions
- A user can approve or reject an action
- Approved actions may execute side effects before the state is finalized
- The system publishes a Redis message so the agent interceptor can resume
- Rejected actions clear private data tied to that action
- HITL actions expire if they are not resolved in time

### Relevant files

- `server/agents/hitl-state.ts`
- `server/agents/action-agent.ts`
- `server/trpc/routers/agent.ts`
- `components/agent/HITLCard.tsx`

## Privacy And AI Safety

Privacy is a major part of the app.

### What the code does

- User privacy rules are stored in `ai_consent_rules`
- Domains can be blocked from AI processing
- The triage worker skips AI work for protected senders
- The inbox and contact summary features avoid blocked domains
- Settings include privacy setup before some AI features are enabled
- Several server paths sanitize payloads before logging

### Important safety details

- Sensitive provider metadata is not meant for user-facing docs or responses
- Agent actions can require HITL approval
- Voice input stays in the browser and depends on browser support and microphone permission

## Search

Search exists in two forms:

- Text search
- Embedding-based vector search fallback

### Search behavior

- Text search queries the local `emails` table
- Vector search uses generated embeddings when the query is long enough and safe enough for that path
- Contact search reuses email sender data

### Relevant files

- `server/trpc/routers/search.ts`
- `lib/schemas/search.ts`
- `lib/email-client.ts`

## Billing

Billing is present, but it is dummy mode only in this codebase.

### What billing currently does

- Shows plan information
- Shows AI and triage usage counts
- Exposes a simulated plan change action for dummy mode
- Reads plan limits from `server/billing/plans.ts`

### Current plan configuration

- Free plan has limited AI and triage usage
- Pro plan has unlimited AI and triage usage
- Team plan is defined, but there is no real payment integration in the codebase

### Relevant files

- `server/trpc/routers/billing.ts`
- `server/billing/plans.ts`
- `server/billing/usage.ts`
- `components/billing/BillingClient.tsx`

## Admin

Admin tooling exists and is intentionally separate from normal user flows.

### Admin capabilities

- Unlock the admin dashboard with an access ID and password
- View a dashboard of users, usage, health, prompt metadata, and audit logs
- Change user plans
- Flag users
- Disable or enable AI access
- Reset usage counters
- Promote or demote users by email, if the current admin is a superadmin

### Security notes

- Admin access requires a special unlock step for the current session
- Role changes are restricted to superadmin flows
- The code checks for admin state before exposing admin operations

### Relevant files

- `server/trpc/routers/admin.ts`
- `server/admin/access.ts`
- `server/admin/access-utils.ts`
- `server/admin/credentials.ts`
- `components/admin/AdminDashboardClient.tsx`
- `components/admin/AdminUnlockClient.tsx`

## Voice Input

Voice input is present.

The hook `hooks/useSpeechToText.ts` uses browser speech recognition when supported.

### Notes

- It needs microphone permission
- It falls back gracefully when the browser does not support speech recognition
- This is browser based voice input, not a server side speech pipeline

## Webhooks And Realtime

### Corsair webhook

- `POST /api/webhooks/corsair`
- Receives synced Gmail and Calendar events from Corsair
- Uses idempotency protection for repeated events

### Realtime updates

- Ably is used for private channel updates
- The app publishes mailbox refresh, email triage, and send events
- The client subscribes through hooks like `hooks/useAblyChannel.ts`

### Worker routes

- `POST /workers/send`
- `POST /workers/purge`
- `POST /workers/triage`

These routes are used by delayed jobs and background processing.

## API Docs

Aethra now includes Scalar API docs.

### Routes

- Docs UI: [https://aethra.rachittaneja.in/api-docs](https://aethra.rachittaneja.in/api-docs)
- OpenAPI spec: [https://aethra.rachittaneja.in/openapi.json](https://aethra.rachittaneja.in/openapi.json)

### How to use them locally

When the app runs locally:

- API docs are available at `/api-docs`
- The OpenAPI spec is available at `/openapi.json`

The docs are generated from `lib/openapi.ts` and served through the Scalar Next.js integration.

## Database

The app uses PostgreSQL with Drizzle.

### Main tables

- `users`
- `user_settings`
- `ai_consent_rules`
- `emails`
- `calendar_events`
- `auto_reply_drafts`
- `hitl_actions`
- `agent_sessions`
- `contact_intelligence`
- `audit_logs`
- `waitlist_emails`
- Corsair integration tables

### Migrations

Database migrations live under:

- `server/db/migrations`

There are also migration helper scripts in `scripts/`.

### Worker database access

Worker routes use `server/db/worker-index.ts`, which expects `DATABASE_URL_UNPOOLED`.

## Redis

Redis is used for a few different jobs:

- Cache entries for mailbox, calendar, settings, and contact intelligence
- Rate limiting
- Usage counters
- Draft storage
- Undo send support
- HITL coordination
- Consent version tracking
- Temporary job IDs

### Relevant files

- `server/redis.ts`
- `server/cache.ts`
- `server/billing/usage.ts`
- `server/trpc/trpc.ts`
- `server/workers/*`

## Background Jobs

The app uses background work for delayed or heavier tasks.

### Send job

- Queued with QStash
- Runs through `/workers/send`
- Uses `WORKER_SECRET`
- Waits for the undo window before sending email

### Purge job

- Runs through `/workers/purge`
- Permanently deletes emails later after trashing

### Triage job

- Runs through `/workers/triage`
- Performs AI classification, summaries, embeddings, and reply suggestions

## Environment Variables

The recommended local values are documented in `.env.example` and `docs/environment.md`.

### App and URLs

- `NEXT_PUBLIC_APP_URL`
- `AUTH_URL`
- `RAILWAY_WORKER_URL`

### Clerk auth

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`

### Database

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`

### Encryption and app secrets

- `ENCRYPTION_KEY`

### Google and Corsair

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_PUBSUB_TOPIC`
- `CORSAIR_KEK`

### Redis, queue, and realtime

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_TOKEN`
- `ABLY_API_KEY`
- `WORKER_SECRET`

### AI

- `AI_PRIMARY_PROVIDER`
- `AI_FALLBACK_PROVIDER`
- `OPENAI_API_KEY`
- `MISTRAL_API_KEY`
- `AI_FAST_MODEL`
- `AI_SMART_MODEL`
- `AI_DAILY_TOKEN_LIMIT`

### Billing

- `BILLING_MODE`

## Local Development

### Prerequisites

- Node.js 20.x
- npm
- PostgreSQL
- Redis
- Clerk project
- Google OAuth credentials
- Corsair KEK

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example`

3. Fill in the required environment variables

4. Run the app:

```bash
npm run dev
```

### Useful commands

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

## Deployment Notes

- The live app is deployed at [https://aethra.rachittaneja.in/](https://aethra.rachittaneja.in/)
- The Railway deployment URL is [https://superhumanclone-production.up.railway.app/](https://superhumanclone-production.up.railway.app/)
- The Next.js app and the worker routes are both part of this repo
- The worker routes expect the worker secret and the database URL for worker access
- `docs/environment.md` separates local, Vercel, GitHub Actions, and Railway environment settings
- The code sets security headers in `next.config.ts`

## Current Status

This repo is functional, but a few parts are intentionally incomplete or simplified:

- Billing is dummy mode only
- Some auth routes are legacy redirect shims
- `/api/debug-auth` is a diagnostic endpoint and should not be treated as a public product API
- The worker flows depend on several external services being configured correctly
- The product is highly integrated with Gmail and Google Calendar, so a disconnected workspace will show fallback behavior

## Known Limitations

- No real payment processor is wired in
- Calendar and mailbox actions depend on Corsair and the external provider state
- AI features are gated by settings and privacy rules
- Voice input depends on browser support
- Some admin behavior depends on the current session unlock state

## Future Improvements

These are grounded in the current codebase, not speculation:

- Add real billing integration if the product moves beyond dummy mode
- Expand OpenAPI coverage if more REST routes are added later
- Add more explicit request and response examples for the tRPC operations in the docs
- Continue tightening privacy and HITL coverage around sensitive AI actions
- Add more end-to-end tests around the worker flows and webhook processing
