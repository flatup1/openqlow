/* FLAT UP WebOS — 質問定義（データ）
 * ロジックは app.js。ここは「データだけ」。
 * 質問の追加・変更・順番入れ替えはこのファイルの編集だけで完結させる。
 * 事実（料金・時間）の正本は openqlow/src/shared/canon.ts。ここへ直書きしない。
 */
window.FLATUP = window.FLATUP || {};

// フローの開始質問
FLATUP.FLOW_START = "audience";

/* 質問定義
 * id:        質問ID（stateとanalyticsのキー）
 * question:  画面に出す問い
 * note:      問いの下に出す優しい一言（任意）
 * skippable: true なら「答えずに進む」を出す（性別など必須にしない）
 * options:   選択肢。next があればその質問へ、なければ質問の next へ進む
 * next:      省略時は "result"
 */
FLATUP.QUESTIONS = {
  audience: {
    id: "audience",
    question: "今日は、誰のために来ましたか？",
    note: "どれを選んでも大丈夫。あとで変えられます。",
    options: [
      { value: "self",    label: "自分が通ってみたい",              next: "gender" },
      { value: "kids",    label: "子どもを通わせたい",              next: "kids_age" },
      { value: "family",  label: "家族と一緒に始めたい",            next: "result" },
      { value: "consult", label: "まだ決めていない・まず相談したい", next: "result" }
    ]
  },

  gender: {
    id: "gender",
    question: "あなたについて教えてください。",
    note: "答えたくない場合は、そのまま進んで大丈夫です。",
    skippable: true,
    next: "goal",
    options: [
      { value: "female", label: "女性" },
      { value: "male",   label: "男性" },
      { value: "other",  label: "その他 / 答えたくない" }
    ]
  },

  goal: {
    id: "goal",
    question: "どんな目的に近いですか？",
    note: "いちばん近いものをひとつ選んでください。",
    next: "experience",
    options: [
      { value: "exercise",  label: "運動不足を解消したい" },
      { value: "diet",      label: "ダイエットしたい" },
      { value: "stress",    label: "ストレスを発散したい" },
      { value: "health",    label: "健康になりたい" },
      { value: "try",       label: "格闘技をやってみたい" },
      { value: "strong",    label: "強くなりたい" },
      { value: "defense",   label: "護身術を身につけたい" },
      { value: "friends",   label: "仲間がほしい" },
      { value: "unsure",    label: "まだよく分からない" }
    ]
  },

  experience: {
    id: "experience",
    question: "格闘技の経験はありますか？",
    note: "「完全に初めて」の方が、いちばん多いです。",
    next: "availability",
    options: [
      { value: "first",       label: "完全に初めて" },
      { value: "some",        label: "少しだけ経験がある" },
      { value: "experienced", label: "経験者" },
      { value: "active",      label: "現役で練習している" }
    ]
  },

  availability: {
    id: "availability",
    question: "通いやすい時間は？",
    note: "まだ決まっていなくても大丈夫です。",
    next: "result",
    options: [
      { value: "weekday_morning", label: "平日の午前" },
      { value: "weekday_noon",    label: "平日の昼" },
      { value: "weekday_night",   label: "平日の夜" },
      { value: "saturday",        label: "土曜日" },
      { value: "unknown",         label: "まだ分からない" }
    ]
  },

  kids_age: {
    id: "kids_age",
    question: "お子さまの年代を教えてください。",
    next: "kids_hope",
    options: [
      { value: "preschool", label: "未就学" },
      { value: "es_lower",  label: "小学校低学年" },
      { value: "es_upper",  label: "小学校高学年" },
      { value: "junior",    label: "中学生" },
      { value: "other",     label: "その他" }
    ]
  },

  kids_hope: {
    id: "kids_hope",
    question: "どんなことを期待していますか？",
    note: "いちばん近いものをひとつ選んでください。",
    next: "result",
    options: [
      { value: "enjoy_sports", label: "運動を好きになってほしい" },
      { value: "confidence",   label: "自信をつけてほしい" },
      { value: "manner",       label: "礼儀を身につけてほしい" },
      { value: "strong",       label: "強くなってほしい" },
      { value: "bully",        label: "いじめなどへの不安がある" },
      { value: "fitness",      label: "体力をつけてほしい" },
      { value: "match",        label: "試合にも挑戦してみたい" },
      { value: "fun",          label: "楽しい習い事を探している" },
      { value: "unsure",       label: "まだ分からない" }
    ]
  }
};

/* 結果画面の文章（データ）
 * 「診断の押し付け」にならない、優しい提案の言葉だけを置く。
 */
FLATUP.RESULT_CONTENT = {
  headlines: {
    self:    "あなたには、こんな始め方が合いそうです。",
    kids:    "お子さまには、こんな始め方が合いそうです。",
    family:  "ご家族での始め方を、一緒に考えさせてください。",
    consult: "まだ決めなくて、大丈夫です。"
  },

  base: {
    self:    "FLAT UP GYMは、初めての人のために作った場所です。あなたのペースで、少しずつで大丈夫です。",
    kids:    "FLAT UP GYMのキッズクラスは、「楽しい」から始まります。礼儀や自信は、その先に自然とついてきます。保護者の方が安心できる環境づくりを大切にしています。",
    family:  "ご家族それぞれに合った通い方があります。年齢も目的もバラバラで大丈夫。まずは一緒に見学から始めるのがおすすめです。",
    consult: "「格闘技ってどんな感じだろう？」くらいの気持ちで大丈夫です。見学だけでも、話を聞くだけでも歓迎です。無理におすすめすることはありません。"
  },

  // 回答値 → 添える一言（該当するものだけ表示）
  snippets: {
    "gender:female":            "女性の会員さんも多く通っています。",
    "goal:exercise":            "運動不足の解消なら、まずは週1回・30分からで十分です。",
    "goal:diet":                "キックボクシングは全身運動。楽しく続くから、結果につながります。",
    "goal:stress":              "ミットを思いきり叩く爽快感は、一度体験すると分かります。",
    "goal:health":              "健康づくりが目的の方も多く、年齢層は幅広いです。",
    "goal:try":                 "「やってみたい」と思えた時が、いちばんいいタイミングです。",
    "goal:strong":              "基礎から一歩ずつ。強くなる道も、優しく始められます。",
    "goal:defense":             "護身の基本も、初心者向けにゆっくり学べます。",
    "goal:friends":             "同じ「初めて」から始めた仲間がたくさんいます。",
    "goal:unsure":              "目的は通いながら見つかることも多いです。まずは体験から。",
    "experience:first":         "会員のほとんどが、完全に初めてからのスタートです。",
    "experience:some":          "少しの経験があれば、思い出すところから始められます。",
    "experience:experienced":   "経験者の方には、レベルに合わせたメニューをご用意します。",
    "experience:active":        "現役の方も歓迎です。練習環境について、お気軽にご相談ください。",
    "availability:weekday_night": "お仕事帰りの時間帯に通う方も多いです。",
    "availability:saturday":    "土曜はクラス制です。詳しい時間は体験のご案内時にお伝えします。",
    "availability:unknown":     "通える時間が決まっていなくても、体験の予約はできます。",
    "kids_age:preschool":       "小さなお子さまは、まず「体を動かすのが楽しい」から始めます。",
    "kids_hope:confidence":     "できることが少しずつ増える経験が、自信につながります。",
    "kids_hope:manner":         "挨拶や礼儀は、クラスの中で自然と身につけていきます。",
    "kids_hope:bully":          "ご不安なことは、体験の際にゆっくりお聞かせください。",
    "kids_hope:match":          "試合への挑戦は、本人の気持ちを最優先に、段階を踏んで応援します。"
  },

  reassurance: "体験は初回500円。道具の貸出があるので、動きやすい服だけで大丈夫です。"
};

/* CTA（正本リンク）
 * 結果画面のCTAは1つだけ。予約を強要せず、相談も体験予約も包含する優しい表現にする。
 */
FLATUP.CTA = {
  lineUrl: "https://lin.ee/cTSDajPz",
  bookingLabel: "まずは気軽に相談・体験してみる（初回500円）",
  consultLabel: "まずは気軽に、話を聞いてみる（予約じゃなくてOK）"
};
