import { resolveHitlTransition } from "@/server/agents/hitl-state";

describe("HITL state machine", () => {
  it("moves pending to approved", () => {
    const result = resolveHitlTransition({
      currentStatus: "pending",
      decision: "approved",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(result).toEqual({ ok: true, nextStatus: "approved", reason: null });
  });

  it("marks expired actions as expired", () => {
    const result = resolveHitlTransition({
      currentStatus: "pending",
      decision: "approved",
      expiresAt: new Date(Date.now() - 1),
    });

    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe("expired");
  });
});
