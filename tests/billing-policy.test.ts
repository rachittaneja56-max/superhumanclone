import { getBillingMode } from "@/server/billing/plans";
import { shouldBlockAiUsage } from "@/server/billing/policy-utils";

describe("billing policy", () => {
  it("blocks free users after 20 AI calls", () => {
    expect(
      shouldBlockAiUsage(
        { monthlyLimit: 20, aiDisabled: false, isFlagged: false, isAdmin: false },
        20,
      ),
    ).toEqual({ blocked: true, reason: "limit" });
  });

  it("uses dummy billing by default", () => {
    const previous = process.env.BILLING_MODE;
    delete process.env.BILLING_MODE;
    expect(getBillingMode()).toBe("dummy");
    process.env.BILLING_MODE = previous;
  });
});
