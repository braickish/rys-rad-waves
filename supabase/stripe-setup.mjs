// Sets up Stripe for Ry's Rad Waves (accounts plan task 8): the products, prices and Customer Portal. Safe to run
// again: it creates only what's missing. Goes through the Stripe CLI (logged in; `stripe switch` picks the account),
// so no key passes through here. Test mode only unless you add --live on purpose.
//   node supabase/stripe-setup.mjs            (the sandbox the CLI is on)
//
// Conventions (one Stripe account for all the games):
//   product ids   {game}_{item}               rys_rad_waves_wave_pass, rys_rad_waves_pro
//   lookup keys   {game}_{item}_{currency}    rys_rad_waves_wave_pass_usd, rys_rad_waves_pro_monthly_usd
//   metadata      game_id, type (wave_pass | pro), platform: web
//   prices        tax included (tax_behavior inclusive): $5 is what the player pays, wherever they are
// A new price: create it, move the lookup key to it (transfer_lookup_key), archive the old one. The code follows the key.
import { execFileSync } from 'node:child_process';

const live = process.argv.includes('--live');
const stripe = (...args) => {
  const out = execFileSync('stripe', [...args, ...(live ? ['--live'] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const j = JSON.parse(out);
  if (j.error) throw new Error(`stripe ${args.slice(0, 2).join(' ')}: ${j.error.message}`);
  return j;
};
const tryGet = (...args) => { try { return stripe(...args); } catch (e) { if (/No such/.test(e.message)) return null; throw e; } };

const GAME = 'rys_rad_waves';
const ITEMS = [
  { id: `${GAME}_wave_pass`, type: 'wave_pass', name: "Ry's Rad Waves: Wave Pass",
    description: 'Every wave in the game, for life.', tax_code: 'txcd_10201000', // (video games, downloaded, permanent rights)
    lookup: `${GAME}_wave_pass_usd`, amount: 500 },
  { id: `${GAME}_pro`, type: 'pro', name: "Ry's Rad Waves: Pro",
    description: 'Build and save your own breaks, host contests, and every wave.', tax_code: 'txcd_10201002', // (subscription)
    lookup: `${GAME}_pro_monthly_usd`, amount: 300, interval: 'month' },
];

for (const it of ITEMS) {
  let product = tryGet('products', 'retrieve', it.id);
  if (!product) {
    product = stripe('products', 'create', '--id', it.id, '--name', it.name, '--description', it.description,
      '--tax-code', it.tax_code, '-d', `metadata[game_id]=${GAME}`, '-d', `metadata[type]=${it.type}`, '-d', 'metadata[platform]=web');
    console.log(`made product ${product.id}`);
  } else console.log(`have product ${product.id}`);

  const prices = stripe('prices', 'list', '-d', `lookup_keys[]=${it.lookup}`, '--active', 'true');
  if (prices.data.length) {
    const have = prices.data[0];
    // (tax included in the price: the player pays $5, not $5 plus tax. Settable once, while unspecified.)
    if (have.tax_behavior === 'unspecified') stripe('prices', 'update', have.id, '--tax-behavior', 'inclusive');
    console.log(`  have price ${it.lookup}: ${have.unit_amount} ${have.currency}, tax included`);
    continue;
  }
  const price = stripe('prices', 'create', '--product', it.id, '--currency', 'usd', '--unit-amount', String(it.amount),
    '--lookup-key', it.lookup, '--tax-behavior', 'inclusive', '-d', `metadata[game_id]=${GAME}`,
    ...(it.interval ? ['-d', `recurring[interval]=${it.interval}`] : []));
  console.log(`  made price ${price.lookup_key}: ${price.unit_amount} ${price.currency}`);
}

// The Customer Portal: cards, receipts, cancel Pro at the end of the period, and renew it again. Not the email (that's
// your sign-in, changed on the account page).
const configs = stripe('billing_portal', 'configurations', 'list', '--active', 'true', '--limit', '100');
const mine = configs.data.find((c) => c.metadata?.game_id === GAME);
if (mine) console.log(`have portal configuration ${mine.id}`);
else {
  const c = stripe('billing_portal', 'configurations', 'create',
    '-d', "business_profile[headline]=Ry's Rad Waves",
    '-d', 'features[invoice_history][enabled]=true',
    '-d', 'features[payment_method_update][enabled]=true',
    '-d', 'features[customer_update][enabled]=true', '-d', 'features[customer_update][allowed_updates][]=address',
    '-d', 'features[customer_update][allowed_updates][]=name',
    '-d', 'features[subscription_cancel][enabled]=true', '-d', 'features[subscription_cancel][mode]=at_period_end',
    '-d', 'features[subscription_cancel][cancellation_reason][enabled]=true',
    '-d', 'features[subscription_cancel][cancellation_reason][options][]=too_expensive',
    '-d', 'features[subscription_cancel][cancellation_reason][options][]=unused',
    '-d', 'features[subscription_cancel][cancellation_reason][options][]=other',
    '-d', `metadata[game_id]=${GAME}`);
  console.log(`made portal configuration ${c.id}`);
}
