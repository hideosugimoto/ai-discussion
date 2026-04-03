import { MODELS } from "./constants";

export function buildPrompt(modelId, topic, profile, history, roundNum, userIntervention) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  const modelName = model.name;
  const others    = MODELS.filter((m) => m.id !== modelId).map((m) => m.name).join("と");
  const safeTopic   = topic.slice(0, 2000);
  const safeProfile = profile.slice(0, 5000);

  const prof = safeProfile.trim()
    ? `\n\n【質問者のプロフィール】\n${safeProfile.trim()}\n上記を踏まえた上で、この人物に合った視点で議論してください。`
    : "";

  const sys =
    roundNum === 1
      ? `あなたは${modelName}です。${others}と3者でパネルディスカッションを行っています。議題に対して自分の見解を300字以内で述べてください。他のAIとの違いが出るよう、あなた自身の視点・特徴を活かして答えてください。${prof}`
      : `あなたは${modelName}です。${others}と3者でパネルディスカッションを行っています。他のAIの発言を踏まえ、同意・反論・新視点を交えて200字以内で応答してください。「〇〇の意見に対して」など発言者に言及しながら議論を深めてください。${prof}`;

  const histText =
    history.length === 0
      ? ""
      : "\n\n【これまでの議論】\n" +
        history
          .map((r) =>
            r.messages
              .map((m) => `[${MODELS.find((x) => x.id === m.modelId).name}] ${m.text || "(エラー)"}`)
              .join("\n")
          )
          .join("\n\n---\n\n");

  const interventionText =
    userIntervention?.trim()
      ? `\n\n【司会者（ユーザー）からの介入】\n${userIntervention.trim()}`
      : "";

  const user = `【議題】${safeTopic}${histText}${interventionText}\n\nあなた（${modelName}）の発言をどうぞ。`;
  return { sys, user };
}
