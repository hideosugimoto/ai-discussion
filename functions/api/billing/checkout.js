// Create Stripe Checkout session for premium / plus subscription
export async function onRequestPost(context) {
  const { env, data, request } = context;
  const user = data.user;

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse target plan from body (default 'premium' for backwards compat)
  let targetPlan = "premium";
  try {
    const body = await request.json();
    if (body && typeof body.plan === "string" && (body.plan === "premium" || body.plan === "plus")) {
      targetPlan = body.plan;
    }
  } catch {
    // Empty body is OK -- fall through with default
  }

  // Pick the right Stripe Price ID based on target plan
  const priceId = targetPlan === "plus" ? env.STRIPE_PRICE_ID_PLUS : env.STRIPE_PRICE_ID;
  if (!priceId) {
    return new Response(
      JSON.stringify({ error: `Stripe price for ${targetPlan} not configured` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = new URL(context.request.url).origin;

  // Get user info and check plan
  const dbUser = await env.DB.prepare(
    "SELECT plan, stripe_customer_id FROM users WHERE id = ?"
  )
    .bind(user.sub)
    .first();

  if (dbUser?.plan === targetPlan) {
    return new Response(
      JSON.stringify({ error: `Already on ${targetPlan} plan` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let customerId = dbUser?.stripe_customer_id;

  if (!customerId) {
    const customerRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: user.email,
        "metadata[user_id]": user.sub,
      }),
    });

    if (!customerRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to create customer" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const customer = await customerRes.json();
    customerId = customer.id;

    await env.DB.prepare(
      "UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(customerId, user.sub)
      .run();
  }

  // Create Checkout session
  const sessionRes = await fetch(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancel`,
        "metadata[user_id]": user.sub,
        "metadata[plan]": targetPlan,
        "subscription_data[metadata][user_id]": user.sub,
        "subscription_data[metadata][plan]": targetPlan,
      }),
    }
  );

  if (!sessionRes.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to create checkout session" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const session = await sessionRes.json();

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
