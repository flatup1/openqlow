# HANDOFF: Claude → Codex（flatupnarita.jp Metaピクセル設置）

作成日時: 2026-07-09
作成者: Claude
受け手: Codex

---

## 0. 最重要

受け手AIは、まず **COORDINATION.md を読み**、自分の担当領域だけを触ってください。
担当外を触りたい場合は JIN に確認してください。
**本番サーバーへのアップロードは JIN の承認後のみ**（憲法ルール1）。

---

## 1. 背景（なぜやるか）

- FLATUP GYM 会員200人計画のInstagram広告（広告予算月7,000円〜）を公開する前提条件として、flatupnarita.jp に Metaピクセルが必要。
- ピクセル未設置のまま「ランディングページビュー最適化」広告を回すと計測不能なため、**設置完了までInstagram広告は公開しない**判断済み。
- サイトは Xserver 上の静的HTML（WordPressではない）。CVポイントはページ内の LINE友だち追加リンク `https://lin.ee/cTSDajPz`。

## 2. やってほしいこと（タスク本体）

### TASK P-1: ピクセル基本コードの挿入

対象ファイル（ローカル正本）: `/Users/jin/Desktop/GYM</0422/deploy_flatup_100_20260622/` の全HTML 7枚
（index / fighters / instructors / sun-warriors / masaki / meltykira / taiyo）

各ページの `</head>` 直前に Meta標準ベースコードを挿入する:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '{{PIXEL_ID}}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id={{PIXEL_ID}}&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
```

`{{PIXEL_ID}}` は JIN が Metaイベントマネージャで発行したIDに置換（§5参照。**IDが来るまで置換せずプレースホルダのまま**）。

### TASK P-2: CVイベント（LINEリンククリック = Lead）

実際の成約はLINE内で起きるため、計測可能な代理CVは「LINEリンクのクリック」。
全ページ共通で、`lin.ee` へのリンククリック時に Lead イベントを発火させる（`</body>` 直前に挿入）:

```html
<script>
document.addEventListener('click', function(e){
  var a = e.target.closest('a[href*="lin.ee"]');
  if (a && window.fbq) { fbq('track', 'Lead'); }
}, true);
</script>
```

### TASK P-3: ローカル検証

- 7ページをローカルで開き、コンソールエラーが増えていないこと・既存表示が崩れていないことを確認。
- `grep -c "fbq('init'" *.html` で全7ページに1回ずつ入っていることを確認（二重挿入禁止）。

## 3. 未完了で残すこと（Codexはやらない）

- [ ] **本番アップロード**（JIN承認後。手順は §4注意参照）
- [ ] Metaイベントマネージャでのピクセル発行（JIN作業）
- [ ] 広告の公開（設置検証後に別タスク）

## 4. 受け手AIへの注意

- **触ってよいのはローカル正本のHTMLのみ**。Xserver本番には触らない（アップロードはJIN承認後、別手順）。
- **重要な差分の罠**: 本番の下層6ページは7/3版、ローカル正本は7/5版。ローカル正本をそのまま上げると**ピクセル以外の内容も変わる**。これは既存P1計画（最終版への同期）と一致するので原則OKだが、JINの最終確認事項（§5-2）。
- 本番アップ時は既存ファイルを `*_bk0709.html` に退避してから（2026-07-06復旧時と同じ安全手順）。
- WebFTP操作手法はClaude側メモリ `xserver-webftp-automation` に確立済み（SSOジャンプURL・base64パスAPI）。必要ならJIN経由で共有依頼。
- APIキー・トークン類は一切不要なタスク。ピクセルIDは公開情報なのでコミットに含めてよい。

## 5. JIN確認待ち事項

| # | 内容 |
|---|---|
| 1 | MetaイベントマネージャでピクセルID発行 → CodexにIDを渡す（イベントマネージャ https://business.facebook.com/events_manager → データソース → ピクセル追加 → 「flatupnarita.jp」で作成） |
| 2 | アップロード版の確定: **A案=ローカル正本7/5版+ピクセル**（P1同期も同時に済む・推奨）/ B案=本番7/3版をDLしてピクセルだけ注入（変更最小） |
| 3 | ローカル修正完了後、本番アップロードの承認 |

## 6. 次にやってほしいこと（順番）

1. JINからピクセルIDを受領 → TASK P-1/P-2/P-3 を実施
2. 完了したら `docs/HANDOFF_YYYYMMDD_codex→claude.md` で報告（変更ファイル一覧つき）
3. JIN承認後に本番反映 → Metaピクセルヘルパー（Chrome拡張）とイベントマネージャの「テストイベント」で PageView / Lead の発火確認

## 7. 関連ドキュメント

- `COORDINATION.md` — 領域分担（本タスクはリポジトリ外の静的サイト編集。衝突領域なし）
- `Desktop/GYM</0422/指示書_flatupnarita_100点化_20260705.md` — P1〜P4残タスク（OGP等。今回のA案採用ならP1の一部が同時に進む）
- 復旧実績: 2026-07-06 サイト復旧（バックアップ手順の前例）
