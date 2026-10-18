# CLAUDE.md

このリポジトリでのコード調査方針と、AI モデルを載せ替えるときの手順。
仕様・アーキテクチャは `README.md` を参照する。

## コード調査は XERJ を第一候補にする

index 済み。prefix は `ai-discussion`、**検索対象 index は `ai-discussion-docs`**
（`ai-discussion-*` だと `public-favicon` / `public-og` が混ざり不要な警告が出る）。
ノードは `http://127.0.0.1:9200`（MCP サーバー `xerj` が接続済み）。

**既存実装の調査・シンボル検索・類似実装の探索では、まず XERJ を使う。**
`grep` / `find` / `Glob` / 大量のファイル読み込みは、XERJ で足りないときのフォールバック。

- `mcp__xerj__xerj_search` — 既定。文字列を渡すと定義優先で検索し、`ax_path` /
  `title`（シンボル名）/ `kind` / `line` と該当ブロック（`_passage`）が返る
- `mcp__xerj__xerj_semantic_search` — 名前が分からず「意味」で探すとき
- `mcp__xerj__xerj_hybrid_search` — 語彙検索と意味検索を併用したいとき

**これらは遅延ツール（deferred）で、セッションには名前だけが渡されている。**
使う前に `ToolSearch` で `select:mcp__xerj__xerj_search` のようにスキーマを取得する。
これを知らないと指示が実行不能に見え、手が grep に流れる。

### XERJ を経由せず直接読んでよい場面

XERJ が効くのは「**どのファイルに何があるか分からない**横断調査」。次は直接 Read でよい。

- 対象ファイルが特定済み（`CLAUDE.md` / `README.md` / 既存の報告書が単一ソースを
  名指ししている場合を含む。例：モデル定義は `src/models.config.js`）
- 変更対象を開いて現在の内容を確認する作業、および index 対象外のファイル（下記）
- 答えがリポジトリ内に無いもの（外部 API の仕様・価格など）

### index されていないもの（XERJ で「見つからない」＝「存在しない」ではない）

実ファイルを読むか grep で調べる。

- 隠しディレクトリ全般（`.github/`・`.husky/`・`.claude/`・`.wrangler/`・`.git/`）
  → **GitHub Actions のワークフローは XERJ では検索できない**
- `node_modules/`・`dist/`（`.gitignore` 由来）、`public/og.png`（バイナリ）
- `functions/schema.sql` と `schema-v2.sql` 〜 `schema-v7.sql`、`marketing/zenn.md`
  → sqldump と判定され本文が抽出されなかった（`schema-v8/v9/v10.sql` は index 済み）

### フォールバックの grep にも穴がある — NUL を含むファイル

`src/research/ledger.js` は区切り文字に**生の NUL バイト**を使っている
（`` `${e.target}\x00${e.field}` ``）。`file` がバイナリと判定するため、
**素の `grep` は一致があっても何も出さず exit 1（＝「一致なし」と同じ応答）を返す。**
2026-10 のモデル更新で、`grep "Sonnet"` が 0 件を返したこのファイルに旧モデル名が
残っていた（テストが検出して発覚）。

- 検索は `grep -a`。`git grep` は素でも `Binary file ... matches` と出るが行を見るには `-a`
- `Edit` / `Write` は NUL を含むファイルを**拒否する**。`sed -i ''` 等で編集し、
  適用後に NUL の個数が変わっていないか確認する
- 「grep が 0 件」を「存在しない」の根拠にする前に、`file` でバイナリ判定を疑う

## XERJ の結果だけを根拠にコードを変更しない

返るのは index 時点のスナップショット。**変更対象は必ず実ファイルを開いて現在の内容を
確認してから編集する。** 行番号・シグネチャ・周辺コードは実ファイルが一次情報。

## index は自動更新されない — 古ければアナウンスする

`--watch` 常駐・cron・LaunchAgent いずれも**意図的に未登録**。放置すると古くなるので、
**XERJ での調査を始める前に `npm run xerj:check` で鮮度を確認する。**

| 終了コード | 対応 |
|---|---|
| `0` 最新 | そのまま XERJ で進める |
| `1` 古い / `2` 未作成 | **ユーザーへアナウンスし、下記コマンドを提示する。** 黙って古い結果を使ってはならない |
| `3` ノード停止中 | `~/.xerj/start-node.sh` の実行を案内し、それまでは grep 等にフォールバック |

再 index は勝手に実行せず、コマンドを提示して判断を仰ぐ（数十秒かかり、ノードの状態を
変える操作のため）。

```bash
xerj autoindex /Volumes/ExternalSSD/develop/ai-discussion --prefix ai-discussion --code-analyzer code --no-graph --yes
```

**ファイルを編集した状態で XERJ 調査に移るときは、その編集が index に入っていないことを
明示する。** 除外は XERJ が `.gitignore` と組み込みルールで自動判定するので、独自の除外
設定は追加しない。

## AI モデルを載せ替えるとき

単一ソースは `src/models.config.js`（価格根拠と仕様上の罠は同ファイルのコメント）。
**作業に入る前に `docs/MODEL-UPDATE.md` を読む。** 価格の一次確認、期日切替、
キャッシュ倍率、検証順序、過去に実際に踏んだ失敗（プロモ価格の取り違え2回、
Claude 5.5 でトライアルが本文を返さなくなった件）がそこにある。

## 外部送信はしない

`rerank` オプションや外部 embedding / reranker API は**使わない**。リポジトリのコード本文を
外部サービスへ送信するため。必要になった場合は、送信内容と送信先を説明して判断を仰ぐ。
