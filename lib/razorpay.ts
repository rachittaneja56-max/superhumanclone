import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;

  const expectedSignature = createHmac("sha256", secret).update(rawBody).digest("hex");
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
