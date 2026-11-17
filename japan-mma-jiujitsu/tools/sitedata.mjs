#!/usr/bin/env node
/* JAPAN MMA JIU-JITSU — サイトのデータから2つのものを作る道具（Node 18 以上・追加のインストール不要）

   node tools/sitedata.mjs jsonld          index.html の中の「検索エンジン向けのデータ（JSON-LD）」を書き直す
   node tools/sitedata.mjs jsonld --check  書き直しが必要か確かめるだけ（必要なら終了コード1）
   node tools/sitedata.mjs i18n            翻訳チェック表 translation_check.md を書き出す（ネイティブ確認用）

   料金（CONFIG.courses）・FAQ・説明文・ドメインを変えたら、jsonld を実行する。 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(DIR, "index.html");
const html = fs.readFileSync(FILE, "utf8");

/* CONFIG と T は index.html の <script> の中にある。画面を触る前の部分だけを取り出して実行する */
function pageData() {
  const a = html.indexOf("const CONFIG = {"), b = html.indexOf("function detect(");
  if (a < 0 || b < 0 || b < a) throw new Error("index.html の中に CONFIG / T が見つかりません");
  const stub = { document: { querySelector: () => null } };   // 画面はないので、ページの部品を探す命令には「なし」と答える
  return vm.runInNewContext(html.slice(a, b) + "\n;({CONFIG, T, LANGS, priceText, yen})", stub, { timeout: 2000 });
}

const unescapeHtml = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const pick = (re, what) => { const m = html.match(re); if (!m) throw new Error(`index.html に ${what} がありません`); return unescapeHtml(m[1]); };

function jsonld() {
  const { CONFIG, T, priceText, yen } = pageData();
  const t = T.en, C = CONFIG.courses, A = CONFIG.postal;
  const url = pick(/<link rel="canonical" href="([^"]+)">/, "canonical");
  const desc = pick(/<meta name="description" content="([^"]*)">/, "description");
  const s0 = html.indexOf('<section class="faq" id="faq">');
  const faqHtml = html.slice(s0, html.indexOf("</section>", s0));
  const faq = [...faqHtml.matchAll(/<summary data-t="(\w+)">[\s\S]*?<\/summary><p data-t="(\w+)">/g)]
    .map(([, q, a]) => [t[q], a === "a4" ? priceText(t) : t[a]]).filter(([q, a]) => q && a);
  if (!faq.length) throw new Error("FAQ が読み取れません");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SportsActivityLocation", "@id": url + "#place",
        "name": "JAPAN MMA JIU-JITSU by FLATUP GYM", "url": url, "image": new URL("og.jpg", url).href,
        "description": desc,
        "address": { "@type": "PostalAddress", "streetAddress": A.street, "addressLocality": A.city, "addressRegion": A.region, "postalCode": A.zip, "addressCountry": "JP" },
        "priceRange": `${yen(Math.min(...C.map(c => c.price)))}–${yen(Math.max(...C.map(c => c.solo)))}`,
        "currenciesAccepted": "JPY",
        "availableLanguage": ["en", "zh-Hant", "zh-Hans", "ko"],
        "parentOrganization": { "@type": "Organization", "name": "FLATUP GYM", "url": CONFIG.gymSite },
        "sameAs": [CONFIG.instagram],
        ...(CONFIG.email ? { "email": CONFIG.email } : {}),
        "makesOffer": C.map(c => ({ "@type": "Offer", "name": `${c.min}-minute MMA jiu-jitsu class`, "description": t[c.id + "d"], "price": String(c.price), "priceCurrency": "JPY" }))
      },
      { "@type": "FAQPage", "mainEntity": faq.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } })) }
    ]
  };
}

function writeJsonld(check) {
  const START = /<!-- jsonld:start[^>]*-->/, END = "<!-- jsonld:end -->";
  const m = html.match(START), e = html.indexOf(END);
  if (!m || e < 0) throw new Error("index.html に jsonld:start / jsonld:end の目印がありません");
  const body = JSON.stringify(jsonld(), null, 1).replace(/</g, "\\u003c");
  const block = `${m[0]}\n<script type="application/ld+json">\n${body}\n</script>\n`;
  const next = html.slice(0, m.index) + block + html.slice(e);
  if (check) {
    if (next !== html) { console.error("JSON-LD が古いです。node tools/sitedata.mjs jsonld を実行してください"); process.exit(1); }
    console.log("JSON-LD は最新です"); return;
  }
  fs.writeFileSync(FILE, next);
  console.log(next === html ? "JSON-LD は最新です（変更なし）" : "JSON-LD を書き直しました");
}

function i18n() {
  const { T, LANGS } = pageData();
  const langs = LANGS.map(l => l[0]);
  const cell = v => (Array.isArray(v) ? v.join(" / ") : String(v ?? "")).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rows = Object.keys(T.en).filter(k => k !== "a4");
  const out = [
    "# 翻訳チェック表（JAPAN MMA JIU-JITSU）",
    "",
    "`node tools/sitedata.mjs i18n` で `index.html` から自動で作る表です。手で直さず、直したい所は `index.html` の `T` を直してから作り直してください。",
    "",
    "## ネイティブの方へのお願い",
    "",
    "- 中国語（繁体字・簡体字）と韓国語が、自然で、旅行者にとって分かりやすいかを見てください。",
    "- `{a}` `{min}` `{s}` のような { } の部分は、プログラムが料金などに置き換えます。消さずにそのまま残してください。",
    "- 技の名前（ASHIKAN、Sankaku-jime など）は、日本語の読みをそのまま見せるためにわざと残しています。",
    "- 直したほうがよい所は、表の行（キー）と直した文を教えてください。",
    "",
    `| キー | ${langs.join(" | ")} |`,
    `|---|${langs.map(() => "---").join("|")}|`,
    ...rows.map(k => `| \`${k}\` | ${langs.map(l => cell(T[l][k])).join(" | ")} |`),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "translation_check.md"), out);
  console.log(`translation_check.md を書き出しました（${rows.length} 行 × ${langs.length} 言語）`);
}

const [cmd, flag] = process.argv.slice(2);
if (cmd === "jsonld") writeJsonld(flag === "--check");
else if (cmd === "i18n") i18n();
else { console.log("使い方: node tools/sitedata.mjs jsonld [--check] | i18n"); process.exit(cmd ? 1 : 0); }
