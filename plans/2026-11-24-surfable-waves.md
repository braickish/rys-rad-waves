# Surfable waves: a Fun version of the builder's wave

Agreed with the user 2026-11-24, after a day of playing built waves: the builder's wave is the literal physics of the reef,
and some of it is no fun to surf (a takeoff creeping at 7 mph, sections at 41-45 mph, a barrel speeding up 18 -> 41 mph in
~2 s, waves that are 60-75% barrel the whole way, sections breaking 2-3 s ahead that are closeouts in disguise, the size
drifting 3.4 -> 2.2 m along the ride, ray noise). The builder stays honest: it always shows the real wave. What DROP IN
sends can be a Fun version of it: the same wave's character, its extremes tamed.

Each step ends live on Pages, with its tests passing and the user trying it before the next. Rules that hold throughout:
the builder's physics are untouched (the Fun pass works on the payload, after loop.js `wavePayload`); Real is exactly
today's wave (its tests' output identical); the other waves (Raglan, Raglan+, Pipe, Queens, Trestles) unchanged.

## What stays literal in Fun

Which way it breaks, roughly how long the ride is, where its features are and in what order (the barrel at the takeoff,
then the fast stretch, then the inside), and its relative difficulty (a hard reef stays harder than an easy one).

## 1. Fun / Real and size, in the builder (the controls, no Fun pass yet) (done 2026-11-24)

- builder.html / ui.js, by the DROP IN button: **Fun / Real** (two buttons, Fun the default; saved with the reef and in the
  link) and **Size**: a scale override on the wave the swell makes (e.g. 0.5x-2x, 1x the default), shown as the wave
  height it gives ("~6 ft -> ~9 ft"). The swell still drives the model (where and how it breaks, peel, shape); the
  override only scales the wave you ride, the way Pipe's `?size` does (sizes, lengths and speeds by the usual rules).
- Payload: `fun: true|false`, `scale: k` (v stays 1; missing = Real, 1x, so older links ride as before).
- Game: built.js `applyBuilt` applies `scale` on top of the breaker height (`sizeK`); `fun` is read but does nothing yet.
- Done: the ride panel's Wave row (Fun / Real, a line saying what each is) and a Size slider (0.5-2x, shown as the height
  you'll ride; the gun suggestion follows it). The payload carries `fun` and `scale` (the panel adds them; older links have
  neither). built.js scales the breakers by `scale` and the speeds (profile peel and `c`, `base`, the leads `e`) by
  sqrt(scale); the reef's lengths stay. test/built.mjs: 1.5x makes the face 1.5x taller (2.45 -> 3.68 m) and the curl and
  the wave sqrt(1.5)x faster; 1x or none is the wave as before.

## 2. Measure first: what built waves actually do (done 2026-11-24)

test/survey.mjs (slow, run by hand): the builder over its presets and 200 random reefs (a peak with one or two arms,
random angles, slopes, lengths, depths and sizes, 0-3 extra blocks, random swells 0.8-4.5 m, 8-18 s, +-30 deg; 30% on deep
water), every ride you could DROP IN on (each side of each listed wave, its full ride). 2026-11-24:

```
506 rides from 200 random reefs + 3 presets (103 s)
                                                  5%    25%    50%    75%    95%
curl speed: slowest on the ride                  2.3    3.7    8.3   13.8   22.6  mph
curl speed: median                               3.0    6.4   12.4   18.2   28.5  mph
curl speed: fastest on the ride                  3.7    8.8   16.5   25.4   54.9  mph
peel angle: smallest (fastest)                     9     25     33     44     64  deg
peel angle: largest (slowest)                     30     40     54     70     70  deg
curl speed change: steepest                      0.0    0.2    1.5    5.0   46.9  mph/s
shape change: steepest                          0.00   0.00   0.00   0.12   0.49  scale/s
time between shape kinds                           0      0      0     34     91  %
barrels: each one's length                       1.7    3.2    5.9    9.7   22.5  s
barrels: smallest tube on the ride              0.81   1.32   1.57   2.05   3.28  m
section lead: longest on the ride               0.00   0.00   0.00   0.28  16.77  s
size along the ride: largest / smallest         1.00   1.06   1.21   1.60   3.29  x
takeoff (first 30 m): curl speed                 3.0    5.5   10.6   16.5   28.2  mph
breakers                                           2      3      5      8     13  ft
ride length                                       98    144    230    427    755  ft
rides with a barrel 7% · a barrel under 2 s 1% · a tube under 1.3 m 2%
rides with a section lead > 0.8 s 20% · > 1.5 s 16% · curl over 40 mph 11% · under 10 mph 60%
rides changing speed faster than 10 mph/s 15% · 20 mph/s 10% · size varying > 1.3x 39%
how rides end: reaches the end of the reef 41% · meets water breaking the other way 32% · closes out 25% · reef 1% · backs off 1%
```

What it says:
- **Slow is the biggest problem, not fast.** 60% of rides have a stretch under 10 mph; a quarter have a median curl under
  6.4 mph, and a quarter reach the back-off floor (70 deg) somewhere. Takeoffs too: a quarter under 5.5 mph.
- **Jumps:** 15% of rides change curl speed faster than 10 mph a second, 10% faster than 20 (the steepest 5%: 47 mph/s).
- **Too fast:** 11% go over 40 mph somewhere.
- **Shape limbo:** most rides are clean, but a quarter spend over a third of the ride between shape kinds.
- **Leads:** 20% have a section breaking over 0.8 s ahead, 16% over 1.5 s (closeouts in disguise; some are inside waves
  whose outside broke long before).
- **Size drift:** 39% vary over 1.3x along the ride (the steepest 5%: 3.3x).
- **Barrels** are only 7% of rides; when there is one it's mostly long enough (1% under 2 s) and big enough (2% under 1.3 m).

The limits for steps 3-8 (all scaled to the wave: speeds by sqrt(breakers / 3.5 m), from Raglan's own pace, 8.3 m/s on its
~3.5 m breakers; `v0` = that pace for the wave's size):
- step 3: the curl's speed changes at most **6 mph a second of curl** (x sqrt of the size); the shape at most 0.25 of the
  scale a second; ~3 s smoothing.
- step 4: the curl's speed within **0.75 v0 to 1.6 v0**, and never under 10 mph (the rider's slowest trim, `vLow` 4.5 m/s):
  on 5 ft breakers ~10-19 mph, on 11 ft ~13-30.
- step 5: snapped to its kinds with ~1.5 s blends; a barrel at least 3 s of curl and 1.3 m of tube, else the steep section.
- step 6: size along the ride within +-20% (largest / smallest at most 1.5).
- step 7: leads capped at 0.8 s; a stretch breaking over 1.5 s ahead becomes the ride's closeout ending.
- step 8: the first 25 m at v0, easing into the profile over the next 25.

## 3. Fun: limit how fast things change (the biggest win for feel) (done 2026-11-24)

- A new module (src/builder/fun.js, pure, used at DROP IN on the payload): along the profile, cap how fast the curl's
  speed may change (per second of curl, so it's the same feel at any size) and how fast the shape (`u`) may change; a rise
  that's too fast is spread out ahead of where it was (the section starts earlier and builds), never cut.
- Light smoothing of everything (~3 s of curl) so the wave reads as changing, not twitching; the ray noise goes.
- Tests: test/fun.mjs: on the user's 11 ft left (curl 18 -> 41 mph in ~2 s) the rise takes at least the chosen time; a
  steady wave comes through unchanged; Real is untouched.
- Done (src/builder/fun.js `funPayload`, applied by built.js after the size override): smoothing 1.5 s of curl (3 s cut a
  short section's peak); the rate limit spreads a too-steep change **both ways** (the high side down, the low side up, half
  and half, until every step is within 6 mph/s x sqrt(size); the shape within 0.25/s). Spreading it only ahead, never cutting
  a peak, as first planned, pushed a section's speed-up into the takeoff: on the user's 11 ft left the takeoff barrel ran at
  21-35 mph and both test bots went over the falls in ~3 s. Now on that wave: the steepest change 17.3 -> 6.0 mph/s, the
  section stays at 50 m, 45 -> 38 mph, the takeoff stays at 18. test/fun.mjs. Bots there: trimming 7.1 s Real / 6.6 s Fun;
  the pumping bot (it climbs, and high in a barrel is over the falls) 12.8 / 2.4 s: it gets into the takeoff barrel on Fun
  and not on Real; step 8 (the takeoff) is where that's handled.

## 4. Fun: peel speed compressed into a makeable band

- Map the real peel angle (~25-70 deg) into a band (from step 2, e.g. ~30-60 deg) by a smooth, monotonic curve, so slow
  stays slower and fast stays faster, but a section is "pump hard", not impossible, and a near-back-off takeoff still moves.
  `base` (what trimming holds) recomputed from the compressed profile.
- Tests: the order of speeds along the ride is kept; nothing outside the band; the user's 7 mph takeoff and 45 mph
  section land inside it.

## 5. Fun: clear shape zones

- Snap `u` toward its kinds (crumbly 0, wall 1, steep section 2, barrel 3) with short blends between, so a wave isn't a
  half-barrel the whole way; a barrel at least ~3 s of curl long (shorter: it becomes the steep section), and where a
  barrel is shown, tall enough to fit in (else the steep section).
- Tests: time spent between kinds (from step 2's survey) down to brief transitions; barrels long enough and tall enough;
  the user's 2.6-2.75 wave becomes barrel or steep section, not limbo.

## 6. Fun: size along the ride

- The size's variation along the ride squeezed to about +-20% of its middle (the user's 3.4 -> 2.2 m becomes ~3.0 -> 2.6);
  the Size override (step 1) then scales the whole thing. The board follows the size as the gun does now.
- Tests: the spread; the ride's middle size unchanged; Real untouched.

## 7. Fun: sections ahead are makeable or an honest closeout

- A section's lead (`e`) capped at about the tube's life (~0.8 s), so it's an open-ended barrel you can thread
  (open-barrel plan step 3); a stretch that breaks much longer ahead becomes a deliberate closeout, the ride's ending, not a
  trap in the middle.
- Tests: test/sectionride.mjs's bot gets through every capped section; a long-lead stretch ends the ride there.

## 8. Fun: a clean takeoff and a real ending

- The first 20-30 m a steady wall at a comfortable pace (the band's middle), easing into the wave's own profile.
- The ride ends with a back-off (the wall easing, the curl slowing, the ride ending as now) or a closeout finale (the inside
  standing up and going at once), whichever the real wave does, instead of the curl just stopping.
- Tests: the takeoff stretch steady; the ending one of the two.

## 9. In the builder: show what Fun changed

- A ghost line beside the real curl: the Fun wave's curl, coloured the same way (how it breaks), drawn when Fun is on; the
  panel's numbers for both ("peels 31-64 deg real, 34-58 fun"). Hovering the line shows what changed there (e.g. "section
  spread over 40 m", "lead capped: open-ended barrel").
- Tests: test/builder.mjs: the ghost line's profile is the payload DROP IN sends.

## Later (if wanted)

- A Fun strength (a slider between Real and Fun) once each part is tuned; per-part toggles for testing.
- The same pass for the other waves' sets (Trestles' maps) if they ever need it.
