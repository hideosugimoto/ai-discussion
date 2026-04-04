// Create Stripe Customer Portal session for subscription management
export async function onRequestPost(context) {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const dbUser = await env.DB.prepare(
    "SELECT stripe_customer_id FROM users WHERE id = ?"
  )
    .bind(user.sub)
    .first();

  if (!dbUser?.stripe_customer_id) {
    return new Response(
      JSON.stringify({ error: "No subscription found" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = new URL(context.request.url).origin;

  const res = await fetch(
    "https://api.stripe.com/v1/billing_portal/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: dbUser.stripe_customer_id,
        return_url: origin,
      }),
    }
  );

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to create portal session" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const session = await res.json();

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
