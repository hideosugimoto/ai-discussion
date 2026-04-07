// Stripe webhook handler - processes subscription events and credit purchases
// This endpoint is public (no JWT required, verified by Stripe signature)

import { endOfCurrentMonth, usdToMicro } from "../_lib_billing.js";

async function verifyStripeSignature(payload, sigHeader, secret) {
  const encoder = new TextEncoder();
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    acc[key.trim()] = value;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return null;

  // Reject if timestamp is too old (5 min tolerance)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (Math.abs(age) > 300) return null;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Convert hex signature to Uint8Array for constant-time verify
  const sigBytes = new Uint8Array(
    signature.match(/.{2}/g).map((b) => parseInt(b, 16))
  );

  // crypto.subtle.verify is constant-time (not vulnerable to timing attacks)
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    encoder.encode(signedPayload)
  );

  if (!valid) return null;

  return JSON.parse(payload);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const payload = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature");

  if (!sigHeader) {
    return new Response("Missing signature", { status: 400 });
  }

  const event = await verifyStripeSignature(
    payload,
    sigHeader,
    env.STRIPE_WEBHOOK_SECRET
  );

  if (!event) {
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency check - skip already processed events
  if (env.KV) {
    const processed = await env.KV.get(`stripe_event:${event.id}`);
    if (processed) {
      return new Response("Already processed", { status: 200 });
    }
    await env.KV.put(`stripe_event:${event.id}`, "1", { expirationTtl: 86400 });
  }

  const sub = event.data?.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = sub?.metadata?.user_id;
      const mode = sub?.mode;

      if (mode === "subscription") {
        // Subscription signup (premium or plus)
        const subscriptionId = sub?.subscription;
        // Plan is in metadata.plan; default to 'premium' for backward compat
        const targetPlan =
          sub?.metadata?.plan === "plus" ? "plus" : "premium";
        if (userId && subscriptionId) {
          await env.DB.prepare(
            "UPDATE users SET plan = ?, stripe_subscription_id = ?, updated_at = datetime('now') WHERE id = ?"
          )
            .bind(targetPlan, subscriptionId, userId)
            .run();
        }
      } else if (mode === "payment" && sub?.metadata?.purpose === "credit_topup") {
        // One-time credit purchase
        const paymentIntent = sub?.payment_intent;
        if (userId && paymentIntent) {
          const creditUsd = parseFloat(env.CREDIT_AMOUNT_USD || "2.00");
          const amountMicro = usdToMicro(creditUsd);
          const expiresAt = endOfCurrentMonth();
          try {
            // UNIQUE constraint on stripe_payment_intent prevents double-credit
            // on webhook retries (in addition to KV idempotency above)
            await env.DB.prepare(
              "INSERT INTO user_credits (user_id, amount_micro, source, stripe_payment_intent, expires_at) VALUES (?, ?, 'purchase', ?, ?)"
            )
              .bind(userId, amountMicro, paymentIntent, expiresAt)
              .run();
          } catch {
            // Likely UNIQUE violation -- already credited, ignore
          }
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      // Always downgrade to free on cancellation
      const customerId = sub?.customer;
      if (customerId) {
        await env.DB.prepare(
          "UPDATE users SET plan = 'free', updated_at = datetime('now') WHERE stripe_customer_id = ?"
        )
          .bind(customerId)
          .run();
      }
      break;
    }

    case "customer.subscription.updated": {
      // Only react to non-active states. Active updates (including
      // mid-period plan changes) keep whatever plan was set at checkout.
      const status = sub?.status;
      const customerId = sub?.customer;
      if (customerId && status !== "active" && status !== "trialing") {
        await env.DB.prepare(
          "UPDATE users SET plan = 'free', updated_at = datetime('now') WHERE stripe_customer_id = ?"
        )
          .bind(customerId)
          .run();
      }
      break;
    }

    case "invoice.payment_failed": {
      const customerId = sub?.customer;
      if (customerId) {
        await env.DB.prepare(
          "UPDATE users SET plan = 'free', updated_at = datetime('now') WHERE stripe_customer_id = ?"
        )
          .bind(customerId)
          .run();
      }
      break;
    }

    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
