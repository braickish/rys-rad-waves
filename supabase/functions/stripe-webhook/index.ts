// POST /functions/v1/stripe-webhook: Stripe's events, signature-checked, written into `entitlements`.
// Each handler fetches the current state from Stripe rather than trusting the event's copy, so events arriving late,
// twice, or out of order all end in the same place. Accounts plan task 8.
//
//   checkout.session.completed / .async_payment_succeeded   a Wave Pass (payment) or a new Pro (subscription)
//   customer.subscription.created / .updated / .deleted     Pro kept in step: renewals, cancelling, ending
//   invoice.paid / invoice.payment_failed                   Pro renewed, or past due
//   charge.refunded                                         a full refund ends that Wave Pass or Pro month
import type Stripe from 'npm:stripe@18.5.0';
import { stripe, cryptoProvider, rpc, GAME_ID } from '../_shared/stripe.ts';

const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const id = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id ?? null);
const at = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

async function userOf(meta: Stripe.Metadata | null | undefined, customer: string | null): Promise<string | null> {
  if (meta?.user_id) return meta.user_id;
  return customer ? await rpc<string | null>('stripe_user_of', { customer }) : null;
}

// The billing period (since 2025-03-31.basil it's on the subscription's item, not the subscription).
const period = (sub: Stripe.Subscription) => {
  const item = sub.items.data[0];
  return { start: item?.current_period_start ?? 0, end: item?.current_period_end ?? 0 };
};
// The subscription an invoice bills, if any (basil: under parent.subscription_details).
const subscriptionOf = (inv: Stripe.Invoice) => id(inv.parent?.subscription_details?.subscription);

// Pro, in step with the subscription as Stripe has it now (see the migration for the mapping).
async function syncSubscription(subId: string) {
  const sub = await stripe.subscriptions.retrieve(subId);
  const { start, end } = period(sub);
  if (sub.metadata?.game_id && sub.metadata.game_id !== GAME_ID) return 'another game';
  const uid = await userOf(sub.metadata, id(sub.customer));
  if (!uid) return 'no user';
  let status: string, until: string | null;
  switch (sub.status) {
    case 'active':
    case 'trialing':
      status = sub.cancel_at_period_end || sub.cancel_at ? 'canceled' : 'active';
      until = at(sub.cancel_at && sub.cancel_at < end ? sub.cancel_at : end);
      break;
    case 'past_due':
    case 'unpaid':
      status = 'past_due';
      until = at(start); // (the unpaid period began here; the grace runs from it)
      break;
    case 'canceled':
    case 'incomplete_expired':
      status = 'canceled';
      until = at(sub.ended_at) ?? new Date().toISOString();
      break;
    default: // (incomplete, paused: nothing paid for yet)
      return `skipped ${sub.status}`;
  }
  await rpc('stripe_put_entitlement', { uid, want: 'pro', external: sub.id, new_status: status, until });
  return `pro ${status} until ${until}`;
}

async function checkoutDone(sessionId: string) {
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (s.metadata?.game_id && s.metadata.game_id !== GAME_ID) return 'another game';
  if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return `not paid (${s.payment_status})`;
  if (s.mode === 'subscription') return await syncSubscription(id(s.subscription)!);
  const uid = s.client_reference_id ?? await userOf(s.metadata, id(s.customer));
  const pi = id(s.payment_intent);
  if (!uid || !pi || s.metadata?.kind !== 'wave_pass') return 'not a Wave Pass';
  await rpc('stripe_put_entitlement', { uid, want: 'wave_pass', external: pi, new_status: 'active', until: null });
  return 'wave pass';
}

// A full refund. A Pro month is found through the subscription invoice its payment paid (basil: InvoicePayments, since
// charges no longer name their invoice); anything else is a Wave Pass, by its PaymentIntent.
async function refunded(chargeId: string) {
  const charge = await stripe.charges.retrieve(chargeId);
  if (!charge.refunded) return 'partial refund: kept';
  const pi = id(charge.payment_intent);
  if (!pi) return 'no payment';
  const paid = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 });
  const invoice = id(paid.data[0]?.invoice as string | { id: string } | undefined);
  // (with Managed Payments a one-time payment has an invoice too, but no subscription: that's a Wave Pass)
  const sub = invoice ? subscriptionOf(await stripe.invoices.retrieve(invoice)) : null;
  if (sub) return `pro refunded (${await rpc('stripe_refund', { external: sub })} rows)`;
  return `wave pass refunded (${await rpc('stripe_refund', { external: pi })} rows)`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', undefined, cryptoProvider,
    );
  } catch (e) {
    console.warn('stripe-webhook: bad signature', (e as Error).message);
    return ok({ error: 'bad signature' }, 400);
  }
  try {
    const o = event.data.object as { id: string };
    let did = 'ignored';
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        did = await checkoutDone(o.id);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        did = await syncSubscription(o.id);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const sub = subscriptionOf(await stripe.invoices.retrieve(o.id));
        did = sub ? await syncSubscription(sub) : 'one-off invoice';
        break;
      }
      case 'charge.refunded':
        did = await refunded(o.id);
        break;
    }
    await rpc('stripe_event_handled', { event_id: event.id, event_type: event.type });
    console.log(`stripe-webhook ${event.type} ${event.id}: ${did}`);
    return ok({ received: true, did });
  } catch (e) {
    // (a 500 makes Stripe retry, with backoff, for up to three days)
    console.error(`stripe-webhook ${event.type} ${event.id}`, e);
    return ok({ error: 'failed' }, 500);
  }
});
