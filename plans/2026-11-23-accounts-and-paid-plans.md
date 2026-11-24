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
- **Domain:** **rysradwaves.com**. Magic-link emails come from **howdy@rysradwaves.com** through a custom SMTP sender
  (e.g. Resend), and the domain carries the site (Pages custom domain) and the Supabase auth redirect URLs.
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
  wave but Raglan (and your built break) without a Wave Pass, and a link to a locked wave lands on Raglan with a note;
  the account page shows your plan. **The lock is off until payments are live** (`PAYWALL` in src/account.js; `?paywall`
  to try it), so nobody loses a wave before they can buy one: turn it on in task 9. Tests:
  `supabase/tests/entitlements_test.sql` (17), `test:plan-browser`.
- [ ] **7. Cloud breaks.** The `breaks` table, Storage thumbnails, and **My Breaks** in the builder (save, open, rename,
  duplicate, delete, visibility), saving gated on Pro. Import from localStorage on first sign-in, plus `?break=<id>`.
  Tests: RLS (private stays private, unlisted readable by id, public listed), and a non-Pro user can't save.
- [ ] **8. Stripe.** Products and prices (test mode), the `checkout` and `stripe-webhook` Edge Functions, the Customer
  Portal link, and Stripe Tax. Tests: Stripe CLI test events → the right `entitlements` rows (buy, renew, cancel, failed
  payment, refund).
- [ ] **9. Paywall UX.** Locked waves in the picker with a "Wave Pass" sheet, "Go Pro" where building or hosting needs it,
  the plan on the account page, and the return from checkout landing back where you were. Terms and privacy pages.
  Check it end to end in test mode in the browser, on a phone too.
- [ ] **10. The contest schema on accounts.** Contests phase 2, with the changes above: Pro-gated `create_contest`, spot
  snapshots, the contest pass, `rides` with replay paths, visibility, and limits. Tests: functions and RLS, a guest
  entrant reading the spot, and a non-Pro user unable to create.
- [ ] **11. Lobby.** Contests phase 3 with sign-in for hosts, starting from a saved break in My Breaks, guests joining
  anonymously. Test: two browser contexts.
- **Jerseys in contests (the user, 2026-11-24):** each contest heat draws its surfers' jersey colours at random (from
  the heat's seed, all different, stored with the heat so every client shows the same), whatever your profile says. Your
  profile's jersey is what you wear in solo heats. The surfer wears the jersey over any outfit, at every water temperature.
- [ ] **12. Live heats.** Contests phase 4, uploading each ride's log with its score, plus "Keep your scores" (claiming
  an anonymous account) on the results card. Test: a two-player heat end to end, then the guest claims and the results
  move to their profile.
- [ ] **13. Brackets.** Contests phase 5 as written.
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
