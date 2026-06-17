import type { AIProvider } from "./types";

export class AIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIError";
  }
}

export class AIUsageLimitError extends AIError {
  constructor(message = "AI monthly usage limit reached") {
    super(message);
    this.name = "AIUsageLimitError";
  }
}

export class AIProviderUnavailableError extends AIError {
  constructor(
    public readonly provider: AIProvider,
    message = "AI provider is temporarily unavailable",
  ) {
    super(message);
    this.name = "AIProviderUnavailableError";
  }
}

export class AIAllProvidersFailedError extends AIError {
  constructor(message = "All AI providers failed") {
    super(message);
    this.name = "AIAllProvidersFailedError";
  }
}

export class AIInvalidResponseError extends AIError {
  constructor(message = "AI provider returned an invalid response") {
    super(message);
    this.name = "AIInvalidResponseError";
  }
}
