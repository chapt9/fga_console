// fga's client encryption wire profile 1, written a second time for the
// browser (fga docs/design/crypto-wire-profile.md and browser-client.md).
// The same bytes as fga's internal/cryptowire and sdk/go/crypto, built
// only on WebCrypto: X25519, Ed25519, HKDF, HMAC, AES-GCM, SHA-256. It
// holds no keys of its own; callers pass CryptoKeys and get errors whose
// kind says what failed: untrusted, binding, integrity, signature, format,
// keyset or aead (the payload's authentication failed).
"use strict";

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export const SUITE = 1;
export const FORMAT = 1;
export const SEGMENT = 1 << 20;
const MAX_CONTEXT = 512;
const MAX_HPKE_CIPHERTEXT = 66000;
const MAX_DESCRIPTOR = 4 << 10;
const MAX_KEYSET = 64 << 10;
const MAX_SIGNATURE = 1 << 10;
const BINDING = 60;
const HEADER = 1 + 32 + 7; // payload header: length byte, salt, nonce prefix
const TAG = 16;

export const TYPE_DESCRIPTOR = "fga-descriptor+jws";
export const TYPE_ENVELOPE = "fga-envelope+jws";
export const TYPE_SIGNING_PROOF = "fga-signing-proof+jws";

export class ProfileError extends Error {
  constructor(kind, message) {
    super(`${kind}: ${message}`);
    this.kind = kind;
  }
}
const fail = (kind, message) => { throw new ProfileError(kind, message); };

// ---------------------------------------------------------------- bytes

export const utf8 = s => enc.encode(s);
export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
export const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const u16 = n => Uint8Array.of(n >>> 8 & 0xff, n & 0xff);
const u32 = n => Uint8Array.of(n >>> 24 & 0xff, n >>> 16 & 0xff, n >>> 8 & 0xff, n & 0xff);
const readU16 = (b, at) => b[at] << 8 | b[at + 1];
const readU32 = (b, at) => (b[at] << 24 | b[at + 1] << 16 | b[at + 2] << 8 | b[at + 3]) >>> 0;
export const hex = b => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
function fromHex(s) {
  if (!/^(?:[0-9a-f]{2})*$/.test(s)) fail("format", "hex");
  return Uint8Array.from(s.match(/../g) || [], x => parseInt(x, 16));
}
export function base64(b) { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
export function fromBase64(s) {
  let bin;
  try { bin = atob(s); } catch { fail("format", "base64"); }
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export const base64url = b => base64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromBase64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) fail("format", "base64url");
  return fromBase64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4));
}

export async function sha256(...parts) {
  return new Uint8Array(await subtle.digest("SHA-256", concat(...parts)));
}
const domainHash = (domain, ...parts) => sha256(utf8(domain), Uint8Array.of(0), ...parts);

// ---------------------------------------------------------------- identifiers

export const digestText = d => "sha256:" + hex(d);
export function parseDigest(s) {
  if (typeof s !== "string" || !/^sha256:[0-9a-f]{64}$/.test(s)) fail("format", `digest ${s}`);
  return fromHex(s.slice(7));
}
export function uuidText(u) {
  const h = hex(u);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function parseUUID(s) {
  if (typeof s !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) fail("format", `UUID ${s}`);
  const u = fromHex(s.replace(/-/g, ""));
  if (u.every(x => x === 0)) fail("format", "zero UUID");
  return u;
}

export const recipientFingerprint = pub => domainHash("fga.recipient-key/v1", u16(SUITE), pub);
export const signingKeyFingerprint = pub => domainHash("fga.signing-key/v1", pub);

// payloadAAD is the 60-byte payload binding: "FGAAD001", tenant, object
// and crypto-version UUIDs, suite and format.
export const payloadAAD = (tenant, object, cryptoVersion) =>
  concat(utf8("FGAAD001"), tenant, object, cryptoVersion, u16(SUITE), u16(FORMAT));

export function encodeKeyPackage(binding, keyset) {
  if (binding.length !== BINDING || keyset.length === 0 || keyset.length > MAX_KEYSET) fail("format", "key package sizes");
  return concat(u16(1), u16(BINDING), binding, u32(keyset.length), keyset);
}
export function decodeKeyPackage(pkg) {
  const head = 4 + BINDING + 4;
  if (pkg.length < head || readU16(pkg, 0) !== 1 || readU16(pkg, 2) !== BINDING) fail("keyset", "key package header");
  const n = readU32(pkg, 4 + BINDING);
  if (n === 0 || n > MAX_KEYSET || pkg.length !== head + n) fail("keyset", "key package keyset length");
  return { binding: pkg.slice(4, 4 + BINDING), keyset: pkg.slice(head) };
}

// ---------------------------------------------------------------- protobuf

function varint(n) {
  let v = BigInt(n);
  const out = [];
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Uint8Array.from(out);
}
function readVarint(b, at) {
  let v = 0n;
  for (let i = 0; i < 10; i++) {
    if (at + i >= b.length) return null;
    v |= BigInt(b[at + i] & 0x7f) << BigInt(7 * i);
    if (!(b[at + i] & 0x80)) return { value: v, next: at + i + 1 };
  }
  return null;
}
const tag = (field, wire) => varint(field << 3 | wire);
const pbVarint = (field, v) => concat(tag(field, 0), varint(v));
const pbBytes = (field, v) => concat(tag(field, 2), varint(v.length), v);

// readFields parses a message into [field, wire, value] in order.
function readFields(b) {
  const out = [];
  let at = 0;
  while (at < b.length) {
    const t = readVarint(b, at);
    if (!t || t.value > 0xffffffffn) return null;
    at = t.next;
    const field = Number(t.value >> 3n), wire = Number(t.value & 7n);
    if (wire === 0) {
      const v = readVarint(b, at);
      if (!v) return null;
      out.push([field, 0, v.value]);
      at = v.next;
    } else if (wire === 2) {
      const n = readVarint(b, at);
      if (!n || n.value > BigInt(b.length - n.next)) return null;
      at = n.next;
      out.push([field, 2, b.slice(at, at + Number(n.value))]);
      at += Number(n.value);
    } else {
      return null;
    }
  }
  return out;
}

// ---------------------------------------------------------------- payload keyset

const STREAMING_KEY_URL = "type.googleapis.com/google.crypto.tink.AesGcmHkdfStreamingKey";

// encodeKeyset writes the Tink binary keyset of one enabled, primary,
// RAW AES-256-GCM-HKDF streaming key with 1 MiB segments.
export function encodeKeyset(keyValue, keyID) {
  const params = concat(pbVarint(1, SEGMENT), pbVarint(2, 32), pbVarint(3, 3));
  const key = concat(pbBytes(2, params), pbBytes(3, keyValue));
  const keyData = concat(pbBytes(1, utf8(STREAMING_KEY_URL)), pbBytes(2, key), pbVarint(3, 1));
  return concat(pbVarint(1, keyID), pbBytes(2, concat(pbBytes(1, keyData), pbVarint(2, 1), pbVarint(3, keyID), pbVarint(4, 3))));
}

// decodeKeyset returns the key of a keyset holding exactly that one key;
// anything else is refused, as fga's SDK refuses it.
export function decodeKeyset(ks) {
  const only = (fields, want) => {
    if (!fields || fields.length !== want.length) return null;
    const out = {};
    for (let i = 0; i < want.length; i++) {
      const [field, wire] = want[i];
      if (fields[i][0] !== field || fields[i][1] !== wire) return null;
      out[field] = fields[i][2];
    }
    return out;
  };
  const top = readFields(ks);
  const keyset = top && top.length === 2 ? only(top, [[1, 0], [2, 2]]) : null;
  const key = keyset && only(readFields(keyset[2]), [[1, 2], [2, 0], [3, 0], [4, 0]]);
  const data = key && only(readFields(key[1]), [[1, 2], [2, 2], [3, 0]]);
  const streaming = data && only(readFields(data[2]), [[2, 2], [3, 2]]);
  const params = streaming && only(readFields(streaming[2]), [[1, 0], [2, 0], [3, 0]]);
  if (!params || keyset[1] !== key[3] || key[2] !== 1n || key[4] !== 3n || data[3] !== 1n ||
      new TextDecoder().decode(data[1]) !== STREAMING_KEY_URL || params[1] !== BigInt(SEGMENT) || params[2] !== 32n ||
      params[3] !== 3n || streaming[3].length !== 32) {
    fail("keyset", "not exactly one profile-1 payload key");
  }
  return streaming[3];
}

// ---------------------------------------------------------------- envelope context

const CONTEXT_FIELDS = [
  ["profileVersion", 0], ["tenant", 16], ["object", 16], ["logicalVersion", 16], ["cryptoVersion", 16],
  ["suite", 0], ["format", 0], ["ciphertextSHA256", 32], ["ciphertextLength", 0], ["recipient", 32],
  ["recipientKeyVersion", 0], ["generation", 0], ["sharer", 32], ["createdAtUnixMs", 0],
];

// encodeContext writes RecipientEnvelopeContextV1 (profile 1): every
// field once, in order. Byte fields are Uint8Arrays, numbers Numbers.
export function encodeContext(c) {
  const parts = CONTEXT_FIELDS.map(([name, size], i) => {
    const v = name === "profileVersion" ? 1 : c[name];
    if (size) {
      if (!(v instanceof Uint8Array) || v.length !== size || v.every(x => x === 0)) fail("format", `context ${name}`);
      return pbBytes(i + 1, v);
    }
    if (!Number.isSafeInteger(v) || v <= 0) fail("format", `context ${name}`);
    return pbVarint(i + 1, v);
  });
  if (c.suite !== SUITE || c.format !== FORMAT) fail("format", "context suite or format");
  return concat(...parts);
}

// parseContext reads a context strictly: every field once, in order,
// with its wire type and length, nothing else, at most 512 bytes, and the
// canonical encoding of what it holds. Only profile 1 opens objects.
export function parseContext(b) {
  if (b.length === 0 || b.length > MAX_CONTEXT) fail("format", "context size");
  const fields = readFields(b);
  if (!fields || fields.length !== CONTEXT_FIELDS.length) fail("format", "context fields");
  const c = {};
  CONTEXT_FIELDS.forEach(([name, size], i) => {
    const [field, wire, v] = fields[i];
    if (field !== i + 1 || wire !== (size ? 2 : 0) || (size && v.length !== size)) fail("format", `context field ${i + 1}`);
    if (!size && v > BigInt(Number.MAX_SAFE_INTEGER)) fail("format", `context field ${i + 1}`);
    c[name] = size ? v : Number(v);
  });
  if (c.profileVersion !== 1) fail("format", "context profile");
  delete c.profileVersion;
  if (!equal(encodeContext(c), b)) fail("format", "context is not canonical");
  return c;
}

export const hpkeInfo = context => domainHash("fga.envelope-hpke-info/v1", context);
export async function envelopeSigningInput(context, hpkeCiphertext) {
  return concat(utf8("fga.envelope-signature/v1"), Uint8Array.of(0), u32(context.length), context, await sha256(hpkeCiphertext));
}
export const envelopeDigest = (context, hpkeCiphertext) =>
  domainHash("fga.envelope-digest/v1", u32(context.length), context, u32(hpkeCiphertext.length), hpkeCiphertext);

// ---------------------------------------------------------------- keys

const X25519_PKCS8 = fromHex("302e020100300506032b656e04220420");
const ED25519_PKCS8 = fromHex("302e020100300506032b657004220420");

async function importPrivate(prefix, name, raw, usages) {
  if (raw.length !== 32) fail("format", `${name} private key`);
  const pkcs8 = concat(prefix, raw);
  const open = await subtle.importKey("pkcs8", pkcs8, { name }, true, usages);
  const publicRaw = fromBase64url((await subtle.exportKey("jwk", open)).x);
  return { privateKey: await subtle.importKey("pkcs8", pkcs8, { name }, false, usages), publicRaw };
}

// recipientKey makes a recipient key from its raw 32-byte X25519 private
// key; the private key is not extractable afterwards.
export async function recipientKey(raw) {
  const k = await importPrivate(X25519_PKCS8, "X25519", raw, ["deriveBits"]);
  const fingerprint = await recipientFingerprint(k.publicRaw);
  return { ...k, fingerprint, fingerprintText: digestText(fingerprint) };
}
// signingKey makes a content-signing key from its 32-byte Ed25519 seed.
export async function signingKey(seed) {
  const k = await importPrivate(ED25519_PKCS8, "Ed25519", seed, ["sign"]);
  const fingerprint = await signingKeyFingerprint(k.publicRaw);
  return { ...k, fingerprint, fingerprintText: digestText(fingerprint) };
}
const rawPrivate = async key => fromBase64url((await subtle.exportKey("jwk", key)).d);
// newRecipientPrivate and newSigningSeed make fresh raw private keys, for
// the person to keep (browser-client.md, "Keys and custody").
export const newRecipientPrivate = async () => rawPrivate((await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])).privateKey);
export const newSigningSeed = async () => rawPrivate((await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])).privateKey);

async function x25519(privateKey, publicRaw) {
  let shared;
  try {
    const pub = await subtle.importKey("raw", publicRaw, { name: "X25519" }, false, []);
    shared = new Uint8Array(await subtle.deriveBits({ name: "X25519", public: pub }, privateKey, 256));
  } catch {
    fail("binding", "X25519");
  }
  if (shared.every(x => x === 0)) fail("binding", "X25519 low-order point");
  return shared;
}

// ---------------------------------------------------------------- signatures

// signJWS returns the detached compact JWS (EdDSA) fga's Sign makes.
export async function signJWS(typ, signer, payload) {
  const header = base64url(utf8(JSON.stringify({ alg: "EdDSA", kid: signer.fingerprintText, typ })));
  const sig = await subtle.sign({ name: "Ed25519" }, signer.privateKey, utf8(header + "." + base64url(payload)));
  return header + ".." + base64url(new Uint8Array(sig));
}

// verifyJWS checks a detached JWS of payload: one EdDSA signature of type
// typ by the key keyFor returns for its key ID (null when not trusted).
export async function verifyJWS(typ, jws, payload, keyFor) {
  if (typeof jws !== "string" || jws.length > MAX_SIGNATURE) fail("signature", "size");
  const parts = jws.split(".");
  if (parts.length !== 3 || parts[1] !== "") fail("signature", "not a detached compact JWS");
  let h;
  try { h = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromBase64url(parts[0]))); } catch { fail("signature", "header"); }
  if (!h || typeof h !== "object" || Array.isArray(h) || Object.keys(h).sort().join() !== "alg,kid,typ" ||
      h.alg !== "EdDSA" || h.typ !== typ || typeof h.kid !== "string") {
    fail("signature", "header");
  }
  const publicRaw = await keyFor(h.kid);
  if (!publicRaw) fail("untrusted", `signer ${h.kid}`);
  let ok = false;
  try {
    const key = await subtle.importKey("raw", publicRaw, { name: "Ed25519" }, false, ["verify"]);
    const sig = fromBase64url(parts[2]);
    ok = sig.length === 64 && await subtle.verify({ name: "Ed25519" }, key, sig, utf8(parts[0] + "." + base64url(payload)));
  } catch { ok = false; }
  if (!ok) fail("signature", "does not verify");
  return h.kid;
}

const trustedSigner = trust => async kid => {
  try { parseDigest(kid); } catch { fail("signature", "key ID"); }
  return trust.signer(kid) || null;
};

// ---------------------------------------------------------------- HKDF and HPKE

async function hmac(key, data) {
  // An empty HMAC key equals 32 zero bytes (both pad to the block).
  const k = await subtle.importKey("raw", key.length ? key : new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data));
}
const extract = (salt, ikm) => hmac(salt, ikm);
async function expand(prk, info, length) {
  let t = new Uint8Array(0), out = new Uint8Array(0);
  for (let i = 1; out.length < length; i++) {
    t = await hmac(prk, concat(t, info, Uint8Array.of(i)));
    out = concat(out, t);
  }
  return out.slice(0, length);
}

// HPKE (RFC 9180) base mode: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
// AES-256-GCM. Tink's NO_PREFIX hybrid ciphertext is enc ‖ ciphertext,
// with the context information as HPKE info and no associated data.
const HPKE_V1 = utf8("HPKE-v1");
const KEM_SUITE = concat(utf8("KEM"), u16(0x0020));
const HPKE_SUITE = concat(utf8("HPKE"), u16(0x0020), u16(0x0001), u16(0x0002));
const labeledExtract = (suite, salt, label, ikm) => extract(salt, concat(HPKE_V1, suite, utf8(label), ikm));
const labeledExpand = (suite, prk, label, info, length) => expand(prk, concat(u16(length), HPKE_V1, suite, utf8(label), info), length);
const none = new Uint8Array(0);

async function hpkeKey(dh, enc, recipientPublic, info) {
  const prk = await labeledExtract(KEM_SUITE, none, "eae_prk", dh);
  const shared = await labeledExpand(KEM_SUITE, prk, "shared_secret", concat(enc, recipientPublic), 32);
  const context = concat(Uint8Array.of(0), await labeledExtract(HPKE_SUITE, none, "psk_id_hash", none),
    await labeledExtract(HPKE_SUITE, none, "info_hash", info));
  const secret = await labeledExtract(HPKE_SUITE, shared, "secret", none);
  const key = await subtle.importKey("raw", await labeledExpand(HPKE_SUITE, secret, "key", context, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { key, nonce: await labeledExpand(HPKE_SUITE, secret, "base_nonce", context, 12) };
}

// hpkeSeal encrypts plaintext to a raw X25519 public key. ephemeralRaw
// fixes the ephemeral key, for tests only.
export async function hpkeSeal(recipientPublic, info, plaintext, ephemeralRaw) {
  const eph = await importPrivate(X25519_PKCS8, "X25519", ephemeralRaw || await newRecipientPrivate(), ["deriveBits"]);
  const { key, nonce } = await hpkeKey(await x25519(eph.privateKey, recipientPublic), eph.publicRaw, recipientPublic, info);
  return concat(eph.publicRaw, new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext)));
}
export async function hpkeOpen(recipient, info, ciphertext) {
  if (ciphertext.length < 32 + TAG || ciphertext.length > MAX_HPKE_CIPHERTEXT) fail("binding", "HPKE ciphertext size");
  const encapsulated = ciphertext.slice(0, 32);
  const { key, nonce } = await hpkeKey(await x25519(recipient.privateKey, encapsulated), encapsulated, recipient.publicRaw, info);
  try {
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext.slice(32)));
  } catch {
    fail("binding", "the envelope does not open with this key");
  }
}

// ---------------------------------------------------------------- payload

// Tink streaming AEAD AES-GCM-HKDF: a header (length 40, 32-byte salt,
// 7-byte nonce prefix), a segment key HKDF-SHA256(key, salt, aad), and
// 1 MiB ciphertext segments (the first one shorter by the header), each
// AES-256-GCM under nonce prefix ‖ segment number ‖ last-segment flag.
async function segmentKey(keyValue, salt, aad) {
  const ikm = await subtle.importKey("raw", keyValue, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: aad }, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const segmentNonce = (prefix, i, last) => concat(prefix, u32(i), Uint8Array.of(last ? 1 : 0));

export async function payloadEncrypt(keyValue, aad, plaintext, fixed = {}) {
  const salt = fixed.salt || crypto.getRandomValues(new Uint8Array(32));
  const prefix = fixed.noncePrefix || crypto.getRandomValues(new Uint8Array(7));
  const key = await segmentKey(keyValue, salt, aad);
  const parts = [Uint8Array.of(HEADER), salt, prefix];
  let at = 0, i = 0;
  do {
    const size = (i === 0 ? SEGMENT - HEADER : SEGMENT) - TAG;
    const chunk = plaintext.subarray(at, at + size);
    at += chunk.length;
    const last = at >= plaintext.length;
    parts.push(new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: segmentNonce(prefix, i, last) }, key, chunk)));
    i++;
    if (last) break;
  } while (true);
  return concat(...parts);
}

export async function payloadDecrypt(keyValue, aad, ciphertext) {
  if (ciphertext.length < HEADER + TAG || ciphertext[0] !== HEADER) fail("aead", "payload header");
  const key = await segmentKey(keyValue, ciphertext.subarray(1, 33), aad);
  const prefix = ciphertext.subarray(33, HEADER);
  const parts = [];
  let at = HEADER;
  for (let i = 0; at < ciphertext.length; i++) {
    const size = i === 0 ? SEGMENT - HEADER : SEGMENT;
    const last = ciphertext.length - at <= size;
    const segment = ciphertext.subarray(at, last ? ciphertext.length : at + size);
    if (segment.length < TAG) fail("aead", "short segment");
    try {
      parts.push(new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: segmentNonce(prefix, i, last) }, key, segment)));
    } catch {
      fail("aead", `segment ${i} does not authenticate`);
    }
    at += segment.length;
  }
  return concat(...parts);
}

// ---------------------------------------------------------------- descriptor

const DESCRIPTOR_FIELDS = ["version", "tenant_id", "object_id", "logical_version_id", "crypto_version_id", "blob_id",
  "attempt_id", "suite", "format", "ciphertext_sha256", "ciphertext_length", "signer", "created_at"];
// key_commitment follows them when present: descriptors from before it
// carry none (fga's security review of 4 November 2026, finding 5).
const DESCRIPTOR_OPTIONAL = ["key_commitment"];

// keyCommitment is fga's cryptowire.KeyCommitment: SHA-256 over
// "fga.key-commitment/v1", a zero byte and the key package. A signed
// descriptor commits to the key package every envelope wraps, so one
// version decrypts to one plaintext for every recipient.
export async function keyCommitment(keyPackage) {
  return digestText(await sha256(utf8("fga.key-commitment/v1"), Uint8Array.of(0), keyPackage));
}

// rfc3339Seconds writes a time as Go writes a UTC time truncated to the
// second.
const rfc3339Seconds = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

// marshalDescriptor writes the descriptor JSON exactly as fga's Marshal.
export function marshalDescriptor(d) {
  const v = { ...d, version: "fga.descriptor/v1", created_at: rfc3339Seconds(d.createdAtUnixMs) };
  const keys = [...DESCRIPTOR_FIELDS, ...DESCRIPTOR_OPTIONAL.filter(k => v[k])];
  const b = utf8("{" + keys.map(k => JSON.stringify(k) + ":" + JSON.stringify(v[k])).join(",") + "}");
  parseDescriptor(b);
  return b;
}

// strictObject parses a flat JSON object of strings and whole numbers,
// refusing repeated, unknown and missing fields and trailing data; the
// optional fields may be missing.
function strictObject(text, fields, optional = []) {
  const re = /\s*("(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}:,])/y;
  const tokens = [];
  let m, at = 0;
  while (at < text.length && (re.lastIndex = at, m = re.exec(text))) { tokens.push(m[1]); at = re.lastIndex; }
  if (/\S/.test(text.slice(at))) fail("format", "descriptor JSON");
  const out = {};
  let i = 0;
  const next = () => tokens[i++];
  if (next() !== "{") fail("format", "descriptor JSON");
  for (let first = true; ; first = false) {
    let t = next();
    if (t === "}" && first) break;
    if (!first) { if (t === "}") break; if (t !== ",") fail("format", "descriptor JSON"); t = next(); }
    if (!t || t[0] !== '"' || next() !== ":") fail("format", "descriptor JSON");
    const key = JSON.parse(t), value = next();
    if (!(fields.includes(key) || optional.includes(key)) || key in out || value === undefined || "{}:,".includes(value) || /^-?\d.*[.eE]/.test(value)) {
      fail("format", `descriptor field ${key}`);
    }
    out[key] = JSON.parse(value);
  }
  if (i !== tokens.length || fields.some(f => !(f in out))) fail("format", "descriptor fields");
  return out;
}

export function parseDescriptor(b) {
  if (b.length > MAX_DESCRIPTOR) fail("format", "descriptor size");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { fail("format", "descriptor encoding"); }
  const d = strictObject(text, DESCRIPTOR_FIELDS, DESCRIPTOR_OPTIONAL);
  if ("key_commitment" in d) parseDigest(d.key_commitment);
  for (const k of ["tenant_id", "object_id", "logical_version_id", "crypto_version_id", "blob_id", "attempt_id"]) parseUUID(d[k]);
  parseDigest(d.ciphertext_sha256);
  parseDigest(d.signer);
  const created = typeof d.created_at === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(d.created_at) ? Date.parse(d.created_at) : NaN;
  if (d.version !== "fga.descriptor/v1" || d.suite !== SUITE || d.format !== FORMAT || !Number.isSafeInteger(d.ciphertext_length) ||
      d.ciphertext_length <= 0 || !(created > 0)) {
    fail("format", "descriptor version, profile, length or time");
  }
  return d;
}

// ---------------------------------------------------------------- enrollment proofs

// recipientProof answers a recipient-key enrollment challenge: X25519
// with the server's ephemeral key, HKDF-SHA256 (salt nonce), HMAC-SHA256
// over challenge ID, tenant, principal and the key's fingerprint.
export async function recipientProof(recipient, ephemeralPublic, nonce, challengeID, tenant, principal) {
  const ikm = await subtle.importKey("raw", await x25519(recipient.privateKey, ephemeralPublic), "HKDF", false, ["deriveBits"]);
  const key = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: nonce, info: utf8("fga.recipient-proof/v1") }, ikm, 256));
  const zero = Uint8Array.of(0);
  return hmac(key, concat(utf8(challengeID), zero, utf8(tenant), zero, utf8(principal), zero, utf8(recipient.fingerprintText)));
}
export function signingProofInput(challengeID, tenant, principal, fingerprintText, nonce) {
  const zero = Uint8Array.of(0);
  return concat(utf8("fga.signing-key-proof/v1"), zero, ...[challengeID, tenant, principal, fingerprintText].flatMap(s => [utf8(s), zero]), nonce);
}
export const signingProof = (signer, challengeID, tenant, principal, nonce) =>
  signJWS(TYPE_SIGNING_PROOF, signer, signingProofInput(challengeID, tenant, principal, signer.fingerprintText, nonce));

// ---------------------------------------------------------------- encrypt, decrypt, reshare

// trust is { recipient(fingerprintText) -> raw public key, signer(fingerprintText) -> raw public key }:
// the keys the person pinned after seeing their fingerprints (RCP-002).

async function wrap(ctx, recipientPublic, keyPackage, signer, ephemeralRaw) {
  const context = encodeContext(ctx);
  const ciphertext = await hpkeSeal(recipientPublic, await hpkeInfo(context), keyPackage, ephemeralRaw);
  return { context, ciphertext, signature: await signJWS(TYPE_ENVELOPE, signer, await envelopeSigningInput(context, ciphertext)) };
}

async function pinned(trust, r) {
  const pub = trust.recipient(r.fingerprint);
  if (!pub || digestText(await recipientFingerprint(pub)) !== r.fingerprint) fail("untrusted", `recipient ${r.fingerprint}`);
  return pub;
}

// encrypt is fga's Encrypt: params holds the tenant, object,
// logical-version, crypto-version, blob and attempt UUIDs the upload
// intent allocated (text form); recipients are { fingerprint, keyVersion }
// and must be pinned. fixed (tests only) sets the random values.
export async function encrypt(plaintext, params, recipients, signer, trust, nowMs, fixed = {}) {
  if (!recipients.length) fail("untrusted", "no recipient");
  const pubs = [];
  for (const r of recipients) pubs.push(await pinned(trust, r));
  const id = k => parseUUID(params[k]);
  const aad = payloadAAD(id("tenant"), id("object"), id("cryptoVersion"));
  const keyValue = fixed.keyValue || crypto.getRandomValues(new Uint8Array(32));
  const keyID = fixed.keyID || crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 || 1;
  const ciphertext = await payloadEncrypt(keyValue, aad, plaintext, fixed);
  const sum = await sha256(ciphertext);
  const keyPackage = encodeKeyPackage(aad, encodeKeyset(keyValue, keyID));
  const envelopes = [];
  for (let i = 0; i < recipients.length; i++) {
    envelopes.push(await wrap({ tenant: id("tenant"), object: id("object"), logicalVersion: id("logicalVersion"), cryptoVersion: id("cryptoVersion"),
      suite: SUITE, format: FORMAT, ciphertextSHA256: sum, ciphertextLength: ciphertext.length,
      recipient: parseDigest(recipients[i].fingerprint), recipientKeyVersion: recipients[i].keyVersion, generation: 1,
      sharer: signer.fingerprint, createdAtUnixMs: nowMs }, pubs[i], keyPackage, signer, fixed.ephemeral && fixed.ephemeral[i]));
  }
  const descriptor = marshalDescriptor({ tenant_id: params.tenant, object_id: params.object, logical_version_id: params.logicalVersion,
    crypto_version_id: params.cryptoVersion, blob_id: params.blob, attempt_id: params.attempt, suite: SUITE, format: FORMAT,
    ciphertext_sha256: digestText(sum), ciphertext_length: ciphertext.length, signer: signer.fingerprintText, createdAtUnixMs: nowMs,
    key_commitment: await keyCommitment(keyPackage) });
  return { ciphertext, descriptor, descriptorSignature: await signJWS(TYPE_DESCRIPTOR, signer, descriptor), envelopes,
    ciphertextSHA256: digestText(sum), ciphertextLength: ciphertext.length };
}

const contextMatches = (c, d) => uuidText(c.tenant) === d.tenant_id && uuidText(c.object) === d.object_id &&
  uuidText(c.logicalVersion) === d.logical_version_id && uuidText(c.cryptoVersion) === d.crypto_version_id &&
  c.suite === d.suite && c.format === d.format && digestText(c.ciphertextSHA256) === d.ciphertext_sha256 &&
  c.ciphertextLength === d.ciphertext_length;

// checked verifies a package's origin and bindings for key, in fga's
// order, and returns its context and the opened key package.
async function checked(pkg, key, trust, ciphertext) {
  const keyFor = trustedSigner(trust);
  await verifyJWS(TYPE_DESCRIPTOR, pkg.descriptorSignature, pkg.descriptor, keyFor);
  const desc = parseDescriptor(pkg.descriptor);
  if (ciphertext && (ciphertext.length !== desc.ciphertext_length || digestText(await sha256(ciphertext)) !== desc.ciphertext_sha256)) {
    fail("integrity", "ciphertext digest or length does not match its descriptor");
  }
  const env = pkg.envelope;
  await verifyJWS(TYPE_ENVELOPE, env.signature, await envelopeSigningInput(env.context, env.ciphertext), keyFor);
  const ctx = parseContext(env.context);
  if (!contextMatches(ctx, desc) || !equal(ctx.recipient, key.fingerprint)) fail("binding", "envelope bound to another version or recipient");
  const keyPackage = await hpkeOpen(key, await hpkeInfo(env.context), env.ciphertext);
  const { binding, keyset } = decodeKeyPackage(keyPackage);
  if (!equal(binding, payloadAAD(ctx.tenant, ctx.object, ctx.cryptoVersion))) fail("binding", "key package bound to another object");
  const keyValue = decodeKeyset(keyset);
  // In fga's order: the key package first, then its commitment.
  if (desc.key_commitment && await keyCommitment(keyPackage) !== desc.key_commitment) fail("binding", "the envelope holds another key than the descriptor commits to");
  return { ctx, keyPackage, keyValue, aad: binding };
}

// decrypt is fga's Decrypt: nothing is returned unless the descriptor,
// the complete ciphertext, the envelope and every binding check out and
// every segment authenticates. pkg is { descriptor, descriptorSignature,
// envelope: { context, ciphertext, signature } }.
export async function decrypt(ciphertext, pkg, key, trust) {
  const { keyValue, aad } = await checked(pkg, key, trust, ciphertext);
  return payloadDecrypt(keyValue, aad, ciphertext);
}

// reshare is fga's Reshare: the same key package, wrapped for a pinned
// target with the given generation and signed by signer.
export async function reshare(pkg, key, trust, target, generation, signer, nowMs, ephemeralRaw) {
  const targetPublic = await pinned(trust, target);
  const { ctx, keyPackage } = await checked(pkg, key, trust, null);
  return wrap({ ...ctx, recipient: parseDigest(target.fingerprint), recipientKeyVersion: target.keyVersion, generation,
    sharer: signer.fingerprint, createdAtUnixMs: nowMs }, targetPublic, keyPackage, signer, ephemeralRaw);
}
