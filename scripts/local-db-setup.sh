#!/usr/bin/env bash
# Initialise the LOCAL D1 (wrangler pages dev) for search-endpoint testing:
# apply all schema migrations in order, then seed one premium user.
# Local only — never touches the remote/prod D1.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=ai-discussion-db
FILES=(schema.sql schema-v2.sql schema-v3.sql schema-v4.sql schema-v5.sql \
       schema-v6.sql schema-v7.sql schema-v8.sql schema-v9.sql)

for f in "${FILES[@]}"; do
  echo "== applying functions/$f =="
  npx wrangler d1 execute "$DB" --local --file="functions/$f"
done

echo "== seeding premium user: test-premium-user =="
npx wrangler d1 execute "$DB" --local --command \
  "INSERT OR REPLACE INTO users (id,email,name,plan,created_at,updated_at) VALUES ('test-premium-user','test@local.dev','Test Premium','premium',datetime('now'),datetime('now'));"

echo "done."
