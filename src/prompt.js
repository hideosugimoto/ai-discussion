import { MODELS } from "./constants";

const QUALITY_GUIDE = "箇条書きではなく文章で回答し、具体例や根拠を含めて論じてください。一般論だけでなく、あなた独自の視点を加えてください。";

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
    round1: `議題に対して、最も重要な論点を整理し、250〜350字であなたの結論を述べてください。「結論：」で始め、理由を簡潔に添えてください。他のAIとは異なる切り口で結論を出すことを意識してください。${QUALITY_GUIDE}`,
    roundN: `これまでの議論全体を踏まえ、200〜300字で結論を更新・統合してください。各AIの主張の共通点と相違点を整理し、「合意できる点」「意見が分かれる点」「最終的な提言」を明確にしてください。議論を収束させることを意識してください。${QUALITY_GUIDE}`,
  },
};

export function buildPrompt(modelId, topic, profile, history, roundNum, userIntervention, discussionMode, personas, constitution) {
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

  const displayName = myPersona ? `${modelName}（${myPersona}）` : modelName;
  const sys = `あなたは${displayName}です。${othersDesc}と3者でパネルディスカッションを行っています。${instruction}${personaInstruction}${prof}${constText}`;

  const histText =
    history.length === 0
      ? ""
      : "\n\n【これまでの議論】\n" +
        history
          .map((r) =>
            r.messages
              .map((m) => {
                const n = MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId;
                const p = (personas?.[m.modelId] || "").trim();
                return `[${p ? `${n}（${p}）` : n}] ${m.text || "(エラー)"}`;
              })
              .join("\n")
          )
          .join("\n\n---\n\n");

  const safeIntervention = (userIntervention || "").slice(0, 1000);
  const interventionText =
    safeIntervention.trim()
      ? `\n\n【司会者（ユーザー）からの介入】\n${safeIntervention.trim()}`
      : "";

  const user = `【議題】${safeTopic}${histText}${interventionText}\n\nあなた（${modelName}）の発言をどうぞ。`;
  return { sys, user };
}
