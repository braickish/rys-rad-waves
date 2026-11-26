# Accounts, paid plans and profiles (and how they reshape live contests)

Asked by the user 2026-11-23, after the live contests plan (plans/2026-11-22-live-contests.md, none of it built yet). This
plan replaces that plan's phases 2-6 with a combined order (the task list at the end). Its phase 1 (solo heat mode) stays as
written.

## What the user wants

- **Wave Pass** (one-time payment): unlocks surfing a few defined waves for good (Raglan, Raglan+, Pipe, Queens,
  Trestles, Dynamic: the set to be picked).
- **Pro** (monthly): building and competing. That covers saving breaks to your account, hosting contests, a private list
  of your breaks, and later surfer styling, contest management and history, and recap videos. Pro includes the Wave Pass.
- **Guests surf free in a Pro host's contest.** You can enter anyone's contest without paying, on the contest's break,
  for the length of the contest. You can't host one without Pro.
- **Simple sign-up:** a magic email link for both sign-up and sign-in, with no passwords. The web is the main channel and
  an app store is optional.
- **Public profile:** the waves you built and your contest scores. **Private:** all your custom breaks, surfer styling,
  and contest management and history. Later: a recap video of a contest with "live" commentary.

## The shape of it

One Supabase project for the game (as the contests plan already called for) does all the server work: magic-link auth (as
spigots does: passwords off, RLS on every table), Postgres, Realtime, Storage (for ride replays and recaps), and Edge Functions
(Stripe checkout and webhooks, and later the commentary). The site stays static on GitHub Pages, with no build step and
supabase-js from a pinned ESM CDN URL. Payments go through Stripe Checkout on the web. The database records **what you're
entitled to**, whichever store you paid through, so an app store can be added later without changing the game.

```
 browser (Pages, static)  ──magic link──▶  Supabase Auth ──▶ auth.users ─┐
        │                                                                ▼
        ├── supabase-js ──▶ Postgres (RLS): profiles, entitlements, breaks, contests, heats, rides
        ├── Realtime ─────▶ lobby presence, live scoreboard
        ├── Storage ──────▶ ride replays (input logs), recap videos
        └── Edge Fn  ─────▶ checkout ──▶ Stripe ──webhook──▶ Edge Fn ──▶ entitlements
```

### Who is who

| | Can | Needs |
|---|---|---|
| **Visitor** (no sign-in) | the demo (one wave, open to all), try the builder (not saved to an account), open a contest link | nothing |
| **Guest entrant** | enter a contest by code or link and surf its break for that contest; results kept | an anonymous session; claiming it with an email keeps the results on a profile |
| **Member** (free, email) | all of the above, a public profile with contest results, contest history | the magic link |
| **Wave Pass** | the defined waves, any time | a one-time payment |
| **Pro** | the Wave Pass, plus saving breaks, hosting contests, a private library, styling, recaps | a monthly payment |

**Guests stay frictionless with anonymous sign-in plus claiming.** Opening a contest link signs you in anonymously (as the
contests plan has it), so a friend surfs within seconds. When the heat ends, the results card offers "Keep your scores: enter
your email". That turns the same user into a permanent one (Supabase `updateUser({ email })` on an anonymous user sends the
magic link and keeps the id), so their rides and results move to their profile with no migration. Anonymous users who never
claim are deleted after 30 days.

### Entitlements: the database decides, the client follows

- `entitlements` (user, `kind`: `wave_pass` | `pro`, `source`: `stripe` | `apple` | `grant`, `status`, `expires_at` (null for
  the Wave Pass), external ids). Only the service role writes it (from the Stripe webhook, or by hand for grants and
  testers). Users can read their own rows.
- `has_entitlement(kind)` in SQL (Pro counts as a Wave Pass), used by RLS and the functions. **Hard gates live on the
  server:** saving a break, `create_contest`, uploading styling, and making a recap all check it. There's a grace period
  of a few days after a failed renewal.
- **The wave unlock is a soft gate, on purpose.** The game is public static code, so anyone determined can surf any wave
  locally whatever we do. The picker locks the waves and the Wave Pass unlocks them. That's enough for honest players and
  costs nothing to run. Everything worth more (saving, hosting, scores on a profile) is gated on the server. Don't spend
  effort on obfuscation.
- **A contest pass:** the contest's break is a snapshot stored with the contest, so any entrant loads it from the contest
  (RLS: entrants can read it) without owning it or having a pass. When the contest closes, a guest is back to their own
  plan. (They keep the replays of their own rides.)
- **When Pro lapses:** nothing is deleted. Your breaks stay in your library and on your profile and you can still surf
  them, but you can't save new ones, edit, or host until you renew. Past contests and recaps stay.

### Payments

- **Stripe Checkout** (hosted page, so no card data touches us) from a `checkout` Edge Function: Wave Pass as a one-time
  price, Pro as a monthly subscription. The **Customer Portal** handles cancelling and cards. A `stripe-webhook` Edge
  Function (with signature checks) writes `entitlements` on `checkout.session.completed`, `customer.subscription.updated`
  and `.deleted`, and `invoice.payment_failed`. Stripe Tax for sales tax and VAT. Prices: $5 Wave Pass, $3/month Pro.
- Test mode end to end before any live key. The secret keys stay in Supabase secrets and never go in the repo or the chat
  (as spigots).
- **App stores later:** in an iOS app, digital unlocks normally have to go through Apple's in-app purchase. In the US,
  since 2025, apps may also link out to web checkout. Check the current rules when we get there. Either way the purchase
  becomes a row in `entitlements` with `source = 'apple'` (RevenueCat can do the receipts and webhooks), and the game only
  ever asks "is this user Pro?". Apple also requires in-app account deletion, so build deletion in from the start.

### Profiles and breaks

- `profiles` (id = the auth user, a unique `handle` (3-20 characters, lowercase, no look-alikes, a reserved list), a display
  name, a jersey colour, `styling` (jsonb, later), created). A public page at `profile.html?u=handle`. The static site
  needs no server routes: the page reads the public views.
- `breaks` (owner, name, `payload` (the builder's JSON, in metres, as saved now), `visibility`: `private` | `unlisted` |
  `public`, a thumbnail in Storage, created and updated, a version). Today the builder keeps one design in localStorage
  and shares by `#built=` URL hash. Signed-in Pro users get **My Breaks**: save, rename, duplicate, delete, and set public.
  On first sign-in, the break in localStorage is offered for import. `?break=<id>` opens a saved break (public or
  unlisted). The `#built=` links keep working (they're how the builder works without an account) but don't appear on
  profiles.
- **Public profile:** your public breaks (thumbnail, name, ride length, "surf it", which a visitor can surf if it's public:
  it's your showcase), your contest results (place, best waves, a link to the contest page), and later your styling and
  the recaps you were in.
- **Private:** all your breaks, contests you're hosting (draft, open, running, done: start, close, delete), contest history,
  billing (to the Customer Portal), handle and email, delete your account.

### Replays: one investment, three payoffs

Record every contest ride as **the heat seed plus the player's inputs each sim step**. That gives us:
1. **Recap videos.** Replay the rides in the engine with broadcast cameras, without storing any video until a recap is made.
2. **Checking scores.** A score posted by the client can be re-run later from its inputs, so impossible scores stand out
   (and could be re-scored on a server if the physics can run without the GPU).
3. **Profiles.** "Watch this wave" on your best rides.

This needs a **deterministic sim**. Today each frame steps by the real frame time (main.js `tick`: `dt = min(0.05, ...)`), so the
same inputs give a different ride at 60 and 120 Hz. The fix is a fixed step (e.g. 120 Hz) with an accumulator and the
render interpolating, plus seeded randomness everywhere the ride depends on it (the judges are already seeded). A ride log is
small: key state changes with step numbers, gzipped, a few KB a ride, kept in Storage.

### Recap video (later)

From a heat's rides and its timeline (scores, lead changes, "needs", the horn), a recap page replays the key waves with a
broadcast camera, a lower-third scoreboard, and commentary. Claude, in an Edge Function, writes the commentary from the
structured timeline (two commentators, timed to the wave events), and text-to-speech voices it. Recording with
`MediaRecorder` on the canvas exports a video to share. The recap is stored once per contest (Pro host), and every entrant
sees it on their profile.

## What this changes in the live contests plan

1. **Identity.** Anonymous sign-in stays for guests, but the host is a signed-in Pro member, and entrants link to
   `auth.users` (anonymous or permanent), so results follow a claimed account. Names come from the profile handle, or a
   nickname for guests.
2. **`create_contest` checks `has_entitlement('pro')`** on the server. Hosting limits per plan (e.g. 32 entrants, 3 running
   contests) are enforced there too.
3. **The spot is a snapshot.** `contests.spot` holds the wave id or a copy of a saved break's payload (with its `break_id`
   for the link), taken at creation, so editing your break doesn't change a running contest. The contest pass (above)
   lets entrants load it.
4. **The schema grows.** Phase 2 now begins with `profiles` and `entitlements`. `waves` becomes `rides` and gains the replay
   path (input log) and the sim version. A `contest_visibility` (`unlisted` | `public`) decides whether results show on
   profiles and a public contest page.
5. **Determinism moves to the front.** The fixed-step sim and ride recording come before (or with) phase 1, so solo heats
   already record rides and the replay test exists before any network work.
6. **The lobby needs sign-in.** "Create a contest" asks you to sign in or upgrade. "Join" never does.
7. **Phase 6's "contest history" and "replay of the final"** become the profile's history and the recap (here).
8. **The transport interface** for an app stays, next to the entitlement source for the App Store.

## Decisions (the user, 2026-11-23)

- **Prices:** Wave Pass **$5** one-time, for life. Pro **$3/month** for everything else (it includes the Wave Pass).
- **Domain:** **rysradwaves.com**. Magic-link emails come from **howdy@rysradwaves.com**, sent by Resend through
  Supabase's Send Email Hook (task 11a; the user, 2026-11-25), and the site is served there since 2026-11-25 (Pages custom
  domain, `CNAME`; the github.io and braickish.com/rys-rad-waves/ addresses redirect to it), and the domain carries the site (Pages custom domain) and the Supabase auth redirect URLs.
- **iOS app:** purchases go through Apple's in-app purchase (`source = 'apple'`), with no link-out.
- The defaults stand: a visitor gets one demo wave (Raglan), the builder to try (no saving), and any contest they're
  invited to. The Wave Pass unlocks every non-Pro wave, including future ones. The builder stays open to try. Visitors
  can surf public breaks on profiles.

## Tasks (one at a time; each ends live with its tests passing, and the user plays it before the next)

- [x] **1. Deterministic rides** (done 2026-11-23). The physics already ran at a fixed 1/120 s step with an accumulator,
  and nothing random touches a ride. What wasn't deterministic was the sea: one running random stream (and a running
  map counter for Trestles and Dynamic), so wave n depended on how long the waves before it and the title demo ran. Each
  wave now has an address (seed, n) and is built from it alone (sea.js `goToWave`, `waveSeed`). `test/determinism.mjs`
  checks every wave and a built break. Found along the way: test/sections.mjs's "trimming alone makes at most 70% of
  sections" had passed on luck. Over 40 waves trimming makes ~84% and pumping ~81%, before and after this change.
  That's a feel question for the user.
- [x] **2. Ride recording and replay** (done 2026-11-23). `src/replay.js` records the wave's address, the physics options,
  the input each step (on change), and the rider's whole state every second and at the end. A replay feeds the inputs
  back and snaps onto each checkpoint, measuring drift. In the game: "Watch it" and "Save replay" on the end card and the
  score sheet, plus `?replay=<url>` and drag-and-drop. `test/replay.mjs` (four waves and a built break, exact, plus the
  drift snap) and `test/replay-browser.mjs` (headless Chrome: a keyboard ride; "Watch it" at 4x slower CPU; `?replay=` in a
  fresh page) all match. Fixed along the way: a new ride's first move could count as a repeat of the last ride's.
- [x] **3. Solo heat mode** (done 2026-11-23). Contests phase 1: `src/heat.js` (pure), `?heat=10m` / `?heat=5w` (`&bots=`, `&seed=`),
  the WSL-style board with needs and score pops, the horn rule, the sheet paddling back out by itself, and a results card
  with "Watch your best wave" (each wave's ride is recorded). `test/heat.mjs` and `test/heat-browser.mjs` pass on Raglan+ and
  Trestles. The title screen's mode row (Free surf · Heat 10 min · Heat 5 waves, 2026-11-24) reloads with `?heat=`. Not yet: bracket `advance` on a URL.
- [x] **4. The Supabase project and auth** (done 2026-11-24). Project `rys-rad-waves` (ref `lyttzshnxspdugvonjea`), the CLI
  in the repo (`supabase/`, `npm run db:start`): magic link only (`private.strip_password` trigger erases any password),
  anonymous sign-ins on, redirect URLs for Pages, rysradwaves.com and local (`[remotes.production]` in config.toml, sent
  with `supabase config push`), custom SMTP noted for launch. `src/account.js` + `src/account-ui.js`: sign in and out under
  DROP IN, session kept (implicit flow, so a link opened on another device's mail app works). Tests: `npm run test:db`,
  `test:auth` (link, session, refresh, sign-out, no passwords, anonymous), `test:auth-browser` (the title screen end to end).
- [x] **5. Profiles** (done 2026-11-24). `profiles` (public read; insert and update your own, not as an anonymous guest;
  `styling` not client-writable yet). Handles 3-20, `[a-z][a-z0-9_]`, unique on a look-alike key (0/o, 1/l/i, 5/s, `_`
  ignored), a reserved list compared the same way; `handle_problem(h)` for the form; `delete_my_account()`. The title asks
  for a handle on first sign-in (a guess from the email), then shows @handle · Account · Sign out. `profile.html?u=`
  (name, jersey, since, empty Breaks and Contest results) and `account.html` (handle, name, jersey, email change, sign
  out, delete by typing your handle). Tests: `supabase/tests/profiles_test.sql` (24), `test:profile-browser`.
- [x] **6. Entitlements (no payments yet)** (done 2026-11-24). `entitlements` (readable by you, written only by the
  database), `has_entitlement(kind)` for you and `private.user_has_entitlement(uid, kind)` for RLS and functions (Pro counts
  as a Wave Pass; a failed renewal keeps Pro 3 days; cancelled runs to the period's end; refunded never counts),
  `my_plan()`, and `private.grant_entitlement(email, kind, interval, why)` for granting by hand. The picker locks every
  wave but Raglan and Queens (free too: the user, 2026-11-24) and your built break without a Wave Pass, and a link to a locked wave lands on Raglan with a note;
  the account page shows your plan. **The lock is off until payments are live** (`PAYWALL` in src/account.js; `?paywall`
  to try it), so nobody loses a wave before they can buy one: turn it on in task 9. Tests:
  `supabase/tests/entitlements_test.sql` (17), `test:plan-browser`.
- [x] **7. Cloud breaks** (done 2026-11-24). `breaks` (name, the builder's `design`, its `ride` for the game, visibility
  private / unlisted / public, a version that counts saves; 200 each; names checked like handles) and `get_break(id)`
  (yours, or an unlisted or public one by id, with the owner's handle). Saving and changing need Pro; a lapsed Pro keeps,
  surfs and deletes everything. Thumbnails in the public `breaks` bucket (your folder, Pro). `src/breaks.js` and
  **My Breaks** at the top of the builder (`src/builder/my-breaks.js`): name, Save / Save as new, Private / Unlisted /
  Public, Copy link, and the list (Edit, Surf, Rename, Duplicate, Delete). On first sign-in with Pro the design this
  browser remembers is offered as your first break. `index.html?break=<id>` drops straight in (`src/boot.js`);
  `builder.html?break=<id>` opens it (someone else's as a copy to keep). Tests: `supabase/tests/breaks_test.sql` (22),
  `test:breaks-browser` (20). Also: service_role can now run the name check (it couldn't change a profile or a break).
- [x] **8. Stripe.** (2026-11-25) **Managed Payments** (the user's call): Stripe is the merchant of record and handles
  sales tax and VAT; receipts come from Link, and statements read `LINK.COM*`. `STRIPE_MANAGED_PAYMENTS=off` falls back
  to selling as Braickish with Stripe Tax (`STRIPE_TAX=on`, which needs a head office set). Prices **include tax** ($5 is
  the total). One Stripe account for all the games: product ids `{game}_{item}` (`rys_rad_waves_wave_pass`,
  `rys_rad_waves_pro`), prices found by lookup key `{game}_{item}_{currency}` (`rys_rad_waves_wave_pass_usd`,
  `rys_rad_waves_pro_monthly_usd`), metadata `game_id`/`type`/`platform`, video game tax codes; the Customer Portal
  (cards, receipts, cancel at the end of the month, renew). `node supabase/stripe-setup.mjs` makes all of it (it only
  adds what's missing). Stripe API pinned to `2025-08-27.basil` (`npm:stripe@18.5.0`).
  Migration `20261125000000_stripe.sql`: customers and an event log (private), and functions only service_role can call;
  Pro past due counts from the start of the unpaid month (so the 3 days' grace is real); a refund sticks until a later
  month is paid; `delete_my_account` waits until Pro is cancelled. Edge Functions `checkout` (Checkout or the Portal;
  no guests, nothing you already have, only the game's own return pages) and `stripe-webhook` (signature-checked;
  re-reads Stripe's current state, so late or repeated events end in the same place).
  Tests: `supabase/tests/stripe_test.sql` (25), `npm run test:stripe` (31: pays on the real Checkout page in headless
  Chrome; Pro on a Stripe test clock through renewal, failed renewal, paying after all, cancelling, ending; refunds
  of both). Local: `npm run functions:serve`, keys in `supabase/functions/.env` (`rrw-set-stripe-key --local`).
  Cloud: both functions deployed; the sandbox's webhook endpoint (`we_1UfcJk5JByhnbHbWl8XR8NDP`, API 2025-08-27.basil)
  points at the cloud `stripe-webhook`, its secret in Supabase secrets. The sandbox is shared by local tests and the
  cloud, so an event for a player a database doesn't have is acknowledged and skipped (not retried).
- [x] **9. Paywall UX** (2026-11-25). `src/paywall.js`, one module for every page (its own markup and styles): the
  Wave Pass sheet (a locked wave: both offers, the pass first; `want: 'pro'`: Pro only), signed out it asks for the
  email first and the link comes back with `?buy=` to reopen it, one tap from paying. Checkout returns to the page you
  were on (the game: the wave you tapped) with `?checkout=done&bought=`; the plan is read again until the webhook lands
  it ("Unlocking…", then "The Wave Pass is yours.") and you're put on that wave; `?checkout=cancel` says "No charge.";
  the address is cleaned. The builder's My Breaks has "Go Pro"; the account page's Plan has the buy buttons and Manage
  billing (the Customer Portal; a granted plan has none to manage). `terms.html` and `privacy.html` (drafts for the user
  to review before launch). **`SALES_OPEN` (account.js `LIVE`) is false** until Stripe has live keys: the lock and every
  buy button stay off, `?paywall` turns them on for the visit. Test: `npm run test:paywall-browser` (33: pays in the
  sandbox through `stripe listen`; `SKIP_PAY=1` skips that), on a phone-sized screen too.
  Also (the user): the title screen lands on three buttons, Free surf (every break, then your saved ones), Build a
  reef and Compete live (Solo: heats against bots; task 11 adds live heats there). Checked in test/heat-browser.mjs
  and test/breaks-browser.mjs.
- [x] **10. The contest schema on accounts** (2026-11-25). Migration `20261125010000_contests.sql`: `contests` (a
  6-letter code without look-alikes, host, name, `spot` = `{wave}` or a break snapshot `{break_id, name, ride}`, seed,
  `end_minutes` or `end_waves`, format, sizes, `visibility` unlisted/public, state lobby/running/done/cancelled),
  `entrants` (guests by nickname, members by handle; results stay by name if an account is deleted), `heats`,
  `heat_entries` (jersey drawn from the heat's seed, all different; total, place), `rides` (score, five judges, sheet,
  `caught_at`, `replay_path` in your own folder, `sim_version`). Read by the host and entrants (the contest pass: they
  read the spot), and by everyone when public; written only through functions: `create_contest` (Pro; 3 open at once;
  one heat of up to 8 until brackets), `contest_by_code` (the lobby's preview, signed out too), `join_contest` /
  `leave_contest` (in the lobby), `start_contest` (the host, still Pro: a 10 s countdown on the server's clock; a waves
  heat gets 3 minutes a wave), `submit_ride` (yours, in order, caught before the horn by the server's clock, in within 2
  minutes), `close_heat` (anyone in it, once over: best two, WSL tie-breaks; the contest ends with its last heat),
  `cancel_contest`. Errors carry a short code (`pro_needed`, `contest_full`, `after_horn`...) for the game to word.
  Not yet: the host isn't entered automatically (the lobby decides, task 11); the ride logs' bucket comes with task 12.
  Tests: `supabase/tests/contests_test.sql` (59). Cloud: `supabase db push` (the user).
- [x] **11. Lobby** (2026-11-25). Under Compete live: **Host a contest** (Pro: where, one of the game's waves or a
  saved break; how long, 10/15/20 minutes or 5/8/10 waves; a name; public or not; the host is entered as their handle
  and can Leave to just run it; signed out it asks you to sign in, not Pro it says so and opens the Go Pro sheet when
  sales are open), a **code** field to join, and the **lobby** (`?contest=<code>`: name, wave, length, host, the code
  with Share link, who's in and who's here now, Join (a guest gets an anonymous session there and then and joins with
  a nickname, remembered; a member as their handle), Leave, and the host's Start and Cancel). My Breaks in the builder
  has **Host** on each break (`index.html?host=<id>` opens the form with it picked). Live: a Realtime channel per
  contest (`contest:<id>`): presence for who's here, a "changed" broadcast after each join, leave, start or cancel so
  everyone reads the contest again, and a read every 15 s as a backstop (src/contests.js, src/lobby.js). On Start
  everyone in it counts down to the heat's server start and drops in: boot.js turns `?contest=<code>&go` into the heat
  (the contest's wave, or its break's ride as `#built=`; its length; the heat's seed; your drawn jersey; no bots), and
  the contest pass opens the wave even without a Wave Pass (account.js `allowWave`). For now each screen runs the heat
  on its own: sharing scores is task 12. Also: `initAccount()` makes one Supabase client however many callers ask at
  once. Local Realtime is on in config.toml. Test: `npm run test:lobby-browser` (18, two Chrome instances: a host and a
  guest).
- **Jerseys in contests (the user, 2026-11-24):** each contest heat draws its surfers' jersey colours at random (from
  the heat's seed, all different, stored with the heat so every client shows the same), whatever your profile says. Your
  profile's jersey is what you wear in solo heats. The surfer wears the jersey over any outfit, at every water temperature.
- [x] **11a. Email through Resend (the Send Email Hook)** (2026-11-25). `supabase/functions/send-email` (index.ts;
  the words in emails.js, shared with the tests): Standard Webhooks signature checked, each email worded in the game's
  look, sent through Resend from howdy@rysradwaves.com; an email change's two links routed by token hash. Local: hook on
  in `[auth.hook.send_email]`, secret in the git-ignored supabase/.env and supabase/functions/.env, no Resend key so it
  posts into Mailpit. Cloud: the domain verified in Resend, key and hook secret in Supabase secrets
  (`rrw-set-resend-key`), a signed test send to Resend's test address accepted, then the hook switched on
  (`[remotes.production.auth.hook.send_email]`, `npx supabase config push`). The email rate limit isn't managed by
  config push: raise it in the dashboard (Authentication > Rate Limits). Test: `npm run test:email-hook` (25).
  Originally: Supabase's built-in sender allows only about 2 emails an
  hour, too few for sign-ups, sign-ins and email changes once people play. Auth hands every email to an Edge Function
  `send-email` (Auth Hooks: Send Email, HTTP), which checks the hook's signature (Standard Webhooks, the hook secret),
  words the email itself (sign-in and sign-up link, email change to both addresses, reauthentication; the game's look,
  plain-text part too) and sends it with Resend's API from **howdy@rysradwaves.com**. Then the email rate limit goes
  up (`[auth.rate_limit] email_sent`, e.g. 100 an hour; per-address limits stay Supabase's).
  The user's part: a Resend account, the domain rysradwaves.com verified in Resend (its SPF, DKIM and return-path DNS
  records), and the API key into Supabase secrets through a hidden-prompt script (`rrw-set-resend-key`, as with
  Stripe). Local: the hook in `config.toml` points at the local function, with emails still landing in Mailpit when
  no key is set (so the browser tests keep reading links there). Tests: the function refuses an unsigned or wrongly
  signed call, builds each email type with the right link, and a sign-in end to end in the browser.
- [x] **12. Live heats** (2026-11-25). src/live-heat.js: the heat runs on the server's clock (`server_time()`,
  each screen's offset measured once; the horn together); each scored wave goes up in order (its replay to the private
  `replays` bucket at <you>/<heat>/<n>.json, then `submit_ride` with the five judges and the sheet, then a "score"
  ping on the contest's channel) and lands on the others' boards (heat.js `rivals` / `addRivalWave`: live surfers whose
  waves come over the network, once each); the rides table is read again every 10 s and on load, so a reload rejoins
  and refills the board (boot.js sets `window.__contestHeat` for `?contest=&go` and for a reload in the heat). Done
  (the horn and off your wave, or all your waves): `finish_heat`, a "finished" ping, and `close_heat` until it closes:
  as soon as everyone's finished (new), else after the grace. The results card waits ("Waiting…"), then shows the
  final places, "back to the contest", and for a guest "Keep your scores": an email (`updateUser`), whose link makes
  the guest session an account with the same id and lands on the account page to make a profile. Migration
  `20261125030000_live_heats.sql`. Tests: `npm run test:live-heat-browser` (19, two browsers riding a 1-wave contest
  on the autopilot, then the guest claims), `supabase/tests/live_heats_test.sql` (11), test/heat.mjs (rivals).
- [x] **13. Brackets** (2026-11-25). Host picks how many: up to 8 (one heat, `single`) or 16 / 32 (`bracket`).
  Migration `20261125040000_brackets.sql`: `private.build_round` makes a round's heats (one when 4 or fewer, else
  ceil(n/4): heats of 3-4 as even as the numbers allow), seeds them in snake order, draws jerseys per heat from the
  round's seed (`round_seed`: every heat of a round has the same waves); `start_contest` builds round 1 (by who joined
  first); `close_heat` locks the contest (two heats closing at once can't both miss the end of the round) and, when
  the last heat of a round closes, builds the next one from who went through (top 2 of each heat; by place, then total,
  then first seed) 30 s later (`round_break`), or ends the contest after the final. The lobby shows the bracket (rounds,
  heats, places, totals, ✓ through, greyed out), counts you down to your next heat, says when you're through or out,
  and names the winner once it's done; the results card says "You're through!" / "Knocked out" with the round and
  heat. Tests: `supabase/tests/brackets_test.sql` (20: 9, 12, 16 and 5 surfers, snake seeding, the round seed, a tie
  through by the best wave), `npm run test:bracket-browser` (11: the host against four scripted guests, round 1 to
  the final).
- [ ] **14. The profile filled in.** Public breaks (surf it) and contest results on the public page. Private contest
  management (draft, open, running, done) and history. A public contest page (`contest.html?c=`) with heats and results.
  "Watch this wave" from replays.
- [ ] **15. Score checks.** Re-run submitted ride logs (in a headless browser job, or in an Edge Function if the physics runs
  without the GPU) and flag any score that doesn't match. At first it only flags; the host sees the flags.
- [ ] **16. Surfer styling (Pro).** Wetsuit, trunks and board colours and patterns in `profiles.styling`, chosen on the account
  page, worn in your rides and shown to others in contests and recaps.
- [ ] **17. Recap video.** A recap page from a heat's rides and timeline, with broadcast cameras, a lower-third scoreboard,
  commentary written by Claude in an Edge Function and voiced by text-to-speech, `MediaRecorder` export, kept in Storage,
  and shown on the profiles of everyone in it.
- [ ] **18. App store (optional).** A wrapper app, entitlements with `source = 'apple'` (IAP or link-out, per the rules at the
  time; RevenueCat), universal links for contests and profiles, and the transport interface for Game Center if wanted.
