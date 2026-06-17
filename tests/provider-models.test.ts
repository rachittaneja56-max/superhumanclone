import { getFallbackProvider, getProviderOrder } from "@/server/ai/models";

describe("provider failover", () => {
  it("switches from mistral to openai as fallback", () => {
    const previousPrimary = process.env.AI_PRIMARY_PROVIDER;
    const previousFallback = process.env.AI_FALLBACK_PROVIDER;
    process.env.AI_PRIMARY_PROVIDER = "mistral";
    process.env.AI_FALLBACK_PROVIDER = "openai";

    expect(getFallbackProvider("mistral")).toBe("openai");
    expect(getProviderOrder("fast")).toEqual(["mistral", "openai"]);

    process.env.AI_PRIMARY_PROVIDER = previousPrimary;
    process.env.AI_FALLBACK_PROVIDER = previousFallback;
  });
});
