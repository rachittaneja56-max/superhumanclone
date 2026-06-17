import { sanitisePayload } from "@/lib/sanitise-payload";

describe("sanitisePayload", () => {
  it("redacts sensitive keys while leaving safe subject/title values alone", () => {
    const result = sanitisePayload({
      body: "secret",
      html: "<b>secret</b>",
      accessToken: "abc",
      subject: "safe subject",
      title: "safe title",
    });

    expect(result.body).toBe("[REDACTED]");
    expect(result.html).toBe("[REDACTED]");
    expect(result.accessToken).toBe("[REDACTED]");
    expect(result.subject).toBe("safe subject");
    expect(result.title).toBe("safe title");
  });
});
