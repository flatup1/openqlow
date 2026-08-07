# UIZIN 大会動画 自動切り抜きシステム（MVP）

YouTube Live の大会動画から **試合だけ** を、画質を落とさずに1試合ずつ MP4 で切り出します。

設計の考え方・採用/不採用の理由は [`docs/UIZIN_AUTO_CLIP_SYSTEM_DESIGN.md`](../../docs/UIZIN_AUTO_CLIP_SYSTEM_DESIGN.md) を読んでください。

---

## しくみ（1行で）

**試合中だけ画面に出るスコアボードを見張って、出ている間＝試合として切り出します。**
AIの推論ではなく画像の照合なので、無料・CPUだけ・結果の理由が分かる、という三拍子がそろいます。

---

## 準備（初回だけ）

```bash
# 1. ffmpeg を入れる
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Linux

# 2. Python の依存を入れる（3つだけ）
cd tools/uizin-clipper
pip install -r requirements.txt
```

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

# 2-2. 試合中の時刻を指定して1枚だけ書き出し、スコアボードを囲む座標を測る
python -m uizin_clipper calibrate --video work/XXXXXXXXXXX/source.mp4 --at 00:23:10

# 2-3. 測った座標 (x,y,幅,高さ) を登録する
python -m uizin_clipper calibrate \
    --video work/XXXXXXXXXXX/source.mp4 \
    --at 00:23:10 --roi 1180,55,620,130 \
    --profile profiles/uizin.yml
```

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

## よくある調整

| 症状 | 直す場所（`profiles/uizin.yml`） |
|---|---|
| 1試合が2本に割れる | `max_gap_sec` を大きくする（20 → 40） |
| MCや表彰まで拾ってしまう | `enter_threshold` を上げる（0.62 → 0.72） |
| 試合を取りこぼす | `enter_threshold` を下げる（0.62 → 0.52） |
| リプレイを別試合として拾う | `min_duration_sec` を大きくする（45 → 90） |
| 入場から入れたい | `pre_roll_sec` を大きくする（6 → 20） |
| 解析が遅い | `fps` を下げる（1.0 → 0.5、2秒に1回） |

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

## 注意

- `work/` と `out/` は Git にコミットしません（動画・生成物・個人名を含むため）。
- 切り抜きの公開可否、選手・観客の肖像、BGMの権利判断はこのツールの範囲外です。
  **公開は必ずオーナー承認後に**行ってください。
- `-c copy` はキーフレームでしか切れないため、開始が最大数秒だけ手前にずれます
  （前のりしろとして働くので実用上は問題ありません）。

---

## これから追加する予定（承認後）

1. ゴング音による境界の微調整
2. 対戦表（`card.yml`）からの選手名確定 ＋ OCR による答え合わせ
3. KO / 判定 / 引き分けの判定
4. YouTube・TikTok・Instagram・X の投稿文自動生成
5. 9:16 黒帯変換
