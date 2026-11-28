# Open contests: heats you surf in your own time

Agreed with the user 2026-11-27, after the Compete screen got Solo, Live and Open (Open "coming soon": 24 hours to surf
and score). Open contests are built on Live contests (plans/2026-11-22-live-contests.md, and the accounts plan's tasks
10-17): the same tables, the same bracket, the same judging and ride checks. What changes is when the heat runs. A Live
heat has one horn and everyone surfs it at once. An Open heat is a window (a day by default): each surfer in it surfs
their heat once, on their own clock, whenever they like before the window closes.

Each step ends live on Pages with its tests passing, and the user plays it before the next starts.

## Decisions (the user, 2026-11-27)

- **One try per heat.** Pressing "Surf your heat" starts your own horn on the server: the heat's length from then. Leaving,
  reloading or losing the network doesn't stop it or give you another go; waves you caught before your horn still count.
- **No rivals' scores in Open.** You see who's in your heat and who has surfed, never their scores, until the round
  closes. The scores come out with the round's results and its recap.
- **A set length for each round.** The host sets each round's window when making the contest; 24 hours by default.
  A round opens when the one before it closes (and its bracket is drawn), so round 2 starts as soon as round 1 closes.
- **Pro only to host** (as Live), at most 3 open contests at once (the same limit, counting Open and Live together).
- **Everyone needs an account, a free one is fine.** No guests in Open: a contest over days needs you to come back as
  yourself, and to be emailed. Entering an Open contest is its contest pass, as in Live: no Wave Pass needed to surf it.
- **Condensed is a played-out bracket.** One window: you surf a session for every round, back to back, each on that
  round's waves. When the window closes the bracket is played out from those sessions, round by round. A session from a
  round you didn't get through doesn't count and isn't shown.

## How it works

- **The same waves for everyone in a round**, as in Live: a round's heats share its seed (`private.round_seed`), so each
  surfer's 1st, 2nd, 3rd wave is the same wave whenever they surf.
- **Your own horn.** `heat_entries.started_at` is set by the server when you start. Your horn is `started_at` plus the
  heat's length (minutes, or the waves heat's time limit). `submit_ride` checks your horn, not the heat's, with the same
  grace. You can't start after the window closes, and a heat you start late still ends with your own horn (the window
  stays open for anyone who started before it closed, until their horn and the grace).
- **Nothing waits for a browser.** Live heats close when a player's browser calls `close_heat`. Open contests close on a
  schedule: a `pg_cron` job every 5 minutes runs `private.tick_open_contests()`, which closes sign-ups and draws round 1,
  closes each heat whose window (and its last horn) is over, plays out the bracket, and opens the next round.
- **No-shows score nothing.** A surfer who doesn't start their heat in its window gets 0 and the last place in it (ties
  between no-shows go by seed), so the bracket always moves on.
- **Ride checks count.** Nobody is watching an Open heat, so `check-rides` (task 15) decides: when the heat closes, a
  flagged ride doesn't count. Each round's close waits until its rides are checked (or runs the checks itself).
- **Who sees what.** Rows stay readable by the contest's host and entrants (and everyone when public), but the scores
  of an Open heat that isn't closed are hidden by a view or a function, not just the UI: `rides` and `heat_entries.total`
  of an open heat are read only by their own surfer until it closes.

## Entry

- **Invite (default).** The host adds people by username (looked up in profiles) or by email. An email invite goes out
  through the `send-email` function with the contest's link. Invites sit in an `invites` table until accepted; someone
  without an account signs up (a free account) from the link and lands in the contest.
- **Open entry.** A sign-up window first (its length the host's choice, 24 hours by default): anyone with the link signs
  in and joins. The bracket is drawn when it closes. Invites can still be added to an open-entry contest.
- The size limit stays (up to 32, heats of 2 to 4). A contest with fewer than 2 entrants when entry closes is cancelled,
  and the host is told.

## Recaps (accounts plan task 17)

- **One clock for everyone.** `recap.js` orders a heat's waves by `caught_at`. In an Open heat those are hours apart, so it
  orders by time into each surfer's own heat instead (`caught_at` minus their `started_at`) and lays the sessions over one
  heat clock, as if they'd surfed together. A Live heat is unchanged (everyone started at once).
- **A recap every round.** When a round closes, its recap is ready: the heat to tell is that round's heat you were in (the
  final at the end). The "results are in" email links to it, so it's what brings people back for the next round.
- **The recap is the reveal.** With scores hidden until the close, the recap is where you first see how your rivals did.
  The results card can wait behind it ("Watch the recap" first, "Skip to results").
- **Commentary** (task 17 step 2, Claude in an Edge Function) suits Open: results come in batches and nobody needs them
  that second, so the close can write it and keep it with the recap. It comes after this plan's step 2, once rounds close
  on the server.
- **Checked rides only.** A recap shows only rides that passed their check.

## Steps

1. **The data, no UI.** *Done 2026-11-27 (20261127000000_open_contests.sql, live; also invites by username).* Migration: `contests.mode` (`live` | `open`), `contests.open_format` (`rounds` | `condensed`),
   `contests.round_hours` (an array, one per round, 24 by default; condensed: one window), `contests.entry` (`invite` |
   `open`), `contests.signup_ends_at`; `heat_entries.started_at`; `heats.window_ends_at`. `create_contest` takes them
   (Pro only, members only). `start_my_heat(heat)` sets your `started_at` once. `submit_ride` checks your own horn.
   `join_contest` refuses guests in Open. Hidden scores: open heats' rides and totals readable only by their own surfer.
   pgTAP tests in `supabase/tests/open_contests_test.sql`.
2. **The scheduler.** `pg_cron` on the project; `private.tick_open_contests()` closes sign-ups and draws round 1, closes
   heats (no-shows last, flagged rides out), builds the next round with its own window (`build_round` with the round's
   length), ends the contest after the final. Tests drive it with a moved clock.
3. **Surfing an Open heat (rounds, invite by username).** The Compete screen's Open button opens the host form: spot,
   heat length, the length of each round, entry. The contest page: your heat, who's in it and who has surfed, the time
   left in the window, "Surf your heat" (one try, said plainly before you start). The heat runs as a Live heat does
   (`live-heat.js`) without rivals on the board and without the shared clock. Open is unlocked on the Compete screen.
4. **Entry.** Email invites (the `invites` table, `send-email`), sign up from an invite, and open entry with its sign-up
   window and link.
5. **Round recaps.** `recap.js` on the one heat clock; a recap for every closed round; "Watch the recap" before the
   results card.
6. **Emails.** Your round is open; a few hours left and you haven't surfed; results and the recap are in.
7. **Condensed.** One window, a session for each round back to back (each on its round's seed), played out at the close:
   round 1's heats from round 1 sessions, then round 2's heats drawn from who went through, scored by their round 2
   sessions, and so on. Sessions from rounds you didn't reach don't count and aren't shown. The recap tells the final.
8. **Commentary** (task 17 step 2) on round recaps, written when the round closes.

Tests for each step: pgTAP for the database (`npm run test:db`), the browser tests for the pages (a new
`test/open-browser.mjs`: host, invite, surf, a moved clock to close the round, the results and recap), and the unit
tests for `recap.js` on the one heat clock.

## Open questions (for later steps)

- Can the host end a round early once everyone has surfed? (Likely yes: it closes on the next tick.)
- Does a public Open contest list on profiles and the map like a Live one? (Likely the same rules.)
