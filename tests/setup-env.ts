const defaults: Record<string, string> = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/aethra",
  DATABASE_URL_UNPOOLED: "postgres://user:pass@localhost:5432/aethra",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  CORSAIR_KEK: "test-corsair-kek",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
  QSTASH_TOKEN: "test-qstash-token",
  ABLY_API_KEY: "test:ably:key",
  WORKER_SECRET: "test-worker-secret",
  AI_PRIMARY_PROVIDER: "mistral",
  AI_FALLBACK_PROVIDER: "openai",
  OPENAI_API_KEY: "test-openai-key",
  MISTRAL_API_KEY: "test-mistral-key",
  AI_FAST_MODEL: "ministral-8b-latest",
  AI_SMART_MODEL: "mistral-large-latest",
  BILLING_MODE: "dummy",
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
