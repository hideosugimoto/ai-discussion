import { MODELS, RESEARCH_CONFIG } from "./constants";
import { buildAttachmentsBlock } from "./lib/fileParser";
import { formatPlanForModel } from "./research/plan";

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

const RESEARCH_INSTRUCTION = `あなたは調査担当者です。意見を述べる場ではありません。実際に検索して一次情報にあたり、読み取れた事実を台帳に追記することがあなたの仕事です。

【このターンでやること】
1. 担当項目のうち、台帳にまだ無い対象を選ぶ（欲張らず2〜3対象。件数より確度）
2. Web検索で対象を特定し、見つけた個別ページのURLを開いて（web_fetch）値を実際に読む
3. 読めた事実を【台帳】に1行1事実で書く
4. 読めなかった項目を【未確認】に書く

【禁止】
- 進め方・方針・分担の提案（計画は確定済み。議論しない）
- 他AIへの同意表明・反論
- 台帳の「済」にある「対象×項目」を調べ直して同じ値を書くこと（重複として捨てられ、そのターンの検索が無駄になります）。済んでいない対象・項目へ進んでください
- 裏の取れていない値を「確実」と書くこと。画像ファイル・検索結果ページ・まとめサイトを出典にした「確実」も不可（本文に値が書かれたページを開いて読めた場合のみ）
- 「これから調べます」という予告だけで終わること

【例外：台帳の値を覆すとき】既存の値が誤っていると別の一次情報で反証できる場合に限り、同じ「対象×項目」を書いてよい。確度は「要確認」、値の末尾に「（台帳の値と相違：<既存の値>）」と添え、読んだ出典URLを示すこと。

【出力形式】厳密に従うこと
本文（100〜300字。今回どの対象の何を確認できたか・つまずいた点だけを書く。前置き・要約・あいさつ不要）

【台帳】
- 対象 | 項目 | 値 | 確度 | 出典URL

【未確認】
- 対象 | 項目 | 確認できなかった理由

台帳の書き方:
- 行は箇条書き（- 対象 | 項目 | ...）でも Markdown の表でも構いません。列の順番だけ守ってください
- 「対象」は施設名・製品名・制度名など固有名詞。「項目」は価格・泉質・評価件数など属性名
- 「値」は読み取った実際の値（数値・単位・条件をそのまま。日付や人数の条件があれば値に含める）
- 「確度」は 確実 / 要確認 / 推測 のいずれか。「確実」は出典URLのページにその値が実際に書かれている場合のみ
- 「出典URL」は実際に開いた、または検索結果に出たURLをそのまま書く。組み立てたURLや存在しないURLは書かない
- 台帳に書く行が無いターンがあってもよい。その場合は【台帳】の下を空にし、【未確認】に理由を書く`;

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
  consensus: {
    round1: `議題に対する自分の見解を250〜350字で述べつつ、他のAIと共有できそうな前提・価値観と、論点になりそうな点を明示してください。最初から合意の土台づくりを意識し、対立をあおらないでください。${QUALITY_GUIDE}`,
    roundN: `他のAIの発言の「正しい部分」を積極的に認めて取り込み、対立を勝ち負けにせず合意形成を目指してください。200〜300字で「合意できる点」と「まだ要調整の点」を切り分け、双方が受け入れられる第三案・条件付き合意を具体的に提案してください。${QUALITY_GUIDE}`,
  },
  decision: {
    round1: `議題を「意思決定」として扱ってください。250〜350字で、取りうる選択肢を洗い出し、評価軸（例: コスト・リスク・実現性・期間など）を立てて各選択肢を簡潔に評価し、最後に現時点での暫定推奨を示してください。${QUALITY_GUIDE}`,
    roundN: `他のAIが挙げた選択肢・評価軸・評価に対して200〜300字で反論または補強し、見落とされたトレードオフや前提を指摘してください。そのうえで「どの条件ならどの選択肢が最適か」を条件付きで具体的に示してください。${QUALITY_GUIDE}`,
  },
  // 調査モード: this is not a discussion instruction — it is a work order. The
  // panel modes above all end in "反論・譲歩を1つ以上含めて200〜300字" (see
  // QUALITY_GUIDE), which is exactly what turns a research request into rounds
  // of methodology debate: the model is being asked for an argument, so it
  // produces one. Research rounds get no character budget, no rebuttal duty,
  // and a fixed output contract instead (本文 + 【台帳】 + 【未確認】), because
  // what has to survive the round is the facts, not the position.
  research: {
    round1: RESEARCH_INSTRUCTION,
    roundN: RESEARCH_INSTRUCTION,
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
  // Cost: this block is re-sent to all three AIs every round. Keep the source
  // count and all functional rules (they drive answer quality — specific names,
  // confidence labels, citation discipline), but trim verbose phrasing and snippet
  // length so per-round input stays lean without weakening the evidence itself.
  const lines = usable.slice(0, 6).map((r, i) => {
    const title = (r.title || "(無題)").toString().trim();
    const rawSnippet = (r.snippet || "").toString().trim();
    const snippet = rawSnippet.length > 160 ? rawSnippet.slice(0, 160) + "…" : rawSnippet;
    const url = (r.url || "").toString().trim();
    return `[${i + 1}] ${title}\n${snippet}${snippet ? "\n" : ""}（出典: ${url}）`;
  });
  const n = lines.length;
  return `\n\n【最新のWeb検索結果（参考・全${n}件）】\n以下を踏まえ「具体的」に答えてください。\n【ルール】\n- 営業時間・価格・固有名詞などの事実は検索結果に明記がある場合のみ記載。無い値は推測せず【要確認】。\n- 出典は[1]〜[${n}]のみ。存在しない番号・店名・数値を創作しない。\n- 各推薦に確度ラベルを付ける：【確実】=結果に明記／【候補】=名称はあるが詳細要確認／【推測】=結果に根拠なし。\n- 検索結果に無い事項を【確実】や出典付きにしない。自分の知識による補足は【推測】とし出典番号を付けない（検索由来と知識を区別）。\n- 固有名詞・数値を積極的に挙げ、抽象論や「要確認」だけで終わらせない。\n- 推薦は箇条書きで「・名称 ［ラベル］（あれば営業時間/出典[番号]）」とし、理由・考察は文章で述べる。\n- 鵜呑みにせず取捨選択し、他AIと異なる切り口を出す。\n${lines.join("\n\n")}`;
}

// Research rounds carry the plan (stable) and the ledger index (grows) instead
// of the discussion transcript. Keeping the transcript out is both the cost win
// and the quality win: the previous round's prose is the part that pulled the
// panel back into arguing about method, and it is also the largest block we
// would otherwise re-send every round.
export function buildResearchBlocks(research, modelId, nameOf) {
  const plan = research?.plan;
  const planText = plan ? formatPlanForModel(plan, modelId, nameOf) : "";
  // budget 0 = this round has no search tool (own-keys / non-premium). Say so
  // plainly: a prompt that promises tools the model does not have is an
  // invitation to fill the ledger from memory.
  const budget = Number.isInteger(research?.searchBudget) ? research.searchBudget : RESEARCH_CONFIG.searchBudget;
  const toolText = budget > 0
    ? `\n\n【使えるツール】このターンの検索は最大${budget}回、ページ取得(web_fetch)も最大${budget}回までです。`
      + `検索結果の要約だけで値を埋めず、個別ページを開いて確認してください。`
      + `予算内で終わる範囲に対象を絞り、残りは【未確認】に回してください。`
    : `\n\n【使えるツール】このターンはWeb検索・ページ取得を利用できません。`
      + `記憶や推論で台帳を埋めないでください。出典URLを示せない項目はすべて【未確認】に回し、`
      + `台帳に書く場合は確度を「推測」とし出典を空にしてください。`;
  const index = (research?.ledgerIndex || "").trim();
  const ledgerText = index
    ? `\n\n【確定事実台帳】以下は3者が確認を終えた項目です。`
      + `「済」に挙がっている項目は調べ直さないでください（重複は捨てられます）。`
      + `URLは web_fetch で開けるので、同じ対象の"別の"項目を調べるときの起点に使えます。\n${index}`
    : "\n\n【確定事実台帳】まだ空です。あなたの担当項目の1件目から着手してください。";
  const open = Array.isArray(research?.openItems) ? research.openItems.filter(Boolean) : [];
  const openText = open.length
    ? `\n\n【前ラウンド時点の未確認項目（あなたの担当分があれば優先）】\n${open.map((o) => `- ${o}`).join("\n")}`
    : "";
  return { planText, toolText, ledgerText: `${ledgerText}${openText}` };
}

// Final research report: one call, no tools, the full ledger as the only source.
export function buildReportPrompt(topic, ledgerText, profile, constitution) {
  const safeTopic = (topic || "").slice(0, 2000);
  const prof = (profile || "").trim()
    ? `\n\n【依頼者のプロフィール】\n${profile.slice(0, 5000).trim()}`
    : "";
  const constText = (constitution || "").trim()
    ? `\n\n【依頼者の判断基準】\n${constitution.slice(0, 2000).trim()}`
    : "";
  const ledger = (ledgerText || "").trim();
  const user = `【議題（依頼内容と出力形式の指定）】\n${safeTopic}${prof}${constText}`
    + `\n\n【確定事実台帳（この内容だけを根拠にできる）】\n${ledger || "（台帳が空です。この場合は「調査結果なし」と述べ、何も確認できていないことを報告してください）"}`
    + `\n\n上記の台帳だけを根拠に、最終レポートを作成してください。`;
  return user;
}

export function buildPrompt(modelId, topic, profile, history, roundNum, userIntervention, discussionMode, personas, constitution, contextDiscussions, summaries, rollingSummary, attachments, searchContext, nativeSearch, research) {
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
  const isResearch = modeKey === "research";
  const nameOf = (id) => MODELS.find((m) => m.id === id)?.name ?? id;
  const rb = isResearch ? buildResearchBlocks(research, modelId, nameOf) : null;

  const sys = isResearch
    ? `あなたは${displayName}です。${othersDesc}と3者で分担して1件の調査を進めています。${instruction}${rb.planText}${rb.toolText}${personaInstruction}${prof}${constText}`
    : `あなたは${displayName}です。${othersDesc}と3者でパネルディスカッションを行っています。${instruction}${personaInstruction}${prof}${constText}${contextText}${nativeText}`;

  // Research mode drops the transcript entirely — the ledger carries the state.
  const histText = isResearch ? "" : compressHistory(history, summaries, personas, rollingSummary);
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
  const userVariable = isResearch
    ? `${rb.ledgerText}${interventionText}\n\nあなた（${modelName}）の担当分の調査を実行し、結果を出力してください。`
    : `${histText}${interventionText}\n\nあなた（${modelName}）の発言をどうぞ。`;
  const user = `${userCachePrefix}${userVariable}`;
  return { sys, user, userCachePrefix, userVariable };
}
