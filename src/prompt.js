import { MODELS } from "./constants";

const MODE_INSTRUCTIONS = {
  standard: {
    round1: "議題に対して自分の見解を300字以内で述べてください。他のAIとの違いが出るよう、あなた自身の視点・特徴を活かして答えてください。",
    roundN: "他のAIの発言を踏まえ、同意・反論・新視点を交えて200字以内で応答してください。「〇〇の意見に対して」など発言者に言及しながら議論を深めてください。",
  },
  debate: {
    round1: "議題に対して自分の立場を明確にし、300字以内で主張してください。根拠を示し、他のAIとは異なる立場を取ることを意識してください。安易な同意は避け、鋭い論点を提示してください。",
    roundN: "他のAIの主張に対して積極的に反論・批判してください。200字以内で、論理的な弱点や見落としを指摘し、自分の主張を強化してください。建設的な対立を心がけてください。",
  },
  brainstorm: {
    round1: "議題に対して、常識にとらわれない自由なアイデアを300字以内で提案してください。実現可能性より発想の独自性を重視し、「こんなのはどうか」という提案を複数出してください。",
    roundN: "他のAIのアイデアに乗っかり、さらに発展させるか、まったく別の角度からの新アイデアを200字以内で提案してください。「Yes, and...」の姿勢で、否定より拡張を優先してください。",
  },
  factcheck: {
    round1: "議題に対して、事実・データ・根拠に基づいた見解を300字以内で述べてください。可能な限り具体的な数字や事例を挙げ、推測には「推測ですが」と明記してください。",
    roundN: "他のAIの発言の事実関係を検証してください。200字以内で、正確な点は認め、不正確・曖昧な点は具体的に指摘し、正しい情報を補足してください。",
  },
};

export function buildPrompt(modelId, topic, profile, history, roundNum, userIntervention, discussionMode) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  const modelName = model.name;
  const others    = MODELS.filter((m) => m.id !== modelId).map((m) => m.name).join("と");
  const safeTopic   = topic.slice(0, 2000);
  const safeProfile = profile.slice(0, 5000);

  const prof = safeProfile.trim()
    ? `\n\n【質問者のプロフィール】\n${safeProfile.trim()}\n上記を踏まえた上で、この人物に合った視点で議論してください。`
    : "";

  const modeKey = discussionMode && MODE_INSTRUCTIONS[discussionMode] ? discussionMode : "standard";
  const instruction = roundNum === 1
    ? MODE_INSTRUCTIONS[modeKey].round1
    : MODE_INSTRUCTIONS[modeKey].roundN;

  const sys = `あなたは${modelName}です。${others}と3者でパネルディスカッションを行っています。${instruction}${prof}`;

  const histText =
    history.length === 0
      ? ""
      : "\n\n【これまでの議論】\n" +
        history
          .map((r) =>
            r.messages
              .map((m) => `[${MODELS.find((x) => x.id === m.modelId)?.name ?? m.modelId}] ${m.text || "(エラー)"}`)
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
