# 設定書から文面を機械的に取り出して作業シートHTMLを生成する。
# 手で写すと誤字が入るため、必ずこの経路で生成する。
import re, json, html, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "docs/GUARDIAN_CONSENT_LINE_SETUP.md").read_text(encoding="utf-8")
blocks = [b.rstrip("\n") for b in re.findall(r"```\n(.*?)```", src, re.S)]
sends = []
for line in src.split("\n"):
    if line.lstrip().startswith("|"):
        sends += re.findall(r"`([^`]+)`", line)

card_age, card_guardian, card_terms, greeting = blocks[1], blocks[2], blocks[3], blocks[5]
send_es, send_jhs, send_hs, send_adult = sends[0], sends[1], sends[2], sends[3]
send_guardian, send_terms = sends[4], sends[5]

def esc(s): return html.escape(s)

def paste(label, text, kind="body"):
    """コピーボタン付きの貼り付けブロック。"""
    return f'''<div class="paste {kind}">
  <div class="paste-hd"><span class="paste-label">{esc(label)}</span>
    <button class="copy" type="button" data-copy="{esc(text)}">コピー</button></div>
  <pre>{esc(text)}</pre>
</div>'''

steps = []

steps.append(("01", "【1/2】重要事項の確認 の文面を差し替える",
  "いま入っている文面は違約金を「必ず取られる」と書いています。ここだけ先に直します。未成年対応とは切り離せるので、最優先です。",
  paste("キーワード1", "入会手続き 成人")
  + paste("キーワード2（保護者カードのボタンで送られる文）", send_guardian)
  + paste("本文", card_terms)
  + paste("ボタン「確認して同意する」の送信テキスト", send_terms, "send")))

steps.append(("02", "自分のLINEで動くか見る",
  "自分のスマホから「入会手続き」と打って、いま直した文面が返ってくるか確認します。ここで止まれば、まだ誰にも影響はありません。",
  '<p class="check-line">送信するのは <code>入会手続き</code> だけです。</p>'))

steps.append(("03", "年代をたずねるカードを足す",
  "ここから未成年対応です。まず年代を聞くカードを作ります。生年月日は聞きません（強い個人情報を持たないほうが安全です）。",
  paste("キーワード", "入会手続き")
  + paste("本文", card_age)
  + paste("ボタン1「小学生」の送信テキスト", send_es, "send")
  + paste("ボタン2「中学生」の送信テキスト", send_jhs, "send")
  + paste("ボタン3「高校生」の送信テキスト", send_hs, "send")
  + paste("ボタン4「成人（18歳以上）」の送信テキスト", send_adult, "send")))

steps.append(("04", "保護者向けカードを足す",
  "小学生・中学生・高校生の3つとも、この同じ内容を返すように設定します。キーワードを3つ登録してください。",
  paste("キーワード1", send_es)
  + paste("キーワード2", send_jhs)
  + paste("キーワード3", send_hs)
  + paste("本文", card_guardian)
  + paste("ボタン「確認して保護者として同意する」の送信テキスト", send_guardian, "send")))

steps.append(("05", "通しで確認する",
  "成人ルートと未成年ルートの両方を、実際に自分のLINEで最後まで通します。ここまで来たら完成です。",
  '<p class="check-line">成人ルート: <code>入会手続き</code> → 「成人（18歳以上）」→ 【1/2】→【2/2】</p>'
  '<p class="check-line">未成年ルート: <code>入会手続き</code> → 「中学生」→ 保護者カード → 【1/2】→【2/2】</p>'))

steps_html = ""
for num, title, why, body in steps:
    steps_html += f'''
<li class="step" data-step="{num}">
  <div class="step-hd">
    <label class="tick"><input type="checkbox" data-done="{num}"><span class="box"></span></label>
    <div>
      <p class="step-num">STEP {num}</p>
      <h3>{esc(title)}</h3>
    </div>
  </div>
  <p class="why">{esc(why)}</p>
  <div class="pastes">{body}</div>
</li>'''

bonus = paste("あいさつ返信（98点 → 100点）", greeting)

tpl = (root / "docs/templates/_line_setup_sheet.tpl.html").read_text(encoding="utf-8")
out = tpl.replace("<!--STEPS-->", steps_html).replace("<!--BONUS-->", bonus)
(root / "docs/templates/line-setup-sheet.html").write_text(out, encoding="utf-8")
print("生成しました:", len(out), "バイト")
print("文面ブロック数:", out.count('class="paste'))
