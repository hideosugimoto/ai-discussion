// プリセット議題（ログイン不要お試し体験用）。
// LP の Hero タブと整合した5議題。topicId のみクライアントから受け取り、
// 本文はサーバ側で確定させることで abuse ベクトル（任意プロンプト送信）を遮断する。

export const TRIAL_TOPICS = [
  { id: 0, label: "副業で起業",   text: "30代会社員、副業で起業すべきか?" },
  { id: 1, label: "結婚 vs 同棲", text: "5年同棲。結婚すべきか同棲を続けるか?" },
  { id: 2, label: "住宅ローン",   text: "住宅ローンは固定金利か変動金利か?" },
  { id: 3, label: "転職判断",     text: "今の会社で昇進待ち vs 転職、どちらが得か?" },
  { id: 4, label: "子の教育費",   text: "子どもを私立中学に行かせるべきか?" },
];

export function topicById(id) {
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  return TRIAL_TOPICS.find((t) => t.id === id) || null;
}
