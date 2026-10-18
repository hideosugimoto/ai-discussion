#!/usr/bin/env bash
# XERJ index の鮮度チェック。
#
# このリポジトリは XERJ に index 済みだが、更新は自動ではない（watch 常駐・cron・
# LaunchAgent はいずれも未登録）。そのため「最後に index した時刻」より新しい
# ファイルがあると、XERJ が返す行番号やシグネチャが実ファイルとズレる。
# このスクリプトはそのズレを検出し、必要なら再 index コマンドを提示する。
#
# 使い方: npm run xerj:check
# 終了コード: 0 = 最新 / 1 = 再 index が必要 / 2 = index 未作成 / 3 = ノード停止中

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="ai-discussion"
NODE_URL="http://127.0.0.1:9200"
STATE_BASE="$HOME/.xerj/autoindex"

REINDEX_CMD="xerj autoindex $ROOT --prefix $PREFIX --code-analyzer code --no-graph --yes"

# --- ノードが生きているか --------------------------------------------------
if ! curl -sf -m 3 "$NODE_URL" > /dev/null 2>&1; then
  echo "❌ XERJ ノードが応答しません（$NODE_URL）"
  echo "   XERJ 検索は使えません。先にノードを起動してください:"
  echo "     ~/.xerj/start-node.sh"
  exit 3
fi

# --- このリポジトリの state-dir を root パスから逆引き ----------------------
# state-dir 名はパス由来のハッシュなので、直接書かずに journal 先頭行の
# "root" と突き合わせて特定する（XERJ 側のハッシュ規則に依存しないため）。
STATE_DIR=""
for d in "$STATE_BASE"/*/; do
  journal="$d/journal.ndjson"
  [ -f "$journal" ] || continue
  if head -1 "$journal" | grep -q "\"root\":\"$ROOT\""; then
    STATE_DIR="$d"
    break
  fi
done

if [ -z "$STATE_DIR" ]; then
  echo "⚠️  このリポジトリの XERJ index が見つかりません"
  echo "   初回 index:"
  echo "     $REINDEX_CMD"
  exit 2
fi

JOURNAL="$STATE_DIR/journal.ndjson"
INDEXED_AT="$(stat -f %m "$JOURNAL")"
INDEXED_AT_HUMAN="$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$JOURNAL")"

# --- index 後に変更されたファイルを数える ----------------------------------
# 追跡ファイル + 未追跡ファイル（.gitignore 対象は XERJ も見ないので除外）。
NEWER="$(git -C "$ROOT" ls-files -z --cached --others --exclude-standard \
  | xargs -0 stat -f "%m %N" 2>/dev/null \
  | awk -v t="$INDEXED_AT" '$1 > t { $1=""; sub(/^ /,""); print }')"

if [ -z "$NEWER" ]; then
  echo "✅ XERJ index は最新です（最終 index: $INDEXED_AT_HUMAN / 以降の変更なし）"
  exit 0
fi

COUNT="$(printf '%s\n' "$NEWER" | wc -l | tr -d ' ')"
echo "⚠️  XERJ index が古くなっています"
echo "   最終 index: $INDEXED_AT_HUMAN"
echo "   以降に変更されたファイル: ${COUNT}件"
printf '%s\n' "$NEWER" | head -10 | sed 's/^/     - /'
if [ "$COUNT" -gt 10 ]; then
  echo "     … ほか $((COUNT - 10)) 件"
fi
echo ""
echo "   再 index:"
echo "     $REINDEX_CMD"
exit 1
