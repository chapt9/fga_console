// Writes what the browser's wire profile 1 (web/fga-profile1.mjs) makes,
// for fga's Go SDK to open (fga sdk/go/crypto TestBrowserProduced, file
// testdata/browser-produced-v1.json): new encryptions of fga's test
// recipient, a reshare of fga's "text" sample to its other recipient, and
// both enrollment proofs. Uses the keys of test/vectors/browser-v1.json.
//   node test/produce-fga-samples.mjs OUT.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as p from "../web/fga-profile1.mjs";

const here = fileURLToPath(new URL("vectors/", import.meta.url));
const v = JSON.parse(readFileSync(here + "browser-v1.json", "utf8"));
const b = s => p.fromBase64(s);
const pattern = n => Uint8Array.from({ length: n }, (_, i) => i % 251);
const recipient = await p.recipientKey(b(v.recipient.private));
const other = await p.recipientKey(b(v.other_recipient.private));
const signer = await p.signingKey(b(v.signer.seed));
const trust = {
  recipient: fp => ({ [v.recipient.fingerprint]: recipient.publicRaw, [v.other_recipient.fingerprint]: other.publicRaw })[fp],
  signer: fp => (fp === v.signer.fingerprint ? signer.publicRaw : undefined),
};
const now = v.created_at_unix_ms;
const envelope = e => ({ context: p.base64(e.context), ciphertext: p.base64(e.ciphertext), signature: e.signature });

const samples = [];
for (const [i, n] of [0, 1, 1000].entries()) {
  const id = k => `${"0123456789abcdef"[i]}${k}`.padEnd(8, "0");
  const params = { tenant: "b00eda52-152b-4985-a2d3-40178b9bcccd", object: `${id("1")}-0000-4000-8000-00000000000${i}`,
    logicalVersion: `${id("2")}-0000-4000-8000-00000000000${i}`, cryptoVersion: `${id("3")}-0000-4000-8000-00000000000${i}`,
    blob: `${id("4")}-0000-4000-8000-00000000000${i}`, attempt: `${id("5")}-0000-4000-8000-00000000000${i}` };
  const out = await p.encrypt(pattern(n), params, [{ fingerprint: recipient.fingerprintText, keyVersion: 1 }], signer, trust, now);
  samples.push({ name: `browser ${n} bytes`, plaintext_length: n, ciphertext: p.base64(out.ciphertext), descriptor: p.base64(out.descriptor),
    descriptor_signature: out.descriptorSignature, envelope: envelope(out.envelopes[0]) });
}

const text = v.samples.find(s => s.name === "text");
const textPackage = { descriptor: b(text.descriptor), descriptorSignature: text.descriptor_signature,
  envelope: { context: b(text.envelope.context), ciphertext: b(text.envelope.ciphertext), signature: text.envelope.signature } };
const reshared = await p.reshare(textPackage, recipient, trust, { fingerprint: other.fingerprintText, keyVersion: 2 }, 2, signer, now);

const nonce = pattern(32).map(x => x ^ 0x5a);
const ephemeral = await p.newRecipientPrivate();
const eph = await p.recipientKey(ephemeral);
const recipientProof = await p.recipientProof(recipient, eph.publicRaw, nonce, "browser-challenge-recipient", "t-acme", "dana");
const signingProof = await p.signingProof(signer, "browser-challenge-signing", "t-acme", "dana", nonce);

writeFileSync(process.argv[2], JSON.stringify({
  format: "fga.browser-produced/v1",
  about: "Made by fga-console web/fga-profile1.mjs (test/produce-fga-samples.mjs) with the keys of browser-v1.json; fga's SDK must open and verify all of it.",
  samples,
  reshare: { of: "text", recipient: "other_recipient", key_version: 2, generation: 2, envelope: envelope(reshared) },
  recipient_proof: { challenge_id: "browser-challenge-recipient", tenant: "t-acme", principal: "dana", nonce: p.base64(nonce),
    ephemeral_private: p.base64(ephemeral), ephemeral_public: p.base64(eph.publicRaw), proof: p.base64(recipientProof) },
  signing_proof: { challenge_id: "browser-challenge-signing", tenant: "t-acme", principal: "dana", nonce: p.base64(nonce), jws: signingProof },
}, null, 1) + "\n");
