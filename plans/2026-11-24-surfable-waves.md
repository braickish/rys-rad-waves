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

## 1. Fun / Real and size, in the builder (the controls, no Fun pass yet)

- builder.html / ui.js, by the DROP IN button: **Fun / Real** (two buttons, Fun the default; saved with the reef and in the
  link) and **Size**: a scale override on the wave the swell makes (e.g. 0.5x-2x, 1x the default), shown as the wave
  height it gives ("~6 ft -> ~9 ft"). The swell still drives the model (where and how it breaks, peel, shape); the
  override only scales the wave you ride, the way Pipe's `?size` does (sizes, lengths and speeds by the usual rules).
- Payload: `fun: true|false`, `scale: k` (v stays 1; missing = Real, 1x, so older links ride as before).
- Game: built.js `applyBuilt` applies `scale` on top of the breaker height (`sizeK`); `fun` is read but does nothing yet.
- Tests: test/builder.mjs (the payload carries both; defaults); test/built.mjs (scale 1.5 makes the face 1.5x taller and
  the curl sqrt(1.5)x faster; scale missing = today's numbers).

## 2. Measure first: what built waves actually do

Before choosing any limit, a survey: the builder over its presets (Dynamic, beach, stacked) and a few hundred random reefs
(random blocks, swells), logging per ride: peel speed (spread, extremes), how fast it changes (mph per second of curl),
shape (time at each kind, how long barrels last, how often it sits between kinds), tube heights, section leads (`e`), size
along the ride, takeoff and ending. Written up in the plan (a table) and kept as test/survey.mjs (slow; run by hand).
The targets come from the game's own comfort zone: Raglan's ~17-19 mph pace, sections up to ~1.45x that (Raglan+'s
`fast`), tubes at least `tubeMinHeight` 1.3 m and ~2 s long, the tube's life ~1.45 s (to phase 1.3).

## 3. Fun: limit how fast things change (the biggest win for feel)

- A new module (src/builder/fun.js, pure, used at DROP IN on the payload): along the profile, cap how fast the curl's
  speed may change (per second of curl, so it's the same feel at any size) and how fast the shape (`u`) may change; a rise
  that's too fast is spread out ahead of where it was (the section starts earlier and builds), never cut.
- Light smoothing of everything (~3 s of curl) so the wave reads as changing, not twitching; the ray noise goes.
- Tests: test/fun.mjs: on the user's 11 ft left (curl 18 -> 41 mph in ~2 s) the rise takes at least the chosen time; a
  steady wave comes through unchanged; Real is untouched.

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
