import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  JOURNEY_LINKED_REPLY,
  JOURNEY_NOT_FOUND_REPLY,
  createJourneyFromWebos,
  executeLineJourneyLink,
  formatJourneyOwnerSummary,
  parseJourneyIdText,
  sanitizeAnswers,
  type JourneyRecord,
} from "./journey_intake.js";

async function makeDataDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "journey-test-"));
}

async function readJourneys(dataDir: string): Promise<JourneyRecord[]> {
  return JSON.parse(await readFile(path.join(dataDir, "journeys.json"), "utf8")) as JourneyRecord[];
}

const okNotify = async () => ({ ok: true, mode: "sent" as const });

async function testSanitizeAnswersDropsUnknownAndRequiresAudience(): Promise<void> {
  assert.equal(sanitizeAnswers({ gender: "female" }), undefined); // audienceなしは拒否
  assert.equal(sanitizeAnswers("text"), undefined);
  const cleaned = sanitizeAnswers({
    audience: "self",
    gender: "female",
    goal: ["diet", "hack_attempt", "stress", "try", "strong"], // 未知値は捨て、最大3件
    experience: "first",
    availability: ["weekday_night"],
    name: "田中太郎", // PIIらしき未知キーは保存しない
  });
  assert.ok(cleaned);
  assert.deepEqual(cleaned, {
    audience: "self",
    gender: "female",
    experience: "first",
    goal: ["diet", "stress", "try"],
    availability: ["weekday_night"],
  });
}

async function testCreateAndParseJourneyId(): Promise<void> {
  const dataDir = await makeDataDir();
  try {
    const created = await createJourneyFromWebos(
      { answers: { audience: "self", goal: ["diet"] } },
      { dataDir },
    );
    assert.equal(created.ok, true);
    assert.match(created.journeyId ?? "", /^J-[a-f0-9]{12}$/);
    assert.equal(parseJourneyIdText(` #${created.journeyId?.toUpperCase()} `), created.journeyId);
    assert.equal(parseJourneyIdText("こんにちは"), undefined);

    const bad = await createJourneyFromWebos({ answers: { audience: "hacker" } }, { dataDir });
    assert.equal(bad.ok, false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testLinkNotifiesOwnerInJapaneseAndSavesLead(): Promise<void> {
  const dataDir = await makeDataDir();
  try {
    const created = await createJourneyFromWebos(
      {
        answers: {
          audience: "self", gender: "female", goal: ["diet"],
          experience: "first", availability: ["weekday_night"],
        },
      },
      { dataDir },
    );
    const notified: string[] = [];
    const result = await executeLineJourneyLink({
      text: created.journeyId ?? "",
      lineUserId: "Ucustomer1",
      dataDir,
      notifyOwner: async text => {
        notified.push(text);
        return { ok: true, mode: "sent" as const };
      },
    });
    assert.equal(result.handled, true);
    assert.equal(result.action, "webos_journey_linked");
    assert.equal(result.message, JOURNEY_LINKED_REPLY);
    assert.equal(result.replyToSender, true);

    // オーナー通知は日本語のみ・内部キーを出さない
    assert.equal(notified.length, 1);
    assert.ok(notified[0].includes("【WebOSから新規相談】"));
    assert.ok(notified[0].includes("対象: 本人"));
    assert.ok(notified[0].includes("性別: 女性"));
    assert.ok(notified[0].includes("経験: 完全に初めて"));
    assert.ok(notified[0].includes("目的: ダイエット"));
    assert.ok(notified[0].includes("希望時間: 平日の夜"));
    assert.ok(notified[0].includes("再質問は不要"));
    assert.ok(!notified[0].includes("female"));
    assert.ok(!notified[0].includes("diet"));

    // Leadレコードとして保存されている
    const journeys = await readJourneys(dataDir);
    assert.equal(journeys.length, 1);
    assert.equal(journeys[0].linked, true);
    assert.equal(journeys[0].line_user_id, "Ucustomer1");
    assert.equal(journeys[0].notify_status, "sent");
    assert.ok(journeys[0].linked_at);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testSameUserResendDoesNotDoubleNotify(): Promise<void> {
  const dataDir = await makeDataDir();
  try {
    const created = await createJourneyFromWebos({ answers: { audience: "consult" } }, { dataDir });
    let notifyCount = 0;
    const notifyOwner = async () => {
      notifyCount += 1;
      return { ok: true, mode: "sent" as const };
    };
    const base = { text: created.journeyId ?? "", lineUserId: "Usame", dataDir, notifyOwner };
    const first = await executeLineJourneyLink(base);
    const second = await executeLineJourneyLink(base);
    assert.equal(first.action, "webos_journey_linked");
    assert.equal(second.action, "webos_journey_linked"); // 再送でも優しく同じ案内
    assert.equal(notifyCount, 1); // 通知は1回だけ
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testDifferentUserCannotStealJourney(): Promise<void> {
  const dataDir = await makeDataDir();
  try {
    const created = await createJourneyFromWebos({ answers: { audience: "self" } }, { dataDir });
    await executeLineJourneyLink({
      text: created.journeyId ?? "", lineUserId: "Uowner1", dataDir, notifyOwner: okNotify,
    });
    const thief = await executeLineJourneyLink({
      text: created.journeyId ?? "", lineUserId: "Uthief", dataDir, notifyOwner: okNotify,
    });
    assert.equal(thief.action, "webos_journey_not_found");
    assert.equal(thief.message, JOURNEY_NOT_FOUND_REPLY);
    const journeys = await readJourneys(dataDir);
    assert.equal(journeys[0].line_user_id, "Uowner1"); // 紐づけは変わらない
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testUnlinkedJourneyExpiresButLinkedLeadIsKept(): Promise<void> {
  const dataDir = await makeDataDir();
  try {
    const old = new Date("2026-08-01T00:00:00.000Z");
    const createdOld = await createJourneyFromWebos({ answers: { audience: "self" } }, { dataDir, now: old });
    const createdLinked = await createJourneyFromWebos({ answers: { audience: "kids", kidsAge: "es_lower" } }, { dataDir, now: old });
    await executeLineJourneyLink({
      text: createdLinked.journeyId ?? "", lineUserId: "Uparent", dataDir, now: old, notifyOwner: okNotify,
    });

    // 8日後: 未連携は期限切れ、連携済みLeadは残る
    const later = new Date("2026-08-09T00:00:00.000Z");
    const expired = await executeLineJourneyLink({
      text: createdOld.journeyId ?? "", lineUserId: "Ulate", dataDir, now: later, notifyOwner: okNotify,
    });
    assert.equal(expired.action, "webos_journey_not_found");
    const journeys = await readJourneys(dataDir);
    assert.equal(journeys.length, 1);
    assert.equal(journeys[0].answers.audience, "kids");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testNotifyFailureDoesNotLoseLead(): Promise<void> {
  const dataDir = await makeDataDir();
  try {
    const created = await createJourneyFromWebos(
      { answers: { audience: "kids", kidsAge: "preschool", kidsHope: ["confidence"] } },
      { dataDir },
    );
    const result = await executeLineJourneyLink({
      text: created.journeyId ?? "",
      lineUserId: "Uparent2",
      dataDir,
      notifyOwner: async () => ({ ok: false, mode: "sent" as const, error: "LINE push 500" }),
    });
    assert.equal(result.action, "webos_journey_linked"); // ユーザー体験は成功のまま
    const journeys = await readJourneys(dataDir);
    assert.equal(journeys[0].linked, true); // Leadは失われない
    assert.equal(journeys[0].notify_status, "failed"); // 再送用に失敗を記録
    assert.equal(journeys[0].notify_error, "LINE push 500");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function testKidsSummaryAndGenderSkip(): Promise<void> {
  const record: JourneyRecord = {
    journey_id: "J-abcdefabcdef",
    answers: { audience: "kids", kidsAge: "es_upper", kidsHope: ["bully", "confidence"] },
    source: "webos",
    created_at: "2026-08-19T00:00:00.000Z",
    linked: true,
  };
  const summary = formatJourneyOwnerSummary(record);
  assert.ok(summary.includes("対象: お子さま"));
  assert.ok(summary.includes("お子さまの年代: 小学校高学年"));
  assert.ok(summary.includes("保護者の期待: いじめなどへの不安、自信をつけてほしい"));
  assert.ok(!summary.includes("性別")); // 未回答の行は出さない
}

await testSanitizeAnswersDropsUnknownAndRequiresAudience();
await testCreateAndParseJourneyId();
await testLinkNotifiesOwnerInJapaneseAndSavesLead();
await testSameUserResendDoesNotDoubleNotify();
await testDifferentUserCannotStealJourney();
await testUnlinkedJourneyExpiresButLinkedLeadIsKept();
await testNotifyFailureDoesNotLoseLead();
await testKidsSummaryAndGenderSkip();

console.log("line journey intake tests passed");
