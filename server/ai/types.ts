import type { z } from "zod";

export type AIProvider = "openai" | "mistral";
export type AICapability = "fast" | "smart" | "embedding" | "agent";

export type PromptDefinition = {
  key: string;
  version: string;
  purpose: string;
  maxOutputTokens: number;
  system: string;
};

export type AIExecutionOptions = {
  userId?: string;
  capability: AICapability;
  prompt: PromptDefinition;
};

export type AIProviderHealth = {
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
};

export type AIUsagePolicy = {
  monthlyLimit: number | null;
  tier: "free" | "pro" | "admin";
};

export type AITextResult = {
  text: string;
  provider: AIProvider;
  model: string;
};

export type AIJsonResult<T> = {
  object: T;
  provider: AIProvider;
  model: string;
};

export type AIEmbeddingResult = {
  embedding: number[];
  provider: AIProvider;
  model: string;
};

export type StructuredTask<TSchema extends z.ZodTypeAny> = {
  schema: TSchema;
};
