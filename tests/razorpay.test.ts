import { createHmac } from "node:crypto";

import { verifyRazorpaySignature } from "@/lib/razorpay";

describe("razorpay webhook verification", () => {
  it("accepts valid signatures and rejects invalid ones", () => {
    const body = JSON.stringify({ hello: "world" });
    const secret = "test_secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyRazorpaySignature(body, signature, secret)).toBe(true);
    expect(verifyRazorpaySignature(body, "bad-signature", secret)).toBe(false);
  });
});
