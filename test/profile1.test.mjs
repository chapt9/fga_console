// The browser's wire profile 1 (web/fga-profile1.mjs) against the vectors
// fga's Go SDK wrote (test/vectors, see SOURCE): the exact bytes, opening
// fga's samples, refusing its negative samples with the same error, and
// re-encrypting fga's samples to the identical ciphertext. Run with
// node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as p from "../web/fga-profile1.mjs";

const here = fileURLToPath(new URL("vectors/", import.meta.url));
const v = JSON.parse(readFileSync(here + "browser-v1.json", "utf8"));
const b = s => p.fromBase64(s);
const pattern = n => Uint8Array.from({ length: n }, (_, i) => i % 251);
const ciphertextOf = s => s.ciphertext_file ? new Uint8Array(readFileSync(here + s.ciphertext_file)) : b(s.ciphertext || "");
const packageOf = s => ({ descriptor: b(s.descriptor), descriptorSignature: s.descriptor_signature,
  envelope: { context: b(s.envelope.context), ciphertext: b(s.envelope.ciphertext), signature: s.envelope.signature } });

function mutate(ct, mutation) {
  const c = ct.slice();
  switch (mutation) {
    case "truncate": return c.slice(0, -1);
    case "append-zero": return p.concat(c, Uint8Array.of(0));
    case "flip-middle": c[c.length >> 1] ^= 1; return c;
    case "drop-last-segment": return c.slice(0, 1 << 20);
  }
  return c;
}

async function keys() {
  const recipient = await p.recipientKey(b(v.recipient.private));
  const other = await p.recipientKey(b(v.other_recipient.private));
  const signer = await p.signingKey(b(v.signer.seed));
  const trust = {
    recipient: fp => ({ [v.recipient.fingerprint]: recipient.publicRaw, [v.other_recipient.fingerprint]: other.publicRaw })[fp],
    signer: fp => (fp === v.signer.fingerprint ? signer.publicRaw : undefined),
  };
  return { recipient, other, signer, trust };
}

test("keys and fingerprints", async () => {
  const { recipient, other, signer } = await keys();
  assert.equal(p.base64(recipient.publicRaw), v.recipient.public);
  assert.equal(recipient.fingerprintText, v.recipient.fingerprint);
  assert.equal(other.fingerprintText, v.other_recipient.fingerprint);
  assert.equal(p.base64(signer.publicRaw), v.signer.public);
  assert.equal(signer.fingerprintText, v.signer.fingerprint);
});

test("exact bytes", async () => {
  const { recipient, signer } = await keys();
  const x = v.exact;
  const aad = p.payloadAAD(p.parseUUID(x.payload_aad.tenant_id), p.parseUUID(x.payload_aad.object_id), p.parseUUID(x.payload_aad.crypto_version_id));
  assert.equal(p.base64(aad), x.payload_aad.bytes);

  const c = x.context;
  const fields = { tenant: p.parseUUID(c.tenant_id), object: p.parseUUID(c.object_id), logicalVersion: p.parseUUID(c.logical_version_id),
    cryptoVersion: p.parseUUID(c.crypto_version_id), suite: c.suite, format: c.format, ciphertextSHA256: p.parseDigest(c.ciphertext_sha256),
    ciphertextLength: c.ciphertext_length, recipient: p.parseDigest(c.recipient_fingerprint), recipientKeyVersion: c.recipient_key_version,
    generation: c.envelope_generation, sharer: p.parseDigest(c.sharer_signing_key), createdAtUnixMs: c.created_at_unix_ms };
  const context = p.encodeContext(fields);
  assert.equal(p.base64(context), c.bytes);
  assert.deepEqual(p.parseContext(context), fields);

  assert.equal(p.base64(await p.hpkeInfo(context)), x.hpke_info);
  const input = await p.envelopeSigningInput(context, b(x.hpke_ciphertext));
  assert.equal(p.base64(input), x.envelope_signing_input);
  assert.equal(p.digestText(await p.envelopeDigest(context, b(x.hpke_ciphertext))), x.envelope_digest);
  assert.equal(await p.signJWS(p.TYPE_ENVELOPE, signer, input), x.envelope_jws, "Ed25519 signatures are deterministic");

  const sp = x.signing_proof;
  assert.equal(p.base64(p.signingProofInput(sp.challenge_id, sp.tenant, sp.principal, signer.fingerprintText, b(sp.nonce))), sp.input);
  assert.equal(await p.signingProof(signer, sp.challenge_id, sp.tenant, sp.principal, b(sp.nonce)), sp.jws);

  const rp = x.recipient_proof;
  const proof = await p.recipientProof(recipient, b(rp.ephemeral_public), b(rp.nonce), rp.challenge_id, rp.tenant, rp.principal);
  assert.equal(p.base64(proof), rp.proof);

  const kp = x.key_package;
  assert.equal(p.base64(p.decodeKeyset(b(kp.keyset))), kp.key_value);
  assert.equal(b(kp.keyset)[0], 0x08, "a keyset starts with its primary key ID");
  const keyID = Number(readVarint(b(kp.keyset), 1));
  assert.equal(p.base64(p.encodeKeyset(b(kp.key_value), keyID)), kp.keyset, "the same keyset bytes as Tink writes");
  assert.equal(p.base64(p.encodeKeyPackage(b(kp.binding), b(kp.keyset))), kp.bytes);
  const back = p.decodeKeyPackage(b(kp.bytes));
  assert.equal(p.base64(back.binding), kp.binding);
  assert.equal(p.base64(back.keyset), kp.keyset);
  // The key commitment, pinned with fga's Go SDK (TestKeyCommitmentVector).
  assert.equal(await p.keyCommitment(b(kp.bytes)), "sha256:241f14d54445f6c810d434dea6156c848cb99be0ff479f22537f4cd42ed7f645");
});

function readVarint(bytes, at) {
  let n = 0n;
  for (let i = 0; ; i++) {
    n |= BigInt(bytes[at + i] & 0x7f) << BigInt(7 * i);
    if (!(bytes[at + i] & 0x80)) return n;
  }
}

test("fga's samples open", async () => {
  const { recipient, trust } = await keys();
  for (const s of v.samples) {
    const ct = ciphertextOf(s);
    assert.equal(p.digestText(await p.sha256(ct)), s.ciphertext_sha256, s.name);
    const plain = await p.decrypt(ct, packageOf(s), recipient, trust);
    assert.deepEqual(plain, pattern(s.plaintext_length), s.name);
  }
});

test("fga's negative samples are refused with the same error", async () => {
  const { recipient, other, trust } = await keys();
  const samples = Object.fromEntries(v.samples.map(s => [s.name, s]));
  const noSigners = { recipient: trust.recipient, signer: () => undefined };
  for (const n of v.negative) {
    const s = samples[n.sample];
    const pkg = packageOf(s);
    if (n.descriptor) Object.assign(pkg, { descriptor: b(n.descriptor), descriptorSignature: n.descriptor_signature });
    if (n.envelope) pkg.envelope = { context: b(n.envelope.context), ciphertext: b(n.envelope.ciphertext), signature: n.envelope.signature };
    await assert.rejects(p.decrypt(mutate(ciphertextOf(s), n.mutation), pkg, n.key === "other" ? other : recipient, n.trust_signer ? trust : noSigners),
      e => e instanceof p.ProfileError && e.kind === n.want, n.name);
  }
});

test("re-encrypting fga's samples gives Tink's exact ciphertext", async () => {
  const { recipient } = await keys();
  for (const s of v.samples) {
    const ct = ciphertextOf(s);
    const ctx = p.parseContext(b(s.envelope.context));
    const aad = p.payloadAAD(ctx.tenant, ctx.object, ctx.cryptoVersion);
    const pkg = p.decodeKeyPackage(await p.hpkeOpen(recipient, await p.hpkeInfo(b(s.envelope.context)), b(s.envelope.ciphertext)));
    const again = await p.payloadEncrypt(p.decodeKeyset(pkg.keyset), aad, pattern(s.plaintext_length),
      { salt: ct.slice(1, 33), noncePrefix: ct.slice(33, 40) });
    assert.ok(p.equal(again, ct), s.name);
  }
});

test("the browser's own encryption opens, and reshares to a pinned recipient", async () => {
  const { recipient, other, signer, trust } = await keys();
  const params = { tenant: "b00eda52-152b-4985-a2d3-40178b9bcccd", object: "0e6b2c1a-7d1f-4c3b-9a55-1f2e3d4c5b6a",
    logicalVersion: "1f7c3d2b-8e20-4d4c-8b66-2a3f4e5d6c7b", cryptoVersion: "2a8d4e3c-9f31-4e5d-9c77-3b4a5f6e7d8c",
    blob: "3b9e5f4d-a042-4f6e-8d88-4c5b6a7f8e9d", attempt: "4cae6a5e-b153-4a7f-9e99-5d6c7b8a9fae" };
  for (const n of [0, 1, 1000, (1 << 20) - 56, (1 << 20) - 55]) {
    const out = await p.encrypt(pattern(n), params, [{ fingerprint: recipient.fingerprintText, keyVersion: 1 }], signer, trust, 1_800_000_000_000);
    const pkg = { descriptor: out.descriptor, descriptorSignature: out.descriptorSignature, envelope: out.envelopes[0] };
    assert.deepEqual(await p.decrypt(out.ciphertext, pkg, recipient, trust), pattern(n), `size ${n}`);
    const shared = await p.reshare(pkg, recipient, trust, { fingerprint: other.fingerprintText, keyVersion: 2 }, 2, signer, 1_800_000_001_000);
    assert.deepEqual(await p.decrypt(out.ciphertext, { ...pkg, envelope: shared }, other, trust), pattern(n), `reshared, size ${n}`);
  }
  await assert.rejects(p.encrypt(pattern(1), params, [{ fingerprint: "sha256:" + "0".repeat(64), keyVersion: 1 }], signer, trust, 1),
    e => e.kind === "untrusted", "an unpinned recipient");
});

// fga's security review of 4 November 2026, finding 5: the descriptor
// commits to the key package, so an envelope that holds another key is
// refused before anything is decrypted; one from before the commitment
// still opens.
test("the descriptor commits to the key", async () => {
  const { recipient, signer, trust } = await keys();
  const params = { tenant: "b00eda52-152b-4985-a2d3-40178b9bcccd", object: "0e6b2c1a-7d1f-4c3b-9a55-1f2e3d4c5b6a",
    logicalVersion: "1f7c3d2b-8e20-4d4c-8b66-2a3f4e5d6c7b", cryptoVersion: "2a8d4e3c-9f31-4e5d-9c77-3b4a5f6e7d8c",
    blob: "3b9e5f4d-a042-4f6e-8d88-4c5b6a7f8e9d", attempt: "4cae6a5e-b153-4a7f-9e99-5d6c7b8a9fae" };
  const to = [{ fingerprint: recipient.fingerprintText, keyVersion: 1 }];
  const one = await p.encrypt(pattern(64), params, to, signer, trust, 1_800_000_000_000);
  const d = p.parseDescriptor(one.descriptor);
  assert.match(d.key_commitment, /^sha256:[0-9a-f]{64}$/);
  // The same envelope context, signed, around another key package for the
  // same object: only the commitment tells them apart.
  const context = one.envelopes[0].context;
  const aad = p.payloadAAD(p.parseUUID(params.tenant), p.parseUUID(params.object), p.parseUUID(params.cryptoVersion));
  const other = p.encodeKeyPackage(aad, p.encodeKeyset(crypto.getRandomValues(new Uint8Array(32)), 7));
  const ciphertext = await p.hpkeSeal(recipient.publicRaw, await p.hpkeInfo(context), other);
  const swapped = { context, ciphertext, signature: await p.signJWS(p.TYPE_ENVELOPE, signer, await p.envelopeSigningInput(context, ciphertext)) };
  await assert.rejects(p.decrypt(one.ciphertext, { descriptor: one.descriptor, descriptorSignature: one.descriptorSignature, envelope: swapped },
    recipient, trust), e => e.kind === "binding" && /commits/.test(e.message), "an envelope with another key");
  const legacy = p.marshalDescriptor({ ...d, key_commitment: undefined, createdAtUnixMs: Date.parse(d.created_at) });
  assert.ok(!new TextDecoder().decode(legacy).includes("key_commitment"));
  const pkg = { descriptor: legacy, descriptorSignature: await p.signJWS(p.TYPE_DESCRIPTOR, signer, legacy), envelope: one.envelopes[0] };
  assert.deepEqual(await p.decrypt(one.ciphertext, pkg, recipient, trust), pattern(64), "a descriptor from before the commitment");
});

test("strict parsing", async () => {
  const s = v.samples[1];
  const context = b(s.envelope.context);
  for (const [name, bad] of [["trailing byte", p.concat(context, Uint8Array.of(0))], ["truncated", context.slice(0, -1)],
    ["profile 2", p.concat(Uint8Array.of(0x08, 0x02), context.slice(2))], ["overlong varint", p.concat(Uint8Array.of(0x08, 0x81, 0x00), context.slice(2))],
    ["unknown field", p.concat(context, Uint8Array.of(0x78, 0x01))]]) {
    assert.throws(() => p.parseContext(bad), e => e.kind === "format", name);
  }
  const desc = new TextDecoder().decode(b(s.descriptor));
  for (const [name, bad] of [["repeated field", desc.replace('{"version"', '{"suite":1,"version"')], ["unknown field", desc.replace("}", ',"x":1}')],
    ["trailing data", desc + "{}"], ["missing field", desc.replace(/,"signer":"[^"]+"/, "")], ["fraction", desc.replace('"suite":1', '"suite":1.0')]]) {
    assert.throws(() => p.parseDescriptor(new TextEncoder().encode(bad)), e => e.kind === "format", name);
  }
  assert.doesNotThrow(() => p.parseDescriptor(new TextEncoder().encode(desc.replace(/,/g, ", "))), "whitespace is JSON");
});
