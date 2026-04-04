// Stripe webhook handler - processes subscription events
// This endpoint is public (no JWT required, verified by Stripe signature)

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

  const sub = event.data?.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = sub?.metadata?.user_id;
      const subscriptionId = sub?.subscription;
      if (userId && subscriptionId) {
        await env.DB.prepare(
          "UPDATE users SET plan = 'premium', stripe_subscription_id = ?, updated_at = datetime('now') WHERE id = ?"
        )
          .bind(subscriptionId, userId)
          .run();
      }
      break;
    }

    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const status = sub?.status;
      const customerId = sub?.customer;
      if (customerId) {
        const plan =
          status === "active" || status === "trialing" ? "premium" : "free";
        await env.DB.prepare(
          "UPDATE users SET plan = ?, updated_at = datetime('now') WHERE stripe_customer_id = ?"
        )
          .bind(plan, customerId)
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
