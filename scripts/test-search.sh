#!/usr/bin/env bash
# Exercise /api/search/query against a running `wrangler pages dev`.
# Sends CF-Connecting-IP (the middleware fails closed without it locally).
#
#   BASE=http://localhost:8788 bash scripts/test-search.sh
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${BASE:-http://localhost:8788}"
IP="-H CF-Connecting-IP:127.0.0.1"
PREM_JWT="$(node scripts/mint-test-jwt.mjs test-premium-user)"
FREE_JWT="$(node scripts/mint-test-jwt.mjs unknown-user)"

echo "== 1) no token → expect 401 =="
curl -s -o /dev/null -w "  HTTP %{http_code}\n" $IP \
  -X POST "$BASE/api/search/query" \
  -H "Content-Type: application/json" \
  --data '{"query":"おすすめの京都観光地"}'

echo "== 2) non-premium / unknown user → expect 403 =="
curl -s -o /dev/null -w "  HTTP %{http_code}\n" $IP \
  -X POST "$BASE/api/search/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREE_JWT" \
  --data '{"query":"おすすめの京都観光地"}'

echo "== 3) premium user → 200 with sources (real key) / 502 (placeholder key) =="
curl -s -w "\n  HTTP %{http_code}\n" $IP \
  -X POST "$BASE/api/search/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PREM_JWT" \
  --data '{"query":"2026年のおすすめ京都観光スポット","sessionId":"local-test"}'

echo
echo "== usage_monthly (web_search rows, premium user) =="
npx wrangler d1 execute ai-discussion-db --local --command \
  "SELECT model, cost_micro, created_at FROM usage_monthly WHERE user_id='test-premium-user' AND model='web_search';"
