# UIZIN 大会動画 自動切り抜きシステム（MVP）

YouTube Live の大会動画から **試合だけ** を、画質を落とさずに1試合ずつ MP4 で切り出します。

設計の考え方・採用/不採用の理由は [`docs/UIZIN_AUTO_CLIP_SYSTEM_DESIGN.md`](../../docs/UIZIN_AUTO_CLIP_SYSTEM_DESIGN.md) を読んでください。

---

## しくみ（1行で）

**試合中だけ画面に出るスコアボードを見張って、出ている間＝試合として切り出します。**
AIの推論ではなく画像の照合なので、無料・CPUだけ・結果の理由が分かる、という三拍子がそろいます。

---

## 準備（初回だけ）

### Mac の人：これ1行で全部そろいます

```bash
bash tools/uizin-clipper/setup-mac.sh
```

まだこのコードを持っていない段階では、**clone してからブランチを切り替えて**実行します。

```bash
git clone https://github.com/flatup1/openqlow.git ~/openqlow
git -C ~/openqlow checkout claude/uizin-auto-clip-system-klrph3
bash ~/openqlow/tools/uizin-clipper/setup-mac.sh
```

> ★2行目を飛ばすと `No such file or directory` で止まります（実機で発生）。
> このツールはまだ `main` に入っていないので、clone しただけでは
> `setup-mac.sh` 自体が存在しません。マージ後はこの行が不要になります。

開発ツール → Homebrew → ffmpeg → コード取得 → Python部品、の順に
**入っていないものだけ**入れます。何度実行しても安全です。

> 最初の「開発ツール」だけは、**画面に出るダイアログを人間が押す**必要があります。
> ダイアログは他のウィンドウの裏に隠れがちなので、F3（Mission Control）で探してください。
> 押して待つ（5〜20分）→ もう一度スクリプトを実行、で先に進みます。

### 使うたびに必要な2行

```bash
cd ~/openqlow/tools/uizin-clipper
source .venv/bin/activate
```

行の先頭に `(.venv)` が出れば準備完了です。**ターミナルを開き直すたびに必要**です。
以降このREADMEの `python -m uizin_clipper ...` は、この状態で打つ前提です。

### 手で入れる場合

```bash
# 1. ffmpeg を入れる
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Linux

# 2. この道具専用の置き場所を作って、そこに依存を入れる（3つだけ）
cd tools/uizin-clipper
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

> ★システムの Python に直接入れないでください。最近の macOS は
> `externally-managed-environment` で拒否します。`--break-system-packages` で
> 押し通す手もありますが、**古い pip にはそのオプションが無く**（実機で発生）、
> システム側を壊す危険もあります。専用の置き場所なら、どちらの問題も起きません。

---

## 使い方

### ステップ1：大会動画を取得する

```bash
python -m uizin_clipper download "https://www.youtube.com/live/XXXXXXXXXXX"
```

`work/XXXXXXXXXXX/source.mp4` に保存されます。もう一度実行しても再取得はしません。

### ステップ2：スコアボードの位置を教える（初回だけ・約10分）

```bash
# 2-1. 5分おきの静止画を出して、試合中の1枚を探す
python -m uizin_clipper contact-sheet --video work/XXXXXXXXXXX/source.mp4

# 2-2. 試合中の時刻を指定して1枚だけ書き出し、座標を測る
python -m uizin_clipper calibrate --video work/XXXXXXXXXXX/source.mp4 --at 00:23:10

# 2-3. 測った座標 (x,y,幅,高さ) を登録する
python -m uizin_clipper calibrate \
    --video work/XXXXXXXXXXX/source.mp4 \
    --at 00:23:10 \
    --roi 1180,55,180,120 \
    --same-match-roi 1380,70,300,40 \
    --profile profiles/uizin.yml
```

#### ★ ROIの選び方（ここを間違えると精度が出ません）

登録する枠は2つあります。**役割が違うので、囲む場所も違います。**

| 引数 | 何を囲むか | 囲んではいけないもの |
|---|---|---|
| `--roi` | **試合中ずっと変わらない部分**（外枠・ロゴ・区切り線） | 選手名・タイマー・得点 |
| `--same-match-roi` | **選手名だけ** | **タイマー**・得点・ロゴ |

理由は実測で確認しています（`docs/UIZIN_AUTO_CLIP_SYSTEM_DESIGN.md` §10）。

- `--roi` にスコアボード全体を入れると、選手名の長さが変わるだけで
  一致度の中央値が **0.945 → 0.856** に落ちました。
  枠とロゴだけに絞ると **0.994 → 0.993**（ほぼ変化なし）でした。
- `--same-match-roi` にタイマーを含めると、同じ試合のラウンド間なのに
  一致度が **0.781** まで落ち、試合が2本に割れました。
  選手名だけに絞ると同じ試合 **1.000** ／ 別の試合 **0.770** で、はっきり分かれました。

> 無地の部分（真っ白な帯など）を `--roi` に選ぶと1件も検出できません。
> その場合は calibrate 時に警告が出て、detect は理由を表示して止まります。

> 赤コーナー表示と青コーナー表示でデザインが違うなど、複数パターンがある場合は
> `--append` を付けて基準画像を追加登録できます。

**これ以降、テロップのデザインが変わるまでステップ2は不要です。**

### ステップ3：試合を検出する

```bash
python -m uizin_clipper detect \
    --video work/XXXXXXXXXXX/source.mp4 \
    --profile profiles/uizin.yml
```

```
検出 12 試合  (source: 第13回UIZIN大会)
  01  00:12:04 → 00:18:33  (6:29)  conf 0.94
  02  00:21:40 → 00:27:02  (5:22)  conf 0.91
  03  00:31:12 → 00:33:05  (1:53)  conf 0.58  [low_confidence]
```

結果は `work/XXXXXXXXXXX/segments.json` に入ります。

### ステップ4：確認して直す（2分）

`segments.json` をそのまま編集します。

```jsonc
{
  "index": 3,
  "start_sec": 1872.0,     // ← 秒数を直す（尺や表示は自動で更新される）
  "end_sec": 1985.0,
  "red": "山田 太郎",       // ← 選手名を入れるとファイル名になる
  "blue": "佐藤 次郎",
  "skip": false,           // ← true にするとこの区間は書き出さない
  "locked": true           // ← true にすると再検出しても絶対に上書きされない
}
```

| 欄 | 意味 |
|---|---|
| `locked` | `true` にすると、`detect` をやり直しても時刻が書き換わらない |
| `skip` | `true` にすると書き出し対象から外れる（誤検出・エキシビション用） |
| `red` / `blue` | 両方そろうとファイル名が `01_山田 太郎vs佐藤 次郎.mp4` になる |
| `note` / `result` | 自由記入。STEP2以降で使う |

`locked` を付けていない区間でも、時刻がほぼ同じなら選手名は再検出後に引き継がれます。

### ステップ5：書き出す

```bash
python -m uizin_clipper render \
    --manifest work/XXXXXXXXXXX/segments.json \
    --event "第13回大会"
```

```
out/第13回大会/01_山田 太郎vs佐藤 次郎.mp4
out/第13回大会/02.mp4
...
```

再エンコードしないので**画質は元のまま**、書き出しも一瞬です。

---

## 全部まとめて実行する（2回目以降の通常運用）

```bash
python -m uizin_clipper run "https://www.youtube.com/live/YYYYYYYYYYY" \
    --profile profiles/uizin.yml \
    --event "第14回大会"
```

確認してから書き出したいときは `--stop-after detect` を付けます。

---

## 選手名を入れる（`01_赤選手vs青選手.mp4` にする）

対戦表を1枚書くだけです。**OCRより速くて確実**なので、こちらを主にしています。

```yaml
# card.yml — 上から順に、検出された試合と対応させます
matches:
  - [赤井一郎, 青山二郎]
  - [赤羽三郎, 青木四郎]
  - {red: 赤坂五郎, blue: 青葉六郎, result: 1R KO}
```

```bash
python -m uizin_clipper card --manifest work/XXXX/segments.json --card card.yml
python -m uizin_clipper render --manifest work/XXXX/segments.json --event "第13回大会"
```

> **件数が合わないと止まります。**
> 対戦表12件に対して検出が11件だと、そのまま入れれば**全部の名前が1つずつずれます**。
> だから何も書かずにエラーにします。余計な区間には `"skip": true` を付けてください。
> 既に入っている名前は上書きしません（人間が直したものを消さない）。

---

## ゴングで開始位置を寄せる（任意）

スコアボードは、ゴングと同時に出るとは限りません。数秒早いことも遅いこともあります。
ゴングは試合開始そのものなので、**スコアボードで決めた位置の前後数秒だけ**を音で探して寄せます。

```bash
python -m uizin_clipper refine --manifest work/XXXX/segments.json --window 6
```

- **探す範囲を絞ることが安全装置です。** 全編からゴングを探すと、歓声・入場曲・
  マイクのハウリングを拾って壊れます。前後6秒なら、その危険はほぼ消えます。
- **はっきりした立ち上がりが無ければ動かしません。** 自信のないときに動かすほうが危険です。
- `"locked": true` の区間は触りません。

---

## 縦型（9:16）にする（任意・再エンコード）

```bash
python -m uizin_clipper vertical --in-dir "out/第13回大会/shorts" --fill blur
# → out/第13回大会/shorts/vertical/*.mp4  （1080x1920）
```

| `--fill` | 見た目 | 使いどころ |
|---|---|---|
| `blur`（既定） | 同じ映像を拡大してぼかし、上下に敷く | 画面が埋まる。SNS向け |
| `black` | 上下を黒帯 | 処理が軽い。元の絵に何も足さない |

**左右は切りません。** 試合は横に動くので、切ると選手が画面から消えます。

> **これだけは再エンコード＝画質が落ちます。**
> 横型の出力（`out/第13回大会/*.mp4`）は無劣化のまま残るので、そちらが原本です。
> 縦型は「書き出し済みのMP4」に後から掛けるので、劣化は1回だけで済みます。

---

## 古い書き出しが残っていたら教えます

選手名を入れて書き出し直すと、`01.mp4` と `01_赤選手vs青選手.mp4` が**両方フォルダに残ります**。
12試合なのに24本並ぶことになり、間違ったほうを投稿する事故につながります。

`render` / `render-highlights` は、今回作らなかったMP4があると最後に知らせます。

```
⚠ 今回作らなかったMP4が 12 本残っています（古い書き出し）:
    01.mp4
    02.mp4
    ...
  中身を確かめて、要らなければ削除してください（--prune で自動削除）。
```

**既定では消しません。** 中身を確かめてから `--prune` を付けてください。

---

## SNS向けの見どころを作る（15〜60秒）

1試合まるごとは長すぎるので、その中から短い見どころを何本か切り出します。

```bash
python -m uizin_clipper highlights --manifest work/XXXX/segments.json --top 3
# → work/XXXX/highlights.json に候補が出る（人間が見て選ぶ）

python -m uizin_clipper render-highlights --highlights work/XXXX/highlights.json \
    --event "第13回大会"
# → out/第13回大会/shorts/01_short1.mp4 …
```

**何を見ているか**

| 信号 | 重み | 意味 |
|---|---|---|
| 音量 | 1.0 | 歓声・実況・打撃音。ダウンやKOの直後に必ず跳ねる |
| 運動量 | 0.6 | 隣り合うフレームの差。歓声の薄い好局面を拾う |
| 試合の終わり際 | 加点 | 決着はほぼそこにある。タダで使える情報 |

どちらも**その試合の中での相対値**にしてから足します。会場の広さもマイクの位置も
大会ごとに違うので、絶対値は使えません。AI も学習も外部APIも使いません。

**ピークより前から切ります。** 歓声は出来事の**あと**に来るので、
ピークだけを切ると肝心の打撃が映らないクリップになります（既定で7秒前から）。

**無い物は作りません。** 盛り上がりがその試合の平均を明確に超えていなければ、
`--top 3` と指定しても2本、1本、0本になります。数合わせで平坦な場所は出しません。

---

## 投稿文の下書きを作る

```bash
python -m uizin_clipper captions --manifest work/XXXX/segments.json --event "第13回大会"
# → out/第13回大会/captions/01.txt …
```

YouTube タイトル・説明文、TikTok / Instagram、X（140文字以内）の4種類が入ります。
大会名・選手名・結果・ハッシュタグを並べるだけなので、**LLM も外部APIも使いません**。
無料枠の条件が変わっても止まりません。

> **これは下書きです。投稿・公開はしません。** 実際の投稿は人間がオーナー承認後に行います。

---

## ラウンド間で試合が割れないしくみ

1R と 2R の間にスコアボードが消えると、そのままでは1試合が2本に割れます。
かといって「◯秒までなら繋ぐ」という秒数だけの判断には、逃げ場がありません。

実測（`max_gap_sec` を変えただけの結果）:

| max_gap_sec | 結果 |
|---|---|
| 20秒 | 3本（**1試合が2本に分割**） |
| 30・60秒 | 2本（正解） |
| 90秒 | 1本（**2試合が1本に結合**） |

そこで秒数では決めず、**途切れの前後で選手名テロップが同じかどうか**を見ます。

- 同じ → ラウンド間なので繋ぐ
- 違う → 次の試合なので繋がない

`--same-match-roi` を登録すると有効になります。有効にした後は、
`max_gap_sec` を 5秒 / 20秒 / 30秒 のどれにしても結果は 2本で一定でした。
**しきい値の当てずっぽうが要らなくなります。**

判断の根拠は実行中にそのまま出ます。

```
[round] 途切れ 20秒: テロップ一致度 1.000 → 同じ試合（繋ぐ）
[round] 途切れ 80秒: テロップ一致度 0.770 → 別の試合（繋がない）
```

---

## 結果を数値で確認する

「だいたい動いた」で終わらせないための点検コマンドです。

まず正解を手で書きます（1大会につき1回、10〜15分）。

```yaml
# truth.yml
matches:
  - {start: "00:12:04", end: "00:18:33", label: "第1試合"}
  - {start: "00:21:40", end: "00:27:02", label: "第2試合"}
```

```bash
python -m uizin_clipper report \
    --manifest work/XXXXXXXXXXX/segments.json \
    --truth truth.yml \
    --out-dir out --event "第13回大会"
```

```
■ 正解との突き合わせ（正解 2 試合）
  正解の試合数: 2
  検出した試合数: 2
  正しく検出: 2
  見逃し: 0
  余計な検出: 0
  1試合が複数に分割: 0
  複数試合が1本に結合: 0
  開始のずれ  中央 -6.0秒  最小 -6.0秒  最大 -6.0秒
  終了のずれ  中央 +8.0秒  最小 +8.0秒  最大 +8.0秒

■ 書き出したMP4の点検
  01.mp4  h264/aac  尺 134.3s（想定 134.0s, 差 +0.3s）  音ズレ -0.13s  エラー 0  → OK
```

MP4の点検では、次を機械的に確かめます。

- 映像コーデックが元と同じか（＝**再エンコードされていないか**）
- 尺が想定どおりか
- 音ズレ（音声と映像の開始時刻の差）
- 全編デコードしてエラーが出ないか

---

## よくある調整

| 症状 | 直す場所（`profiles/uizin.yml`） |
|---|---|
| 1試合がラウンドごとに割れる | `--same-match-roi` を登録する（秒数いじりより先にこれ） |
| それでも割れる | `same_match_threshold` を下げる（0.80 → 0.75） |
| **別の試合まで繋がってしまう** | **`round_gap_sec` を下げる（90 → 70）。しきい値より先にこちら** |
| MCや表彰まで拾ってしまう | `enter_threshold` を上げる（0.62 → 0.72） |
| 試合を取りこぼす | `enter_threshold` を下げる（0.62 → 0.52） |
| リプレイを別試合として拾う | `min_duration_sec` を大きくする（30 → 60）。**上げすぎ注意**（下の注記） |
| 勝敗が出る前に切れる | `post_roll_sec` を大きくする（60 → 75）。`round_gap_sec` は超えない |
| 入場から入れたい | `pre_roll_sec` を大きくする（6 → 20） |
| 解析が遅い | `fps` を下げる（1.0 → 0.5、2秒に1回） |

> **`round_gap_sec` と `same_match_threshold` の役割分担**
> 誤って繋ぐのを防ぐ主役は `round_gap_sec`（秒数の上限）です。
> ラウンド間は約60秒、試合間の休憩は2分以上あるので、その中間の90秒に置きます。
> 4時間・12試合の検証で 180秒 にすると **4組の試合が1本に結合**しました。
> テロップ照合（`same_match_threshold`）はその中でさらに確かめる二段目で、
> 上げすぎると同じ試合が割れます（0.85で2件割れた）。

> **`min_duration_sec` と `post_roll_sec` は実配信で決まった値です**
> - `min_duration_sec: 30` … 45秒にすると **第13回大会の31秒決着が丸ごと消えました**。
>   短い決着ほど切り抜きの価値が高いので、リプレイ除去より取りこぼし防止を優先します。
> - `post_roll_sec: 60` … 8秒では **勝者発表の前で切れました**。第13回では勝者表示まで
>   最大およそ40秒かかります。ただし `round_gap_sec`(90) より小さく保つこと。
>   休憩へ食い込むと隣の試合が混ざります。

---

## どれくらい時間がかかるか（4時間・720p30・6.1GB での実測）

| 工程 | 所要 | 備考 |
|---|---|---|
| `detect`（**その動画の初回**） | **12分32秒** | 内訳は下 |
| ├ キーフレーム走査 | 約9分 | **ここが一番長い**。1動画1回だけ |
| └ 4時間を1秒ごとに照合 | 約3分 | 実時間の約67〜80倍速 |
| `detect` 再実行（キャッシュ利用） | **7秒** | しきい値の調整はほぼ即時 |
| `render`（12本を無劣化コピー） | **56秒** | 再エンコードなし |
| **取得後の自動処理 合計** | **約14分** | 放っておけば終わります |

人手は「初回のROI測定10分」＋「毎回の確認2〜3分」だけです。
1080p ならデコード量が約2.25倍なので照合部分は8分前後の見込みです（見積もり）。

しきい値を変えたら `detect --force` で解析し直してください。
`locked` を付けた区間は、何度やり直しても残ります。

---

## テスト

外部ツールなしで走ります。

```bash
cd tools/uizin-clipper
python -m unittest discover -s tests -t .
```

リポジトリ直下からは `npm run test:uizin-clipper` でも実行できます。

---

## 実配信で確認する手順（オーナー環境で実行）

開発用のクラウド環境からは YouTube に接続できません（組織のエグレスポリシーで遮断）。
実配信での検証は、YouTube に接続できる手元のPCで次の順に実行してください。

```bash
cd tools/uizin-clipper
pip install -r requirements.txt

# 1) 大会動画を取得（4時間で数GB）
python -m uizin_clipper download "https://www.youtube.com/live/P8CCcO_wWq0"

# 2) 下見（5分おきの静止画が work/P8CCcO_wWq0/contact/ に出る）
python -m uizin_clipper contact-sheet --video work/P8CCcO_wWq0/source.mp4

# 3) 試合中の1枚を書き出して、2つのROIの座標を測る
python -m uizin_clipper calibrate --video work/P8CCcO_wWq0/source.mp4 --at 00:23:10
#    → 出てきたPNGを画像ソフトで開き、
#       (a) 試合中ずっと変わらない部分（枠・ロゴ）
#       (b) 選手名だけ（タイマーを含めない）
#      の x,y,幅,高さ を読む

# 4) 登録
python -m uizin_clipper calibrate \
    --video work/P8CCcO_wWq0/source.mp4 --at 00:23:10 \
    --roi <(a)の座標> --same-match-roi <(b)の座標> \
    --profile profiles/uizin.yml

# 5) 検出（4時間で10〜20分程度）
python -m uizin_clipper detect \
    --video work/P8CCcO_wWq0/source.mp4 --profile profiles/uizin.yml

# 6) 正解を手で書く（truth.yml）。試合表があれば10〜15分。

# 7) 数値で確認
python -m uizin_clipper report \
    --manifest work/P8CCcO_wWq0/segments.json --truth truth.yml

# 8) 書き出して、出力も点検
python -m uizin_clipper render \
    --manifest work/P8CCcO_wWq0/segments.json --event "第13回大会"
python -m uizin_clipper report \
    --manifest work/P8CCcO_wWq0/segments.json \
    --truth truth.yml --out-dir out --event "第13回大会"
```

7 と 8 の出力をそのまま貼っていただければ、
見逃し・誤検出・分割・結合の件数を見て、必要な最小修正を判断できます。

---

## 注意

- `work/` と `out/` は Git にコミットしません（動画・生成物・個人名を含むため）。
- 切り抜きの公開可否、選手・観客の肖像、BGMの権利判断はこのツールの範囲外です。
  **公開は必ずオーナー承認後に**行ってください。
- `-c copy` はキーフレームでしか切れないため、開始が最大数秒だけ手前にずれます
  （前のりしろとして働くので実用上は問題ありません）。

---

## これから追加する予定（承認後）

1. **OCR による選手名の答え合わせ** … `card.yml` の入力ミス・並び違いを機械が指摘する
2. **KO / 判定 / 引き分けの自動判定**

2 は今のところ `card.yml` の `result:` に人間が書く形です。
映像から自動で決めるには「レフェリーの動作」や「勝者コールの音声」を読む必要があり、
学習モデルか音声認識が要ります。**確実さの割に合わないので、今は入れていません。**
1試合3秒の入力で100%正確になるものを、誤読するかもしれない機械に置き換える理由がありません。
