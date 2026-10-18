# CLAUDE.md

このファイルは、このリポジトリで Claude Code が作業するときのコード調査方針と、
AI モデルを載せ替えるときの手順を定めたもの。
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

**`mcp__xerj__*` は遅延ツール（deferred）で、セッションには名前だけが渡されている。**
スキーマが無い状態では呼び出せないので、使う前に `ToolSearch` で
`select:mcp__xerj__xerj_search` のようにスキーマを取得する。これを知らないと
「第一候補」の指示が実行不能に見え、手が grep に流れる。

**grep / find / Glob / 大量のファイル読み込みは、XERJ で十分な情報が得られない場合の
フォールバックとして使う。** 第一手では使わない。

### XERJ を経由しなくてよい場面（これに当たるなら直接読む）

XERJ が効くのは「**どのファイルに何があるか分からない**横断調査」。次は直接 Read でよい。

- 対象ファイルが既に特定できている（`CLAUDE.md` / `README.md` / 既存の報告書が
  単一ソースを名指ししている場合を含む。例：モデル定義は `src/models.config.js`）
- 変更対象そのものを開いて現在の内容を確認する作業（実ファイルが一次情報。後述）
- index 対象外のファイル（後述）を調べるとき
- 答えがこのリポジトリの中に無いもの（外部 API の仕様・価格など）

### index されていないもの（XERJ で「見つからない」＝「存在しない」ではない）

次は index 対象外。これらを調べるときは実ファイルを読むか grep を使う。

- 隠しディレクトリ全般（`.github/`・`.husky/`・`.claude/`・`.wrangler/`・`.git/`）
  → GitHub Actions のワークフローは XERJ では検索できない
- `node_modules/`・`dist/`（`.gitignore` 由来）
- `functions/schema.sql` と `functions/schema-v2.sql` 〜 `schema-v7.sql`、`marketing/zenn.md`
  → sqldump と判定され本文が抽出されなかった（`schema-v8/v9/v10.sql` は index 済み）
- `public/og.png`（バイナリ）

### フォールバックの grep にも穴がある — NUL を含むファイル

`src/research/ledger.js` は区切り文字に**生の NUL バイト**を使っている
（`` `${e.target}\x00${e.field}` ``）。このため `file` はこのファイルをバイナリと判定し、
**素の `grep` は一致があっても何も出さず exit 1（＝「一致なし」と同じ応答）を返す。**
実際に 2026-10 のモデル更新で、`grep "Sonnet"` が 0 件を返したこのファイルに
旧モデル名が残っていた（テストが検出して発覚）。

- 検索するときは `grep -a` を使う。`git grep` は素のままでも
  `Binary file ... matches` と出るので気づけるが、行を見るには `-a` が必要
- `Read` は NUL を警告して内容を返し、**`Edit` / `Write` は編集を拒否する**。
  変更するときは `sed -i ''` のようにエンコーディングを保つコマンドを使い、
  適用後に NUL の個数が変わっていないことを確認する
- 「grep が 0 件だった」を「存在しない」の根拠にする前に、`file` でバイナリ判定を疑う

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

## AI モデルを載せ替えるとき

単一ソースは `src/models.config.js`。個別の価格根拠・仕様上の罠は同ファイルのコメントに
書いてあるので、ここには手順と**過去に実際に踏んだ失敗**だけを置く。

1. **価格は各社の公式価格ページで一次確認する。** このリポジトリは
   プロモ価格と定価の取り違えを**2回**踏んでいる（#7 の Gemini 3.6 Flash、
   2026-10 の `gpt-5.6-*` は luna が5倍の過大計上だった）。提供状況は各社
   `/v1/models` の実レスポンスで確認する（実 ID に `-preview` が付かない＝GA の
   判定基準は #7 のコメント）
2. 時限価格は `until` / `after` で期日切替にする。**終了後の価格が非公開なら `after` を
   書かず、その事実をコメントに残す。** 黙って安い値だけ入れると期日後に過小計上
   （＝赤字）へ反転する
3. Anthropic のキャッシュ読み出し倍率は**モデル別**（`anthropicCacheReadMultiplier`）。
   固定値にすると調査モードの計上が倍になり、有料ユーザーの上限を削る
4. ルーティングを変えたら `npm run sync:models` → `npm test`。表示ドリフトテストが
   LP・README・UI コンポーネントに残った旧モデル名を検出する
5. `node scripts/check-models.mjs` を再実行し、未登録が 0 件になることを確認する
6. **最後は実リクエストで検証する。** 価格表とビルドが通っても、モデル側の仕様変更で
   壊れる。最低限、SSE ストリーミング経路（本文抽出と usage 抽出の両方）と
   `functions/api/trial/chat.js` の非ストリーミング経路の両方を叩く。
   2026-10 の Claude 5.5 移行では、thinking を無効化できない仕様
   （`output_config.effort` が唯一のレバー）のため、**LP の無料トライアルが
   本文を返さなくなる不具合が実際に発生した**（`content[0]` が thinking ブロックになり、
   思考が `max_tokens` を使い切る）

## 外部送信はしない

`rerank` オプションや外部 embedding / reranker API は**使わない**。
これらはこのリポジトリのコード本文を外部サービスへ送信する。
必要になった場合は、送信内容と送信先を説明してユーザーの判断を仰ぐ。
