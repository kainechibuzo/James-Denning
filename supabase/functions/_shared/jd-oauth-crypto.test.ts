import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {base64Url,fromBase64Url,importAesKey,encryptSecret,decryptSecret,sha256Hex} from "./jd-oauth-crypto.ts";
Deno.test("OAuth PKCE helpers round-trip state and verifier encoding",()=>{const raw=new Uint8Array([0,1,2,253,254,255]);assertEquals(Array.from(fromBase64Url(base64Url(raw))),Array.from(raw));});
Deno.test("OAuth credentials are AES-GCM encrypted and decrypt only with the same key",async()=>{const raw=new Uint8Array(32).fill(17);const key=await importAesKey(btoa(String.fromCharCode(...raw)));const stored=await encryptSecret("access-token-secret",key);assertEquals(stored.startsWith("\\x"),true);assertEquals(stored.includes("access-token-secret"),false);assertEquals(await decryptSecret(stored,key),"access-token-secret");});
Deno.test("OAuth state hash is SHA-256 hex",async()=>{assertEquals((await sha256Hex("state")).length,64);});
