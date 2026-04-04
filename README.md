# 3 AI Discussion

## このツールについて
Claude・ChatGPT・Geminiの3AIに同じ議題を投げ、
互いの発言を読みながら複数ラウンド議論させるWebアプリ。

## セキュリティ設計

### 運営者サーバーへの送信：ゼロ
- 通信はブラウザ↔各AI API間のみ（HTTPS直接）
- APIキーは運営者サーバーに一切送信されない
- コードはすべてGitHubで公開（誰でも確認可能）

### CDN改ざん対策：SRI（Subresource Integrity）
- ビルド時にファイルのハッシュをHTMLに埋め込む
- ブラウザがファイル取得時にハッシュを自動照合
- 改ざんを検知した場合はブラウザが読み込みを拒否・ブロック
- 動いている間は改ざんされていないことが保証される

### 残るリスク（正直に記載）
- localStorageのXSSリスク → デフォルトOFFで対策済み
- SRIは改ざんを防ぐが、Cloudflareアカウント自体の侵害は別問題

### 最も安全な使い方（推奨）
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

### Cloudflare Pagesで使う場合
外出先からスマホで使いたい場合はCloudflare Pagesにデプロイ

## 必要なAPIキー
| サービス | 取得先 |
|----------|--------|
| Claude (Anthropic) | https://console.anthropic.com |
| ChatGPT (OpenAI) | https://platform.openai.com/api-keys |
| Gemini (Google) | https://aistudio.google.com/apikey |

## セットアップ
```bash
npm install
npm run dev    # 開発
npm run build  # ビルド
```

## Cloudflare Pagesへのデプロイ

### 方法A：GitHub経由（推奨）
1. GitHubにpush
2. https://pages.cloudflare.com でプロジェクト作成
3. GitHubと連携してリポジトリを選択
4. 設定：
   - Framework preset: Vite
   - Build command: npm run build
   - Build output directory: dist
5. Save and Deploy

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
- 3AIへの並列送信・ストリーミング表示
- 複数ラウンドのディスカッション
- ユーザー介入機能（ラウンド間で司会者として介入可能）
- 途中停止ボタン
- APIキー疎通確認
- プロフィール入力（各AIのシステムプロンプトに自動注入）
- プロフィール更新通知（30日未更新で通知バナー表示）
- 設定のAES-GCM暗号化バックアップ/復元
- SRIによるCDN改ざん検知・自動ブロック
- 3テーマ切替（Dark / Base / Feminine）
- 3UIモード切替（構造優先 / 操作最適 / 体験重視）
- ラウンドサマリー（合意点・対立点・未解決・立場変化を自動分析）
- マインドマップ可視化（Mermaid.js）

## UIモード

ユーザーの目的に応じてUIの振る舞いを切り替えられます。

| モード | アイコン | 特徴 | 用途 |
|--------|----------|------|------|
| 構造優先 | ▦ | 広い余白、アニメなし、フラットデザイン、境界線区切り | 正確に情報を読みたい時（デフォルト） |
| 操作最適 | ⚡ | コンパクト余白、大きいタッチターゲット、高密度レイアウト | ヘビーユーザー向け、スピード重視 |
| 体験重視 | ✧ | シャドウ、ホバーエフェクト、アニメーション、広い角丸 | デモ・プレゼン、気持ちよく使いたい時 |

テーマ（配色）とUIモード（レイアウト・インタラクション）は独立して切り替え可能です。

## ライセンス

MIT License with Non-Commercial Clause

- 個人利用・学習・改変・再配布：OK
- 商用利用（販売・有料サービスへの組み込み・収益化）：事前の書面許可が必要
- 詳細は [LICENSE](./LICENSE) を参照
