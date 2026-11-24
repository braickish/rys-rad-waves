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

## 1. Break times in the payload (builder)

- loop.js `wavePayload`: per profile point, the time it breaks on its own (`tb`, s after the stretch's start), next to
  `peel`. Loops: times wrap with the lap (the seam crossfade as for the other keys).
- builder.html: draw a section that breaks ahead (own time earlier than the curl's) in its own color, with both ends
  marked, so you can see it before you drop in.
- Test: test/builder.mjs: a reef bump ahead of the line (a focusing lump) gives a stretch with `tb` earlier than the curl.

## 2. The game places the water by break time (built waves)

- wave.js: a built wave with `tb` gets a break map like Trestles' (`breaksAt` from the profile); the phase everywhere,
  ahead of the curl too, is the time since that spot broke (negative before it does). The curl frame stays the running
  latest (as `RIDE.front`), so riding is unchanged where nothing breaks ahead. Replaces `PASSED` for these waves (the
  map holds the same information); older links without `tb` keep today's behavior.
- The section's shape: blend toward the tube set by the profile's `u` there, as now.
- Check: screenshots from the channel (`cam=3`) of a section standing up, throwing and peeling both ways; plots of the
  phase along the wave over time.

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
