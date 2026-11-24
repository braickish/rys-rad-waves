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

## 3. Riding through it (in progress)

- **The barrel carries you (done 2026-11-23, the user's option 2).** On the user's 11 ft left a barrel speeding up into a
  section (curl 18 -> 41 mph over 20-47 m) left you behind: the tube's hold (1.12x the curl) was capped by the speed limits
  that stop stacked moves running away (softMax 32 mph, the acceleration taper, maxSpeed 39 mph), so you topped out ~28.
  Built waves now get `tubeCarry`: deep in the tube heading down the line you're carried at the tube's own hold, past those
  caps (they lift while the carry lasts), following the curl at up to 8 m/s^2; out of the tube the carry fades at 4 m/s^2
  (spat out, you keep its speed a moment). On that wave a rider in the barrel now holds ~4 m behind the curl at 43-46 mph,
  comes out at speed and closes back up on the curl after the section. Pipe, Trestles unchanged (their tests identical).
- **Riding through a section breaking ahead: the model has to change (found 2026-11-23).** On a test barrel with a section
  at 100 m, no line makes it: with a 0.8-2.5 s lead the rider never gets a tube; with 0.4 s, half a second then pinched.
  Partly physics: the near side peels back toward you, so riding forward takes you into water that broke earlier, and a
  tube lasts ~1.45 s (to phase 1.3); a lead over ~1 s is a closeout coming at you. But the main cause is the model: the
  curl is one point, and crossing a section it runs through at up to 25 m/s, so your place in the tube (measured from it)
  flips to "behind the curl" in a collapsing tube whatever your line. Options (the user to pick):
  1. **The section is its own peak** (Trestles' way, `RIDE.closed`): the curl stops where the section's near side meets
     it, and the section's far side becomes the new curl, peeling away at its own pace. The tube you ride through is the
     section's: in from its near end, out its far end. Biggest change, most faithful.
  2. **The curl crosses at your pace while you're in the tube:** the frame waits for a barrelled rider (up to the tube's
     life), so the tube stays measured around you. Smaller change; less true to how the section breaks.
- **Option 1 (the user's pick), done 2026-11-23.** wave.js: a built wave's curl is the edge of the broken water, as on
  Trestles: from where it is, on while the water just ahead has broken (`breaksAtBuilt`), catching up at up to CURL_MAX.
  A spot's break time comes from the curl's schedule (`curlTime`: the profile's speeds added up every 0.1 m, the game's
  clock) less its lead, and the lead is mapped **by place**, not seconds (`earlyLead`): a spot that broke `e` s before the
  builder's curl got there broke when the builder's curl was where its own clock (`builderTime`, along the break line at
  v = sqrt(peel^2 + c^2)) read that much earlier, so the game's spot breaks when the game's curl is there. (Subtracting
  seconds was wrong: the builder's curl stands still through a section, the game's still takes time to cross it.) The water
  behind the curl goes by that schedule too (behindDist), not by where the frame went. With no section the curl is the
  schedule exactly (test/sectionride.mjs: 0.00 m apart over 20 s), so every wave without one plays as before.
  On the pinnacle wave the curl runs normally to ~75 m, waits for the section to connect, crosses the 39 m that broke on its
  own at the cap, then follows the far side at its own pace (2-4 m/s in the pinnacle's lee, as the profile has it), and it
  never runs over unbroken water (the old schedule did). test/sectionride.mjs checks that, and riders holding a line get
  past sections of 0.4-1.5 s lead. Still to see in play: a tube ridden through a section, in at its near end and out the
  far end (the test bots sit at the curl and don't get barrelled on these waves).

## 4. Raglan+ (optional, the user's call)

Raglan+'s random ridges could lay out sections that break ahead too (a ridge strength that also moves its break time
earlier). Only if the built waves feel right.
