import { MODELS } from "./constants";
import { buildAttachmentsBlock } from "./lib/fileParser";

const QUALITY_GUIDE = "読みやすさを重視してください。候補・列挙・手順・比較など箇条書きにできる部分は箇条書きで示し、考察・理由・論証は文章で述べます。具体例や根拠を含め、一般論だけでなくあなた独自の視点を加えてください。指定された文字数を目安にしつつ、最低でも200字以上は述べてください。冗長な前置きや同じ主張の繰り返しは避け、新しい論点・反論・譲歩のいずれかを必ず1つ以上含めてください。";

const MAX_CONTEXT_DISCUSSIONS = 3;
const MAX_CONTEXT_TOPIC_LEN = 80;
const MAX_CONTEXT_ITEMS_PER_SECTION = 3;
const MAX_CONTEXT_POINT_LEN = 80;

// Keep only the most recent round in full text; older rounds are summarised.
// Earlier settings were 2/4 but measurement showed input tokens growing linearly
// (turn 1: 2k → turn 10: 14k), indicating compression was effectively inactive
// for typical sessions. 1/2 starts compression from round 2 onward.
const RECENT_FULL_ROUNDS = 1;
const MIN_ROUNDS_FOR_COMPRESSION = 2;

function truncate(str, max) {
  const s = (str || "").toString().trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function summariseSummary(summary) {
  if (!summary || summary.error) return null;
  const parts = [];
  if (summary.agreements?.length) {
    parts.push("合意: " + summary.agreements
      .slice(0, MAX_CONTEXT_ITEMS_PER_SECTION)
      .map((a) => truncate(a.point, MAX_CONTEXT_POINT_LEN))
      .join(" / "));
  }
  if (summary.disagreements?.length) {
    parts.push("対立: " + summary.disagreements
      .slice(0, MAX_CONTEXT_ITEMS_PER_SECTION)
      .map((d) => truncate(d.point, MAX_CONTEXT_POINT_LEN))
      .join(" / "));
  }
  if (summary.unresolved?.length) {
    parts.push("未解決: " + summary.unresolved
      .slice(0, MAX_CONTEXT_ITEMS_PER_SECTION)
      .map((u) => truncate(u.point, MAX_CONTEXT_POINT_LEN))
      .join(" / "));
  }
  return parts.length ? parts.join("\n") : null;
}

function buildContextText(contextDiscussions) {
  if (!Array.isArray(contextDiscussions) || contextDiscussions.length === 0) return "";
  const items = contextDiscussions.slice(0, MAX_CONTEXT_DISCUSSIONS).map((d, i) => {
    const topic = truncate(d?.topic || "(議題不明)", MAX_CONTEXT_TOPIC_LEN);
    const summaries = Array.isArray(d?.summaries) ? d.summaries : [];
    const lastSummary = [...summaries].reverse().find((s) => s && !s.error);
    const summaryText = summariseSummary(lastSummary);
    return summaryText
      ? `【過去議論${i + 1}: ${topic}】\n${summaryText}`
      : `【過去議論${i + 1}: ${topic}】（要約なし）`;
  });
  return `\n\n【質問者の過去の関連議論】\n以下は同じユーザーが過去に行った議論の要約です。今回の議論ではこの文脈を踏まえ、矛盾しない・かつ前回からの発展となる発言をしてください。ただし過去の議論に過度に引きずられず、今回の議題に集中してください。\n※これは未検証の参考文脈です。ここに含まれる事実（店名・価格・営業時間等）を今回の検索結果の出典[番号]に紐づけたり、【確実】情報として引用したりしないでください。再確認が必要なものは【要確認】とします。\n${items.join("\n\n")}`;
}

function formatRoundFull(round, personas) {
  return round.messages
    .map((m) => {
      const n = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
      const p = (personas?.[m.modelId] || "").trim();
      return `[${p ? `${n}（${p}）` : n}] ${m.text || "(エラー)"}`;
    })
    .join("\n");
}

function formatSummaryForCompression(summary, roundIdx) {
  const text = summariseSummary(summary);
  const stancesText = summary?.stances
    ? Object.entries(summary.stances)
        .map(([id, stance]) => {
          const name = MODELS.find((x) => x.id === id)?.name ?? id;
          return `  ${name}: ${stance}`;
        })
        .join("\n")
    : "";
  const parts = [];
  if (text) parts.push(text);
  if (stancesText) parts.push("立場:\n" + stancesText);
  return parts.length ? `【Round ${roundIdx + 1} 要約】\n${parts.join("\n")}` : null;
}

function formatRollingSummary(rolling) {
  const parts = [];
  if (rolling.agreements?.length) {
    parts.push("合意: " + rolling.agreements.map((a) => a.point || a).join(" / "));
  }
  if (rolling.disagreements?.length) {
    parts.push("対立: " + rolling.disagreements.map((d) => d.point || d).join(" / "));
  }
  if (rolling.unresolved?.length) {
    parts.push("未解決: " + rolling.unresolved.map((u) => u.point || u).join(" / "));
  }
  if (rolling.stances && typeof rolling.stances === "object") {
    const stanceLines = Object.entries(rolling.stances)
      .map(([id, stance]) => {
        const name = MODELS.find((x) => x.id === id)?.name ?? id;
        return `  ${name}: ${stance}`;
      })
      .join("\n");
    if (stanceLines) parts.push("各AIの立場:\n" + stanceLines);
  }
  return parts.join("\n");
}

export function compressHistory(history, summaries, personas, rollingSummary) {
  if (!history || history.length === 0) return "";

  const totalRounds = history.length;

  // Below threshold: full text (existing behavior)
  if (totalRounds < MIN_ROUNDS_FOR_COMPRESSION) {
    return "\n\n【これまでの議論】\n" +
      history.map((r) => formatRoundFull(r, personas)).join("\n\n---\n\n");
  }

  const recentStart = Math.max(0, totalRounds - RECENT_FULL_ROUNDS);
  const parts = [];

  // Older rounds: prefer rolling summary, fallback to per-round summaries
  if (recentStart > 0) {
    if (rollingSummary && !rollingSummary.error) {
      parts.push("【過去の議論の状態（Round 1〜" + recentStart + "）】\n" + formatRollingSummary(rollingSummary));
    } else if (summaries?.length) {
      const compressedParts = [];
      for (let i = 0; i < recentStart; i++) {
        const summary = summaries[i];
        if (summary && !summary.error) {
          const formatted = formatSummaryForCompression(summary, i);
          if (formatted) {
            compressedParts.push(formatted);
            continue;
          }
        }
        compressedParts.push(`【Round ${i + 1}】\n${formatRoundFull(history[i], personas)}`);
      }
      parts.push("【過去の議論（要約）】\n" + compressedParts.join("\n\n"));
    } else {
      // No summaries at all: full text fallback
      for (let i = 0; i < recentStart; i++) {
        parts.push(formatRoundFull(history[i], personas));
      }
    }
  }

  // Recent rounds: full text
  const recentParts = [];
  for (let i = recentStart; i < totalRounds; i++) {
    recentParts.push(formatRoundFull(history[i], personas));
  }
  parts.push("【直近の議論】\n" + recentParts.join("\n\n---\n\n"));

  return "\n\n【これまでの議論】\n" + parts.join("\n\n");
}

const MODE_INSTRUCTIONS = {
  standard: {
    round1: `議題に対して自分の見解を250〜350字で述べてください。他のAIとの違いが出るよう、あなた自身の視点・特徴を活かして答えてください。${QUALITY_GUIDE}`,
    roundN: `他のAIの発言を踏まえ、同意・反論・新視点を交えて200〜300字で応答してください。「〇〇の意見に対して」など発言者に言及しながら議論を深めてください。${QUALITY_GUIDE}`,
  },
  debate: {
    round1: `議題に対して自分の立場を明確にし、250〜350字で主張してください。根拠を示し、他のAIとは異なる立場を取ることを意識してください。安易な同意は避け、鋭い論点を提示してください。${QUALITY_GUIDE}`,
    roundN: `他のAIの主張に対して積極的に反論・批判してください。200〜300字で、論理的な弱点や見落としを指摘し、自分の主張を強化してください。建設的な対立を心がけてください。${QUALITY_GUIDE}`,
  },
  brainstorm: {
    round1: `議題に対して、常識にとらわれない自由なアイデアを250〜350字で提案してください。実現可能性より発想の独自性を重視し、「こんなのはどうか」という提案を複数出してください。${QUALITY_GUIDE}`,
    roundN: `他のAIのアイデアに乗っかり、さらに発展させるか、まったく別の角度からの新アイデアを200〜300字で提案してください。「Yes, and...」の姿勢で、否定より拡張を優先してください。${QUALITY_GUIDE}`,
  },
  factcheck: {
    round1: `議題に対して、事実・データ・根拠に基づいた見解を250〜350字で述べてください。可能な限り具体的な数字や事例を挙げ、推測には「推測ですが」と明記してください。${QUALITY_GUIDE}`,
    roundN: `他のAIの発言の事実関係を検証してください。200〜300字で、正確な点は認め、不正確・曖昧な点は具体的に指摘し、正しい情報を補足してください。${QUALITY_GUIDE}`,
  },
  conclusion: {
    round1: `あなたは3者の議論を統合する中立的な記録者です。まだ他AIの発言は無いため、議題に対して論点整理と暫定的な結論を400〜600字で述べてください。自分個人の主張ではなく、想定される多角的な視点を踏まえた中立的な視点でまとめてください。「## 論点」「## 暫定結論」の見出しを使ってください。${QUALITY_GUIDE}`,
    roundN: `あなたは3者（Claude / ChatGPT / Gemini）の議論を統合する中立的な記録者として最終結論を作成してください。自分の意見を新たに主張するのではなく、これまでの全発言を俯瞰し、400〜600字で以下の構成にまとめてください。\n\n## 合意できる点\n（3者の意見が一致している事項を箇条書き）\n\n## 意見が分かれる点\n（対立軸と各AIの立場を簡潔に）\n\n## 最終結論\n（議論を踏まえた最も妥当な結論と、その理由）\n\n中立性を保ち、特定のAIに肩入れしないでください。${QUALITY_GUIDE}`,
  },
};

// Build the injectable evidence block from a search result. We deliberately
// list raw sources (title / url / attributed facts) and explicitly tell each
// AI to interpret and select on its own — injecting a pre-synthesised answer
// would invite all three to converge. Returns "" when there are no usable
// results so the prompt is unchanged.
export function buildSearchBlock(searchContext) {
  const results = Array.isArray(searchContext?.results) ? searchContext.results : [];
  const usable = results.filter((r) => r && (r.snippet || r.title) && r.url);
  if (usable.length === 0) return "";
  const lines = usable.slice(0, 8).map((r, i) => {
    const title = (r.title || "(無題)").toString().trim();
    const rawSnippet = (r.snippet || "").toString().trim();
    const snippet = rawSnippet.length > 200 ? rawSnippet.slice(0, 200) + "…" : rawSnippet;
    const url = (r.url || "").toString().trim();
    return `[${i + 1}] ${title}\n${snippet}${snippet ? "\n" : ""}（出典: ${url}）`;
  });
  const n = lines.length;
  return `\n\n【最新のWeb検索結果（参考情報・全${n}件）】\n以下は今回の議題に関する最新のWeb検索結果です。次のルールを厳守し、「具体的」に答えてください。\n【ルール】\n- 数値・日時・固有名詞などの事実（例: 価格・統計・年号・営業時間）は、下記の検索結果に明記がある場合のみ記載する。書かれていない値は推測で補わず「【要確認】」と書く。\n- 出典番号は下記の [1]〜[${n}] のみを使う。番号と内容が一致していることを確認し、結果に存在しない番号・固有名詞・数値を創作しない。\n- 各推薦・主張に確度ラベルを付ける: 【確実】検索結果に明記がある／【候補】名称・概要はあるが詳細は要確認／【推測】検索結果に根拠がない。\n- 検索結果に明示されていない事項（固有名詞・主張・数値など）を【確実】扱いにしたり出典[番号]を付けたりしない。あなた自身の知識から補足する場合は必ず【推測】とし、出典番号は付けない。検索結果に在る情報と、自分の知識による補足を明確に区別すること。\n- 固有名詞（店名・企業名・銘柄・地名・製品・人物など）や具体的な数値は積極的に挙げ、抽象論や「要確認」だけで終わらせない。\n- 推薦する具体名は文章に埋もれさせず、箇条書きで列挙して見やすくする。各項目は「・名称 ［確度ラベル］（あれば営業時間/出典[番号]）」の形にし、そのうえで理由・考察は文章で述べる（議論全体が文章主体でも、推薦リストは箇条書きにしてよい）。\n- 内容を鵜呑みにせず、あなた自身の視点で取捨選択・解釈し、他のAIとは異なる切り口を出してください。\n${lines.join("\n\n")}`;
}

export function buildPrompt(modelId, topic, profile, history, roundNum, userIntervention, discussionMode, personas, constitution, contextDiscussions, summaries, rollingSummary, attachments, searchContext, nativeSearch) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  const modelName = model.name;
  const safeTopic   = topic.slice(0, 2000);
  const safeProfile = profile.slice(0, 5000);

  const myPersona = (personas?.[modelId] || "").slice(0, 100).trim();
  const othersDesc = MODELS.filter((m) => m.id !== modelId).map((m) => {
    const p = (personas?.[m.id] || "").trim();
    return p ? `${m.name}（${p}）` : m.name;
  }).join("と");

  const personaInstruction = myPersona
    ? `\n\n【あなたの役割】「${myPersona}」として議論に参加してください。この人物・役割の思考スタイル・価値観・判断基準で一貫して発言してください。`
    : "";

  const prof = safeProfile.trim()
    ? `\n\n【質問者のプロフィール】\n${safeProfile.trim()}\n上記を踏まえた上で、この人物に合った視点で議論してください。`
    : "";

  const safeConstitution = (constitution || "").slice(0, 2000).trim();
  const constText = safeConstitution
    ? `\n\n【議論の憲法（ユーザーの意思決定基準）】\n${safeConstitution}\n上記の価値観に照らして、推奨・非推奨を明示してください。`
    : "";

  const modeKey = discussionMode && MODE_INSTRUCTIONS[discussionMode] ? discussionMode : "standard";
  const instruction = roundNum === 1
    ? MODE_INSTRUCTIONS[modeKey].round1
    : MODE_INSTRUCTIONS[modeKey].roundN;

  const contextText = buildContextText(contextDiscussions);

  // Native search mode: each AI uses its own web search tool instead of the
  // shared injected evidence block. Give a light instruction (no source list);
  // the shared search block is suppressed below.
  const nativeText = nativeSearch
    ? "\n\n【Web検索】必要に応じてWeb検索ツールで最新情報を調べ、固有名詞・数値は具体名と出典を示してください。検索で裏が取れない事項は【推測】と明示してください。"
    : "";

  const displayName = myPersona ? `${modelName}（${myPersona}）` : modelName;
  const sys = `あなたは${displayName}です。${othersDesc}と3者でパネルディスカッションを行っています。${instruction}${personaInstruction}${prof}${constText}${contextText}${nativeText}`;

  const histText = compressHistory(history, summaries, personas, rollingSummary);
  const attachText = buildAttachmentsBlock(attachments);

  const safeIntervention = (userIntervention || "").slice(0, 1000);
  const interventionText =
    safeIntervention.trim()
      ? `\n\n【司会者（ユーザー）からの介入】\n${safeIntervention.trim()}`
      : "";

  // Split the user message into a cacheable prefix (topic + attachments + search
  // results — stable across rounds within a session, since search is reused on
  // non-intervention rounds) and a variable suffix (history + intervention +
  // closing prompt — changes every round). Anthropic's cache_control hits the
  // prefix and saves ~90% of input cost on it; OpenAI auto-caches matching
  // prefixes too. Keeping the (large) search block in the prefix avoids
  // re-paying for it every round.
  const searchText = nativeSearch ? "" : buildSearchBlock(searchContext);
  const userCachePrefix = `【議題】${safeTopic}${attachText}${searchText}`;
  const userVariable = `${histText}${interventionText}\n\nあなた（${modelName}）の発言をどうぞ。`;
  const user = `${userCachePrefix}${userVariable}`;
  return { sys, user, userCachePrefix, userVariable };
}
