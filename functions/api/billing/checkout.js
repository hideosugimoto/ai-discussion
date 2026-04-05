// Create Stripe Checkout session for premium subscription
export async function onRequestPost(context) {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = new URL(context.request.url).origin;

  // Get user info and check plan
  const dbUser = await env.DB.prepare(
    "SELECT plan, stripe_customer_id FROM users WHERE id = ?"
  )
    .bind(user.sub)
    .first();

  if (dbUser?.plan === "premium") {
    return new Response(
      JSON.stringify({ error: "Already on premium plan" }),
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
        "line_items[0][price]": env.STRIPE_PRICE_ID,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancel`,
        "metadata[user_id]": user.sub,
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
