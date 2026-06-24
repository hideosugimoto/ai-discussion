// Bundled, read-only sample discussion shown from the Onboarding card ("サンプル
// を見る"). Lets a first-time / logged-out visitor experience the actual output
// — 3 AIs debating + the auto summary — before logging in or entering API keys.
// Static data only (no network); rendered by DemoView.

export const SAMPLE_TOPIC =
  "副業を始めるなら「コンテンツ発信」と「受託（フリーランス）」、どちらから始めるべき？";

export const SAMPLE_DISCUSSION = [
  {
    userIntervention: "",
    isConclusion: false,
    messages: [
      {
        modelId: "claude",
        error: null,
        loading: false,
        text: `結論として、**まずは受託から始める**ことを勧めます。理由は再現性とキャッシュフローです。

## 受託を勧める理由
- **即金性が高い**：スキルさえあれば最初の月から売上が立つ
- **市場のニーズが明確**：何が売れるかを顧客が教えてくれる
- **スキルの言語化が進む**：納品を通じて自分の強みが整理される

コンテンツ発信は「資産」になりますが、**収益化までの時間が長く**、初期は心理的に折れやすい。まず受託で土台を作り、そこで得た知見をコンテンツに転用するのが堅実です。

> 受託で「稼ぐ力」を、発信で「集める力」を。順番が重要です。`,
      },
      {
        modelId: "chatgpt",
        error: null,
        loading: false,
        text: `Claudeの「受託先行」に基本同意しつつ、**一点だけ補強と反論**をします。

受託は時間の切り売りになりやすく、**単価の天井**に早くぶつかります。だからこそ、受託をしながら**並行して小さく発信**すべきです。

1. 受託で得た学びを、そのまま発信ネタにする
2. 発信が「営業」になり、受託単価が上がる
3. 実績が溜まると受託→商品化への移行がスムーズ

つまり「受託 **か** 発信」ではなく、**受託を主・発信を従**で同時に回すのが最適だと考えます。`,
      },
      {
        modelId: "gemini",
        error: null,
        loading: false,
        text: `両者の意見は「どちらを主軸にするか」で一致しています。論点を整理すると、選択は**あなたの現状**に依存します。

| 状況 | おすすめの起点 |
|------|----------------|
| 専門スキルが既にある | 受託（即収益化） |
| 実績・スキルがこれから | 発信（学習過程を資産化） |
| 時間が極端に少ない | 受託（短時間で成果） |

重要なのは「どちらか」ではなく**両方を一本の線で繋ぐ**こと。受託で稼ぎ、その過程を発信し、発信が次の受託を呼ぶ——この循環を設計できるかが分かれ目です。`,
      },
    ],
  },
  {
    userIntervention: "時間が週5時間しか取れない会社員の場合は？",
    isConclusion: false,
    messages: [
      {
        modelId: "claude",
        error: null,
        loading: false,
        text: `週5時間という制約なら、**受託一択**です。発散させず1点集中すべきです。

- 5時間は「1案件を丁寧に納品する」のにちょうどよい
- 発信は習慣化に時間がかかり、5時間では中途半端になりやすい
- まず**月1〜2万円の成功体験**を作ることを最優先に`,
      },
      {
        modelId: "chatgpt",
        error: null,
        loading: false,
        text: `同意します。ただし**発信ゼロ**にはしない。受託の合間に、納品の学びを**週1回だけ**短く記録する。

これは「発信」というより**実績ログ**です。負担は最小、でも半年後に効いてきます。`,
      },
      {
        modelId: "gemini",
        error: null,
        loading: false,
        text: `結論は一致しました。**受託9 : 記録1** の配分が現実解です。

週5時間なら、4.5時間を案件に、0.5時間を「やったことの記録」に。記録は将来の発信・商品化の**種**になります。`,
      },
    ],
  },
];

export const SAMPLE_SUMMARIES = [
  {
    agreements: [
      "副業の主軸は「受託」から始めるのが堅実",
      "発信は受託と並行して小さく回すと相乗効果が出る",
    ],
    disagreements: [
      "発信を最初からやるか（ChatGPT寄り）/ 後回しにするか（Claude寄り）",
    ],
    unresolved: ["どの時点で受託から商品化・発信主軸へ移行すべきか"],
    positionChanges: [],
    stances: {
      claude: "受託先行・発信は後",
      chatgpt: "受託主・発信従で同時並行",
      gemini: "現状依存だが両者を循環で繋ぐ",
    },
  },
  {
    agreements: [
      "時間制約が強い場合は受託に1点集中",
      "発信ではなく『実績の記録』を最小限だけ残す",
    ],
    disagreements: [],
    unresolved: ["記録をいつ本格的な発信へ育てるか"],
    positionChanges: [
      { model: "chatgpt", change: "並行発信 → 『週1の実績ログ』へ現実的に縮小" },
    ],
    stances: {
      claude: "受託一択（週5時間）",
      chatgpt: "受託＋週1記録",
      gemini: "受託9：記録1の配分",
    },
  },
];
