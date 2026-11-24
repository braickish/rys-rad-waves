# Barrel sections that break ahead, open at both ends

Asked by the user 2026-11-23, after the whitewater-behind-the-curl work (phase from break time, tubes collapsing into a
bore): a barreling section that breaks ahead of you, which you want to ride through, should be open on either side, a
tube you can enter from the curl's side and come out of at the far end.

Each step ends live on Pages, with its tests passing and the user trying it before the next. Rules that hold: no fudge
factors (fix causes); the other waves stay unchanged.

## What we have

- **The builder knows it already.** rays.js traces when each spot along the reef breaks (`tb` per ray). The curl it hands
  the game is the running latest of those times along the line ("time = running max of break times"), so a stretch whose
  own break time comes before the curl gets there is exactly a section breaking ahead. Today that stretch reaches the game
  only as a very fast curl (`peel`), so the game draws the curl racing through, never a peak standing up ahead.
- **The game can already draw it.** Each slice of water takes its own phase (mesh.js `slicePhases`), and since 2026-11-23
  built waves place the water behind the curl by when it broke (wave.js `PASSED`, `behindDist`). Trestles places the whole
  wave by a break-time map (`breaksAt`, `barPhase`) and already has sections that break ahead and peel back to meet you.
- **A tube is the same shape whichever way it peels:** the lip throws toward shore. A spot ahead that broke 0.8 phase ago,
  with spots on both sides that haven't broken yet, already makes a short tube with an opening at each end. The ends are
  just the unbroken wall standing up on either side.

## 1. Break times in the payload (builder) (done 2026-11-23)

- **The builder used to end the ride at such a section.** A stretch breaking > 1.5 s earlier ("meets water breaking the
  other way") or the break line jumping out to a bommie ("reaches the end of the reef") ended the side. Now (rays.js
  `sectionThrough`, `RAYS.sectionMax` 40 m) the walk looks past it: if within 40 m along the line it comes back onto the
  line it was following, still unbroken when the curl gets there, the stretch is a section the curl runs through (its
  strips put on that line, with their own break times), and the closeout rule skips it. A jump to water breaking later
  (the reef's end) and water that broke long before (the inside) still end the ride. Plain Dynamic is unchanged.
- Curl points keep their own break time (`tb`; `t` stays the curl's running max). The payload carries, per profile point,
  how many seconds before the curl gets there it breaks on its own (`e`, only where > 0.05): a lead, not an absolute time,
  because the game's curl keeps its own clock (it runs along the crest at `peel`, slower than the builder's `v` along
  the break line). Step 2 places the section by the game's own curl arrival minus `e`.
- Builder map: white dots over the curl through such a section and a white bar across the line at each end; legend entry.
- Follow-up (2026-11-23, the user: "the build breaks if there is a section"): a section entered gradually (no 1.5 s drop),
  then a stretch in the bommie's lee that doesn't break, still closed the ride out: the closeout rule now skips any stretch
  up to 40 m the curl runs through because it already broke, and smooths each 20 m angle only with stretches that touch
  it (it used to reach across gaps). Every pinnacle, ridge and ledge placement by Dynamic's right arm now rides on past
  it. The curl's speed in the payload slides its 40 m window in at the stretch's ends instead of shrinking it (through a
  section at the end it was 400 m/s; plain Dynamic's right loop had a 97 mph spike) and is capped at 25 m/s (`CURL_MAX`,
  Trestles' frameMax). In the game, built waves get Trestles' forgiving section whitewater (built.js `section`: above
  12 m/s, 3 s, 2.5x; and up to 2.5x further behind the curl before the whitewater takes you). test/built.mjs drops in on
  the pinnacle wave (full and loop).
- test/builder.mjs: a pinnacle at (920, 440) by Dynamic's right arm makes a 14 m stretch breaking up to 3.2 s ahead,
  the ride carries on to 236 m (it ended at ~80 before); plain Dynamic has none. A 10 ft 9 s +35 swell on Dynamic now also
  lists an inside wave B (left, 49 deg) whose line runs through a short section.

## 2. The game places the water by break time (built waves) (done 2026-11-23)

- Simpler than planned: no break map replacing `PASSED`. wave.js `earlyPhase` adds each spot's lead to its phase: `e` (the
  builder's seconds) x v / peel (the game's curl runs along the crest at `peel`, the builder's along the line at
  v = sqrt(peel^2 + c^2)) at the wave's own phase rate (`peelSpeed` / `phase.behind`, as behindDist). Where `e` is 0 nothing
  changes. The lead rises toward the section's peak on its near side and falls away on its far side, so the section stands
  up, breaks and peels both ways ahead of the curl. The GPU water, the lip/mist table and the riding physics all read
  `phaseAt`, so they all follow. `ridges.early` (built.js) skips it on waves without a section; profile keys a point leaves
  out read as 0.
- On the pinnacle wave (920, 440): at 9.5 s the section (~100 m) is breaking (phase 0.6-1.0) with the curl 20 m short of
  it, the water either side still unbroken (-0.8 at 88 m, -0.5 at 112 m); the curl then runs through at 25 m/s. This
  pinnacle's section isn't hollow enough for a tube (its shape `u` there is the steep wall), so it breaks as a wall.
- test/phasetime.mjs: a 3 s lead around 100 m breaks with the curl 33 m short of it, unbroken either side.

## 3. Riding through it

- The tube logic goes by phase and the tube's real height under you (rider.js `tubeDepth`, `tubeAt`), so a tube ahead
  should mostly work as is. What changes: you enter it from its open end on the curl's side (riding toward a lip
  peeling back at you), and its far end is an exit with unbroken wall beyond.
- Where the section's back-peeling side meets the curl, the two close together (Trestles' `RIDE.closed` and
  `sectionMax` rule): a short section the curl runs through at once; a long one is the inside closing out.
- Speed: the section's wall is steep ahead of the curl, so `wallPower` already pays for pumping into it. Test whether
  making it through needs a new rule, or is just the line and the speed you bring.
- Tests: a bot that pumps into the section and holds a line through the tube comes out the far end; one that goes too
  high is caught by the lip; one too slow meets the closing water.

## 4. Raglan+ (optional, the user's call)

Raglan+'s random ridges could lay out sections that break ahead too (a ridge strength that also moves its break time
earlier). Only if the built waves feel right.
