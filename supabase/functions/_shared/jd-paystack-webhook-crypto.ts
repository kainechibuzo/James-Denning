const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha512(secret: string, message: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, message)));
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{128}$/i.test(left) || !/^[0-9a-f]{128}$/i.test(right)) return false;
  let mismatch = 0;
  for (let index = 0; index < 128; index++) {
    mismatch |= left.toLowerCase().charCodeAt(index) ^ right.toLowerCase().charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyPaystackWebhookSignature(
  rawBody: Uint8Array,
  modernHeader: string | null,
  legacyHeader: string | null,
  signingSecret: string | null,
  legacySecret: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ valid: boolean; mode: "timestamped" | "legacy" | "none" }> {
  if (modernHeader) {
    if (!signingSecret) return { valid: false, mode: "none" };
    const parts = modernHeader.split(",").map((part) => part.trim());
    const timestampPart = parts.find((part) => part.startsWith("t="));
    const timestamp = timestampPart ? Number(timestampPart.slice(2)) : NaN;
    if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
      return { valid: false, mode: "none" };
    }
    const prefix = encoder.encode(`${timestamp}.`);
    const signedBody = new Uint8Array(prefix.length + rawBody.length);
    signedBody.set(prefix);
    signedBody.set(rawBody, prefix.length);
    const expected = await hmacSha512(signingSecret, signedBody);
    const signatures = parts
      .filter((part) => part.startsWith("v1="))
      .map((part) => part.slice(3).split(":").at(-1) || "");
    return {
      valid: signatures.some((signature) => constantTimeHexEqual(expected, signature)),
      mode: "timestamped",
    };
  }

  if (legacyHeader && legacySecret) {
    const expected = await hmacSha512(legacySecret, rawBody);
    return { valid: constantTimeHexEqual(expected, legacyHeader), mode: "legacy" };
  }
  return { valid: false, mode: "none" };
}
