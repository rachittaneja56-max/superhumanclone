# Environment split

Use `.env.local` for local development only.

Use GitHub Actions secrets or repository environment variables for CI.

Use Vercel project environment variables for the Next.js app.

Use Railway environment variables for the worker service.

## Required variables

### App / auth
- `NEXT_PUBLIC_APP_URL`
- `ENCRYPTION_KEY`

### Database
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`

### Google / Corsair
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CORSAIR_KEK`

### Redis / queue / realtime
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

### Billing
- `BILLING_MODE`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
