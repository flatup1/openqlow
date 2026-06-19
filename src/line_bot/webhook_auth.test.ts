import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyLineSignature } from "./webhook_auth.js";

const secret = "test-channel-secret";
const body = JSON.stringify({ events: [{ type: "message", message: { type: "text", text: "OK FG-20260101-001" } }] });
const validSig = crypto.createHmac("sha256", secret).update(body).digest("base64");

// secret 設定済み: 正しい署名だけ通す
assert.equal(verifyLineSignature(body, validSig, { channelSecret: secret, dryRun: true }), true, "valid signature passes");
assert.equal(verifyLineSignature(body, validSig, { channelSecret: secret, dryRun: false }), true, "valid signature passes in production");
assert.equal(verifyLineSignature(body, "wrong-signature", { channelSecret: secret, dryRun: false }), false, "wrong signature rejected");
assert.equal(verifyLineSignature(body, undefined, { channelSecret: secret, dryRun: false }), false, "missing signature rejected");

// 署名が改ざんされても通らない（別本文の署名を使い回せない）
const otherSig = crypto.createHmac("sha256", secret).update("tampered").digest("base64");
assert.equal(verifyLineSignature(body, otherSig, { channelSecret: secret, dryRun: false }), false, "signature for other body rejected");

// secret 未設定: dry-run は通す（ローカル検証）／本番送信モードは fail-closed で全拒否
assert.equal(verifyLineSignature(body, undefined, { channelSecret: "", dryRun: true }), true, "no secret + dry-run allows (dev)");
assert.equal(verifyLineSignature(body, undefined, { channelSecret: "", dryRun: false }), false, "no secret + production rejects (fail-closed)");

// content-type に依存しないこと（呼び出し側がゲートしない前提）= text/plain でも同じ判定
assert.equal(verifyLineSignature("OK FG-20260101-001", undefined, { channelSecret: secret, dryRun: false }), false, "plain-text forged command rejected in production");

console.log("line webhook auth tests passed");
