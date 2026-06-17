import "server-only";

import type { AICapability, AIProvider } from "./types";

const DEFAULT_FAST_MODELS: Record<AIProvider, string> = {
  mistral: "ministral-8b-latest",
  openai: "gpt-4o-mini",
};

const DEFAULT_SMART_MODELS: Record<AIProvider, string> = {
  mistral: "mistral-large-latest",
  openai: "gpt-4o",
};

const DEFAULT_EMBEDDING_MODELS: Record<AIProvider, string> = {
  mistral: "mistral-embed",
  openai: "text-embedding-3-small",
};

function parseProvider(value: string | undefined, fallback: AIProvider): AIProvider {
  return value === "mistral" || value === "openai" ? value : fallback;
}

export function getPrimaryProvider(): AIProvider {
  return parseProvider(process.env.AI_PRIMARY_PROVIDER, "openai");
}

export function getFallbackProvider(primary: AIProvider): AIProvider {
  const fallback = parseProvider(process.env.AI_FALLBACK_PROVIDER, primary === "openai" ? "mistral" : "openai");
  return fallback === primary ? (primary === "openai" ? "mistral" : "openai") : fallback;
}

export function getProviderOrder(capability: AICapability): AIProvider[] {
  const primary = getPrimaryProvider();
  const fallback = getFallbackProvider(primary);

  if (capability === "agent") {
    return ["openai", primary, fallback].filter((value, index, array) => array.indexOf(value) === index) as AIProvider[];
  }

  return [primary, fallback].filter((value, index, array) => array.indexOf(value) === index) as AIProvider[];
}

export function getModelForCapability(provider: AIProvider, capability: AICapability): string {
  if (capability === "embedding") {
    return DEFAULT_EMBEDDING_MODELS[provider];
  }

  if (capability === "smart" || capability === "agent") {
    if (provider === "openai" && process.env.AI_SMART_MODEL) return process.env.AI_SMART_MODEL;
    return DEFAULT_SMART_MODELS[provider];
  }

  if (provider === "mistral" && process.env.AI_FAST_MODEL) return process.env.AI_FAST_MODEL;
  if (provider === "openai" && process.env.AI_FAST_MODEL) return process.env.AI_FAST_MODEL;
  return DEFAULT_FAST_MODELS[provider];
}

export function getProviderApiKey(provider: AIProvider): string | null {
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.MISTRAL_API_KEY;
  return key?.trim() || null;
}

export function getProviderBaseUrl(provider: AIProvider): string {
  return provider === "openai" ? "https://api.openai.com/v1" : "https://api.mistral.ai/v1";
}
