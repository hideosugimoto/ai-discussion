# CLAUDE.md

このファイルは、このリポジトリで Claude Code が作業するときのコード調査方針を定めたもの。
プロジェクトの仕様・アーキテクチャは `README.md` を参照する。

## コード調査は XERJ を第一候補にする

このリポジトリは XERJ に index 済み。

| 項目 | 値 |
|---|---|
| prefix | `ai-discussion` |
| 検索対象インデックス | `ai-discussion-docs`（ソース・ドキュメント本体） |
| ノード | `http://127.0.0.1:9200`（MCP サーバー `xerj` が接続済み） |

**既存実装の調査・シンボル検索・類似実装の探索では、まず XERJ を使う。**

- `mcp__xerj__xerj_search` — 既定。`query` に文字列を渡すと定義優先で検索し、
  `ax_path` / `title`（シンボル名）/ `kind` / `line` と該当ブロック（`_passage`）が返る
- `mcp__xerj__xerj_semantic_search` — 名前が分からず「意味」で探すとき
- `mcp__xerj__xerj_hybrid_search` — 語彙検索と意味検索を併用したいとき
- `index` には `ai-discussion-docs` を指定する。`ai-discussion-*` を使うと
  `public-favicon` / `public-og`（SVG 由来の構造データ）が混ざり、不要な警告が出る

**grep / find / Glob / 大量のファイル読み込みは、XERJ で十分な情報が得られない場合の
フォールバックとして使う。** 第一手では使わない。

### index されていないもの（XERJ で「見つからない」＝「存在しない」ではない）

次は index 対象外。これらを調べるときは実ファイルを読むか grep を使う。

- 隠しディレクトリ全般（`.github/`・`.husky/`・`.claude/`・`.wrangler/`・`.git/`）
  → GitHub Actions のワークフローは XERJ では検索できない
- `node_modules/`・`dist/`（`.gitignore` 由来）
- `functions/schema.sql` と `functions/schema-v2.sql` 〜 `schema-v7.sql`、`marketing/zenn.md`
  → sqldump と判定され本文が抽出されなかった（`schema-v8/v9/v10.sql` は index 済み）
- `public/og.png`（バイナリ）

## XERJ の検索結果だけを根拠にコードを変更しない

XERJ が返すのは index 時点のスナップショット。**変更対象のファイルは、最終的に必ず実ファイルを
開いて現在の内容を確認してから編集する。** 行番号・シグネチャ・周辺コードは実ファイルが一次情報。

## index の更新 — 自動では更新されない。古ければアナウンスする

index の自動更新は**意図的に設定していない**（`--watch` 常駐・cron・LaunchAgent
いずれも未登録）。そのため index は放置すると古くなる。

### Claude Code の義務

**このリポジトリで XERJ を使ったコード調査を始める前に、まず鮮度を確認する。**

```bash
npm run xerj:check
```

終了コードと対応：

| 結果 | 対応 |
|---|---|
| `0` 最新 | そのまま XERJ で調査を進める |
| `1` 古い | **ユーザーへ「index が古いので再 index が必要」とアナウンスし、下記コマンドを提示する。** 黙って古い結果を使ってはならない |
| `2` index 未作成 | 同様にアナウンスし、初回 index コマンドを提示する |
| `3` ノード停止中 | XERJ 検索は使えない。`~/.xerj/start-node.sh` の実行を案内し、それまでは grep 等にフォールバックする |

再 index は勝手に実行せず、**コマンドを提示してユーザーの判断を仰ぐ**
（index は数十秒かかり、ノードの状態を変える操作のため）。

```bash
xerj autoindex /Volumes/ExternalSSD/develop/ai-discussion --prefix ai-discussion --code-analyzer code --no-graph --yes
```

変更を加えた後も同じ。**ファイルを編集した状態で「XERJ で調べる」作業に移るときは、
index にその編集が入っていないことを明示する。**

除外（`node_modules/`・`dist/`・`.git` などの隠しディレクトリ）は XERJ が
`.gitignore` と組み込みルールで自動判定する。独自の除外設定は追加しない。

## 外部送信はしない

`rerank` オプションや外部 embedding / reranker API は**使わない**。
これらはこのリポジトリのコード本文を外部サービスへ送信する。
必要になった場合は、送信内容と送信先を説明してユーザーの判断を仰ぐ。
