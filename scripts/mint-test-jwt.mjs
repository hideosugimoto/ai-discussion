// Mint a local HS256 test JWT matching functions/api/auth/callback.js's format
// (header {alg:HS256,typ:JWT}, claims {sub, exp}). Signed with JWT_SECRET from
// .dev.vars so functions/api/_middleware.js verifies it. Local use only.
//
//   node scripts/mint-test-jwt.mjs [sub]
//   (default sub: test-premium-user — the user seeded by local-db-setup.sh)

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const sub = process.argv[2] || "test-premium-user";

const envText = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
const secret = (envText.match(/^JWT_SECRET=(.*)$/m)?.[1] || "").trim();
if (!secret) {
  console.error("JWT_SECRET not found in .dev.vars");
  process.exit(1);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const header = b64({ alg: "HS256", typ: "JWT" });
const payload = b64({ sub, exp: Math.floor(Date.now() / 1000) + 86400 });
const data = `${header}.${payload}`;
const sig = createHmac("sha256", secret).update(data).digest("base64url");
process.stdout.write(`${data}.${sig}`);
