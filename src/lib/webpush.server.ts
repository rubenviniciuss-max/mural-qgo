// Web Push (RFC 8291 "aes128gcm" content encoding + RFC 8292 VAPID) implemented
// with only the native Web Crypto API (crypto.subtle / crypto.getRandomValues).
// Deliberately does NOT use the `web-push` npm package or Node's `crypto`
// module: Cloudflare Workers runs this at the edge, and crypto.subtle is a
// native Workers API — this avoids any risk of a Node-compat gap breaking
// the whole app the way an unrelated env-var change once did.

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

const enc = new TextEncoder();

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(sig);
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const t1 = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t1.slice(0, length);
}

async function importVapidPrivateKey(publicKeyB64url: string, privateKeyB64url: string) {
  const pub = b64urlToBytes(publicKeyB64url); // 65 bytes: 0x04 || x(32) || y(32)
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(x),
    y: bytesToB64url(y),
    d: privateKeyB64url,
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidJwt(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string,
): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject };
  const unsigned =
    `${bytesToB64url(enc.encode(JSON.stringify(header)))}.` +
    `${bytesToB64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await importVapidPrivateKey(publicKey, privateKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `${unsigned}.${bytesToB64url(new Uint8Array(sig))}`;
}

async function encryptPayload(payload: string, p256dhB64url: string, authB64url: string) {
  const uaPublicRaw = b64urlToBytes(p256dhB64url); // 65 bytes
  const authSecret = b64urlToBytes(authB64url); // 16 bytes

  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey } as EcdhKeyDeriveParams, asKeyPair.privateKey, 256),
  );

  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(enc.encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, enc.encode("Content-Encoding: nonce\0"), 12);

  // Single record (push payloads are tiny): plaintext || delimiter(0x02).
  const record = concatBytes(enc.encode(payload), new Uint8Array([2]));
  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, record),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const idLen = new Uint8Array([asPublicRaw.length]);
  const header = concatBytes(salt, recordSize, idLen, asPublicRaw);

  return concatBytes(header, ciphertext);
}

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type WebPushResult = { ok: boolean; status: number; expired: boolean };

export async function sendWebPush(
  sub: PushSubscriptionKeys,
  payloadObj: unknown,
  opts: { publicKey: string; privateKey: string; subject: string; ttl?: number },
): Promise<WebPushResult> {
  const body = await encryptPayload(JSON.stringify(payloadObj), sub.p256dh, sub.auth);
  const jwt = await buildVapidJwt(sub.endpoint, opts.subject, opts.publicKey, opts.privateKey);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 60 * 60 * 24),
      Authorization: `vapid t=${jwt}, k=${opts.publicKey}`,
    },
    body,
  });
  // Drain the body so the connection can be reused; we don't need the content.
  await res.arrayBuffer().catch(() => undefined);

  return { ok: res.ok, status: res.status, expired: res.status === 404 || res.status === 410 };
}
