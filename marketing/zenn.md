---
title: "Claude / ChatGPT / Gemini を月980円で同時に議論させる Web アプリを Cloudflare Pages で作った"
emoji: "🤖"
type: "tech"
topics: ["cloudflare", "ai", "react", "stripe", "claude"]
published: false
---

## TL;DR

- 3つのフロンティア AI (Claude Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro) に**同じ議題を並列で投げて議論させる Web アプリ**を作った
- フルスタック Cloudflare (Pages + Functions + D1 + KV) で個人開発
- ソースコードは BSL 1.1 で全公開、2030年に MIT 移行
- 月額 980 円 (Premium) で API キー不要
- URL: https://ai-discussion.pages.dev/lp.html

## 動機: ChatGPT 1社では意思決定がぼやける

「転職すべきか起業すべきか」みたいな複雑な問いを ChatGPT に投げると、たいてい「どちらにもメリットとデメリットがあります」みたいな当たり障りのない答えが返ってくる。

Claude は同じ質問でもう少し「あなたの価値観を踏まえると…」と踏み込んでくる傾向があり、Gemini は「前提を確認しましょう」とメタな視点を入れる傾向がある。

**それぞれを開いてコピペで投げて、答えを並べて比較する**のがバカバカしくなったので、Web アプリにした。

## アーキテクチャ

```
┌────────────────┐
│   React Vite   │  フロント (SPA)
└────────┬───────┘
         │
┌────────▼────────────────────────┐
│  Cloudflare Pages Functions     │  サーバーレス
│  ├── /api/auth/*  (Google OAuth + JWT)
│  ├── /api/chat/stream  (LLM プロキシ, SSE)
│  ├── /api/discussions/*  (履歴 CRUD + FTS5)
│  ├── /api/share/*  (公開リンク)
│  └── /api/billing/*  (Stripe)
└────────┬────────────────────────┘
         │
┌────────▼────────┐  ┌──────────┐
│ D1 (SQLite+FTS5)│  │  KV      │
└─────────────────┘  └──────────┘
```

### LLM プロキシ (`/api/chat/stream`)

3社の API を **SSE (Server-Sent Events)** でストリーミング中継する。各モデルのリクエスト/レスポンス形式の違いを吸収し、フロントには統一フォーマットで返す。

```js
// 抜粋: モデル名で分岐してプロキシ
const stream = await fetch(getEndpoint(model), {
  method: "POST",
  headers: getHeaders(model, env),
  body: JSON.stringify(buildPayload(model, messages, system)),
});

// SSE で1トークンずつフロントへ転送
return new Response(transformStream(stream.body), {
  headers: { "content-type": "text/event-stream" }
});
```

### D1 + FTS5 で議論履歴を全文検索

```sql
CREATE TABLE discussions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  data_json TEXT NOT NULL,
  ...
);

CREATE VIRTUAL TABLE discussions_fts USING fts5(
  topic, content, tags,
  user_id UNINDEXED,
  discussion_id UNINDEXED,
  tokenize = 'unicode61'
);
```

検索時は **FTS インデックスを引いて主テーブルに JOIN**。FTS は `UNINDEXED` カラム経由でフィルタすると遅いので、`d.user_id = ?` を主テーブル側で絞る。

### Stripe + クレジット購入

サブスクリプション (`mode=subscription`) と都度購入 (`mode=payment`) を1つの Webhook で処理する。冪等性のために `stripe_payment_intent` カラムに UNIQUE 制約。

```sql
CREATE TABLE user_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  amount_micro INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'purchase',
  stripe_payment_intent TEXT UNIQUE,  -- ← 二重発火防止
  expires_at TEXT NOT NULL,
  ...
);
```

通貨は **microdollar (整数)** で持ち、フロート誤差をゼロに。

## セキュリティ: 5層の多層防御

| Layer | 対策 |
|---|---|
| 1 | CORS (許可オリジンのみ) |
| 2 | KV ベースの IP レート制限 (30 req / 60s) |
| 3 | JWT (HS256, 15分有効, リフレッシュは SHA-256 ハッシュ保管) |
| 4 | 入力バリデーション (モデルホワイトリスト + 文字数制限) |
| 5 | 出力サニタイズ (上流エラー詳細の隠蔽) |

特に**共有リンク機能** (議論を公開URLで共有) は whitelist 方式でサニタイズ:

```js
export function sanitizeForSharing(rawDataJson) {
  // 「絶対に共有したくないもの」をブラックリストにすると漏れるので、
  // 「絶対に共有して良いもの」のホワイトリスト方式
  return {
    discussion: filterMessages(parsed.discussion),
    summaries: parsed.summaries,
    mode: parsed.mode,
    discussionMode: parsed.discussionMode,
    // personas, profile, constitution, userIntervention は完全除外
  };
}
```

リグレッション防止のためテストも書いた:
```js
test("personas は絶対に出てこない", () => {
  const sanitized = sanitizeForSharing(input);
  expect(JSON.stringify(sanitized)).not.toContain("persona");
});
```

## なぜ Cloudflare スタックなのか

| 観点 | Cloudflare |
|---|---|
| **コスト** | Pages 無料、D1 5GB まで無料、Workers Functions 100k req/日まで無料 |
| **デプロイ** | git push で自動デプロイ |
| **エッジ実行** | レスポンスが速い (LLM プロキシも edge から発火) |
| **個人運営** | サーバー管理ゼロで月数万人スケールまで対応 |

ベンダーロックインのデメリットはあるが、個人開発で月額固定費をゼロにできる価値は大きい。

## 月額 980 円のロジック

3社契約すると月 ~9,000 円 (Claude Pro $20 + ChatGPT Plus $20 + Gemini Advanced $20)。
このアプリは API 利用なので、ユーザー全員のトークン消費を平均化すれば、1ユーザー月額 980 円でも黒字にできる試算。

ヘビーユーザー向けには:
- **Plus プラン** (1,980 円, 上限 2倍)
- **追加クレジット** (500 円 = +$2, 月末まで有効)

## できなかったこと / これから

- E2E テスト (Playwright) はまだ書いていない
- 観測性 (Sentry / ログ集約) も未整備
- スマホ UX のさらなる磨き込み

## まとめ

- フロントエンド + バックエンド + 決済 + 認証 + DB をすべて Cloudflare に寄せれば、個人開発でも月額固定費ゼロでプロダクション運営できる
- LLM プロキシは SSE で素直に作れる
- ソースコードは https://github.com/hideosugimoto/ai-discussion で全公開しているので、似たような Multi-Agent SaaS を作りたい人の参考になれば

ぜひ触ってみてフィードバックをください: https://ai-discussion.pages.dev/lp.html
