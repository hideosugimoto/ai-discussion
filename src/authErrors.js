// Maps the ?auth_error=... codes that /api/auth/callback bounces back with
// onto messages a user can act on. The callback never renders text itself —
// it redirects to "/" so the app can present the failure in place instead of
// leaving the user on a raw JSON body.

const MESSAGES = {
  // Thrown exception (D1 outage, KV failure, upstream hiccup). Transient from
  // the user's point of view — the actionable advice is simply to retry.
  server_error:
    "ログイン処理中に一時的なエラーが発生しました。時間をおいて再度お試しください。",
  // The user declined consent on Google's screen.
  access_denied: "Google のログインがキャンセルされました。",
  "Missing code or state":
    "ログイン情報が不足していました。もう一度ログインしてください。",
  "Server configuration error":
    "サーバー設定に問題があります。復旧までお待ちください。",
  "Invalid state (CSRF check failed)":
    "ログインの有効期限が切れました。もう一度ログインしてください。",
  "Token exchange failed":
    "Google との認証に失敗しました。もう一度ログインしてください。",
  "Failed to get user info":
    "Google からユーザー情報を取得できませんでした。もう一度ログインしてください。",
};

const FALLBACK = "ログインに失敗しました。もう一度お試しください。";

export function authErrorMessage(code) {
  if (!code || typeof code !== "string") return FALLBACK;
  if (MESSAGES[code]) return MESSAGES[code];
  // "OAuth denied: access_denied" — Google's own reason is appended by the
  // callback, so match on the prefix and use the reason when we know it.
  if (code.startsWith("OAuth denied: ")) {
    const reason = code.slice("OAuth denied: ".length).trim();
    return MESSAGES[reason] || "Google のログインが拒否されました。";
  }
  // Never echo an unrecognised server string back into the UI.
  return FALLBACK;
}
