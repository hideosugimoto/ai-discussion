# 3 AI Discussion

## このツールについて
Claude・ChatGPT・Geminiの3AIに同じ議題を投げ、
互いの発言を読みながら複数ラウンド議論させるWebアプリ。

## アーキテクチャ

### 2つの利用モード

| | Free | Premium（月額980円） |
|---|---|---|
| API呼び出し | ブラウザから各社APIへ直接 | サーバーサイドプロキシ経由 |
| APIキー | ユーザー自身で取得 | 不要（サーバー側で管理） |
| 認証 | なし | Google OAuth + JWT |
| 使用量追跡 | なし | D1でトークン・コスト記録 |

### バックエンド構成（Premium）

```
Cloudflare Pages Functions（サーバーレス）
├── /api/auth/*        Google OAuth + JWT認証
├── /api/chat/stream   LLMプロキシ（SSEストリーミング）
├── /api/usage         使用量照会
└── /api/billing/*     Stripe決済
```

| リソース | 用途 |
|----------|------|
| D1 (SQLite) | ユーザー、使用量、リフレッシュトークン、リクエストログ |
| KV | レート制限、OAuthステート、認証コード（短期TTL） |

### セキュリティ設計

**Freeモード：**
- 通信はブラウザ↔各AI API間のみ（HTTPS直接）
- APIキーは運営者サーバーに一切送信されない

**Premiumモード（多層防御）：**
- Layer 1: CORS（許可オリジンのみ）
- Layer 2: IPベースレート制限（30req/60s）
- Layer 3: JWT検証（HS256、15分有効期限）
- Layer 4: 入力バリデーション（モデルホワイトリスト、文字数制限）
- Layer 5: 出力サニタイズ（上流エラー詳細を非公開）
- リフレッシュトークンはSHA-256ハッシュのみDB保存

**共通：**
- SRI（Subresource Integrity）によるCDN改ざん検知
- コードはすべてGitHubで公開（誰でも確認可能）

### ローカル開発（最も安全な使い方）
```bash
git clone https://github.com/hideosugimoto/ai-discussion.git
cd ai-discussion
npm install
npm run dev
```

LAN内のスマホからアクセスしたい場合：
```bash
npm run dev -- --host
```

## 必要なAPIキー（Freeモード）
| サービス | 取得先 |
|----------|--------|
| Claude (Anthropic) | https://console.anthropic.com |
| ChatGPT (OpenAI) | https://platform.openai.com/api-keys |
| Gemini (Google) | https://aistudio.google.com/apikey |

## セットアップ

### Freeモード（フロントエンドのみ）
```bash
npm install
npm run dev    # 開発
npm run build  # ビルド
```

### Premiumモード（バックエンド込み）

Cloudflare D1・KV・環境変数の設定が必要：

```bash
# D1データベース作成・マイグレーション
npx wrangler d1 create ai-discussion-db
npx wrangler d1 execute ai-discussion-db --file=functions/schema.sql
npx wrangler d1 execute ai-discussion-db --file=functions/schema-v2.sql
npx wrangler d1 execute ai-discussion-db --file=functions/schema-v3.sql
npx wrangler d1 execute ai-discussion-db --file=functions/schema-v4.sql

# KVネームスペース作成
npx wrangler kv namespace create KV
```

必要な環境変数（Secrets）：

| 変数名 | 用途 |
|--------|------|
| `JWT_SECRET` | JWT署名キー |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `ANTHROPIC_API_KEY` | Claude APIプロキシ用 |
| `OPENAI_API_KEY` | ChatGPTプロキシ用 |
| `GOOGLE_AI_API_KEY` | Geminiプロキシ用 |
| `STRIPE_SECRET_KEY` | 決済 |
| `STRIPE_WEBHOOK_SECRET` | Webhook検証 |

## Cloudflare Pagesへのデプロイ

### 方法A：GitHub経由（推奨）
1. GitHubにpush
2. https://pages.cloudflare.com でプロジェクト作成
3. GitHubと連携してリポジトリを選択
4. 設定：
   - Framework preset: Vite
   - Build command: npm run build
   - Build output directory: dist
5. D1・KV バインディングとSecrets を設定
6. Save and Deploy

### 方法B：Direct Upload
```bash
npm run build
npx wrangler pages deploy dist --project-name ai-discussion
```

## 使用モデル
| モード | Claude | ChatGPT | Gemini |
|--------|--------|---------|--------|
| 🧠最強 | claude-opus-4-6 | gpt-4o | gemini-2.5-pro |
| ⚡高速 | claude-sonnet-4-6 | gpt-4o-mini | gemini-2.5-flash |

## 機能

### ディスカッション
- 3AIへの並列送信・ストリーミング表示
- 複数ラウンドのディスカッション
- 5つの議論モード（standard / debate / brainstorm / factcheck / conclusion）
  - **conclusion（結論まとめ）モード**: 選択した1つのAI（デフォルト Claude）が中立的な記録者として、3者の議論を「合意点 / 相違点 / 最終結論」に統合。実行後は自動的に standard モードに復帰
- **おすすめ質問集（50問）**: 自己分析・キャリア・お金・事業・哲学・創作・時事・思考実験・軽めテーマの9カテゴリ。クリックで議題と推奨モードが自動セット。議題欄プレースホルダーも自動ローテーションで質問例を提示
- ユーザー介入機能（ラウンド間で司会者として介入可能）
- ペルソナ設定（各AIに役割を付与）
- コンスティテューション（AIの行動指針を設定）
- 途中停止ボタン

### 分析・可視化
- ラウンドサマリー（合意点・対立点・未解決・立場変化を自動分析）
- 詳細分析（テーマ抽出・合意形成・未解決事項）
- アクションプラン生成
- マインドマップ可視化（Mermaid.js）

### 設定・管理
- APIキー疎通確認
- プロフィール入力（各AIのシステムプロンプトに自動注入）
- プロフィール更新通知（30日未更新で通知バナー表示）
- 議論履歴の保存・復元（IndexedDB、最大50件）
- 設定のAES-GCM暗号化バックアップ/復元
- 3テーマ切替（Dark / Base / Feminine）
- SRIによるCDN改ざん検知・自動ブロック

### Premium限定
- APIキー不要（サーバー側プロキシ）
- Google OAuth認証
- 月次使用量ダッシュボード
- LLMリクエストログ収集（トークン数・レイテンシ）


## ライセンス

Business Source License 1.1 (BSL 1.1)

- 個人利用・学習・改変・再配布・非商用利用：OK
- 商用利用（有料サービスへの組み込み・収益化）：商用ライセンスの購入が必要
- 2030-04-04 以降、MIT License に自動移行
- 詳細は [LICENSE](./LICENSE) を参照
