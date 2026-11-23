# Live contests: heats against other players (Supabase Realtime)

Agreed with the user 2026-11-22, after competition judging (`?judge`, src/judging.js) went in. Players join a contest by code or
link and surf the same break with the same swell seed (the same waves, in the same order), each on their own screen; a
WSL-style heads-up scoreboard shows everyone's scores live; heats end on a timer or a wave count; a small contest is one
round (best total wins), a bigger one a bracket (top N of each heat advance).

Not in scope: priority and interference, other surfers drawn on your wave (ghosts), looping waves (a loop never ends: a
contest on a built break rides its full ride). App Store: the network code sits behind a small transport interface so a Game
Center transport can be added later (see the end).

Each phase ends live on Pages with its tests passing, and the user plays it before the next starts.

## How it works

- **The same ocean for everyone, with no sync.** The sea is deterministic (sea.js `seedSea`, `nextWave`). A heat has a seed;
  each player's 1st, 2nd, 3rd ... wave is that seed's 1st, 2nd, 3rd wave of the set sequence, so everyone gets the same
  waves in the same order (with the set-to-set variation in size the seed gives), however fast they ride. Nothing about
  the ride itself crosses the network.
- **What crosses the network** is small and rare: who's in the room (presence), the heat's start time, "riding wave 3",
  each wave's judged score (score, the five judges, the shorthand), the heat's end. A few messages a minute per player.
- **Supabase** (a new project for the game, separate from spigots' "cRm"): Postgres tables for everything that must
  survive a reload or a dropped connection (contests, entrants, heats, waves scored); Realtime broadcast for the live
  scoreboard and presence for the lobby. Anonymous sign-in gives each player an id without accounts; row-level security
  lets a player write only their own waves; database functions do the bookkeeping (join, submit a wave, close a heat,
  advance a round), so no player has to stay connected as the "host" for the contest to finish.
- **Cost:** GitHub Pages plus Supabase's free tier. A 4-player 10-minute heat is on the order of a hundred messages;
  presence and the occasional reload read are the rest. (Check the free tier's current Realtime limits when setting up.)
- **No build step stays:** supabase-js from a pinned ESM CDN URL, like the rest of the game's plain modules. The project's
  schema and functions live in the repo (`supabase/migrations`), applied with the Supabase CLI as in spigots.

## The heat

- **End:** a timer (e.g. 10 min) or a wave count (e.g. 5 waves), the contest's choice. On a timer a wave counts if you
  caught it before the horn (as WSL); the horn sounds for everyone at the same server time.
- **Score:** each wave judged as now (judging.js; the judges' random seed from the heat seed and wave number, so a sheet
  is the same on every screen); your heat total is your best two waves (out of 20).
- **Ties:** the best single wave, then the second best, then the third (WSL's order).
- **Between waves:** the score sheet shows for a few seconds, then you paddle back out to the next wave of the sequence.
- **End of heat:** a results card: places, totals, who advances.

## The heads-up scoreboard (in contest mode, while you ride)

After WSL's broadcast graphic (the user's reference, 2026-11-22): a dark panel at the top left.

- Header: the heat clock counting down (or "wave 3 of 5"), the round and heat ("R2 H4").
- One row per surfer, ordered by place: a jersey colour swatch (red, white, blue, yellow, green, black, by entry), the
  name, the heat total, the best two scores, and for anyone not in first (or, in a bracket, not in an advancing place)
  what they **need**: the score on one wave that would take the place ("3.51 to adv" / "to win"; "combo" when no single
  wave could, i.e. they need two). The leader row first; your row highlighted; "P"-style marker left for later (priority
  is out of scope).
- A score popping beside the panel when someone's wave is scored ("8.50"), yours or another surfer's.
- On a phone: the panel shrinks to the clock and the two rows around you, tap to expand.

**Needs:** with the target total T (the leader's, or the last advancing place's) and your two best b1 >= b2, one new wave
w replaces b2, so you need w > T - b1 (to 0.01), shown if it's <= 10, else "combo".

## Formats

- **One round:** up to ~8 surfers in one heat together (everyone sees everyone); best total wins.
- **Bracket:** more than that, heats of 3 or 4, the top N (2 by default) advancing; rounds until a final of 4 (or 2). All
  heats of a round run at the same time on the same break with the round's own seed; a round closes when every heat in it
  has ended; seeding into the next round by heat place then total (snake order), worked out in the database so it doesn't
  depend on who is still online.

## Phases and tasks

### 1. Solo heat mode (no network)

The heat engine and the scoreboard on their own, so they can be played and tested before any of the network exists.

- `src/heat.js` (pure): a heat from { seed, end: { minutes | waves }, surfers }: the wave sequence (sea.js seeded per heat),
  best two, totals, places, tie-breaks, `needs`, the horn rule. A "bot surfers" option fills the other rows with scores
  drawn per wave (so the scoreboard has rivals to test against).
- The HUD panel (index.html + main.js): the layout above; the score pop; the end-of-heat results card.
- Flow: `?heat=10m` or `?heat=5w` (with `?judge` implied): the heat clock runs, waves come in sequence, the sheet between
  waves, the results at the end; works on every wave and on a built break's full ride.
- Tests (`test/heat.mjs`): the same seed gives the same wave sequence; best two and places; needs (to win, to advance,
  combo); ties; the horn (a wave caught before it counts, one after doesn't); wave-count end.

### 2. The Supabase project and schema

- A new Supabase project for the game; anonymous sign-ins on; the CLI linked in the repo (`supabase/`), as in spigots.
- Tables: `contests` (code, host, spot: a wave id or a built payload (full ride), seed, end rule, format, state),
  `entrants` (contest, player id, name, jersey, seed rank), `heats` (contest, round, heat number, seed, starts_at, ends_at,
  state), `heat_entries` (heat, entrant, place, total, advanced), `waves` (heat, entrant, wave number, score, judges, sheet,
  caught_at).
- Functions: `create_contest`, `join_contest(code, name)`, `start_contest` (host), `submit_wave` (checks the heat is on and
  the wave was caught before the horn, by server time), `close_heat` (places, advancing), `advance_round` (the next round's
  heats and seeding). A short random contest code (6 letters, no look-alike characters).
- Row-level security: anyone signed in can read a contest they've joined; a player inserts only their own waves; only the
  host (or the functions) change contest and heat state. Limits on names (length, characters) and on submissions per heat.
- Tests against the local stack: the functions' bookkeeping, RLS (a player can't post another's wave or change the heat).

### 3. Lobby: create, share, join

- Create a contest from the title screen (choose the wave) or from Build a Break ("Start a contest" with the current break,
  full ride), choosing the end (timer / waves) and the format (one round / bracket, heat size, how many advance).
- Share: the code and a link (`…/rys-rad-waves/?contest=K7QM2P`); the link opens straight into the lobby; a "join a
  contest" field on the title screen takes the code.
- Lobby: everyone present (presence), their names and jersey colours, the format; the host's Start. Names: a nickname, no
  accounts (kept in this browser with the anonymous session, so a reload rejoins as you).
- Tests: two browser contexts join one contest and see each other (headless Chrome, as test/drive.mjs).

### 4. Live heats

- Start: everyone's heat clock runs from the heat's server start time (a clock offset from the server, measured at join).
- While riding: your scored waves go to `submit_wave` and out on the heat's broadcast channel; others' arrive in the HUD
  and its score pop; a reload or a dropped connection rejoins and refills the scoreboard from the tables.
- The end: the horn (timer) or your last wave (wave count; you wait, watching the scoreboard, until everyone has ridden
  theirs or the heat's time limit passes); `close_heat`; the results card; in a bracket, on to the next round's lobby.
- Tests: a two-player heat end to end in headless Chrome (bot riders), scores and places agree on both screens.

### 5. Brackets

- Round building, heats per round, seeding, the final; the bracket view between rounds (heats, totals, who went through).
- What if someone leaves: they score 0 for the rest of the heat; the round still closes on time.
- Tests: 9, 12 and 16 entrants make sensible rounds and a final; ties advance by the tie-break.

### 6. Polish and later

- The share sheet on phones; contest history (your past contests and results); a replay of the final's best waves.
- The transport interface (join, send, broadcast, presence, on message) so an iOS app could add Game Center matches
  later without touching the game; universal links for contest links in an app.
- Priority and interference, a shared lineup, ghosts: out of scope for now.

## Open questions (defaults in the meantime)

- Biggest contest: 32 entrants.
- Heat size and advancing: 4, top 2.
- Timer and wave options offered: 10 / 15 / 20 min; 5 / 8 / 10 waves.
- Who can start: the contest's creator only.
