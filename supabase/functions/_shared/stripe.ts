// Shared by the `checkout` and `stripe-webhook` Edge Functions (accounts plan task 8).
//
// Secrets (Supabase secrets in the cloud; supabase/functions/.env locally, never in the repo):
//   STRIPE_SECRET_KEY      sk_test_... until payments go live
//   STRIPE_WEBHOOK_SECRET  whsec_... (the webhook endpoint's, or `stripe listen`'s locally)
//   STRIPE_MANAGED_PAYMENTS "off" to sell as Braickish with Stripe Tax instead (default on: Stripe is the merchant of
//                           record, and handles sales tax and VAT, fraud and disputes; receipts come from Link)
//   STRIPE_TAX             "on" for Stripe Tax when Managed Payments is off (needs a head office set in Stripe)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come with the runtime.
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

// Pinned, so the shapes the code reads never shift under it. (Managed Payments needs 2025-03-31.basil or later.)
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-08-27.basil',
  httpClient: Stripe.createFetchHttpClient(),
});
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// What we sell, by Stripe lookup key ({game}_{item}_{currency}): the code never holds a price id, so a new price takes
// over by moving the key to it. The products carry metadata game_id=rys_rad_waves, type=wave_pass|pro.
export const GAME_ID = 'rys_rad_waves';
export const ITEMS = {
  wave_pass: { lookup: 'rys_rad_waves_wave_pass_usd', mode: 'payment' },
  pro: { lookup: 'rys_rad_waves_pro_monthly_usd', mode: 'subscription' },
} as const;
export type Kind = keyof typeof ITEMS;

export const MANAGED = Deno.env.get('STRIPE_MANAGED_PAYMENTS') !== 'off';

// The statement line buyers see after the account's descriptor prefix (without Managed Payments: with it, statements
// read LINK.COM* and the account's descriptor).
export const STATEMENT_SUFFIX = 'RYSRADWAVES';

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
