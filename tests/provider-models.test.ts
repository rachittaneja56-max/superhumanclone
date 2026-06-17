import { getFallbackProvider, getProviderOrder } from "@/server/ai/models";

describe("provider failover", () => {
  it("switches from openai to mistral as fallback", () => {
    const previousPrimary = process.env.AI_PRIMARY_PROVIDER;
    const previousFallback = process.env.AI_FALLBACK_PROVIDER;
    process.env.AI_PRIMARY_PROVIDER = "openai";
    process.env.AI_FALLBACK_PROVIDER = "mistral";

    expect(getFallbackProvider("openai")).toBe("mistral");
    expect(getProviderOrder("fast")).toEqual(["openai", "mistral"]);

    process.env.AI_PRIMARY_PROVIDER = previousPrimary;
    process.env.AI_FALLBACK_PROVIDER = previousFallback;
  });
});
