# 3 AI Discussion

## このツールについて
Claude・ChatGPT・Geminiの3AIに同じ議題を投げ、
互いの発言を読みながら複数ラウンド議論させるWebアプリ。

## アーキテクチャ

### 2つの利用モード

| | Free | Premium（月額980円） | Plus（月額1,980円） |
|---|---|---|---|
| API呼び出し | ブラウザから各社APIへ直接 | サーバーサイドプロキシ経由 | サーバーサイドプロキシ経由 |
| APIキー | ユーザー自身で取得 | 不要（サーバー側で管理） | 不要 |
| 認証 | なし | Google OAuth + JWT | Google OAuth + JWT |
| 使用量追跡 | なし | D1でトークン・コスト記録 | D1でトークン・コスト記録 |
| 月間目安 | 無制限（自費） | 約8〜40議論 | 約17〜90議論 |
| 追加クレジット | - | 500円/回 | 500円/回 |

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
npx wrangler d1 execute ai-discussion-db --file=functions/schema-v5.sql
npx wrangler d1 execute ai-discussion-db --file=functions/schema-v6.sql
npx wrangler d1 execute ai-discussion-db --file=functions/schema-v7.sql

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
| `STRIPE_PRICE_ID` | Premium プラン (980円/月 subscription) の Price ID |
| `STRIPE_PRICE_ID_PLUS` | Plus プラン (1,980円/月 subscription) の Price ID |
| `STRIPE_CREDIT_PRICE_ID` | 追加クレジット (500円 one-time) の Price ID |

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
| 🧠最強 | claude-opus-4-8 | gpt-5.6-sol | gemini-3.5-flash |
| ⚡高速（既定） | claude-sonnet-4-6 | gpt-5.4-mini | gemini-3.1-flash-lite |

> モデル定義の単一ソースは `src/models.config.js`。新モデルが各社から出れば随時更新します。

## 機能

### ディスカッション
- 3AIへの並列送信・ストリーミング表示
- 複数ラウンドのディスカッション
- 7つの議論モード（standard / debate / brainstorm / factcheck / consensus / decision / conclusion）
  - **consensus（合意形成）モード**: 対立を歩み寄らせ、第三案で合意を目指す
  - **decision（意思決定）モード**: 選択肢を評価軸で比較し、推奨を出す
  - **conclusion（中立まとめ）モード**: 選択した1つのAI（デフォルト Claude）が中立的な記録者として、3者の議論を「合意点 / 相違点 / 最終結論」に統合（裁定はしない）。実行後は自動的に standard モードに復帰
- **おすすめ質問集（50問）**: 自己分析・キャリア・お金・事業・哲学・創作・時事・思考実験・軽めテーマの9カテゴリ。クリックで議題と推奨モードが自動セット。議題欄プレースホルダーも自動ローテーションで質問例を提示
- ユーザー介入機能（ラウンド間で司会者として介入可能）
- ペルソナ設定（各AIに役割を付与）
- コンスティテューション（AIの行動指針を設定）
- 途中停止ボタン

### 裁定・検証（差別化の核）
- **最終ジャッジ（裁定）**: 中立AIが対立点ごとに「どちらが妥当か」を判定し、全体の推奨を確信度（高/中/低）つきで出す。「整理」で終わらせず「決める」
- **ストレステスト**: 出した結論に別AIがあえて全力で反論し、「主要な反論に耐えるか」を 耐える/条件付き/覆る で評価
- **ワンクリック再ジャッジ**: 反論で結論が覆ったら、その反論を材料として差し戻し、より強い結論へ再裁定
- エクスポート（HTML/Markdown）・共有時は、裁定とアクションプランを成果物の冒頭に含める

### 分析・可視化
- **現在の到達点カード**: 合意・対立・未解決と各AIの立場を常時ピン留め。未解決点はワンクリックで深掘り（司会者介入に流し込み）
- ラウンドサマリー（合意点・対立点・未解決・立場変化・各AIの立場を自動分析）
- **立場の変化（心変わり）検出**: 議論中に意見を変えたAIを可視化（熟議の証拠）
- 詳細分析（テーマ抽出・合意形成・未解決事項）
- アクションプラン生成
- マインドマップ可視化（Mermaid.js）
- 共有リンクの動的OG画像（議論ごとの結論カードをPNG生成）

### コスト最適化
- **会話履歴の要約圧縮**: 4ラウンド以降、古いラウンドを要約で置換し直近2Rのみ全文保持
- **Rolling Summary**: 累積要約1個に集約し、10R超でもトークン数一定（個別要約にフォールバック可）
- **プロンプトキャッシュ**: Anthropic `cache_control` 対応（静的system prompt最大90%削減）、OpenAI自動キャッシュ対応
- **出力トークン制限**: max_tokens 2500→1500に削減 + プロンプトで簡潔指示を強化
- 要約に各AIの立場（stances）を含め、圧縮後も議論の一貫性を維持
- 要約なし時は全文フォールバック（安全弁）

### 設定・管理
- APIキー疎通確認
- プロフィール入力（各AIのシステムプロンプトに自動注入）
- プロフィール更新通知（30日未更新で通知バナー表示）
- 議論履歴の保存・復元（IndexedDB、最大50件）
- 設定のAES-GCM暗号化バックアップ/復元
- 3テーマ切替（Dark / Base / Feminine）
- SRIによるCDN改ざん検知・自動ブロック

### Premium / Plus 限定
- APIキー不要（サーバー側プロキシ）
- Google OAuth認証
- 月次使用量ダッシュボード（使用率%表示）
- LLMリクエストログ収集（トークン数・レイテンシ）
- クラウド同期・全文検索・共有リンク
- 追加クレジット購入（500円/回、購入月末まで有効）

## 開発

### テスト
```bash
npm test               # 全テスト実行
npm test -- --watch    # 監視モード
```

主要なテスト対象（vitest、計210テスト）:

| 対象 | 内容 |
|------|------|
| `prompt.js` | モード別プロンプト生成（consensus/decision含む）・字数制限・モデル名解決・履歴圧縮 |
| `consensus.js` | 到達点カードのロジック（合意/対立/未解決の集約・立場変化検出） |
| `compressHistory` | 会話履歴圧縮ロジック（要約置換・フォールバック・ペルソナ） |
| `export.js` | HTML/Markdown エクスポート（裁定・アクションプランの埋め込み・HTMLエスケープ） |
| `ogCard.js` | 動的OG画像のカード派生・グリフ抽出 |
| `shareMeta` | 共有メタタグ生成（og:image=動的OG・寸法・alt） |
| `share-sanitize` | 共有時のホワイトリストサニタイズ（ペルソナ/憲法/キー除外） |
| `search.js` | FTS5 全文検索クエリ生成・ハイライト |
| `suggestedQuestions.js` | 質問データ整合性（ID重複・mode/category参照・字数上限） |
| `fileParser` | 添付ファイル（PDF/docx等）パース |
| `storage.js` / `crypto.js` | localStorage 保存/復元・AES-GCM 暗号化バックアップ |
| `actionPlan.js` / `constitution.js` | アクションプラン生成・議論の憲法バリデーション |
| `billing-helpers` / `apiProxy` | USD→microdollar変換・プラン別上限・プロキシ判定 |

### ビルド
```bash
npm run build          # 本番ビルド（vite）
```

push 時には pre-push フックで `vite build` と Functions 構文チェックが自動実行されます。

### お試し API のキャッシュ運用

`/api/trial/chat` は議題ごとに最大 3 応答バリエーションを KV にキャッシュし、
24h 経過で自動失効します（コスト上限保護のため）。万一不適切な応答が
キャッシュされた場合は、Cloudflare ダッシュボードの **Workers と Pages →
KV → ai-discussion KV namespace** で以下のキーを手動削除できます:

```
trial:cache:0   # 副業で起業
trial:cache:1   # 結婚 vs 同棲
trial:cache:2   # 住宅ローン
trial:cache:3   # 転職判断
trial:cache:4   # 子の教育費
```

または wrangler CLI で:
```bash
npx wrangler kv key delete --binding=KV trial:cache:0 --remote
```

削除後は次のリクエストで新しい応答が 3 通り再生成されます。

## ライセンス

Business Source License 1.1 (BSL 1.1)

- 個人利用・学習・改変・再配布・非商用利用：OK
- 商用利用（有料サービスへの組み込み・収益化）：商用ライセンスの購入が必要
- 2030-04-04 以降、MIT License に自動移行
- 詳細は [LICENSE](./LICENSE) を参照
