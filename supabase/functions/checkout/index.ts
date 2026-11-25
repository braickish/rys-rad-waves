// POST /functions/v1/checkout  { kind: 'wave_pass' | 'pro' | 'portal', return_to: '<page url>' }
// with your session (Authorization: Bearer <access token>). Answers { url }: Stripe Checkout to buy, or the Customer
// Portal (cards, receipts, cancelling Pro). Back from Checkout you land on return_to with ?checkout=done (or =cancel).
// Guests (anonymous) can't buy: sign in with an email first. Accounts plan task 8.
import { stripe, db, rpc, ITEMS, GAME_ID, MANAGED, STATEMENT_SUFFIX, type Kind } from '../_shared/stripe.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

// Where Stripe may send you back to: the game's own pages only (Pages serves it at braickish.com/rys-rad-waves/; the
// github.io address redirects there; rysradwaves.com later).
const SITES = (Deno.env.get('CHECKOUT_RETURN_SITES') ??
  'https://braickish.com/rys-rad-waves/,https://www.braickish.com/rys-rad-waves/,https://braickish.github.io/rys-rad-waves/,https://rysradwaves.com/,https://www.rysradwaves.com/').split(',');
function returnTo(raw: unknown): URL | null {
  try {
    const u = new URL(String(raw));
    const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    if (!local && !SITES.some((s) => u.href.startsWith(s))) return null;
    u.hash = '';
    for (const k of ['checkout', 'session_id']) u.searchParams.delete(k);
    return u;
  } catch {
    return null;
  }
}
const withParams = (u: URL, params: Record<string, string>) => {
  const v = new URL(u);
  for (const [k, x] of Object.entries(params)) v.searchParams.set(k, x);
  // ({CHECKOUT_SESSION_ID} is filled in by Stripe and has to stay unescaped)
  return v.href.replace(encodeURIComponent('{CHECKOUT_SESSION_ID}'), '{CHECKOUT_SESSION_ID}');
};

async function customerFor(user: { id: string; email?: string }): Promise<string> {
  const have = await rpc<string | null>('stripe_customer_of', { uid: user.id });
  if (have) return have;
  const c = await stripe.customers.create(
    { email: user.email, metadata: { user_id: user.id, game_id: GAME_ID } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await rpc('stripe_link_customer', { uid: user.id, customer: c.id });
  return c.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer(405, { error: 'POST only' });
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!user) return answer(401, { error: 'sign in first', code: 'signed_out' });
    if (user.is_anonymous || !user.email) return answer(403, { error: 'sign in with your email to buy', code: 'guest' });

    const body = await req.json().catch(() => ({}));
    const back = returnTo(body.return_to);
    if (!back) return answer(400, { error: 'return_to must be a page of the game', code: 'bad_return' });
    const kind = body.kind as Kind | 'portal';

    if (kind === 'portal') {
      const customer = await rpc<string | null>('stripe_customer_of', { uid: user.id });
      if (!customer) return answer(404, { error: 'nothing bought yet', code: 'no_customer' });
      // (the game's own portal settings, made by supabase/stripe-setup.mjs)
      const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
      const configuration = configs.data.find((c) => c.metadata?.game_id === GAME_ID)?.id;
      const s = await stripe.billingPortal.sessions.create({ customer, return_url: back.href, configuration });
      return answer(200, { url: s.url });
    }

    const item = ITEMS[kind as Kind];
    if (!item) return answer(400, { error: 'kind must be wave_pass, pro or portal', code: 'bad_kind' });

    // Don't sell what you already have.
    if (await rpc<boolean>('stripe_already_has', { uid: user.id, want: kind })) {
      return answer(409, { error: kind === 'pro' ? 'you already have Pro' : 'you already have the Wave Pass', code: `have_${kind}` });
    }

    const prices = await stripe.prices.list({ lookup_keys: [item.lookup], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) throw new Error(`no active price with lookup key ${item.lookup}`);

    const customer = await customerFor(user);
    const meta = { user_id: user.id, kind, game_id: GAME_ID };
    // Tax: Managed Payments handles it (and won't take tax settings); without it, Stripe Tax if it's switched on.
    const tax = !MANAGED && Deno.env.get('STRIPE_TAX') === 'on';
    const params: Record<string, unknown> = {
      mode: item.mode,
      customer,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: meta,
      ...(item.mode === 'payment'
        ? { payment_intent_data: { metadata: meta, ...(MANAGED ? {} : { statement_descriptor_suffix: STATEMENT_SUFFIX }) } }
        : { subscription_data: { metadata: meta } }),
      ...(MANAGED ? { managed_payments: { enabled: true } } : { automatic_tax: { enabled: tax } }),
      ...(tax ? { customer_update: { address: 'auto', name: 'auto' } } : {}),
      success_url: withParams(back, { checkout: 'done', session_id: '{CHECKOUT_SESSION_ID}' }),
      cancel_url: withParams(back, { checkout: 'cancel' }),
    };
    // (managed_payments isn't in this library's types yet; it goes through as is)
    const session = await stripe.checkout.sessions.create(params as Parameters<typeof stripe.checkout.sessions.create>[0]);
    return answer(200, { url: session.url, id: session.id });
  } catch (e) {
    console.error('checkout', e);
    return answer(500, { error: "Couldn't reach the payments service. Try again in a moment.", code: 'server' });
  }
});
