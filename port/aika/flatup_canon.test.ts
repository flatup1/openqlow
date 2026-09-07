// AIKA配布コピー（port/aika/flatup_canon.ts）が正本（src/shared/canon.ts）とズレたら落ちる。
//
// 2026-08-17: レディースクラスが正本「土曜14:30〜15:30」に対し配布コピーは「土曜14:30」のままで、
// AIKAの回答から終了時刻が消えていた。値のズレは人間には見つけにくいので、ここで機械的に止める。
//
// 配布コピーは依存ゼロを守る（本番コードは src を import しない）。このテストだけが両方を読む。

import { FLATUP_CANON as PORT_CANON, BRAND as PORT_BRAND } from "./flatup_canon.js";
import { FLATUP_CANON as SRC_CANON, BRAND as SRC_BRAND } from "../../src/shared/canon.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 配布コピーの全キーは正本にも存在し、値が一致すること。
const portKeys = Object.keys(PORT_CANON) as Array<keyof typeof PORT_CANON>;
const srcKeys = new Set(Object.keys(SRC_CANON));

const missing: string[] = [];
const mismatched: string[] = [];

for (const key of portKeys) {
  if (!srcKeys.has(key)) {
    missing.push(String(key));
    continue;
  }
  const portValue = PORT_CANON[key];
  const srcValue = SRC_CANON[key as keyof typeof SRC_CANON];
  if (portValue !== srcValue) {
    mismatched.push(`${String(key)}: port="${portValue}" / canon="${srcValue}"`);
  }
}

assert(
  missing.length === 0,
  `配布コピーに正本へ無いキーがあります（正本 src/shared/canon.ts を先に更新してください）:\n${missing.join("\n")}`,
);

assert(
  mismatched.length === 0,
  `配布コピーが正本とズレています — port/aika/flatup_canon.ts を正本に合わせてください:\n${mismatched.join("\n")}`,
);

// 正本にあって配布コピーに無いキーは「未配布」として一覧するだけにする。
// AIKAが使わない値（攻め側専用）まで配布する必要はないため、失敗にはしない。
const notDistributed = Object.keys(SRC_CANON).filter(key => !(key in PORT_CANON));

// ブランドの芯も同じ言葉であること。
assert(PORT_BRAND.tagline === SRC_BRAND.tagline, "BRAND.tagline が正本とズレています");
assert(
  PORT_BRAND.values.join("／") === SRC_BRAND.values.join("／"),
  "BRAND.values が正本とズレています",
);

// 事故の再発ガード（レディースクラスは土曜14:30〜15:30。旧「14:00」は誤り）。
assert(
  PORT_CANON.scheduleLadies === "土曜14:30〜15:30",
  `レディースクラスは「土曜14:30〜15:30」です（現在: ${PORT_CANON.scheduleLadies}）`,
);

console.log(
  `flatup_canon port tests passed (${portKeys.length} keys synced, ${notDistributed.length} keys not distributed)`,
);
