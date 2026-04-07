// Create Stripe Checkout session for one-time credit purchase
//
// Premium / Plus users only. Adds CREDIT_AMOUNT_USD worth of usage to their
// monthly limit, valid until end of the current UTC month.

export async function onRequestPost(context) {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!env.STRIPE_CREDIT_PRICE_ID) {
    return new Response(
      JSON.stringify({ error: "Credit purchase not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const dbUser = await env.DB.prepare(
    "SELECT plan, stripe_customer_id FROM users WHERE id = ?"
  )
    .bind(user.sub)
    .first();

  if (!dbUser || dbUser.plan === "free" || !dbUser.plan) {
    return new Response(
      JSON.stringify({ error: "Premium plan required to purchase credits" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Reuse existing customer if any, otherwise create
  let customerId = dbUser.stripe_customer_id;
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

  const origin = new URL(context.request.url).origin;

  const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      customer: customerId,
      mode: "payment",
      "line_items[0][price]": env.STRIPE_CREDIT_PRICE_ID,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/?credit=success`,
      cancel_url: `${origin}/?credit=cancel`,
      "metadata[user_id]": user.sub,
      "metadata[purpose]": "credit_topup",
    }),
  });

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
