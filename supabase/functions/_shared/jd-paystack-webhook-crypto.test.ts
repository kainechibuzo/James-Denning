import { assertEquals } from "jsr:@std/assert@1";
import { verifyPaystackWebhookSignature } from "./jd-paystack-webhook-crypto.ts";

const encoder = new TextEncoder();
async function sign(secret: string, data: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const payload = new ArrayBuffer(data.byteLength);
  new Uint8Array(payload).set(data);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, payload))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
Deno.test("verifies timestamped Paystack-Signature over exact raw bytes", async () => {
  const body=encoder.encode('{"event":"charge.success","data":{"amount":1900}}');
  const timestamp=1_800_000_000;
  const prefix=encoder.encode(`${timestamp}.`);
  const input=new Uint8Array(prefix.length+body.length);input.set(prefix);input.set(body,prefix.length);
  const signature=await sign("whsec_test-secret",input);
  const result=await verifyPaystackWebhookSignature(body,`t=${timestamp},v1=whk_test:${signature}`,null,"whsec_test-secret",null,timestamp);
  assertEquals(result,{valid:true,mode:"timestamped"});
});
Deno.test("rejects timestamped signatures outside the five-minute window", async () => {
  const body=encoder.encode("{}");
  const result=await verifyPaystackWebhookSignature(body,"t=100,v1=whk_test:"+"a".repeat(128),null,"whsec_test-secret",null,500);
  assertEquals(result.valid,false);
});
Deno.test("supports legacy X-Paystack-Signature while the legacy secret is configured", async () => {
  const body=encoder.encode('{"event":"ping"}');
  const signature=await sign("sk_test_secret",body);
  const result=await verifyPaystackWebhookSignature(body,null,signature,null,"sk_test_secret");
  assertEquals(result,{valid:true,mode:"legacy"});
});
Deno.test("rejects malformed and incorrect signatures", async () => {
  const body=encoder.encode("{}");
  const result=await verifyPaystackWebhookSignature(body,"t=1800000000,v1=bad","x", "whsec_test-secret", "sk_test_secret",1_800_000_000);
  assertEquals(result.valid,false);
});
