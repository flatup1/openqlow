// secrets.env（KEY=VALUE の行）と PIN の読み取り。値そのものはどこにも表示しない。
// 仕様: tools/uizin-event-os/README.md §2.1

// 書き方の揺れを受け入れる：先頭の export、前後の空白、対になった引用符、引用符なしの値の後ろの「 # コメント」、CRLF、BOM。
export function parseSecretsEnv(text) {
  const result = {};
  for (const raw of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = raw.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    // 引用符で始まる値は、対になる引用符までが値（その後ろの「 # コメント」は無視）。
    const quoted = value.match(/^(["'])(.*?)\1\s*(?:#.*)?$/);
    if (quoted) {
      value = quoted[2];
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    result[match[1]] = value;
  }
  return result;
}

// PIN は4〜8桁の数字。全角数字は半角にする。書いてあるのに使えない形なら、理由を返す（値は返さない）。
export function readPin(value) {
  if (value === undefined || value === "") return { pin: null, problem: null };
  const normalized = String(value).normalize("NFKC").trim();
  if (/^\d{4,8}$/.test(normalized)) return { pin: normalized, problem: null };
  return { pin: null, problem: "4〜8桁の数字で書いてください" };
}
