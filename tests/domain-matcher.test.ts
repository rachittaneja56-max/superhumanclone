import { isDomainBlocked, matchesDomainPattern } from "@/lib/domain-matcher";

describe("domain matcher", () => {
  it("matches wildcard domains without regex", () => {
    expect(matchesDomainPattern("ceo@sub.example.law", "@*.law")).toBe(true);
    expect(matchesDomainPattern("ceo@example.com", "@*.law")).toBe(false);
  });

  it("matches exact addresses", () => {
    expect(matchesDomainPattern("admin@exact.com", "admin@exact.com")).toBe(true);
    expect(matchesDomainPattern("user@exact.com", "admin@exact.com")).toBe(false);
  });

  it("blocks blocked domains deterministically", () => {
    expect(
      isDomainBlocked("person@bank.com", [{ pattern: "@bank.com", isBlocked: true }]),
    ).toBe(true);
  });
});
