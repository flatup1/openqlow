import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeLineCrmIntake, parseLineCrmInquiryText } from "./crm_intake.js";

async function readProspects(dataDir: string): Promise<Array<Record<string, unknown>>> {
  return JSON.parse(await readFile(path.join(dataDir, "prospects.json"), "utf8")) as Array<Record<string, unknown>>;
}

async function testOnlyExplicitInquiryTextIsParsed(): Promise<void> {
  assert.equal(parseLineCrmInquiryText("OK FG-20260611-001"), undefined);
  assert.equal(parseLineCrmInquiryText("/push"), undefined);
  assert.equal(parseLineCrmInquiryText("記憶係 今日のログ"), undefined);
  assert.equal(parseLineCrmInquiryText("問い合わせ: 小学生の体験を相談したいです"), "小学生の体験を相談したいです");
  assert.equal(parseLineCrmInquiryText("問い合わせ： 女性でも初心者で大丈夫ですか？"), "女性でも初心者で大丈夫ですか？");
}

async function testCommandTextDoesNotCreateProspect(): Promise<void> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "openqlow-line-crm-data-"));
  try {
    const result = await executeLineCrmIntake({
      lineUserId: "Uowner",
      text: "OK FG-20260611-001",
      dataDir,
      notifyOwner: async () => ({ ok: true, mode: "dry_run" }),
    });

    assert.equal(result.handled, false);
    await assert.rejects(readProspects(dataDir), /ENOENT/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testManualInquiryCreatesOwnerNotificationWithoutReplyDraftInWebhookMessage(): Promise<void> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "openqlow-line-crm-data-"));
  const notifications: string[] = [];
  try {
    const result = await executeLineCrmIntake({
      lineUserId: "Uowner",
      text: "問い合わせ: 小学生の子供に習わせたい。初心者でも大丈夫ですか？",
      dataDir,
      now: () => new Date("2026-06-11T09:00:00.000Z"),
      notifyOwner: async (message) => {
        notifications.push(message);
        return { ok: true, mode: "dry_run" };
      },
    });

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    assert.equal(result.action, "crm_intake");
    assert.match(result.message, /CRMに登録しました/);
    assert.doesNotMatch(result.message, /AIKA/);

    const prospects = await readProspects(dataDir);
    assert.equal(prospects.length, 1);
    assert.match(String(prospects[0].externalId), /^manual:Uowner:/);
    assert.equal(prospects[0].contactSource, "LINE");
    assert.equal(prospects[0].inquiryText, "小学生の子供に習わせたい。初心者でも大丈夫ですか？");
    assert.equal(notifications.length, 1);
    assert.match(notifications[0], /新規問い合わせ/);
    assert.match(notifications[0], /返信下書き/);
    assert.match(notifications[0], /AIKA/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testManualInquiryDoesNotMergeDifferentTextsFromOwner(): Promise<void> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "openqlow-line-crm-data-"));
  try {
    const base = {
      lineUserId: "Uowner",
      dataDir,
      notifyOwner: async () => ({ ok: true, mode: "dry_run" as const }),
      now: () => new Date("2026-06-11T09:00:00.000Z"),
    };

    await executeLineCrmIntake({ ...base, text: "問い合わせ: 子どもの体験を相談したいです" });
    await executeLineCrmIntake({ ...base, text: "問い合わせ: 子どもの体験を相談したいです" });
    await executeLineCrmIntake({ ...base, text: "問い合わせ: 女性クラスの雰囲気を知りたいです" });

    const prospects = await readProspects(dataDir);
    assert.equal(prospects.length, 2);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

await testOnlyExplicitInquiryTextIsParsed();
await testCommandTextDoesNotCreateProspect();
await testManualInquiryCreatesOwnerNotificationWithoutReplyDraftInWebhookMessage();
await testManualInquiryDoesNotMergeDifferentTextsFromOwner();

console.log("line crm intake tests passed");
