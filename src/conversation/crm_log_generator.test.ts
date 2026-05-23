import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConversationSession } from "./session_store.js";
import { renderCrmLogMarkdown, saveCrmLog } from "./crm_log_generator.js";

function baseSession(overrides: Partial<ConversationSession> = {}): ConversationSession {
  return {
    userId: "test-user",
    command: "/昨日の記録",
    step: "ready_to_save",
    activeGenreQuestionIndex: 0,
    genres: [],
    startedAt: "2026-05-22T00:00:00.000Z",
    expiresAt: "2026-05-22T00:30:00.000Z",
    lastInteractionAt: "2026-05-22T00:10:00.000Z",
    ...overrides,
  };
}

// テスト 1: 空セッション → 「記録なし」が出力される
{
  const session = baseSession();
  const { markdown, dateJst } = renderCrmLogMarkdown(session, { dateJst: "2026-05-22" });
  assert.equal(dateJst, "2026-05-22");
  assert.ok(markdown.includes("# FLATUP GYM 日次 CRM ログ"));
  assert.ok(markdown.includes("## 記録なし"));
  assert.ok(markdown.startsWith("---\n"));
  assert.ok(markdown.includes("date: 2026-05-22"));
}

// テスト 2: 体験者 1 件 → trial セクション + 回答が出る
{
  const session = baseSession({
    genres: [{
      type: "trial",
      data: {
        name: "山田 T.",
        gender: "女性",
        age_band: "30代",
        reaction: "楽しそう",
      },
      answers: [
        { key: "name", question: "名前は？", answer: "山田 T." },
        { key: "gender", question: "性別は？", answer: "女性" },
        { key: "age_band", question: "年齢層は？", answer: "30代" },
        { key: "reaction", question: "反応は？", answer: "楽しそう" },
        { key: "hesitation_reason", question: "理由は？", answer: "なし" }, // 「なし」は省略される
      ],
    }],
  });
  const { markdown } = renderCrmLogMarkdown(session, { dateJst: "2026-05-22" });
  assert.ok(markdown.includes("## 昨日の体験"));
  assert.ok(markdown.includes("- name: 山田 T."));
  assert.ok(markdown.includes("- gender: 女性"));
  assert.ok(!markdown.includes("hesitation_reason"), "「なし」回答は出力されない");
}

// テスト 3: 同ジャンル複数件 → サブ見出しが付く
{
  const session = baseSession({
    genres: [
      {
        type: "trial",
        data: { name: "山田 T." },
        answers: [{ key: "name", question: "?", answer: "山田 T." }],
      },
      {
        type: "trial",
        data: { name: "鈴木 K." },
        answers: [{ key: "name", question: "?", answer: "鈴木 K." }],
      },
    ],
  });
  const { markdown } = renderCrmLogMarkdown(session, { dateJst: "2026-05-22" });
  assert.ok(markdown.includes("山田 T."));
  assert.ok(markdown.includes("鈴木 K."));
  // 2 件目には index サブ見出し
  assert.ok(markdown.includes("### 昨日の体験 2"));
}

// テスト 4: 連絡先が混入したらアサート例外
{
  const session = baseSession({
    genres: [{
      type: "other",
      data: { topic: "問い合わせ" },
      answers: [{ key: "phone", question: "?", answer: "090-1234-5678" }],
    }],
  });
  assert.throws(() => renderCrmLogMarkdown(session, { dateJst: "2026-05-22" }));
}

// テスト 5: saveCrmLog でファイル新規作成
{
  const tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmpVault;
  const session = baseSession({
    genres: [{
      type: "trial",
      data: { name: "山田 T." },
      answers: [{ key: "name", question: "?", answer: "山田 T." }],
    }],
  });
  const result = await saveCrmLog(session, { dateJst: "2026-05-22" });
  assert.equal(result.appended, false);
  assert.ok(result.filePath.endsWith("2026-05-22.md"));
  const content = await fs.readFile(result.filePath, "utf-8");
  assert.ok(content.includes("山田 T."));
  assert.ok(content.includes("date: 2026-05-22"));
}

// テスト 6: 同日 2 回目は追記モード
{
  const tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-vault2-"));
  process.env.OBSIDIAN_VAULT_ROOT = tmpVault;
  const session = baseSession({
    genres: [{
      type: "trial",
      data: { name: "山田 T." },
      answers: [{ key: "name", question: "?", answer: "山田 T." }],
    }],
  });
  await saveCrmLog(session, { dateJst: "2026-05-23" });
  const second = await saveCrmLog(session, { dateJst: "2026-05-23" });
  assert.equal(second.appended, true);
  const content = await fs.readFile(second.filePath, "utf-8");
  // frontmatter フィールドは 1 回だけ（type: daily_crm_log を frontmatter のシグネチャとして使う）
  const frontMatterMarker = (content.match(/^type: daily_crm_log$/gm) || []).length;
  assert.equal(frontMatterMarker, 1, `frontmatter は最初の 1 ブロックだけ。type: daily_crm_log の出現数: ${frontMatterMarker}`);
  assert.ok(content.includes("## 追記:"));
  // 追記前と追記後のセクションが両方ある
  const titleCount = (content.match(/# FLATUP GYM 日次 CRM ログ/g) || []).length;
  assert.equal(titleCount, 2, "title が 2 回出現する（1 回目 + 追記）");
}

console.log("crm log generator tests passed");
