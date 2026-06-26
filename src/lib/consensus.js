// Pure helpers for the "現在の到達点" consensus card. Extracted so they can be
// unit-tested independently of React rendering.

// Normalize a summary section (agreements/disagreements/unresolved) into an
// array of point strings. Accepts items shaped as { point } or plain strings.
export function pts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (x && typeof x === "object" && x.point) ? x.point : (typeof x === "string" ? x : null))
    .filter(Boolean);
}

// Flatten every round's positionChanges into a single chronological list of
// { round, ai, description } — the "心変わり" record that proves real
// deliberation happened (vs a hidden one-shot answer). Tolerates both the
// {ai, description} and {model, change} shapes.
export function positionChanges(summaries) {
  const out = [];
  (summaries || []).forEach((s, i) => {
    const list = s && Array.isArray(s.positionChanges) ? s.positionChanges : [];
    for (const pc of list) {
      if (!pc) continue;
      const ai = pc.ai || pc.model || null;
      const description = pc.description || pc.change || "";
      if (description) out.push({ round: i + 1, ai, description });
    }
  });
  return out;
}

// Compare the two most recent (non-null) rounds' conflict counts to label the
// trend. Returns null when there are fewer than two summarized rounds.
export function trend(summaries) {
  const valid = (summaries || []).filter(Boolean);
  if (valid.length < 2) return null;
  const da = Array.isArray(valid[valid.length - 2].disagreements) ? valid[valid.length - 2].disagreements.length : 0;
  const db = Array.isArray(valid[valid.length - 1].disagreements) ? valid[valid.length - 1].disagreements.length : 0;
  if (db < da) return { kind: "converging", label: "収束に向かっています", color: "var(--success)", icon: "↘" };
  if (db > da) return { kind: "diverging", label: "対立が広がっています", color: "var(--warning)", icon: "↗" };
  return { kind: "flat", label: "論点は平行線です", color: "var(--text2)", icon: "→" };
}
