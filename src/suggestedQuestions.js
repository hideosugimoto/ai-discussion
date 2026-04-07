// おすすめ質問集
// 自分への質問35問 + 議論しがいのあるテーマ15問 = 計50問

export const QUESTION_CATEGORIES = [
  { id: "self",       label: "🪞 自己分析",       hint: "プロフィール推奨" },
  { id: "career",     label: "🎯 キャリア・人生", hint: "プロフィール推奨" },
  { id: "money",      label: "💰 お金・時間",     hint: "プロフィール推奨" },
  { id: "business",   label: "🚀 事業・プロダクト", hint: "プロフィール推奨" },
  { id: "philosophy", label: "🤔 哲学・価値観",   hint: "プロフィール推奨" },
  { id: "creative",   label: "🎨 創作・学習",     hint: "プロフィール推奨" },
  { id: "trends",     label: "🌐 時事・トレンド", hint: "誰でもOK" },
  { id: "thought",    label: "💭 思考実験",       hint: "誰でもOK" },
  { id: "fun",        label: "✨ 軽めのテーマ",   hint: "誰でもOK" },
];

export const SUGGESTED_QUESTIONS = [
  // ── 🪞 自己分析（7問） ──────────────────────────────
  { id: "q01", category: "self", mode: "conclusion", needsProfile: true,
    text: "私のプロフィールを読んで、今後3年で『絶対にやめるべきこと』『絶対に始めるべきこと』『継続すべきこと』を1つずつ、根拠とともに挙げてください。" },
  { id: "q02", category: "self", mode: "debate", needsProfile: true,
    text: "私のプロフィールを見て、私が自覚していないであろう弱点を3つ挙げてください。忖度なしでお願いします。" },
  { id: "q03", category: "self", mode: "debate", needsProfile: true,
    text: "私が無意識に避けている、または先送りしている重要な意思決定は何だと思いますか？" },
  { id: "q04", category: "self", mode: "debate", needsProfile: true,
    text: "私が『これは自分の強み』と思っていそうなことの中で、実は時代遅れになりつつあるものは何ですか？" },
  { id: "q05", category: "self", mode: "conclusion", needsProfile: true,
    text: "私の人生で一番怖いものは何だと思いますか？それを直視せずに済ませる方法ばかり選んでいないでしょうか？" },
  { id: "q06", category: "self", mode: "standard", needsProfile: true,
    text: "60歳になった私が、今の自分に最も言いたいことは何だと思いますか？" },
  { id: "q07", category: "self", mode: "standard", needsProfile: true,
    text: "私のプロフィールから読み取れる『人生のテーマ』を一言で表現してください。" },

  // ── 🎯 キャリア・人生選択（7問） ────────────────────
  { id: "q08", category: "career", mode: "debate", needsProfile: true,
    text: "私が今のキャリアを5年続けた未来と、いま全部捨てて別の道に行く未来、どちらが幸福度が高いと思いますか？" },
  { id: "q09", category: "career", mode: "conclusion", needsProfile: true,
    text: "私が次の10年で最も後悔する可能性が高い選択は何ですか？それを避けるには？" },
  { id: "q10", category: "career", mode: "debate", needsProfile: true,
    text: "私は本業を辞めて独立すべきか、副業のままが最適か？それぞれの立場で論じてください。" },
  { id: "q11", category: "career", mode: "brainstorm", needsProfile: true,
    text: "私の年齢・経歴で、今から学ぶ価値のある『次のスキル』を3つ提案してください。" },
  { id: "q12", category: "career", mode: "brainstorm", needsProfile: true,
    text: "私が定年後にやりたいと思うようなことを、今から始めるとしたら何が良いですか？" },
  { id: "q13", category: "career", mode: "brainstorm", needsProfile: true,
    text: "私のキャリアにおける『次の一手』を、保守的・中庸・大胆な3パターンで提案してください。" },
  { id: "q14", category: "career", mode: "standard", needsProfile: true,
    text: "私が転職するとしたら、どんな会社・職種が向いていますか？理由も教えてください。" },

  // ── 💰 お金・時間（5問） ────────────────────────────
  { id: "q15", category: "money", mode: "debate", needsProfile: true,
    text: "私が今100万円自由に使えるとしたら、投資・学習・旅行・事業・貯金のどれが最もリターンが大きいですか？" },
  { id: "q16", category: "money", mode: "debate", needsProfile: true,
    text: "年収1000万を目指すのと、年収600万で週3勤務を目指すの、私の場合どちらが合理的ですか？" },
  { id: "q17", category: "money", mode: "standard", needsProfile: true,
    text: "私の支出で『無駄になっている可能性が高いもの』と『逆にケチりすぎているもの』をそれぞれ指摘してください。" },
  { id: "q18", category: "money", mode: "brainstorm", needsProfile: true,
    text: "私が今すぐ始められる『副収入』のアイデアを5つ提案してください。実現可能性は問いません。" },
  { id: "q19", category: "money", mode: "conclusion", needsProfile: true,
    text: "私の老後資金、どう設計するのがベストですか？必要額・運用方法・優先順位を教えてください。" },

  // ── 🚀 事業・プロダクト（6問） ──────────────────────
  { id: "q20", category: "business", mode: "debate", needsProfile: true,
    text: "私が新規事業を始めるとしたら、どんな分野が一番勝ちやすいですか？根拠とともに3案提示してください。" },
  { id: "q21", category: "business", mode: "debate", needsProfile: false,
    text: "私が作っているサービス（事前に詳細を伝えます）の致命的な見落としは何ですか？忖度なしで。" },
  { id: "q22", category: "business", mode: "conclusion", needsProfile: false,
    text: "私のビジネスのターゲットユーザーを1人だけ選ぶなら誰ですか？その理由は？" },
  { id: "q23", category: "business", mode: "debate", needsProfile: false,
    text: "半年運営して有料ユーザーが0人だったら、撤退すべきか継続すべきか？判断基準も含めて議論してください。" },
  { id: "q24", category: "business", mode: "brainstorm", needsProfile: false,
    text: "私の事業を10倍にスケールさせるための施策を、コスト別（無料・10万・100万）で提案してください。" },
  { id: "q25", category: "business", mode: "standard", needsProfile: true,
    text: "もし私が起業するなら、共同創業者にどんな人を選ぶべきですか？私に欠けている要素から逆算してください。" },

  // ── 🤔 哲学・価値観（5問） ──────────────────────────
  { id: "q26", category: "philosophy", mode: "debate", needsProfile: true,
    text: "私が『成功』と呼んでいるものの定義は、本当に私自身の価値観から来ていますか？それとも社会の刷り込みですか？" },
  { id: "q27", category: "philosophy", mode: "debate", needsProfile: true,
    text: "私にとって『自由』とは何ですか？それは本当に手に入れる価値があるものですか？" },
  { id: "q28", category: "philosophy", mode: "standard", needsProfile: true,
    text: "私のプロフィールから、私が『これだけは譲れない』と思っているものを推測してください。" },
  { id: "q29", category: "philosophy", mode: "standard", needsProfile: true,
    text: "私の人生において、最も大切にすべき関係性は何でしょうか？" },
  { id: "q30", category: "philosophy", mode: "conclusion", needsProfile: true,
    text: "私が死ぬ前に『やっておけば良かった』と思いそうなことは何ですか？今からできる対策も含めて。" },

  // ── 🎨 創作・学習（5問） ────────────────────────────
  { id: "q31", category: "creative", mode: "brainstorm", needsProfile: true,
    text: "私が今から趣味を1つ始めるとしたら、何がオススメですか？理由も含めて。" },
  { id: "q32", category: "creative", mode: "standard", needsProfile: true,
    text: "私の学習スタイルに合った、効率的な勉強法を提案してください。" },
  { id: "q33", category: "creative", mode: "brainstorm", needsProfile: true,
    text: "私が読むべき本を5冊、ジャンルバラバラで選んでください。各1行で理由も。" },
  { id: "q34", category: "creative", mode: "brainstorm", needsProfile: true,
    text: "私の創造性を伸ばすために、明日から始められる習慣を3つ提案してください。" },
  { id: "q35", category: "creative", mode: "brainstorm", needsProfile: true,
    text: "私のSNS発信、もっと面白くするにはどうしたらいいですか？具体的な方向性を3つ。" },

  // ── 🌐 時事・トレンド（5問） ────────────────────────
  { id: "q36", category: "trends", mode: "debate", needsProfile: false,
    text: "AIは10年後、人間の仕事の何%を奪うか？最も影響を受ける職種と、逆に残る職種を予測してください。" },
  { id: "q37", category: "trends", mode: "debate", needsProfile: false,
    text: "リモートワークと出社、どちらが本当に生産性が高いですか？職種別の答えも欲しいです。" },
  { id: "q38", category: "trends", mode: "debate", needsProfile: false,
    text: "日本の少子化を止める最も効果的な政策は何ですか？非常識な案も歓迎します。" },
  { id: "q39", category: "trends", mode: "debate", needsProfile: false,
    text: "ベーシックインカムは導入すべきですか？経済・倫理・政治の観点で議論してください。" },
  { id: "q40", category: "trends", mode: "debate", needsProfile: false,
    text: "大学進学は今でも価値がありますか？コスト・キャリア・人脈の3軸で考えてください。" },

  // ── 💭 思考実験（5問） ──────────────────────────────
  { id: "q41", category: "thought", mode: "debate", needsProfile: false,
    text: "『努力すれば報われる』は本当か、それとも幻想か？両方の立場で論じてください。" },
  { id: "q42", category: "thought", mode: "debate", needsProfile: false,
    text: "幸福とは『感じるもの』か、『追求するもの』か？" },
  { id: "q43", category: "thought", mode: "debate", needsProfile: false,
    text: "AIに『意識』は宿りうるか？哲学・神経科学・情報理論の観点から議論してください。" },
  { id: "q44", category: "thought", mode: "brainstorm", needsProfile: false,
    text: "もし全員が同じ年収だったら、社会はどうなりますか？面白い予測を競ってください。" },
  { id: "q45", category: "thought", mode: "debate", needsProfile: false,
    text: "『死後の世界』はあると考えるべきか、ないと考えるべきか？人生への影響も含めて。" },

  // ── ✨ 軽めのテーマ（5問） ──────────────────────────
  { id: "q46", category: "fun", mode: "brainstorm", needsProfile: false,
    text: "もしタイムマシンがあったら、過去と未来どちらに行くべき？それぞれの旅程プランも提案してください。" },
  { id: "q47", category: "fun", mode: "standard", needsProfile: false,
    text: "無人島に1冊だけ本を持っていくなら何ですか？3者でそれぞれ別の本を選んで理由を述べてください。" },
  { id: "q48", category: "fun", mode: "brainstorm", needsProfile: false,
    text: "人類が次に発明すべきものは何ですか？突拍子もないアイデア大歓迎。" },
  { id: "q49", category: "fun", mode: "brainstorm", needsProfile: false,
    text: "『最強の朝のルーティン』を3者で議論して、最終的に統合プランを作ってください。" },
  { id: "q50", category: "fun", mode: "brainstorm", needsProfile: false,
    text: "もしお金も時間も無限にあったら、人は何をすべきですか？意外な答えを期待しています。" },
];

// 議題欄プレースホルダーローテーション用（短めの質問のみ抜粋）
export const PLACEHOLDER_ROTATION = [
  "私が今後3年で『絶対にやめるべきこと』は？",
  "私が自覚していない弱点を3つ教えて",
  "AIは10年後、何%の仕事を奪うか？",
  "リモートワークと出社、どちらが生産性が高い？",
  "私の老後資金、どう設計するのがベスト？",
  "『努力すれば報われる』は本当か？",
  "私が今100万円使うとしたら、最適な使い道は？",
  "60歳の私が今の自分に言いたいことは？",
  "大学進学は今でも価値があるか？",
  "私の事業の致命的な見落としは何か？",
];
