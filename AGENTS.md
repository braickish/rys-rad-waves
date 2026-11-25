# Ry's Rad Waves

A WebGPU surfing prototype: one endless peeling wave that barrels, a surfer you steer along the face,
and GPU particle spray. It's an original game in the spirit of the PS1/PS2 surf games, not a remake of
any of them. Plain ES modules, no build step, no dependencies. Static site (GitHub Pages ready).

## Run

```sh
python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

It needs a WebGPU browser (recent Chrome/Edge, or Safari on macOS/iOS 26+).

Waves (2026-11-17 names, after real waves): **Raglan** (`point`, the crumbling point; was "Mellow Point"), **Raglan+**
(`raglanPlus`, Raglan with random faster sections; see below),
**Pipe** (`reef`, the simulated barrel; was "Reef Barrel"), **Queens** (`queens`, a small longboard wave: a right, ridden regular foot; see below),
**Trestles** (`trestles`, Lower Trestles: a right that changes as you ride it; see below). The title
screen (2026-11-25, the user) lands on three buttons, styled like DROP IN, with the demo surfer riding behind: **Free surf** (every break as the
original pills, then your saved breaks the same way when signed in, and DROP IN; a saved break reloads with `?break=<id>&pick`,
which boot.js loads without dropping in), **Build a reef** (builder.html) and **Compete live** (**Solo**: the waves, then
**Start heat** (DROP IN's style) with its length (10 minutes or 5 waves, remembered) as small text below it, a dropdown; against bots; live
heats with friends later; **Host a contest** and a code field to **Join**, and the lobby at `?contest=<code>`:
src/lobby.js, src/contests.js; accounts plan task 11). Build a reef and Compete live are Pro: without it (once sales are open, `SALES_OPEN`) they show greyed with 🔒 and a tap opens the Go Pro sheet; joining stays free: a contest link reaches its lobby, and "Have a contest code?" under the buttons opens just the code box. A `?heat=` link opens on Solo; `?menu=surf`, a
`?break=` link, or a link to a locked wave opens Free surf.
URL options: `?wave=point|reef|queens|trestles` (older `?wave=barrel` / `crumble` still work), `?play` (skip the
title), `?auto` (autopilot works the pocket; a test can set `window.__manual = true` to take over the keys), `?xs=-4` (start behind the peel), `?cam=1` (chase
camera), `?cam=3` (testing: fixed out in the channel, looking at the curl side-on, like a photo
from the channel; used to compare the reef with reference photos), `?noparticles`. `?size=1.75` (the reef this many times
bigger, for trying sizes; works with `?sim`): reef.js `sized()` scales the cross-section (`scale`), the
lengths along the wave (`phase`, `pocket`, whitewater, `curlZone`, `startXs`), the peel and wave speeds by
sqrt(size) (as sets do), the riding camera's distance (`WAVE.sizeK`) and when the barrel view ends. The barrel's
catch rules go by place along the curve, phase and real height in the tube, so they scale on their own
(at 1.75 on `?sim`, riders are caught at 79-93% of the tube's height, as at size 1). On the bigger face the
drop takes longer, so a slash needs a later bottom turn (test/slash.mjs's player-timing check only tries
up to 0.8 s and fails at `SIM=1 SIZE=1.75`; from 1.4 s it slashes).

**Raglan look** (2026-11-18, the user; raglan-1.PNG / raglan-2.PNG in braickish/reference-images): its own keyframes
(point.js `KF_RAGLAN`, blends of the shared sections): ahead of the curl the face stays steep and nearly full height a long
way down the line (~2.7 m tall at 35 m out, still ~2.4 at 60 m) before easing into swell; behind the curl it crumbles as
before (`KF_CRUMBLE`, which Queens still uses). Cold green water (`green: 1`: bottle-green body, greyer teal-green flats,
a muted emerald glow through the top of the face, which now runs all along the wall, `thin`). The surfer wears a black full
wetsuit there (`outfit: 'wetsuit'`, main.js `bodyColors`: neck to wrists and ankles, painted per body and outfit).
The taller shoulder carries speed further out: test/pocket.mjs's pocket bot now averages ~43 m out (was ~9 m), S-turning ~19 m
(was ~11); the moves' numbers barely changed.

**Raglan+** (`raglanPlus`, src/waves/raglan-plus.js; 2026-11-22, the user; plain Raglan kept): Raglan with random faster
sections. Reef ridges (wave.js `ridges`, `RIDGE`, `ridgeAt(xs)`): a ridge makes the wave stand up steeper and peel
faster ("a ridge causes a local increase in seabed gradient and leads to a wave section with a steeper face and lower
peel angles", Mead & Black 2001 on Raglan, via Scarfe et al. 2002), so one strength per spot along the beach drives
both. The shape blends toward a section shape (`shapes[1]`: Raglan's own, face drawn in to 0.66, 1.1x taller, lip
pitched slightly; mid-face ~52 -> ~65 deg, ~73 higher up, 3.5 -> 3.8 m) by the ridge under each slice (the GPU gets it
per slice: `slicePhases` is now [xs, phase, ridge, 0], shaders.js `tableAt`; the physics via `controlPoints(.., xs)`),
and the curl runs `fast` 1.45x faster by the ridge where the curl is (base peel 7.6 m/s, ~17 mph; sections ~22.5-24.6
mph), added up as it goes (`RIDGE.c`). Ridges are fixed to the reef, so a section walls up ahead before the curl gets
there. Each wave lays out its own (`ridges` ranges: first 40-90 m, then every 70-140 m, 15-30 m either side, strength
0.75-1.0; seeded with the sea). Trimming holds the wave's own pace through a section (wave.js `holdPeel`; the user: as it
speeds up you need to pump) plus, since 2026-11-22 (the user: sections were hard to make), up to `SECTION_HOLD` 0.5 of the
section's extra curl speed by how steep the wall is at the curl (Raglan+: the ridge strength; built waves: the shape past
Raglan's wall): the steeper face pulls you along harder; sections.mjs: pumping makes 9 of 9 (was 6 of 9), trimming 2 of 6, and carving the steep wall pays (`wallK` 0.65, `wallAngles` [55, 63]). `node
test/sections.mjs`: a mid-face trimmer makes 1 of 6 sections (caught ~10 s in), the pocket-pumping bot 6 of 9 (~23 s
rides). crest.mjs runs Raglan+ without ridges. GPU ~+1 ms.
**Reef edges** (2026-11-24, the user: allow more sudden changes, like a lot of reefs): a global builder setting, Sharp (the
default) or Soft, under the coast. Sharp fades every reef piece in over a quarter of its distance (10 m; channels 8; blocks.js
`reefComponents(.., edges)`, `EDGE_FADE`), and the analysis follows the reef closer (rays.js `analyse(.., { sharp })`: a 3-strip
median instead of 5; loop.js: the curl's speed over 20 m instead of 40, how it breaks over +-10 m instead of +-20); the payload
says `sharp`, and Fun then lets the wave change faster (8 mph/s, the shape 1.5/s: a ledge still jacks up). Called without it
(tests, survey, Dynamic's FUNWAVE checks) it's Soft, as before.

**Built barrels: the almond and the ledge** (2026-11-24, the user). The built waves' barrel (shapes.js `KF_ALMOND_HEAD`, Real
and Fun) is an almond: the lip throws out and curves down to land in front, the back wall rises concave, the opening leans
forward, ~0.89x the breakers tall (2.66 m on 3 m), so it fits from ~1.5 m breakers. Past it, **the ledge** (`KF_LEDGE_HEAD`,
after Teahupoo: a near-vertical wall up from deep water; a short back, a lip half the wave thick thrown far out, a round tube
as wide as it's tall; down at the water the same reference as every other shape, the trough ~-0.45 and the flats untouched,
the user: no dipping where a wave is a ledge; the height it had from the drawdown kept by lifting the rest instead, so it
jacks up: ~15% more face than the barrel on the same swell, scaled as the barrel is): the shape scale runs 0-4 (crumbly,
wall, steep section, barrel, ledge). The builder reads it from rays.js `step` (the steepest seabed within 30 m seaward of the
break: an arm ~0.10-0.15, the Ledge block ~0.20-0.25) on a hollow wave (loop.js `shapeIndex`, `ledgeK`); the Ledge block is
now a true ledge (8 m wall on a 1:1 face, was 4 m on 1:3) and the curl is drawn in its own colour there. A ledge in front of a
peak isn't reached: the peak's ramp breaks the wave first. Pipe keeps its simulated tube. Turning in the barrel is damped 70%
deep in (was 60%), and holding crouch there damps what's left 35% more (`tubeCrouchDamp`; test/tubeturn.mjs).

**Behind the curl, by when it broke** (2026-11-23, the user: behind the curl it should look broken and connected): on
waves with ridges (Raglan+, built waves) the curl's speed varies, so the water behind it is placed by the time since the
curl passed it (wave.js `PASSED` history, `behindDist`), at the wave's own pace (`peelSpeed`), as Trestles' bar does. A
steady wave at that pace looks exactly as before; behind a fast section a long stretch is at nearly the same stage.
`node test/phasetime.mjs`.
**Whitewater that lasts, tubes that collapse** (2026-11-23, same ask): shapes.js `withBore` replaces each wave's shapes after
its last broken keyframe with a bore (`boreKF`: a rolling foam wall, its base and a foam apron ahead) that keeps FUNWAVE's
heights (`BORE_DECAY`: 100% at 3 s, 96% 6 s, 84% 10 s, 67% 15 s, 53% 21 s, 37% 30 s), by each wave's own phase rate (`sOf`).
Barrels (Pipe's sim and classic shapes, the built tube) first collapse: the cavity flattens under the lip (half way to
`collapse`), then a steep foam wall stands where the lip landed (`collapse` 1.65; the tip, point 8, stays at its base,
so the lip never pulls back up). Raglan, Raglan+ and built waves get the lasting whitewater; Queens and Trestles are
unchanged. Far behind, the bore holds ~2/3 height (the GPU table ends at phase 15). Riding tests unchanged.
The look (shaders.js water, every wave): whitewater behind the curl (phase 0.2+, with foam) is lumpy (vertex bumps along
the normal, rolling toward shore, 0.3 x scale), lit mostly by the sky with lumpy normals (the sun is usually behind the
wave, so sunlight alone left it one flat white), thins across the bore's apron (t 12.5-15) instead of ending in a line,
and goes patchy with age (phase 3-12) in place of the old 50% fade 10-40 m behind. The mist haze runs along the bore.

**Feet on every wave** (2026-11-18, the user: carry Queens's Up/Down walking to the other waves): all waves have
`walkKeys`, so Up/Down (and up/down swipes) move the feet and only Left/Right turn. On Queens they walk the longboard
(tail / middle / nose, below). On the shortboards (Raglan, Pipe: `shuffle`) they shuffle the feet one spot, subtly,
in `shuffleTime` 0.2 s: back (-1), middle (0, the normal stance; where you start) and forward (1) (rider.js `r.shuf`;
drawn as a real shuffle: the leading foot (back foot going back, front foot going forward) lifts ~6 cm, moves and lands in 0.13 s, then the other foot (`pose.shuf`); spots 15 cm apart since 2026-11-18, the user:
back 10 cm behind the board's stance, middle 5 cm ahead of it, forward 20 cm ahead; the riding effects unchanged). Back: sharper turns (`backRadius` 0.9, `backTurn` 1.1),
slightly more pivot (`backPivot` 0.05 of the turn rate stops depending on speed; turning scrubs `backScrub` 0.03 per
radian), slightly slower (`backSpeed` 0.95). Forward: helps you accelerate (`fwdFeed` 1.25, `fwdAccel` 1.15,
`fwdSpeed` 1.04) and turns more rail to rail (`fwdRadius` 1.15, `fwdTurn` 0.9). `node test/shuffle.mjs` measures it:
back turns ~17-24% sharper and runs ~1 mph slower, forward turns ~12-17% wider; the middle is unchanged.
**The stall** (2026-11-23, the user; every board): already all the way back (the shortboard's back spot, the longboard's
tail), Down (or a down swipe) again pushes hard on the tail: for `stallTime` 0.5 s (held, as long as you hold Down) it scrubs
`stallScrub` 5 m/s^2 (~11 mph/s) and halves the pocket's pull (`stallHold`), and in a built barrel the carry eases the same, so
you sink deeper or let the curl catch up. You keep steering; moving the feet off the back ends it. Flash "Stall" (no
points). `node test/stall.mjs`: shortboard 17 -> 11 mph in 0.6 s, longboard 9 -> 4. On a steep face (`handSteep` 45 deg or more under you, or in the tube; the user, 2026-11-23: in the barrel
and right outside it), heading flat along it or a little down (`handHeading`: ~9 deg up to ~33 deg down; climbing it's the
tail), the stall is a hand in the face instead (rider.js `r.handDrag`). Pose from frontside-barrel-stall /
backside-barrel-stall (braickish/reference-images), surfer.js: a deep crouch; the back hand cuts the water where the back
shoulder drops onto the face (the deck's plane: on a steep face that's beside you on the wave side, about an arm's length;
the shoulder reaches up to 0.35 m to meet it), a little behind (more backside, by the tail). Frontside the torso leans out
over the toe rail and the front hand is low by the front knee; backside a deeper squat, upright and open, the front arm out
forward at shoulder height down the line. White where the hand cuts the water: a short streak trailing behind it (shaders.js,
`F.hand` from surfer.js `pose.handTouch`). `node test/stallpose.mjs` draws both poses (test/out/stallpose.png) and checks the
hand meets the water. Same scrub. `?cam=4` (testing): a front-on close-up.
The Up = Left / Down = Right steering below still exists in the rider (`tilt`, tested) but no wave's keys use it now.
Controls (before 2026-11-18; Queens was the exception: see `walkKeys` below): one control, from the surfer's point of view. Left (or Up) turns the board to the surfer's
left, Right (or Down) to their right; Up is exactly Left and Down exactly Right in every situation
(tested). Riding right along the wave, the surfer's left is up the face. Air spins turn the same way
(about the face normal at takeoff). Holding a turn progressively leans you into it harder (`hardAfter`: tighter arc,
more drive, more rail roll). C switches camera (`?cam=2` is a
close-up for testing). Shift crouches, only needed on the barrel wave. Touch: swipes do exactly what the keys
do (swipe left/up = Left, right/down = Right, harder the further you swipe; anywhere on the
button).

## Trestles: a wave that changes as you ride it

Added 2026-11-19 (the user's idea, 2026-11-17: modeled on Lower Trestles; then "make it feel like the actual real
Trestles wave any way we can"). Research, simulations and the pipeline for new runs: `~/workspace/research/trestles`
(README there).
- **When each part breaks** (`src/waves/trestles-breaks.js`, generated by `research/trestles/trestles_breaks.py` from
  FUNWAVE): for two clean simulated waves (each ride takes the next), every 2 m along the crest, when it breaks. A
  spot's phase is the time since it broke (`phaseTime` s per unit; before, minus the time until it does), so the whole
  wave is the simulated one: the peak, the left peeling away, the right with its sections, the inside peak breaking on
  its own ahead and peeling back to meet you (the closeout). `play` (default): each stretch's curl speed is the sim's
  / 2.4 (sections keep their relative speeds: the middle ~60% of the takeoff, as in the sim), at-once stretches capped at 12 m/s (`?nocap`: no cap, rides end ~8-10 s in); `?literal` (LITERAL=1 in node): the sim's own times (~5-9 s rides).
  `wave.js`: `RIDE` {time, front (the curl: edge of broken water running down the right), c (the frame, chasing the
  curl at up to `frameMax`), closed}, `breaksAt(d)`, `startRide` (rides start `lead` 1.5 s before the peak breaks).
  The curl stops where it runs into water that broke before it (RIDE.closed): caught = "The inside closed out!",
  out past it the ride ends `end` s later ("You rode it to the end of the wave!", flashed END OF THE WAVE).
- **Shapes** (`src/waves/sim-trestles.js`, `trestles_keyframes.py`): per section (takeoff, middle, inside, a set wave's
  inside) from 2D BEM runs on real profiles, plus the shoulder: the same sims 3-15 s before breaking (s -3 to -15), so
  the shoulder keeps its height (the user's reference trestles.jpg). The lip lands about half way down the face: the
  tube is small and up on the face (`tubeFloor`). All sets share the phase stops and blend point by point.
- **Shape blending**: `wave.js` `SHAPES` / `SHAPE` {a, b, w, ver} (`withShape(i, fn)`); the GPU water table holds one
  table per set and the shader mixes two (`W.setA/setB/blend`); the rider's line tables are per set and blended.
- **Water texture flow**: by the frame's speed added up (`flow`), never time x peel speed (that lurched when it changed).
- **Tube too small?** (the user: then you go around it) `tubeMinHeight` 1.3 m: ~1.4 m on the takeoff and middle,
  ~1.1 m on the inside (not rideable), ~1.35-1.6 m on a 1.15 set wave. Caught under a too-small lip: "Clipped by the lip!".
- **The top of the face** (snaps, airs, floaters) by real height: the face-top table covers the whole shoulder (s -15 up;
  it used to start at -0.4, reading the shoulder off the wrong shape), the lip's tip is looked for on the lip only
  (t 7.5-8.5: the pitching face bulged further forward), and the snap band is the top line down to `snapBand` 0.25 of
  the face (by curve place it reached a quarter of the way up at the curl). Pipe keeps its old lines (the user: Pipe unchanged).
- **Second round (2026-11-19, the user):** only wave 545 in rotation (`bar.use`; 1139 closed out too quickly, `?map=1139`).
  The closeout starts once water ahead of the curl (within 80 m) has broken on its own (`RIDE.closing`, the inside coming
  to meet you), and the curl stops where it meets it (`RIDE.closed`). Down in the face (height < 0.5) when it does, the
  surfer steps off (closeout-exit-1..4: stands tall, lifts the front foot, steps off forward toward the beach, drops in
  feet first to the chest; the board carries on and drifts: rider.js `startStepOff`, surfer.js `so`), ending the ride
  without a wipeout; up high it's "The inside closed out!". `?ridet=<s>` runs the wave on before you drop in (testing).
  Fixes: the lower face behind the curl got its own keyframe point (it was a straight ramp ~0.4 m proud of the sim's
  concave face: a bump pushing into the flats); the whitewater's height follows FUNWAVE's broken-wave decay (~100% for
  6 s, ~80% at 12 s, ~50% at 21 s; was a generic mound at ~25% by 8 s); the lip's aqua glow narrowed and dimmed; the
  camera eases in a frame moving at a smoothed peel speed (main.js `camPeel`: the peel frame's speed jumps made the
  view lurch sideways); the playable map is capped again after smoothing (smoothing had let stretches run at ~40 m/s);
  airs use Raglan's curl zone (`curlZone` was Pipe's -6, moving every air rule 6 m behind the curl) and leave from the
  crest (the top line is ~88% up the face). test/airs.mjs takes W=<wave>.
- **Speed from steep walls, not just the pocket** (2026-11-19, the user, from footage of Uppers and Lowers: long steep
  sections stand up ahead of the curl before they break, and up-and-down carves there should make speed so you can make
  the section; no pump control, the carves pay off by local steepness): `wallK` 0.65 / `wallAngles` [17, 28] (rider.js
  `wallPower`): a face standing at 28 deg at mid height and as tall as at the curl is worth 0.65 of the pocket for the
  cruising speed, the high-drop boost and bottom/top-turn drive; 17 deg (still fat swell) is worth nothing. Out of the
  pocket only (x `1 - pocket`), so the pocket's own speeds are unchanged. On 25-30 deg Trestles faces the old steepness
  gate (18-46 deg) let ~5% through, so the wall has its own. Mid-face cruising target 10-20 m ahead of the curl on a
  standing section: 10-14 -> 18-21 mph; the fat shoulder ~10 mph as before. `node test/wallspeed.mjs`: carving on a steep
  section ahead +2.6 mph on average, the fat shoulder +0, the pocket unchanged. Raglan/Pipe/Queens unaffected (no `wallK`).
  Note: on the current maps some stretches peel faster than you can carve (420 at 8 s: 26 mph): those maps come from the
  old breaking detector, which read steep faces as broken (research/trestles README, rounds 7-8).
- **Pocket speed from physics and real surfers' speeds** (2026-11-19, the user: the pocket's mid-face was ~13 mph against
  28 up top, from Raglan's steepness gate barely registering Trestles' gentler faces; ground it in real numbers):
  `physPocket` (rider.js `physCruise`). In the pocket you move along at the peel speed while the wave carries you in at c,
  so over the ground c / sin(peel angle) = sqrt(c^2 + peel^2), 1.41 c at a 45 deg peel. c ~6.5 m/s at the break
  (sqrt(g (depth + height))). GPS on surfers: recreational max ~33 km/h (21 mph), pros ~40 (25), record 45 (28). So the
  cruising speed over the ground is 1.2 / 1.45 / 1.8 c low / mid / high on the face (~17 / 21 / 26 mph) and the board's
  speed across the face (`speed`, the HUD) sqrt(ground^2 - c^2): ~10 / 15-17 / 20 mph (was 10 / 13 / 28), never below
  1.03 x the peel (you can hold the pocket). `node test/pocketspeed.mjs` (OLD=1 for the old model): whole rides barely
  change (riding speed comes mostly from drops and turns): pocket bot ~20 mph board, peaks ~24-25 (the energy ceiling for
  a drop from the top, sqrt(v^2 + 2 g H), ~25.6); ground peaks 33-36 mph, above GPS's 28, partly GPS sampling (1-10 Hz).
  `physPocket.gravity` (off): real g sin(slope) both ways; see trestles.js for why it waits (airs).
- Raglan's shortboard tuning with Pipe's tube settings; a 5'11" performance shortboard (`perf511`, shape inspired by a
  known high-performance board, no branding), black full wetsuit, grey-green water (`green` 0.55), regular foot, `dir: -1`,
  scale 0.8 (takeoff face ~3.6 m). No catching the wave yet (pop-up/paddling is still a planned idea).

## Dynamic: the first designed reef (`src/waves/dynamic.js`; `?wave=dynamic`, `?wave=peak` still works)

First named Performance Peak (renamed 2026-11-21, the user).
- The user's reef generator idea (2026-11-20): build reefs from Mead & Black's surf-reef components (ramp, platform,
  focus, wedge, ledge, ridge, pinnacle; plus our `channel`, the one that deepens) instead of surveys of real breaks, and
  let FUNWAVE decide how they break. Generator, recipes, peel estimate and runs: `~/workspace/research/reef-generator`
  (README there).
- The reef (since 2026-11-22, the user): the design sweep's best, combo_shelf_eased_grad10: the A-frame (focus + two
  wedges at 45 deg) with a 1:10 reef line and a shelf eased into the right arm from 40 m. FUNWAVE (1.6 m 15 s straight
  in): median curl 204 m (the first reef, performance_peak_45: 122), peel ~29 deg, an advanced wave. Maps: waves 159 and
  261 (313/437 crawl over the shelf then section ~60 m at once and caught the racer bot every time).
- Peel angle vs wedge angle: about 0.7x the wedge angle (the crests bend toward the wedge). A pointed peak focuses
  energy and the shoulders lose it.
- In the game it is Trestles's wave kind (the bar: `dynamic-breaks.js` from reef_breaks.py, waves 159/261, one per
  ride) with warm clear water and boardshorts. `tb` is FUNWAVE's breaking flag (never the face-steepening test; SWASH's
  own breaking agrees within ~1-3 s along the right). Past where the flag stops, the curl slows to a stop (the map's
  fade) and you step off `bar.fadeEnd` 4 s after it gets there ("You rode it to the end of the wave!"; maps carry `end`).
- Not its own yet: the breaking shapes are Trestles's (similar breakers, ~2.3 m; tubes 0.73 m, too small to ride).
  An inside barrel section is being designed (reef generator README, "Inside barrel"). `node test/trestles.mjs dynamic`
  runs Trestles's checks on it.

## Build a Break: the wave builder prototype (`builder.html`, `src/builder/`)

2026-11-22, the user: long term, players build breaks from snap-together reef blocks and ride them; fun and forgiving
(most builds should make a surfable wave) but real physics, so a closeout is still possible. The prototype is a live
version of the reef "about" card (research/reef-generator/about_map.py, out/about/dynamic.png): a top-down map of the
bay (offshore at the top, beach at the bottom, so a right peels to the map's left), depth bands, blocks you drag (10 m
snap; arms snap onto peaks, ridges snap along arms; a peak drags its arms), swell sliders (height, period, direction),
crest lines every 5 s, and the curl each way from the peak, coloured by time with dots every 5 s and marked as a fast
section (25-30 deg), backing off (slower than 70 deg, or a gap), or closing out (< 25 deg twice in a row: the ride ends).
- `reef.js`: reefgen.py's components (ramp, focus, wedge, ledge, ridge, pinnacle, platform, channel) on a cropped bay
  (x' 150-1262, y' 120-920, 4 m cells), plain min + Gaussian blend, flat offshore strip, edges eased to the mean.
- `rays.js`: peelrays.py (linear rays stepped together in time, H from shoaling and ray spacing, break at 0.78 h; strips,
  5-strip median, peel angle per 20 m as asin(c / V_line)) plus the curl rule (running max of break times).
- `blocks.js`: the palette (Peak, Arm 30/45/60 deg x 150/212/280 m, Ridge, Pinnacle, Ledge, Channel), each sized to
  work on its own; the bay floor is Dynamic's ramp; the start is Dynamic as blocks.
- `node test/builder.mjs`: on Dynamic's exact reef, JS 28.5 / 31.6 deg peel and 236 m rides vs peelrays.py 29.5 / 31.7
  and 220 m (FUNWAVE ~29 deg, 204 m); rebuild + trace ~45 ms in node, ~30-40 ms in the browser. Design checks: 30 deg
  arms close out, 45 make ~230 m at ~32 deg, 60 slower and longer; an empty bay or a ridge lined up with the swell closes
  out; a ridge along an arm (2.6 m crest) gives fast sections (1.8 m closed out).
- Known from the Python work: rays over-read breaker heights on ledges, saturate on very wide wedges, fragment on very
  gentle ones; pewave.py (heights) isn't ported yet. Not yet: riding a built break (DROP IN), presets, saving/sharing.
- **Loop** (`loop.js`; the user, 2026-11-22: mark the primary stretch and surf it forever; the builder will drive endless
  waves like Queens / Raglan / Raglan+): Ride it = Full ride or Loop (Right / Left). The loop is a stretch of one side's
  curl (`a`..`b` m from the peak; default from 20 m to just before the ride ends; 10 m snap, >= 60 m), drawn as a dark band
  with a teal edge (amber = rough seam) and round end handles you drag along the curl. `loopInfo`: length, seconds a lap,
  the curl's speed along the reef, sections, closeouts, and the seam (end vs start: speed within 15%, height within 20%),
  plus its `profile` (curl speed, height, kind every 10 m): the data an endless wave would repeat, the same shape as
  Raglan+'s ridges (a curl speed and section strength along the beach). Not wired into riding yet. `?loop=right|left`.
- **Seam snapping and Best loop** (the user, 2026-11-22): dragging a loop end snaps it to the nearest spot within 20 m
  where the seam is smooth (`snapEnd`); ★ Best loop finds the longest stretch with a smooth seam and no closeout
  (`bestLoop`). Right / Left apply to a full ride too.
- **DROP IN** (the user, 2026-11-22: start testing): `wavePayload` (the stretch's profile every 10 m: the game's peel speed
  along the crest, sqrt(v^2 - c^2) = c / tan(alpha), from the curl's speed v along the reef and the wave's speed c at
  breaking; section strength 1 where it's a section; breaker height; base pace = median peel outside sections; side;
  loop or full) goes to `index.html?wave=built&play#built=<base64 JSON>` (also kept in localStorage, `rys-rad-waves-built`).
  `src/waves/built.js` (hidden: in the picker only while you're on it, with "✎ Edit your break" back to the builder):
  Raglan+'s wave and riding, scaled to the breakers (scale 1.25 x H / 3.5 m), a right = `dir: -1`, regular foot, driven by
  the profile (wave.js `ridges.profile`, `profileAt`): looped, the last 20-30 m crossfade into the start (smoothstep) and
  it repeats forever; a full ride runs once, backs off over 30 m past the end, and you step off 3 s later ("You rode it to
  the end of the wave!", rider.js checkHazards). The builder remembers your design in localStorage
  (`rys-rad-waves-builder`). `applyBuilt(data)` swaps the wave in place (tests). `node test/built.mjs`.
  Plan step 2 (2026-11-22): the wave's size follows the breakers along the stretch (wave.js `sizeAt`: profile H / the
  wave's reference H, 0.5-1.8, crossfaded at a loop's seam; the whole cross-section scales, so angles stay; physics via
  controlPoints(.., xs), the GPU via the slice's 4th float, shaders.js surfacePoint). The takeoff and the wave's speed come
  from the builder (the user): you drop in at the curl's speed where the stretch starts (dropInSpeed = PEEL_SPEED there),
  and `waveSpeed` is the builder's median c at breaking (was Raglan's fixed 5 m/s). Best loop now starts past the takeoff
  (a lap through the peak's slow first metres stalled each time).
  Plan step 3 (2026-11-22): the shape follows how it breaks. A built wave has three shapes on a scale (built.js `shapes`):
  `KF_CRUMBLY` (raglan-plus.js `sectionKF` the other way: face drawn out 1.45x, 0.92 tall, lip held back), Raglan's wall,
  `KF_SECTION`. The builder places each 10 m on it (loop.js `shapeIndex`: u 0 at xi0 <= 0.4, 1 at 0.8, 2 from 1.3; xi
  averaged over +-20 m) and the game blends the two neighbouring shapes there (wave.js `shapeU`, controlPoints; the GPU
  slice's 3rd float, shaders.js tableAt mixes table i and i+1; Raglan+ is the same blend with its ridges, 0-1). The
  section strength `k` still only drives the curl's speed. Face at half height: crumbly 41, wall 54, section 67 deg. Arms
  have a Slope (Gentle 1:18 / Medium 1:10 / Steep 1:6: the hollowness dial; 1:16 and gentler broke up in the rays): on
  Dynamic xi0 0.66 / 0.88 / 1.11, scale 0.65 / 1.31 / 1.73. Reefs are steep, so truly crumbly waves need gentle slopes and
  short-period swell (9 s on 1:18 arms: 0.52).
  Plan step 4 (2026-11-22): `src/builder/pewave.js`, a port of research/reef-generator/pewave.py (wide-angle parabolic
  mild-slope equation per spectral component, JONSWAP + 7 deg spread, 8 x 9 components, Battjes-Janssen breaking with
  Battjes & Stive's gamma, friction; y' padded 400 m), ~260 ms. Against pewave.py on Dynamic's recipe: Hs within 0.12 m rms
  at 13 points (worst 0.35 m on the inner flat). `analyse(.., { pe })`: as design_eval.py, along each strip's row the first
  spot where Hs / h >= 0.47 (the 1-in-100 wave reaching 0.78 h) is where the set waves break, Hs there their height, the
  slope there the one for xi (5-point median along the curl); a stretch that never gets there backs off. Timing and peel
  stay the rays'. The builder runs it 0.3 s after you stop changing things (rays alone while dragging; "refining
  heights..." in the footer), and DROP IN always sends the refined wave. Dynamic: breakers 1.7 m (rays 2.1), the right's
  ledge shelf xi0 1.36 pitching (rays 1.53 barrelling), arms pitching 0.94-1.10; built waves come out smaller (scale 0.62
  vs 0.74). The arm Slope dial is weaker refined (0.79 / 0.94 / 0.98): the set waves break further out, partly on the
  Peak's fixed 1:10 face. (Corrected at step 5: with the slope measured along the wave's own direction the right's ledge
  shelf reads ~1.56 refined, about the rays' 1.53: the set waves break on its steep face.)
  Plan step 5 (2026-11-22): the coastline. reef.js `buildDepth(.., coast)`: the floor is the coast's profile by signed
  distance from a waterline polyline (beach face 1:`face` to 5 m, then 1:66.7, up the beach to +2.5 m); `defaultCoast()`
  (straight at x' 1250, face 66.7) is the old floor (7 mm apart); the reef's part is eased to its mean at the sides, so a
  bent coast stays bent. Builder: five sand-coloured handles on the waterline (drag in and out, x' 700-1240, 10 m snap),
  Beach slope Steep 1:12 / Medium 1:20 / Gentle 1:35 / Flat 1:67, Straighten; the Peak gets the arms' Slope. For long
  oblique coasts: the model runs 300 m wider each side than the map (`BAY.view`, rays and pewave see real seabed where
  the waves come in from); rays start along a line extended past the sides by the swell's drift and each sets off when
  the angled crest reaches it (all at once swept the break along a coast ~2x too fast; design_eval.py's oblique front);
  the slope for xi is taken along the ray's own direction where it breaks; a closeout is more than 40 m in a row faster
  than 25 deg (as Trestles' sectionMax; the 20 m readings jitter ~8 deg along a coast); swell direction +-40 (pewave's
  reach). A coast 35 deg off, swell +40 (75 deg to the shore), face 1:20: 800 m at 28 deg (Skeleton Bay); faces 1:12 /
  1:20 / 1:35 xi0 1.09 / 0.66 / 0.38 (research 0.93 / 0.63 / 0.37); 11.6 / 15 / 18 s: 0.51 / 0.65 / 0.79 (0.49 / 0.63 /
  0.76); a straight beach facing the swell closes out. Default loops end 20 m before the ride's end.
  Plan step 6 (2026-11-22): the Sandbar block (reef.js component `bar`: a crest line `points` at `depth_m`, falling away 1:40
  to the sides and off its rounded ends; Mead & Black's elongated platform / broad ridge): Turn, Length 100 / 160 / 240 m,
  Crest Shallow 1.0 / Medium 1.5 / Deep 2.0 m; it lands near the beach in ~3 m. "Start from a beach break" (blocks.js
  `beachPreset`: one bar pointing out to sea on a medium 1:20 beach, 12 s swell): a crumbly A-frame, right 60 m at 45 deg,
  left 96 m at 34 deg (xi0 0.29); lined up with the swell it closes out. A full ride now starts where the curl can be
  followed (loop.js `takeoffStart`: its speed along the line <= c / sin 25 deg), not inside the peak: a sandbar's curved
  end breaks all at once for ~25 m (the sandbar's left: from 48 m of 90; a pump bot rides it to the end of the wave).
  (The one-peak gap noted here was closed by plan step 8, stacked reefs.)
  `?preset=beach` (testing).
  Plan step 7 (2026-11-22): barrel sections. built.js adds `KF_TUBE` (Pipe's classic KF_PIPE, scaled to Raglan+'s section
  height) as shape 3 of the scale; the builder moves spots onto it from xi0 1.5 (2) to 1.9 (3) (loop.js `shapeIndex`).
  wave.js `tubeAt(xs)` (u 2.3 -> 2.8: 0 -> 1) says how much tube the shape has there; the built wave has `tube`,
  `tubeScale`, `tubeMinHeight` 1.3 and Pipe's tube tune (as Trestles takes it). The face's top (Pipe's 5.3 -> 11.9 as the
  lip throws), the physics foam (Pipe's: whitewater only behind the tube) follow tubeAt at each spot; the GPU table's tube
  set takes Pipe's foamVisual and thin (`env.SHAPE.a === 3`; wave.js hands built.js `env` to avoid an import loop).
  rider.js checkHazards: tube rules only where tubeAt >= 0.5 (enter) and the barrel ends when it drops below 0.3;
  tubeHeight(xs) measures the tube that forms where you are. Pipe's classic tube is about as tall as the face (3 m
  breakers: 3.4 m inside, 2 m: 2.3), so the 1.3 m fit-in limit only bites on the smallest waves. In the builder: Dynamic
  has no barrel; + Ledge 30 m on the right; Steep peak and arms + Ledge 140 m; steep arms on an 18 s 2.2 m swell 70 m each
  side. In the browser the barrel view and tube HUD come on in a built barrel section. test/built.mjs checks the tube is
  only in the section, a stalling rider gets barrelled and is never in a tube where there's none, and the tube grows with
  the wave.
- **Stacked reefs** (plan step 8, 2026-11-22; the user asked after a big swell on a sandbar gave nothing on either side):
  rays.js no longer stops a ray at its first break. A broken wave goes on losing height toward 0.4 h (Dally, Dean &
  Dalrymple 1985: energy flux decays at K / h = 0.15 / h toward the stable H = 0.4 h; `RAYS.ddK`, `ddGamma`); where the water
  deepens it drops under 0.45 h and has reformed (`RAYS.reform`), shoals again on its own energy flux and breaks again at
  0.78 h (up to `RAYS.breaks` 3). Every break is in `R.ev` ({ r, k, t, x, y, h, H, c, s, th, from }); the first breaks are
  exactly as before (the unbroken rays' spread still sees broken neighbours where they broke), so every earlier number is
  unchanged. `analyse` returns the main wave as before plus `waves` [{ name A.., tier 'outside' | 'inside', peak, right,
  left }]: outside waves one peak after another (the earliest strip no curl reached yet), inside waves from the reformed
  breaks (per strip the earliest, else its first break: a beach beside the reef); past the main wave one counts only if a
  side rides 40 m+ slower than a closeout, and not if an earlier wave's curl already ran through its peak. With the height
  model a reformed spot's break is searched from its earlier break inward (Hs / h back under 0.47, then over again). A
  reformed wave's xi0 uses the deep-water height that would break at its own breaker height (Komar & Gaughan 1972), not the
  swell's. Peak and Arm get "Behind: Reef flat / Lagoon" (blocks.js `BACKS`; lagoon: the reef top runs 20 m behind its edge,
  then falls to the floor over 40 m; a peak passes it to its arms). Builder: a wave picker (A main, B peak / inside, with
  length and height) under The wave; every wave drawn, the others at 40%; a letter over each takeoff line; reformed waves'
  crests fainter. `state.pick` saved; DROP IN rides the picked wave (its button reads "DROP IN · B"). The pick follows the wave, not
  its list index (the user, 2026-11-22: B seemed to ride with A's speed): ui.js `repick` finds it again after every analysis by
  tier and peak spot (`pickKey`, saved), so a re-analysis with a different wave count can't drop you onto A.
  A ride (rays.js `isRide`; the user, 2026-11-22: an inside wave showed "peels 90°, curl ~0 mph"): 40 m+, peeling 25-70 deg overall
  (`RAYS.backoff` 70, the same line the curl's back-off stretches use). Slower, the panel says "no ride: it barely peels" and
  DROP IN is off; an extra wave with no ride either way isn't listed (a reformed wave reaching the beach along its own path
  breaks at 90 deg: Dynamic, 10 ft 9 s from +35).
  Inside waves follow one line (the user, 2026-11-22: an inside curl zig-zagged in to the beach and back out to another
  wave's takeoff): a strip can hold several reformed breaks (back on the outer reef, on the inside reef, at the beach), so
  each strip's reformed breaks are grouped by spot (a gap over 12 m starts a new group, its earliest break stands for it) and
  a wave takes, strip by strip from its peak, the group nearest its line so far (5-strip median after). Any wave's ride ends
  at water that broke before its peak did (q.t < peak.t - 1.5, besides the step-to-step check; never bites the main wave,
  whose peak breaks first), and an extra wave whose ride runs mostly (> 50%) along an earlier wave's curl isn't listed.
  Every listed wave can be ridden (the user, 2026-11-22: DROP IN was off for every wave but A): loop.js `takeoffStart` needs
  a 40 m ride (as `isRide`; it needed a loop's 60) and keeps at least 20 m after the takeoff; the takeoff skips spots slower
  than a back-off (v < c / sin 70) as well as closeout-fast ones; `wavePayload` floors each point's peel at a back-off's pace,
  c / tan 70 (where the break barely moves along the reef it came out 0 and the game's curl, which advances by it, stopped
  for good). Picking a wave switches Right / Left to the side that rides if the chosen one doesn't. test/built.mjs "every
  wave": stacked, steep beach, 10 ft 9 s from -35: each wave droppable, each ride ends. `stackedPreset` (`?preset=stacked`, `?pick=1`):
  a 1.5x deep outer reef with a lagoon + a 1x reef inside, 10 ft 15 s: A outside 10 ft pitching; with a reef flat nothing
  reforms, with the lagoon B inside 5 ft steep at x' 1012. Dynamic now also lists two ~2 ft inside reforms on the beach
  behind its reef flat; the user's 2.5x sandbar (turn 135, 9.8 ft 12 s -20) a second outside peak (right 328 ft, left 394
  ft) and an inside wave. Not yet: three tiers apart (each strip's inside is its first reformed break), sand that moves.
- Out of the tube (the user, 2026-11-22: a bit more boost in the tube; hard to make it out, especially in small tubes): two
  causes. A built wave's pocket was Raglan+'s, which ends at the curl, so behind it in a barrel the wave fed you nothing
  (pocket 0, cruise ~0.85x the curl); built.js `pocket` now blends in Pipe's (which carries on ~9 m behind the curl) by
  `tubeAt`, as the face top and foam already did. And in the tube trimming now holds the curl's own speed x `tubeHold` 1.08
  (rider.js ENERGY_TUNE, every tube wave): a built barrel is usually a fast section, where the open face's hold (wall pace
  plus half the section's extra) left you ~0.9x the curl with no pumping possible, and a small tube is short, so a
  shortfall pinched you first there. Placed 30% in, trimming low: built barrels 2-3 m at 8-10 m/s were all pinched in
  7-17 s, now they hold their place or come out (test/built.mjs "tube exit"); Pipe on a 0.4 line comes out in 2.6-6.5 s
  (held station at 1.00x before), 0.5 stays in. (test/tube.mjs and tubetrim.mjs's pull-in bots no longer get into Pipe's
  tube, before and after this change: their output didn't move.)
- Swell sliders (the user, 2026-11-22: numbers right, thumbs not): syncSwell makes the value each slider's default too
  (`defaultValue` / the attribute: what a browser restores) and re-syncs on load, pageshow, the next frame and 250 ms on;
  Safari can put back an old slider position after the script has run.
- Water temperature (the user, 2026-11-22; looks only): a Water slider under Swell, 48-86 °F (default 66), saved with the
  design and sent with DROP IN (`water`); built.js `OUTFITS` / `outfitFor`: up to 54 wetsuit + hood ('hood'), 63 wetsuit
  ('wetsuit', Raglan's), 69 short-sleeve wetsuit ('shortsleeve'), 75 swimsuit + top ('topper'), above that swimsuit ('');
  older links keep Raglan+'s wetsuit. main.js bodyColors paints the swimsuit first, then the suit over it: short sleeves to
  half way down the upper arm; the hood covers head and neck but a face oval (brow to chin) and turns the hair cap into the
  hood's crown (no long hair); the top is dark teal (navy matched the guy's blue shorts), long-sleeved, to the waistband.
  Checked in the browser on the guy (built waves); the girl (Queens only) gets the same outfits but isn't on a built wave.
- Tighter crouch in small tubes (the user, 2026-11-22): rider.js `tubeTight` = sstep(3.0, 1.5, tubeHeight) (the surfer ~1.75 m,
  the barrel stance ~1.2 m): from a 3 m tube down to 1.5 m the full barrel stance comes on as soon as you're in (barrelCrouch
  target max(depth-based, 0.3 + 0.7 tight)) and surfer.js sinks the hips further (-0.08), bends the knees more (+0.15, capped)
  and folds the chest over the front knee (+0.2). 15% in: 1.7 m tube crouch 0.89 (was ~0.35), 2.3 m 0.58, 3.4 m+ unchanged.
  Barrel view switching: main.js updateTubeView (on with rider.tube, off when it clears, VIEW_HOLD 1 s); the tube itself:
  rider.js checkHazards / enterTube.
- Barrel speed (the user, 2026-11-22: a bit more in the barrel; 100% of a section's speed-up there): `tubeHold` 1.08 -> 1.12.
  In the tube the hold was already the curl's full speed (sections included) x tubeHold, not the open face's SECTION_HOLD share.
  Placed riders trimming: built barrels 2-3 m mostly come out in 4-11 s (1.08: most held station); Pipe 0.4 line 1.7-4.4 s.
- Speed at any depth in the tube (the user, 2026-11-24: slowing down deeper in; keep it, or add some to help make it out).
  The tube's hold was scaled by the pocket's power and the face's steepness where you are, and both fade behind the curl,
  where deep in the tube is: Pipe held 1.12x the curl to half way, then 0.69x at 70%, 0.62x at 80-90% (a low line 1.32 ->
  0.69); Dynamic's target fell to 0.97x; built barrels were fine (their `tubeCarry`). In the tube the pocket now counts as
  full at any depth (rider.js target: `pkT`, `stT`), and `tubeDeepBoost` 0.08 raises the hold from 40% depth to the pinch
  (rider.js `tubeHoldAt`: 1.12x mid-tube unchanged, where 1.15 made coming out automatic; ~1.20x at 90%), in the carry too.
  Now Pipe 1.13 -> 1.24x on a 0.45 line, 1.28-1.32x low; built 1.12 -> 1.25x. `node test/tubedepth.mjs` (puts riders in the tube
  at each depth: test/tube.mjs and tubetrim.mjs script their way in and haven't got into Pipe's tube for a while).
  replay.js `SIM_VERSION` 2.
- Section hold (the user, 2026-11-22: more boost when a section speeds up): wave.js `SECTION_HOLD` 0.5 -> 0.85 (trimming holds
  85% of a section's extra speed, by its steepness). Raglan+ sections test: trimming makes 4 of 7, pumping 10 of 10 (0.5: 2 / 6
  and 9 / 9; 1.0: trimming 6 of 7, pumping no longer mattered). test/sections.mjs allows trimming up to 70%.
- Zoom (the user, 2026-11-22): wheel / trackpad pinch about the pointer, two-finger pinch, drag the water to pan, and − / + / Fit
  in the map's corner (up to 6x; handles, labels and line widths keep their screen size; the scale bar picks a round length).
  `?zoom=2.5` opens zoomed on the peak (testing).
- Kept clear so the curl's colour reads (the user, 2026-11-22): block names and shape guides only on hover or selection,
  arm and ledge handles at their far end on their line (the user, 2026-11-22: on the feature, not offset; their start is
  the peak's handle), the curl drawn over a thin dark casing, no time ticks on the map; the zoom buttons in the row under
  the map. The swell arrow turns the way the waves travel (it was mirrored; `?dir=` for tests).
- Big swells (the user, 2026-11-22: toward Pipe-size waves): swell up to 4.5 m (~15 ft); Coast "Offshore: Shelf / Deep"
  (Deep: the bay 25 m offshore, `FLOOR_DEEP` shelf 24 -> 16 m, and past the beach face the bottom drops 1:25 instead of 1:67,
  deep water close in as at Pipeline); reef blocks get Depth Shallow / Medium / Deep (x0.7 / 1 / 1.8 their depths); built
  waves size up to scale x2.6. A 4 m swell closes out on the shelf bay (Dynamic: 20 / 20 m) but rides on the deep bay
  (60 / 100 m at 35 deg, ~14 ft). Not yet Pipe-like barrels: deeper blocks alone let big waves pass over and break on the
  bay; a reef for a 13 ft swell must grow ~2.5x in every direction (Froude scaling), which needs a reef Size option and a
  bigger bay (the user's call).
  Then (the user: real reefs work at small and big sizes; is there a better default?): reef designs now start on Deep offshore
  water (ui.js `reefCoast`; the beach-break preset keeps the gentle shelf, as sand beaches are). The Dynamic reef across
  swells, shelf vs deep (rides right / left): 3 ft 197 / 197 vs 131 / 197 ft; 5 ft 722 / 774 at 32 deg vs 722 / 776 at 29;
  8 ft 591 / 591 vs 525 / 591; 11 ft 262 / 262 crumbly vs 328 / 328 steep; 15 ft closes out vs 262 / 262 at 16 ft. The reef
  rising out of deep water close in is what lets one reef work at every size; the research site's shallow shelf turned big
  swells into closeouts on its straight contours. (test/builder.mjs keeps the shelf for its Python / FUNWAVE comparisons.)
- No size caps (the user, 2026-11-22): a built wave's size k = breakers / 3.5 m with no floor or ceiling (was 0.45-2.6), and
  `sizeAt` along the stretch uncapped (was 0.5-1.8). As Pipe's `sized()`: the phase rates along the wave, the pocket, the
  drawn foam, curlZone, startXs, shoulderReach, snapIntoLip, the air zones and the camera (`sizeK`) all scale by k; the
  curl's and wave's speeds come from the builder. The rider doesn't scale (a human on a shortboard): riding the same wall at
  0.5x / 1x / 3x with the curl at sqrt(k), a pump bot rode 40 / 27 / 8 s (avg speed 1.49 / 1.08 / 0.88x the curl): big
  waves are harder, as real ones are.
- The gun (the user, 2026-11-22): a Board choice in the builder's Ride it panel (Shortboard / Gun; suggested from ~10 ft
  waves), sent with DROP IN (`board` in the payload). mesh.js `BOARDS.gun`: 9'6" x 19.5", pointed nose, pin tail, gentle
  rocker, thruster, stance back over the fins. built.js `GUN` riding: turn radii 2.3 / 8.2 m (shortboard 1.3 / 4.8), top turn
  rate 3.6 rad/s (5.2), slower snaps and check turns, drag bites at 40 mph (32; hard cap 49), extra speed fades half as fast,
  acceleration holds at speed, drops slow down later, no airs. On a 3x wall (10.5 m breakers, curl 31 mph): pumping up and
  down the 10 m face fails on both boards (shortboard 7.8 s, gun 9.9 s; top 36 / 41 mph); drawing a line at mid-face rides
  it on both for the full 40 s. You don't pump a wave that size.
- Reef Size (same day): blocks get Size 1x / 1.5x / 2.5x (blocks.js SIZES: every length and depth about the anchor, slopes
  unchanged; Froude scaling; a peak passes its size to its arms; `blockLength` for handles and snapping). A 13 ft 18 s swell
  on Dynamic at 1x: 80 / 80 m, steep; at 2.5x with its peak 160 m further out (so its 530 m arms fit): 240 / 280 m at 27 /
  31 deg, pitching, ~14 ft. At its normal spot the 2.5x reef runs into the beach.
- The summary's peel (the user, 2026-11-22: a slow ride read "advanced"): "peels N° overall" from the ride's pace (length /
  time along the line, asin(c / V); `peelAll`, its skill band `bandAll`), "fastest" = the quickest stretch (3-stretch median), and
  "curl ~N mph" = the curl's speed along the wave, what you race in the game (c / tan). The 20 m median (`peel`) stays for the
  peelrays.py comparisons; it weighs stretches by length, not time. `seconds` is the ride's own time.
- Units (the user, 2026-11-22): the builder shows heights and lengths in feet (swell, waves, rides, loops, block lengths,
  the scale bar; ui.js `ft`/`ft1`), speeds in mph; the model works in metres underneath and saves metres.
- Circles only for what you can drag (block handles, loop ends; the user): the curl's time marks are ticks, where it
  first breaks (the takeoff) a short white upright line (was a diamond: it looked clickable), always shown, nudged just above a handle it would sit on (the user, 2026-11-22: it
  came and went).
- `PAGE=builder.html node test/drive.mjs test/out/bld "" 2500` screenshots it (drive.mjs's `PAGE`).
- **How it breaks** (plan step 1, 2026-11-22): rays.js records the seabed slope along each ray where it breaks (depth
  smoothed over 4 m, the bottom rising in the wave's direction) and the curl carries xi0 = slope / sqrt(H0 / L0)
  (Iribarren / Battjes; Mead & Black tie reef breaking intensity to the same slope), 5-strip median, and a type
  (`BREAK_TYPES`: crumbly < 0.5 spilling; within plunging, our provisional split steep < 0.9, pitching < 1.5, barrelling).
  The curl is coloured by how it breaks (mint / yellow / orange / violet; one view, no seconds on the map: the user
  dropped the Time view; a fast section is thicker and glowing; a closeout dashed in its own colour, the dashes carried
  along the line; backing off has no mark: the user, 2026-11-22, dropped the red and the dashed white); each side's summary reads "breaks steep (ξ 0.88)". Dynamic's arms 0.88 (the right ~1.5 over its ledge shelf; Python's ray_zone.py 0.9-1.5);
  1:6 / 1:10 / 1:15 lines 1.14 / 0.88 / 0.72 at the same peel; 10 / 18 s swell 0.67 / 1.00.
- **Next (agreed 2026-11-22):** shape, size and barrels from the reef, in steps: plans/2026-11-22-reef-driven-waves.md (step 8: stacked reefs).

## Heats (`?heat=10m` / `?heat=5w`, `src/heat.js`; accounts plan task 3 = the contests plan's phase 1, 2026-11-23)

Solo heat mode, no network yet. `?heat=10m` (a timer; any minutes) or `?heat=5w` (a wave count), `&bots=N` rivals (3 by
default, 0-7), `&seed=` to fix the heat (else random). Judging is on. DROP IN starts the heat: its seed is the sea's, so your waves
are that seed's waves 0, 1, 2 ... (wave addresses), the same for anyone with the seed. Each wave is judged with the judges' seed
from the heat seed and wave number (`judgeSeed`), and the judges' memory of maneuvers (variety) is the heat's. Best two waves
make your total. Ties go to the best wave, then the next (WSL). On a timer, a wave counts if caught before the horn, even when the
horn sounds mid-ride ("HORN!": this wave still counts). The clock runs in game time while you ride and while the sheet shows
(it stops on the title and in replays). The sheet paddles you back out by itself after 6 s (Space sooner).
Bots: a skill each (mean wave scores spread ~3.8-6.4), waves on a schedule from the seed (timer: first at 20-60 s, then every
45-95 s; a wave count: every 35-70 s, the rest coming in at once when you've ridden yours). Their scores pop in beside the board.
The board (top left, after WSL's broadcast graphic): the clock (or "Wave 3 of 5", then HORN / FINAL), a row per surfer by place
(jersey colour, name, total, best two, what they need: "6.18 to win", "combo"), your row lit. On a phone only the rows around
you show; tap the board for all. The arcade points and Best are hidden in a heat, and move callouts lose their "+points".
The end: a results card (places, best two, totals; "Watch your best wave" replays it from its recording; Space for a new heat).
A built break's loop rides its full ride in a heat. `heat.js` is pure (`createHeat`, `stepHeat`, `canCatch`, `addWave`,
`checkOver`, `standings` with `needFor`, `clockText`). `window.__heat` and `window.__heatResults` are for tests. `advance` (top N
go through, needs "to adv") is in heat.js for brackets later, not on a URL yet.

## Replays (`src/replay.js`; accounts plan task 2, 2026-11-23)

Every ride is recorded: its wave's address (wave id, a built break's payload, `SEA.seed`, `SEA.n`), the URL options that
change the physics (`PHYS_PARAMS`: size, map, moveaccel, nosea, ridet), the input the sim used at each 1/120 s step (stored
when it changes: a keyboard ride is ~5-10 changes a second, the autopilot's analog aim more), and a checkpoint of the
rider's whole state every 120 steps and at the end (`snapshot`: every field but `events`; non-finite numbers survive
`encodeRecording`). The judged score and the context it was scored in (`judge`: seed, maneuvers seen) and the points go in
`result`. ~2 KB a second, mostly checkpoints. Replaying (`createPlayer`, `playerStep` before each `stepRider`) feeds the inputs
back; at each checkpoint it measures the drift and puts the rider back on the recording, so another browser's last-bit maths
(V8 vs JavaScriptCore) can't take a replay elsewhere; `playerEnd` says whether it ended where the ride did.
In the game: the game-over card and the score sheet have **▶ Watch it** (replays the last ride) and **⬇ Save replay** (a
.json file); `?replay=<url>` plays a saved file, and dropping one on the page does too. A replay whose physics options differ
from the page's reloads with them (handing the recording over in sessionStorage, `?replay=session`). The REPLAY badge shows
while it plays; the end card says "Replay: the same ride ✓" (or how far off it was) with the recorded points and judged score;
`window.__replay` (the last recording) and `window.__replayResult` are for tests.
The main loop now stops stepping on the step the ride ends (it used to finish the frame's steps), so a replay ends on the
same step whatever its frame rate. Found on the way: the "same move again" penalty compared against the last ride's
`lastMoveTime` (each ride's clock starts at 0), so a new ride's first move could score 40%; reset each ride now.
`SIM_VERSION` (replay.js): bump it when a physics change would make old recordings ride differently.

## Share video (`src/video.js`; plans/2026-11-24-share-ride-video.md step 1, 2026-11-24)

**↗ Share video** on the game-over card and the score sheet (hidden where the browser has no WebCodecs) makes the last ride
into an MP4 on the device: the replay re-runs as it plays (same camera and look) with the main loop at a fixed 1/30 s a
frame (`vid` in main.js: `dt` fixed, the next frame only once the encoder is ready); right after each frame is drawn
(`videoFrame`, same task: a WebGPU canvas is only readable until it's shown) it's copied to a 2D canvas at the video's size
(the canvas's, long side at most 1920, even) and Mediabunny's `CanvasSource` encodes it (H.264, 8 Mbit/s, keyframe every
2 s) into an in-memory MP4. Mediabunny 1.65.0 is imported from jsDelivr only when a video is made. A progress panel
(`#video`, Cancel / Esc) covers the game; at the end, **↗ Share** opens the share sheet (`navigator.share({ files })`, needs
the tap) where the browser can share files, else downloads; **⬇ Save video** downloads. Videos stop at 90 s. No sound yet. The start screen's logo is drawn in the top left (`makeLogo`: Bungee Shade,
its shadows and tilt, font 6% of the short side).
Runs about real time on a laptop. `window.__video` is for tests; `node test/video.mjs` (MOBILE=1 for a phone) rides, makes
the video, checks frames/size and that a `<video>` plays it, and saves test/out/ride.mp4.

## Competition judging (`?judge`, src/judging.js; the user, 2026-11-22: a start, later heats against other players)

WSL-style: five judges score each wave 0-10, the high and low dropped, the middle three averaged; a heat keeps the best two
waves (20 is perfect); grades poor < 2, fair < 5, good < 6.5, very good < 8, excellent. With `?judge` main.js keeps a ride
log (`createRideLog` / `logStep` after each physics step: maneuvers with where on the wave (pocket, height), speed in and 0.6
s later, stalls since the last; airs from launch to landing (spins, backwards); barrels made (time, depth) or caught inside;
noserides; how it ended) and at the end shows the score sheet (`#judge` panel): the judges' shorthand ("BT – snap – cutback
– air rev – out"), the five scores (high and low struck out), the result and grade, the heat (the session: best two).
`scoreRide`: per maneuver base value (MOVE_VALUES; airs 4 / 6.5 / 9 / 11 / 13 by spin, big x1.25; barrels (2.5 + 2.6 s) x
(0.7 + 0.9 depth), caught inside x0.3) x criticality (0.6 shoulder .. 1.3 in the pocket at the lip) x execution (a fall
within 0.6 s voids it; backwards landing x0.5; speed kept: losing half x0.7) x variety (repeats 1 / 0.7 / 0.4 / 0.2 / 0) x
innovation (x1.1 new this session, x1.1 rare: rebound 180, 360+ airs, barrel slash, deep barrel) x combination (different
major maneuvers within 2 s: x1.12 per link up to x1.5, a stall breaks it), the sum x flow (0.8-1.15: average speed vs the
curl, less stalled time). Raw points -> S curve s / (10 - s) = (R / R0)^1.75, R0 9.4 x (0.7 + 0.3 size, 0.75-1.3): two
hits ~3.4 fair, snap - cutback - snap 5.0, straight air + snap + floater + air ~7.6, air reverse + three hits ~7.7, a 360
air + deep barrel + three linked hits ~9.5. Judges: J1 airs x1.18, J2 power x1.15 (and flow), J3 barrels x1.18, J4 flow,
J5 by the book; seeded gaussian spread 0.15-0.22. test/judging.mjs checks each criterion and the scale, and judges a pump
bot's real ride. Not yet: a heat timer, priority / interference, other players.

## How it works

- Wave shape between keyframes is a smooth cubic (Catmull-Rom slopes) and the phase rate changes
  smoothly through the curl: piecewise easing left visible creases on the wave.
- `src/waves/`: **wave definitions**, one file per wave (`point.js` Mellow Point, `reef.js` Reef Barrel;
  registry in `index.js`, shared keyframes in `shapes.js`). A wave defines its shape (keyframes, scale,
  peel/phase speeds), its foam (`foam` for physics, `foamVisual` built on the same pieces for drawing),
  translucency, spray emitter, pocket power, `faceTop`, whether it has a `tube`, and `tune`: the
  wave-specific settings (pocket speeds, zones, airs, face limits) merged over the rider's settings by
  `useWave()` in rider.js. Rider/board feel settings stay in `RIDER_TUNE`. `?wave=<id>` picks a wave;
  `renderer.rebuildWave()` rebuilds the meshes after `useWave()`. Every wave is its own design (mirrored lefts were tried and removed:
  goofy/regular should be a surfer stance, and a left should be its own wave). The title screen has a wave picker (remembered in localStorage).
- **Queens** (`src/waves/queens.js`, 2026-11-17, after queens.jpg in braickish/reference-images): a small
  (~1.2 m face, `scale` 0.42), slow-peeling, crumbling right in clear turquoise water (`turquoise`, shaders.js), ridden
  by a girl in a teal long-sleeve rash guard and floral bikini bottoms (was a light blue bikini; the user's pick) with long light brown hair, lighter toward the ends with slight highlights (was blonde; the user's pick) (`surfer: 'girl'`, surfer.js) on a 9'0" pink noserider
  (`BOARDS.longboard`: wide round nose with little nose rocker, single fin, `noseStance` for the hang five; shortened
  from 9'6" and changed from yellow 2026-11-17, the user's call). On a steep face it sits mostly level with the
  wave-side rail cut into the wave (`faceTilt` 0.35 of the face's slope, the user's description) and rolls half as
  far onto its rail in turns (`rollK`). Longboard feel in its `tune`:
  slower turns (turn rate 2.4 vs 5.2 rad/s) sized to the small wave, glides and carries speed (`bleed` 0.55, `climb`
  4), ~12 mph in the pocket (`vPocket` 5.2). Peel 4.8 m/s and wave speed 3.9 m/s (2026-11-17: the user found the wave
  felt slow; it had peeled at 3.0, and the surfer's speed had been cut to 4.0 m/s because she outran that slow peel).
  Water ripples are `rippleK` 2x finer than on the big waves (Frame `misc.y` in shaders.js), so the small wave doesn't
  read as a big wave in slow motion; no airs, snaps or slashes (turning off the top is a check turn). **No floaters**
  (the user's call, 2026-11-17: `floaters: false` with `softFoam`): climbing the whitewater just slows you (no
  pop-up, no wipeout), turning off its top is a re-entry, and hitting its top without turning knocks you off
  ("Knocked off by the whitewater!"). Heavy waves without floaters still go over the falls; rebounds stay.
  **Walking the board** (2026-11-17, the user's design; `WAVE.noseride`, rider.js `r.foot`/`r.footGoal`): three spots,
  -1 the tail, 0 the middle (where you start), 1 the nose. WALK UP / WALK BACK buttons (`#walk-up`, `#walk-back`; each
  hides at its end) move one spot per press, and so do **Up / Down** (and up / down swipes) on Queens (`walkKeys`, the
  user's trial 2026-11-17, this wave only: there only Left/Right turn; the hint changes to match); Space walks back -> middle -> front -> middle -> back (`walk: 'cycle'`,
  turning round at each end; otherwise Space drops in). Tail <-> middle takes `tailWalk` 0.6 s, middle -> nose
  `noseWalkUp` 1.1 s, back 0.8 s; the feet step along the board one at a time, lifting as they step (to the nose
  the back foot leads; to the tail the front foot cross-steps back first, since back foot first put her in the splits). The middle trims fastest with rail turns
  (`middleSpeed` 1.6x cruising speed, picked up `middleFeed` 2x quicker; `softMax` 10 / `maxSpeed` 12 / `maxAccel`
  4.5 raised with it; the user asked twice for more speed there). A pocket bot from the middle tops out ~16 mph and
  runs ahead onto the shoulder: walk up to the nose to stall, or cut back. **In the whitewater from the middle** the foam pushes you
  along instead of dragging you down (`foamPush` 5.8 m/s target in the foam, ~13 mph, about trimming in the pocket from the middle; was 4.6, the user
  asked for nearer pocket speed; picked up `foamPushFeed` 2.5x quicker; in thick foam she now rides 12-13.6 mph, was ~10.5)
  and takes twice `foamLimit` to catch you (the user's call): dropped into the foam 2.5 m behind the curl at ~6 mph,
  from the middle she's at ~12 mph after 1 s and back to the curl in ~3 s (was slowing to ~9 mph, falling behind). (An automatic walk back to the middle after a tail turn was tried and removed the same day, the user's call.)
  **The tail** is slower (cruising speed x `tailSpeed` 0.8) and every turn up on the wave is a **fin pivot**
  (`r.pivot`, the user: on a small wave a longboard turns by pivoting round the fin, not on the rail; reference
  pivot-turn.jpg): the board swings at `pivotRate` (3.5 rad/s) whatever her speed, either way along the wave (also
  heading back toward the whitewater). Since 2026-11-17 (the user: 'almost too quick', and wanted a teeny bit of
  speed from them) `pivotRate` is 3.5 rad/s (was 4.2; 120 deg in 0.67 s, was 0.57), `pivotDrag` 0 (was 0.2 of her speed
  per radian) and a pivot gives `pivotDriveK` 0.25 of a rail carve's drive (was none): a pivot down the face now gains
  a little (10.1 -> 10.7 mph, was -> 8.1), a cutback up the face keeps more (-> 7.8 mph, was -> 4.8).
  Then (same day; the user: still too easy, as if slightly too far back, and not crediting the little drive a
  pivot makes) the tail spot moved 0.1 m forward (`tailStance` [-1.0, -0.52]), a turn there is 70% pivot / 30% rail
  (`pivotMax` 0.7), `pivotRate` 3.2 and `pivotDriveK` 0.5: 120 deg from the tail in ~0.84 s (was 0.67), a cutback
  10.1 -> 8.2 mph.
  **By direction** (same day, the user's idea): turning away from the lip (nose swinging down the face, `r.pivotUp`
  false) is 85% pivot (`pivotMax`) at 1.15x the rate (`pivotDownRate`, ~3.7 rad/s): 70 deg in 0.38 s (was 0.43).
  Turning toward the lip (nose up the face) is 50% pivot (`pivotMaxUp`) with a full rail carve's drive
  (`pivotDriveUp` 1.0): it holds her speed through the climb (10.1 -> 10.1 mph, was -> 9.6).
  **Decided once per turn** (2026-11-18, the user: by whether the board pivots toward the wall of the wave or away):
  `r.pivotUp` is set when a turn starts (the swing's first ~25 deg takes the nose further up the face = toward the
  wall) and kept until the turn is released (`r.pivotDir`). It used to be re-decided every frame from the nose's
  heading, so one pivot switched halfway (heading back and swinging round down the face: away, then toward the
  wall as the nose came back up, slowing the second half; riding along and swinging up into the wall: the reverse).
  On top of that, from the tail a turn toward the wall is `wallTurn` 0.85 as fast, on the face or anywhere (the
  user, same day: always a bit slower): up on the face from the tail, 41 deg toward vs 58 away in 0.3 s (was 48 /
  58). From the middle and the nose turns are the same both ways.
  In the pocket tail turns are slower still (`pocketTurn` 0.15, plus `pocketWallTurn` 0.2 toward the wall, scaled by
  pocket power): from mid-face in the pocket, 27 deg toward the wall vs 49 away in 0.3 s (was 41 / 58); out on the
  shoulder unchanged. (A tail turn toward the wall that reaches the lip sets off the check turn, which spins fast.)
  The pivot also swings slower as the board slows (`pivotSpeedRef` 5 m/s, `pivotSlowMin` 0.4; it used to be the same
  at any speed): away from the wall from the tail, 24 / 38 / 52 / 57 deg in 0.3 s at 4 / 7 / 10 / 13 mph (was
  52 / 55 / 57 / 57).
  Pivots also work the first few feet out onto the flats, easing off further out (`pivotFlats` [0.33, 0.5] surface
  units past `tBottom`: full to ~1.2 m, rail turns by ~2.3 m; the user's idea, after a hard cutoff at the bottom
  made turns facing the whitewater slow). A pivot started within that lasts until you let go of the turn
  (`r.pivotHeld`) even if it swings you further out: facing the whitewater, a turn down the face used to drop to a
  slow rail turn partway round (1.1-1.6 s for 120 deg instead of 0.5). Further out on the flats and in the barrel
  turns stay on the rail, and from the tail a cutback is a
  pivot rather than a dropknee turn. A tail cutback: 150 deg in ~0.5 s, ~11 -> 6 mph (from the middle 0.83 s, ~11 -> 9.6).
  Feet (mesh.js): the middle spot is `stance` [-0.28, 0.26], either side of the board's middle (the user's call; it
  used to be the back half); the tail spot `tailStance` [-1.0, -0.52] (moved forward twice, the user's call).
  Drawn (surfer.js `tl`, `pv`): feet stepped back close together just ahead of the fin, more upright, arms half out; the nose
  lifts a little standing there and up to ~15 deg swinging round in a pivot away from the wave, ~9 deg toward it (was ~27 / ~15; 2026-11-18, the user: too much lift) (`pose.tip`, about a point ahead of the
  back foot so the tail sinks), with less rail roll and lean. (A first version stepped back automatically when you
  held a turn; replaced by walking the same day.)
  **On the nose** you steer a little (`noseTurnDamp` 0.55, was 0.8); in the pocket the nose
  trims you to just under the curl's speed (`noseHold`, `noseUnder` 0.8 m/s under; was 0.45, the user wanted it slower), so you stay there; out on the shoulder (pocket
  power below `nosePocket`) it drags and the nose dips under (`r.noseRisk`, drawn as the board pitching nose-down, the feet going with it) until
  you pearl (wipeout). Scores: HANG FIVE! on reaching the nose, then a noseride bonus by time when you walk back
  (hang ten time counts double).
  On the nose her hips and chest turn further toward the nose (`NOSE_OPEN` 0.8 rad, was the normal 0.45; the user, 2026-11-18,
  so stepping into a hang ten is a short move).
  **Hang ten** (2026-11-18, the user's idea; hang-ten-position.jpg in braickish/reference-images): automatic, no key. On the
  nose in the pocket (pocket power >= `tenPocket` 0.7) about mid-way up the wall (height `tenLow` 0.35 .. `tenHigh` 0.75) for
  `tenSettle` 1 s (was 0.3; the user wants at least 1 s of hang five first), she steps the back foot up beside the front (`r.ten`, `tenStep` 0.35 s); out of that spot (with
  `tenMargin` 0.08 of slack) or walking back she steps back to hang five. Drawn: `tenStance` [1.17, 1.21] with the feet
  side by side across the board (`tenSide` 0.09 m each side), toes toward the nose (body.js), facing the nose
  (`TEN_OPEN` 1.3 rad), tall, arms out wide, less lean and rail roll (so the legs still reach the deck in turns).
  Scores HANG TEN! (500). `node test/hang10.mjs`: mid-face in the pocket hangs ten; low or up by the lip stays hang five.
  (Known, not from this: climbing steeply with weight on the nose, the nose goes under the face and she looks to float.)
  **Dropknee turn** (the user: a longboard's roundhouse): on Queens the roundhouse is a dropknee turn (`WAVE.dropknee`,
  `moveNames`: "DROPKNEE TURN!"): no slow start, `roundhouseRate` 1.4x a normal longboard turn (up to 4 rad/s), and
  `roundhouseNoDrive`: it turns you without making speed (150 deg in ~0.95 s instead of ~1.6 s, no speed gain where
  the old roundhouse added ~3 mph); the back knee drops toward the deck (surfer.js `dk`). Zone 3 m out (small wave).
  Spray and mist scale with the wave (`misc.x` particle scale in the frame uniform; rail spray amount). A walk press
  counts once per frame (main.js clears `input.walk` after the first physics step: two steps moved it twice).
- **Which way a wave breaks** (2026-11-18): every wave peels toward +x (screen right seen from the beach,
  which for the surfer is a **left**: Raglan and Pipe are lefts, ridden goofy) unless its definition says
  `dir: -1`, a **right** (peels toward -x). Riding works along the wave in the peel frame whichever way it runs
  (xs ahead of the curl, the camera's shots, the particle sim); `toWorld` (wave.js) places it in the world: the
  camera (main.js), the water and particles (shaders.js `dirX`, Frame `misc.z`) and the surfer's position,
  heading and velocity (`worldRider`). The sun, sky and the surfer's body stay real-world, so a right gets its own
  lighting and is not a flipped picture. Controls stay from the surfer's point of view: on a right up the face is
  the surfer's right, so `readInput` hands Left/Right to the rider the other way round (Right turns up the face on
  Queens; checked in the browser). **Stance** is the surfer's (`stance: 'regular'` = left foot forward, default
  goofy = right foot forward): surfer.js builds the body from the toe side `T` (where the chest faces).
- **Queens is a right** (2026-11-18, the user's correction: the real Queens is a right, ridden regular): built as
  "Queens R" (`dir: -1`, `stance: 'regular'`: frontside, left foot forward) next to the first Queens, which peeled
  the other way (a left, ridden goofy). Checked identical in every other setting and in speed (same inputs, same
  speeds; peel 4.8 / wave 3.9 m/s), then the first one was dropped and this one named Queens (`queens`;
  `?wave=queensR` still opens it). Directions in the Queens notes above ("riding right", goofy) describe the first one.
- `src/wave.js`: the wave model. Two wave types share one 16-point layout: **crumble** (default, the
  crest spills foam down the face, no overhang) and **barrel** (the lip throws over into a tube). The game runs in the **peel frame** (moves with the breaking point),
  where the wave shape is static. Each distance `xs` from the peel point has a 2D cross-section curve
  through 16 control points, keyframed by phase (swell → steep → pitching → barrel → closing →
  whitewater) and smoothed with centripetal Catmull-Rom. Because it's one curve and not a heightfield,
  it can wrap around into a tube. Surface coords are `(xs, t)`, with `t` in `[0, 15]` along the curve.
- `src/rider.js`: **arcade surf control, designed for feel, not physics** (the physics-driven
  versions were tried and weren't fun). State on the face: `xs` (distance ahead of the curl), `t`
  (surface coordinate; smaller = higher), board speed `speed`, direction `phi` (0 = level along
  the wave, +π/2 = straight up the face, π = back toward the curl). Knobs are in `TUNE`.
  The face frame (`frameAt`): `e1` is the level direction on the face (it used to be the beach
  direction laid onto the surface, which tilted up/down wherever the wave reshapes along the beach,
  ±10-27 deg around the barrel exit, so a held board angle flattened out coming out of the tube),
  `e2` straight up the face. Moving along the wave keeps your real height (`t` corrected by
  `-Px.y·dxs/Pt.y`): staying at the same place in the cross-section carried you up and down over a
  lump that wasn't in the water. (A post-exit angle correction and a full re-solve of motion in
  the level frame were tried first: the first was a patch, the second changed how the barrel rode.)
  - **Energy pocket** (2026-11-21, the user; rider.js `ENERGY_TUNE`, live on every wave; it overrides parts of the speed
    model described below): holding the pocket means keeping pace with the curl, so the cruising target is 1.0x the
    local peel at any height (`pocketHold`), fading to `vLow` off the pocket. Height is stored energy: real gravity on
    your height change over the face (g sin(face) x sin(pointing), uncapped by `maxAccel`); pointing down pays only beyond
    cancelling the water's lift (`faceFlow`), so holding a line is neutral, and climbing costs only your own climb (the
    lift is free). Drag (`bleed`) pulls extra speed back to the peel. You drop in at 1.0x the peel (`dropInSpeed`; bar
    waves: the takeoff's average curl speed over its first 30 m). You drop in 3/4 of the way up the face on every wave (`dropInHeight`,
    default 0.75; was a fixed spot, mid-face on Raglan), so the drop's height gets you up to speed and pointing down
    pays from the start (2026-11-22, the user). Raglan's peel is 8.3 m/s (~18.6 mph; was 6.0, 13 mph): the user found it
    oddly slow, and Indicators/Manu Bay walls on a good swell are ~45-50 deg peels, ~17-21 mph. `node test/takeoff.mjs`.
    Over the top 20% of the face the pocket's hold fades with the water's lift (rider.js `crestFade`; the user,
    forever-on-top.jpg: you could sit on the lip forever): a line up there bogs and drifts back to the curl; the highest
    line you can hold is ~0.8 of the face. Not in the tube. `node test/crest.mjs`.
    Idle decay on the shortboards (`idleDecay` 0.22 m/s per s, ~0.5 mph/s, after `idleDelay` 2 s, set on Raglan, inherited by Pipe,
    Trestles, Dynamic; not Queens, not in the tube; the user, 2026-11-22): no key and no change of direction for 2 s and
    you lose ~0.5 mph/s, growing ~0.5 mph/s each further idle second up to ~3 mph/s (`idleRamp`, `idleDecayMax`), and
    the pocket doesn't top you back up, until you press a key or turn.
    Floaters (the user, 2026-11-22: not enough boost): no speed cost to get on (`moveScrub.floater` 0, was 0.05, which
    cancelled half of `floaterBoost`) and no post-move calm or speed freeze during a free floater, so steering down off
    the foam pays at once. `node test/floater.mjs`: peak +1.8 mph, ~+0.7-1.5 mph 1.5 s after.
    Airs need you coming up the face (the user, 2026-11-22): rising at least `airMinRise` 1.0 m/s (measured from your
    real height change, smoothed ~0.1 s, not the nose's heading) and `airMoveGap` 0.5 s since you were last in a move
    (floater, snap, slash, assist...). Fast enough but not rising: you stay on the top and the board eases round along
    the line. Every legit air in the tests rises 1.5-5.8 m/s, 9+ s after a move; the old floater launch came 0.28 s
    after the float. floater.mjs checks no air within 0.5 s of a float.
    `node test/idle.mjs`. Air thresholds are lift-off physics: 16 mph at the
    curl, 18 out. Foot spots as ratios of that speed: longboard middle 1.0x / nose 0.95x / tail 0.85x (a stall);
    shortboard back 0.95x / forward 1.04x. A longboard tail turn drives by its split (rail share in full, pivot share
    `pivotDriveK` 0.75), and the pivot share falls with speed (`pivotFastSpeeds`: 85% / 50% away from / toward the face at
    <= 7 mph, 60% / 35% at >= 15 mph). A shortboard turn's skid share (faster than speed / radius) drives at
    `skidDriveK` 0.75. In the tube: no `tubeDrive` / `trimCap`; the front-foot lean trims 1.04x; the back foot is the
    stall, 0.85x (`tubeBackSpeed`). Tests: energy, pivotshare, skid, tubetrim. Trestles' `physPocket` cruise is no longer
    used; the wall (`wallK`) now pays ~+1.4 mph on a steep section (was +2.2; test/wallspeed.mjs's 1.5 mph check fails).
  - Speed (the original arcade model; see the energy pocket above): the pocket feeds you toward a fast cruising speed (`vPocket`, faster higher on the face);
    the shoulder, flat water and foam bleed you down (`vLow`, `vFoam`). Dropping pays a lot (`drop`);
    climbing costs real speed (`climb`) and the pocket stops feeding you while you point up the face; dropping from
    the top half of the pocket pays most (`topDropBoost`, scaled by pocket power so the shoulder still bogs); pointing down high up also
    raises the acceleration cap (`highDropAccel`) and the soft speed limit (`highDropSoftMax`).
    On the point the pocket's speed (cruising target, the drop boost and the water flowing up the
    face) carries `shoulderReach` (2 m) further out toward the shoulder than the pocket itself before
    it fades (the user found you slowed a little too soon); the reef keeps 0.
    Above `softMax` (~32 mph) speed bleeds off fast, hard cap `maxSpeed` (~38 mph), so stacked moves
    can't run away. There is no pump control (removed by design): speed comes from
    the wave and from carving.
  - Turns: the turn radius depends on height on the face (`rTop` snappy up top, `rBottom` a long
    rail-to-rail arc at the bottom), so turn rate = speed / radius. A bottom turn (nose coming up,
    low on the face) generates a lot of speed (`bottomDrive`); carving up near the top adds some too
    (`topDrive`), and cruising speed climbs with height, so the high line is fast. A turn started while pointing down the face
    (`bottomCarve`) commits at once: full lean, a slightly wider arc (`bottomCarveRadius`), more drive
    (`bottomCarveDrive`). There's no automatic bottom turn: head down
    without turning and you ride out onto the flats (`tFlats`) and bog down.
  - Speed never builds faster than `maxAccel` (~22 mph/s when slow, tapering to `maxAccelFast` of
    that as you get fast), whatever is feeding it, so nothing surges.
  - Each move costs some speed (`moveScrub`), spends any banked turn drive, and the drop off it gets no
    high-drop boost until you're back below mid-face (`postMove`).
  - During a move and for `moveCalm` (0.95s) after it, speed can't rise at all (bottom turns excluded);
    `?moveaccel` turns that off for comparison.
  - Moves never add speed by themselves: they're quick board pivots, then gravity and the wave take
    over. Turn drive (bottom turns, high carves) goes through `driveBank` and releases over
    `driveSmooth`; bottom turns drive you out on the flats too. Pivots off the lip point you straight down
    (`lipExit`), the way you're riding; in the whitewater (re-entry, floater exit) shallower
    (`foamExit`), down and forward, and the foam can't slow you or catch you until you've cleared it.
  - The lip: you must be steering as you reach it (within `turnWindow`, 0.08s) to get a
    move; let go before the lip and it's an air (airs aren't blocked by `moveGap`). The pivot follows
    the way you're turning, never the way you were riding: turning away from the whitewater (surfer's
    right when riding right) = snap / off the lip / re-entry, ending down and forward; turning toward
    it = a quick 180 (`lip180Rate`) ending straight back down the wave, but only coming up out of a
    bottom turn (`comboWindow`) right by the curl (`curlZone[1]`), or straight out of a roundhouse
    (then it scores as a **rebound**). Anywhere else turning toward the whitewater at the top is
    just your own turn carrying you round over the top (a cutback off the top). Not turning, you go
    up and over the back (wipeout), or launch an air if fast enough and out of the whitewater. The wave carries you
    along in the air (`airDrift`) so you don't drift back into the whitewater.
    - Default rule (waves without `airPopPerSpeed`): an air above `airSpeed`, or within `airCurlZone` of the
      whitewater above `airMinSpeed`; pop `airPop` (+ a little with speed), and within `airBoostZone` of the whitewater
      it launches higher (`airBoostUp`, "BIG AIR").
    - Raglan, speed-scaled airs (the user's design, 2026-11-18; `airSpeedAt` / `airPopFor` / `bigAirSpeedAt` in
      rider.js): the threshold is `airSpeedCurl` (19 mph) at the curl's edge easing up to `airSpeed` (21 mph) by
      `airCurlZone` out. (Physics: the board leaves the water over the 3-5 m crest once v^2/R > g, ~12-15 mph; a
      usable ~0.5 m pop needs ~16-18.) The pop is `airPopBase` + `airPopPerSpeed` x (speed over the threshold there),
      eased out (`airPopTopSpeed` 30 mph, `airPopEase` 1.6) to `airPopMax` (capped at 3.5 m above the lip, the user): ~2 m at 22-23 mph,
      ~2.5 m at 25, ~3 m at 27, ~3.3 m at 29, 3.5 m from ~30 (a bit higher near the curl, where the threshold is
      lower; the ease-out, 2026-11-18, the user: keep building through to ~30 instead of capping at ~25-27; `airPopBase` 5.7 since 2026-11-18, the user: 28-30 mph was hard to reach,
      so heights start scaling ~4 mph earlier). BIG AIR (1.5x points) = a pop of at least `bigAirPop` (~2 m up),
      from ~20 mph at the curl / ~22 mph out on the face; the HUD speed glows pink when your
      speed would give one where you are. No separate next-to-the-whitewater boost. (Before: 24 mph on the open face
      and ~13 near the curl, where every air was big, so near the curl was the only place airs happened in play.)
      `test/lipspeed.mjs`: bottom turn up into the lip at different spots, speed at the top and what you get.
    On Raglan airs also reach `airIntoCurl` (0.6 m) into the breaking curl: heading up without turning,
    fast enough, that's an air rather than the automatic snap or a floater (2026-11-18, the user). In the air the
    surfer plays a pose sequence after air-1..7.jpg (surfer.js: stretch, tuck, nose-down reach, landing absorb, timed by
    the vertical speed); `?air=<xs>` starts a test air. `test/airs.mjs` sweeps launch distance from the curl.
  - Moves are decided by where you hit the top and how steep: in the whitewater (behind `curlZone`)
    → **re-entry**, otherwise → **snap** (shallow hits are a **top turn**). There's no separate
    "off the lip" any more (the user removed it): it's all the snap. Within `comboWindow` of a bottom turn it's a combo. Snap / off the lip / re-entry
    (turning away from the whitewater) **stay on the lip** (`r.lipSnap`). Climbing with the nose
    well up (`snapUp`), start the Right turn within `snapZone` below the top and the snap starts right
    there, on the face (reaching the very top while turning still snaps too). It holds you at least
    `snapLine` below the top, where the face is steep (point ~45 deg, reef ~65 deg; the point's crest
    is nearly level, 8 deg at the top). The board first comes round to point straight up the face
    (`snapStandRate`), deck showing, then spins down to the right. Your line runs
    along the wave, held there, while the fins release and the board swings round in place (`lipSnapSwing`,
    via `r.slide`) scrubbing speed (`lipSnapDrag`, ~28 -> 17 mph), then the fins grip (`slashGrip`,
    `r.snapGrip`) and you ride back down at `lipExit`. Your steering is ignored until they've
    gripped (holding the turn through it doesn't spin you round). The old version pivoted with
    `snapRate` while still travelling up, so it went over the lip and back. Riding back the other
    way (`rideDir < 0`) still uses the quick pivot.
  - **Roundhouse:** out on the shoulder (`roundhouseZone`, pocket below `roundhousePocket`), start a
    turn while riding along or down the line (not a bottom turn) and keep it going back toward the
    whitewater; the surfer crouches right down and gets further up on the rail than any other turn
    (surfer.js, past the usual roll limit). It starts slow and wide (`roundhouseStart` of the turn rate for `roundhouseHold`),
    eases up to the full rate over `roundhouseRamp`, tightens as you get deep into it
    (`roundhouseDeep`), never faster than `roundhouseMaxRate` (a sweeping arc), and you lean deeper
    and crouch lower as it comes round (fully deep by `roundhouseDepth[1]` of turn). Going round Left (up and
    back) needs to start mid-face or lower, or the arc reaches the lip (a 180 off the top). The
    slower arc means a cutback from the shoulder needs starting earlier (the pocket bot in
    pocket.mjs, which cuts back late, now meets the whitewater too low) (`r.crouchDepth`, surfer.js), scoring once you've turned `roundhouseScore` and are heading
    back. No `moveGap`/`moveCalm` from it, so it flows into a rebound off the whitewater.
  - Turning back into the whitewater (a cutback): you must meet its front edge (`foamContact`) in the
    top two thirds of the wave (`reboundMinHeight`) and be turning as you hit: Left → **rebound**
    (nose swings down and back down the line), Right → **rebound 180** (spins around through the
    top). Rebound needs the top two thirds of the full wave height (`reboundMinHeight`,
    measured in real height against the open wave at the curl), the 180 the top third
    (`rebound180MinHeight`; Right in between is a plain rebound). Low, or not turning, and the
    whitewater buries you. Assisted pivots don't add speed.
  - **Floater:** any hit on the top in the whitewater while heading down the line (except a steep,
    turning hit, which is a re-entry): you ride along the top of it until you clear it (`floaterMax`),
    then drop back down. Climbing up the whitewater from the flats behind it, you pop onto it and
    float once you're above `floaterHeight` of the wave (no need to reach the very top), and the foam
    drags less (`climbFoamDrag`) and doesn't count toward catching you while you climb it.
    On Raglan (`floaterSteer`, 2026-11-18, the user: the old floater grabbed the board and steered it) you keep
    steering the whole time: no forced heading, no locked assist. You get a little speed (`floaterBoost`, ~2 mph, eased
    in), no foam or climb drag while floating, can't climb above where you got on, and steer down to come off it at
    once; after `floaterSink` s the foam gives way (`floaterSinkSpeed`). It ends once you're clear, `floaterDrop` below
    where you got on, or turned back. `test/floater.mjs`.
  - **Air landings:** you land when the board crosses the water moving into it. On Raglan a touchdown with the
    nose pointing down the face always lands (`airLandDown` [15, 70]: from 15 deg back toward the whitewater to 70 deg out
    toward the shoulder of straight down; the user, 2026-11-18), whatever the spin, and you ride off the way you point.
    In the air the nose settles toward along the line turned by however far you've spun (so a ~90 deg spin toward the
    beach stays pointing down to land; the old pull toward along the line undid part spins). Wipeouts: touching down on the back
    of the wave, a spin more than `airLandSpin` (Raglan 1.1 rad, ~63 deg; default 0.9) off a whole half-turn, or
    falling 2 m below still water. (A steep descent could slip between two frames' cross-sections and fall through the face, ~3% of
    airs; stepAir now also tests the last spot's cross-section and lands you if you end up just under the face.) Landing in the whitewater gives `airLandFoamGrace` (Raglan 1.5 s) before the foam
    can slow or catch you. `test/landing.mjs` (spin timing) and `test/airs.mjs` (where you land, what happens after).
  - **Slash:** out of a real bottom turn (you came off the bottom pointing at least
    `slashDropAngle` down, below `slashDropLow`, within `slashDropRecent`), start the Right turn
    early, still at the very bottom (`slashLow`; the reef's is higher because its water lifts you
    fast) with the nose well up the face (`slashClimb`), within `slashWindow` of starting it; also
    in the barrel, with the same bottom-turn requirement. Little S-turns in the pocket or the barrel
    never slash. The fins hold for `slashHold` (an ordinary carve; let go before then and it's just
    a turn), then release, and that's when the move scores. While it slides the board swings round
    ahead of your line (`r.slide`, at `slashSpin` up to `slashSlideMax`, drawn via the heading in
    `syncPose`); your line follows part of it (`slashFollow`) and only some of your own carve keeps
    turning you (`slashCarve`). Sideways, the board scrubs speed hard (`slashDrag`, plus
    `moveScrub.slash` up front, nothing builds speed meanwhile): ~30 -> 17 mph on a short slash on
    the point. Let go, or once the board points `slashEnd` down, the fins grip and your line swings
    round to the board (`slashGrip`). In the barrel (`slashTube` overrides) it's a smaller,
    scrubbier slide: a bigger up-front scrub (`scrub`), harder drag, your line follows the board
    more, and while the board is sideways the water rushing up the face lifts you only `lift` as
    much, so it doesn't carry you up toward the roof. An armed slash takes priority over pulling in. Start the Right turn higher and
    it's an ordinary turn (a snap / off the lip at the top). No `moveCalm` after it.
    `node test/slash.mjs` reports and checks all of this, including player-style timing. History
    (2026-11-16): a mid-face Right-turn slash, then a looser one, both slashed too often; the user
    specified the low-start rule, then asked for more scrub, less turn and a real bottom turn.
  - **Steering lock** (`r.lock`, `lockInput`): while a move has the board (snap, rebound, 180,
    floater exit, roof deflection) your steering is ignored; as soon as the move is done whatever
    you're holding takes effect again, even if you never let go. (A version that kept ignoring a
    held key until you pressed it again was tried; the user preferred just the delay.)
  - Moves need at least `moveGap` (1s) between them. Inside the gap the lip is just a plain turn and
    the whitewater just slows you.
    Sit in heavy foam longer than `foamLimit` (1.0s on the point) and it takes you. The whitewater
    rolling out across the flats (below `tBottom`, ~7 m behind the curl on the point) knocks you off
    at once if you ride into it there (`checkHazards`), unless you're climbing up into it (a floater
    from the flats), floating, or just carried through by a move (`boost`). Land an air backwards (nose pointing
    back along the line) and you ride it backwards (`fakie`) for `fakieTime`, then the board spins
    back round ("Revert"). Airs: straight up the open face above
    `airSpeed`.
  - **Tube riding** (`tube: true` waves): the barrel is normal surfing (same turning, rail, drop speed)
    with rules on top (`checkHazards`). You're in the barrel once the curl has passed you while you're on
    the face (`tubeEnter`); there's no assisted entry. (A **pull-in** assist was removed 2026-11-17, the
    user's call: turning high near the curl swung the board level, pulled you down to a set line and
    stalled you until the curl passed, which read as the board being redirected as "in the barrel" came
    on. Without it, normal surfing tends to outrun the barrel: you get in by slowing down near the curl.)
    **Barrel stance** (2026-11-17, the user's request, after barrel-stance.jpg in braickish/reference-images):
    `r.barrelCrouch` builds with depth in the tube (a compact crouch going in, the full stance by about
    half depth: back knee dropped toward the deck, hips low, chest folded over the front thigh, hands low by
    the knees, head up looking down the line; surfer.js `bc`/`deep`). Really deep (past ~40% depth, full by
    85%) `r.frontLean` builds slowly: hips and chest shift toward the nose, and it adds a slight push
    (`tubeLeanDrive` 1.1) and lets you trim slightly faster (`tubeLeanOver`, 0.45 m/s; the user had them halved from 1.5/0.6, then raised a bit), so deep in you creep
    forward a little (~0.35 m/s over the peel at 70% depth, vs 0.25 without the lean).
    **Barrel entry on the sim reef** (2026-11-17, the user saw the barrel view come on while out toward the
    flats): the sim shape has a long low base in front of the face, and `t <= tBottom + tubeEnterLow` reached
    3-5 m out in front of the lip tip. Waves with `tubeReal` also need you `enterIn` (0.5 m, the user's
    pick, so the barrel is over you) in under the lip (`lipTipZ`), and near the opening (phase below
    `outBefore` 0.45) you're out once you're less than `exitIn` 0.3 m in: a 0.2 m gap between where it starts
    and ends (the user's pick; a 0.25 s settle and a 0.75 m 'well out' rule were tried first). It used to wait
    for phase `tubeExit`, ~0.6-3.6 m further on. The barrel view (main.js `updateTubeView`) switches with the
    barrel and holds `VIEW_HOLD` 1 s after any switch (tried 0.6 s, then 2 s; it used to stay on until
    `TUBE_VIEW_OUT` 5 m out on the shoulder). Deeper in, a low turn out in front of the curtain doesn't
    end the barrel (making that the lip landing on you was tried and was too harsh on S-turns). The position itself
    never jumped at entry (checked: the entry step is a normal step); it was where the view switched.
    **Slashes in the barrel are easier to start** (2026-11-17, the user): `slashTube` carries gentler gates
    used only in the tube: a smaller, shallower drop counts (`slashDropAngle` 0.35, below `slashDropLow` 0.45,
    tracked as `r.tubeDropTime`, which is recorded outside the tube too so a drop just before you go in
    counts), within `slashDropRecent` 1.6 s, from up to `slashLow` 0.45, with `slashWindow` 0.2 s and only
    `slashClimb` 0.15 nose-up. A drop / bottom turn / Right in the tube from mid-face now slashes 14/16 of
    the timings tried (9/16 before); little S-turns still never slash.
    **Reef slashes turn less** (2026-11-17, the user): the reef's tune sets `slashSlideMax` 0.6 (point 1.0),
    `slashSpin` 4, `slashCarve` 0.3, and in the barrel `slashTube` 0.26 / 0.22 (merged over the rider's
    `slashTube` in `useWave`): a reef slash turns ~69 deg on a short hold, ~88 on a long one (was 83 / 120).
    Barrel trim on the reef is 15% stronger (`tubeDrive` 5.2, `tubeTrimOver` 0.29, `tubeTrimOverHigh` 1.32).
    **Snaps only at the lip, out on the shoulder; check turns elsewhere** (2026-11-17, the user): on the reef
    (`snapShoulder` 4 m x size, `snapNear` 0.8) a snap needs you right at the lip and that far ahead of the
    curl (`snapAllowed`); where a snap used to fire otherwise (the early snap anywhere in the top `snapZone`, or
    turning away at the lip in the pocket) it's a **check turn** (`startCheckTurn`, move 'check', "CHECK
    TURN" 200 pts, scrub 0.05): a brief assist of up to `checkTurn` 1.3 rad ending no steeper than `checkExit`
    0.35 rad down, at `checkRate` 4.5 rad/s (a snap ends 70 deg down at 13). The point keeps its snaps.
    **No roof deflection** (removed the same day): in the barrel, riding up into the roof is over the falls
    (it used to pivot you back down at snap speed). The lip moves don't happen in the tube at all. The
    'too high' line is at 90% of the tube's height (`tubeReal.fall`, was 80%), so you go over right by the roof.
    **Open-face top by real height** (2026-11-17: the user saw the surfer ride into / through the lip on the
    shoulder): the drawn water and the physics surface match (checked: within 0.11 m), but the open face's top
    (`faceTop` t 5.3) sat over the sim shapes' broad, rounded crest, so you rode along on top of the curl. On
    `tubeReal` waves the open-face top is now `tubeReal.faceTop` 0.88 of the way from the trough to the crest
    (`faceLineT`), blending into the barrel's roof line as the lip throws; riders top out at 86-88% (were
    98-101%). The reef's `snapZone` is 1.5 (was 3) so the zone near the top where Right is a snap/check turn
    doesn't reach down the face. **Shoulder speed:** the reef's `shoulderReach` is 6 m (x size; was 0), so the
    pocket's speed carries further out (racing out: ~34 mph 12 m ahead of the curl, was fading before 8 m).
    **Turn damping in the barrel** (2026-11-17, the user's request, then more): turn rate is scaled by
    `1 - tubeTurnDamp * r.tubeDamp`; `r.tubeDamp` eases toward depth (full by ~50%) and back out, so
    turns get gradually subtler the deeper you are (`tubeTurnDamp` 0.6 on the reef; was 0.45, full by 70%).
    On the sim reef (`tubeReal`) it starts 1 m before the barrel's entry point (both in under the lip and
    along the wave as the curl comes to you), reaching a quarter of full damping as you go in, then builds
    with depth (the user asked for it to begin a little outside the tube).
    **Climbing in the barrel is slowed** (`tubeClimbDamp` 0.45): while your line rises (board speed up the
    face plus `faceFlow`), the rise is cut by 30% going in, up to 45% deep, so turning up the wall doesn't
    suck you into the roof (holding a turn up deep in: +0.2 m in 1 s instead of +3.2 m). The open face is
    unaffected.
    In the tube: past `tubeCollapse` = pinched; driving straight into the
    roof = over the falls (it used to deflect you back down unless steeper than `roofCrash`; removed). On the reef the water rushes up the face
    (`faceFlow`, scaled by steepness and pocket power): riding level drifts you up, you hold your line
    pointing about 23 degrees down. Every wave's flow is `faceFlowK` 0.46 x its wave speed c = sqrt(g (depth + H))
    at breaking, measured live from the wave's current shape (rider.js `faceFlow()`; Pipe's tuned 5.7 m/s is the
    reference; the user, 2026-11-21): Pipe 5.7 (c 12.4), Raglan 4.3 (c 9.4), Queens 2.5 (c 5.5); Trestles and
    Dynamic 3.6 at the peak easing to 3.1 inside as the bar reshapes the wave; sets scale it (Pipe 5.1 / 6.2 at
    0.8x / 1.2x). It follows the wave's size, not the peel speed. Up the face it slows as it climbs (Bernoulli along
    the surface: q / q_bottom = sqrt(1 - 0.88 x height), 0.78 at a mid-face takeoff, 0.35 at the top; rider.js liftTop,
    with the fade over the top; not in the tube; the user, 2026-11-21: Raglan's takeoff felt flat at full flow). In the tube, trimming flat or pointing down the
    line adds acceleration (`tubeDrive`) (brushing it deflects you down); way below the bottom
    (`tubeLow`) = the lip lands on you; back past `tubeExit` = out. Caught way up in the lip as it throws
    (`tubeTooHigh`), or riding in the top 3/8 of the barrel (`tubeFallHeight`) = over the falls. The barrel
    picks you up once you're on the face or just below its base (`tubeEnterLow`). Scored by time x average depth. HUD: depth across, height up/down.
    Reef shape (`KF_PIPE`, reshaped 2026-11-16 after a reference photo of a heavy reef barrel in
    braickish/reference-images, pipe-example.jpg): a tall wall stands up well ahead of the curl
    (`phase.ahead` 14), near vertical and slightly hollow before it pitches (no overhang until the
    lip throws, so the rideable face is unchanged); the lip throws far out into a round tube about
    as wide as it is tall, the lip a thin sheet (roof and curtain), landing well out in front. The roof sits right up under the outside of the lip (raised 2026-11-16: the user found the top, where it breaks, too thick), and the pitching lip throws out nearly level before it falls, so from the channel the tube opening reaches up close to the crest. The
    broken wave behind the closing tube lasts longer (`phase.behindFar` 22 m per phase past
    `farFrom` 1.3, eased in so there's no crease; the tube itself keeps `behind` 13, since
    stretching it changed how the barrel rides). Looks: the thrown lip white and frothy across
    its whole outside (its glassy glow fades once it has thrown), feathering along the crest of the wall, light glowing through the
    lip as it pitches and a narrow turquoise band just under the crest of the wall ahead (`thin`; the user
    wants the wall's glow less tall than the lip's, fading out quickly), and an offshore spray plume blowing back off the crest (the wave's
    `plume(s)`, particle kind 4, from the crest position in the lip table), and whitewater bursting up
    where the curtain lands (`lipImpact(s)`, blowing out toward shore, away from the tube). The reef drops you in
    at `startXs` (5 m) since the wall stands up further ahead. `test/plot-slices.mjs` draws the
    cross-sections (render the SVG to PNG with headless Chrome `--screenshot`).
    Barrel view (main.js `updateTubeView`, the `tube` shot): on once you're in the tube (the user
    tried switching it on earlier and went back to this), and it stays on after you come out until
    you're out on the shoulder or wipe out (changed 2026-11-17: now it ends with the barrel, see below). In the tube the
    camera is pinned inside, `TUBE_CAM_BACK` (5.5 m) behind you and about `TUBE_CAM_UP` (1.5 m) above
    you (the most open spot near that height, `tubeCenter`; up near the roof was tried and the user
    found it too high; 7 m back was the previous distance). If there's no tube that far back (deep in
    the back of the barrel it's pinched shut) or the view to you is blocked, it searches closer along
    the inside of the tube, and with nowhere at all it holds its last spot (`lastTubeSpot`): it used
    to pop out the back of the wave there.
    **Never inside the wave** (2026-11-23 a final guard, `tubeCamOK`: in air, `TUBE_CAM_ROOM` 0.35 m from the water, a clear
    view of you; 2026-11-24, the user: on Pipe it could still end up inside the wave): when no spot in the tube passed, the
    last resort sat just behind your head, unchecked, and high in the mouth of Pipe's barrel under its thick lip that was
    0.7-0.95 m inside the lip (default view on a small Pipe, `?size=0.8`: 81 frames in the water in a minute; the chase view
    too). `nearestAirSpot` now takes the first spot near your head, then out toward the open face, that passes; and every
    other view gets the same in-the-air check after smoothing (the chase view trailed into the lip riding high behind the
    curl: 230+ frames a minute). `node test/camera-water.mjs` rides Pipe in headless Chrome and checks the camera every
    frame (fails on the old code).
    **Washing machine:** wipe out in the barrel (pinched, too high, too low, caught in the lip) and
    `r.washing` is set: a longer hold-down (3.2s) and the screen goes to a churning white foam ball
    (`src/washer.js`, a 2D canvas `#foam` over the game), fading out as the score card comes up.
    Caught up top (too high in the barrel, into the roof, or caught in the lip pulling in) you first
    go **over the falls** (`r.falls`, `startFalls`/`stepFalls` in rider.js): sucked up the face, round
    under the roof and out to the lip tip (`FALLS_UP`, 0.5s), then carried with the tip as it throws
    out and down until it lands near the trough (following the tip back along `xs` is following that
    water in time), tumbling slowly. The camera cuts to the channel view to watch; the washing
    machine starts when the lip lands (`fallsLand`, with a splash). You come off your board (the user: you aren't
    attached to it): the surfer goes over alone, curled up in a ball (the `tuck` in surfer.js), while the board
    (`r.fallsBoard`, `stepFallsBoard`) stalls on the face, then is dragged back under the curtain and down
    toward the trough, flipping end over end. It tips down toward you so you sit a little above the middle of the frame.
    Coming out it eases back down to right behind you (`tubeBlend`). It never snaps or jumps
    between distances (earlier versions did, and hopped around out on the flats). Mist particles
    fade near the camera-to-surfer sightline (shaders.js) so spray never covers the surfer. Reef shape is `KF_PIPE`
    (waves/shapes.js); `faceTop` lowers smoothly as the lip throws.
- Heavy waves (`floaters: false, rebounds: false` in the wave's tune, e.g. the reef): hitting the
  whitewater or the lip next to it is a crash ("Over the falls"), not a floater or rebound.
- **No shoulder bend** (removed 2026-11-17): a `bend` that curved the shoulder in toward the beach was tried
  (0.15, then 0.3). It shifted the surfer's direction on the flats: the board's 'along the wave' direction
  there was the fixed beach direction while the water ran along the bend, up to ~17 deg apart, swinging at
  the bottom of the face. The user had it removed; the wave is straight again.
- **No ridge at the tube's opening** (2026-11-17, the user's idea: push the curl/upper tube higher): in the
  two wall keyframes (s -1.2 and -0.25) the points that become the lip (8-12) sit high on the upper face,
  and the wall below them leans slightly out instead of being hollow. With them spread down the wall, they
  dragged a fold across the rideable face as they peeled into the lip: the face just outside the opening
  overhung (112 deg at 4.5 m up, vs 78 in the tube). Now it peaks at 83 and eases out to the shoulder.
  `node test/steepness.mjs` measures it.
- **Smooth from the tube out to the shoulder** (2026-11-17, the user's rules): at any height the face is
  steepest in the tube and eases going out (`test/steepness.mjs`); the face's position along the wave should
  never surge forward and fall back (a bump seen from the tube; `test/concave.mjs`); no corners
  (`test/corners.mjs`). The tube's roof (points 10-13 of the full and closing tube) lies on an ellipse, so the
  top is a true arc. Only the lower face points (12-14) were tuned, by a small coordinate-descent script
  against these measures. Lesson: letting the optimizer move the lip's or wall's upper points (6-11) put lumps
  on the crest, a notch under the forming lip and a wavy roof, and thickened the lip, while the scores
  improved; keep the lip/crest points fixed and always look at test/plot-slices.mjs output. Remaining: the
  upper face (~5.5 m) still pushes ~0.5 m forward at the opening as the lip forms, and steepness at 4-6 m
  creeps up a few degrees there.
- **Tube as a tapered cylinder** (the user's model, 2026-11-17): the closing tube (s 1.3) is the full tube
  (s 0.8) scaled to 78% about the bottom of the back wall, lip, roof, crest and all, so the tube keeps one
  round section and narrows steadily toward the back (~0.3 m narrower per m from just inside the mouth to
  the pinch). Tried and dropped: a further 66% copy at s 1.8 (barely changed the taper and folded the tube
  into a loop where it hands over to whitewater). A small fold at xs -24..-28 where the closing tube turns
  to whitewater is old, under the foam. Also tried and reverted the same day: a hidden guide point on the
  flats to remove a spline sag in front of the wave (the user said it made it not work).
  Next idea (the user's): carry the cylinder out past the tube onto the shoulder, growing at a smooth rate,
  with only part of its circumference being wave (the rest sky) further out, and it only breaks up to a point.
- **Cylinder wave (tried and dropped, 2026-11-17):** shapes generated from one growing cylinder along the whole
  wave (behind `?cyl`). Smooth from inside the tube, but the user found it wasn't good overall; removed. Next:
  wave shapes from real 2D breaking-wave simulations (see research/wave-sim).
- **The reef is the simulated one at 1.2x by default (2026-11-17, the user's pick).** `?classic` (CLASSIC=1 in
  node) brings back the hand-built `KF_PIPE` shapes at their old size; `?sim` is now ignored, and `SIZE`/`?size`
  is absolute (1.2 = the default). Tests run on the new default. History of the sim shapes:
- **Simulated reef (originally behind `?sim`; 2026-11-17):** the reef's building, standing,
  pitching and full-barrel keyframes come from a 2D BEM simulation of a 4 m solitary wave over the Pipeline
  reef profile (~/workspace/research/wave-sim, run pipe_a4, frames 24.6/25.7/26.5/27.0 s), converted by
  `sim_to_keyframes.py` there into `src/waves/sim-pipe.js` (regenerate, don't hand-edit). Points sit on
  landmarks (crest, lip tip) with the inside spaced evenly from the tip to the knee of the face (pinning the
  roof made a corner; uneven spacing made a notch). The lip is extrapolated ~0.12 s on to touchdown at sea
  level; the closing tube is the full tube at 78%. Scores better than the current reef on steepness,
  concave and corners, but the tube is a lower wedge under a long sloping lip, and tube riding (tuned for
  the round tube) pinches the S-turn riders in test/tube.mjs; not retuned yet.
  The barrel's lines on `?sim` (`tubeReal` in reef.js, `tubeLineT` in rider.js) are set by real height in the
  tube, trough (`tBottom`) to roof, per phase: the roof line (`topOfFace`) at 92% and over the falls above 80%.
  The t-based ones (`faceTop` 11.9, `tubeFallHeight` 0.62) assume the normal reef's point layout; on the sim
  layout they put the roof half way down the back wall and caught you at ~20% of the tube's height.
- **Snaps into the breaking lip on Raglan** (2026-11-18, the user: turns right at the lip gave floaters): with
  `snapIntoLip` 1 m, turning Right as you meet the lip still snaps up to 1 m further behind the curl's edge
  (`curlZone[0]`), with foam up to 0.65 there (was 0.3). On that edge the climbing-into-the-whitewater floater
  waits until you reach the top, so the turn decides; not turning there is still a floater. Climbing at 52 deg and
  turning, snaps now reach xs -1.3 (were floaters behind -0.4); from -1.6 back it floats.
  Then (the user's rule, same day): barely onto the breaking lip (`curlZone[0]` - `snapIntoLip` to `curlZone[0]`), a
  board pointing straight up or angled toward the shoulder at all (`cos phi >= -0.1`) snaps even without a turn
  (`autoSnap`); angled back toward the whitewater it's the usual moves. Right at the curl and ahead of it, not
  turning as you cross the top is still an air (the user), and turning there snaps.
- **Raglan turn drive** (2026-11-18, the user: some turns had too much artificial acceleration coming out of them).
  Found: turn drive made most of a bottom turn's speed (27 -> 38 mph; 13 without drive), released as a steady push at
  the acceleration cap; `highDropAccel` 4 raised the cap 5x whenever the nose pointed down high in the pocket, so a turn
  swinging down up there surged +59 mph/s; the roundhouse added ~5 mph. Changed on Raglan only (point.js; Pipe copies
  point's tune, so reef.js pins its old values): `bottomDrive` 6.5 / `bottomCarveDrive` 1.5 / `topDrive` 1.28 (were
  8 / 1.6 / 1.6), new `driveMaxAccel` 7 (turn drive alone adds at most ~16 mph/s; excess is spent, not saved, rider.js),
  `highDropAccel` 1.5, `roundhouseNoDrive`. Now a bottom turn 27 -> 30 mph, on the flats 25 -> 26 (still builds a
  little: the user's rule), worst spike +32 mph/s (was +47), pocket rider avg 20 mph (was 23), max 30 (was 34). A first
  try at 5 / 1.2 / cap 5 made bottom turns add nothing and the pocket bot got buried.
  Then (same day, the user): `bottomDrive` back up to 7. Snaps and slashes dropped too much speed and held you after:
  on Raglan `lipSnapDrag` 0.7 (was 1.4), `slashDrag` 2.2 (3.2), `moveScrub` snap 0.06 / slash 0.15 (0.08 / 0.25), and
  `moveCalm` 0.25 s (was 0.95: after a snap she sat pointing down the face at a frozen speed for ~0.5 s). Snap now 27 ->
  19-22 mph and the drop off the lip picks up at once (was 27 -> 14, held); a slash 28 -> 19 / 15 (was 26 -> 14 / 8). The
  short pause also gets rebounds out of the whitewater (a slow rebound spent 1.27 s in the foam and slid back behind the
  curl; now 0.63 s and 2.8 m ahead), which the user had asked for. More speed into the shoulder: `shoulderReach` 3.5
  (was 2), new `shoulderFade` 1.6 (the pocket's speed fades over 1.6x its length), `bleed` 0.65 (0.9): racing out it's
  32 mph 12 m ahead of the curl (was 23). Pipe pins its own values for all of these in reef.js and is unchanged.
- **Raglan speed, second pass** (2026-11-18, the user: still too much acceleration out of top turns, bottom turns and
  snaps, and speed building on speed). Traced per move (where each mph comes from): after snaps, rebounds, the 180 and the
  roundhouse almost all the gain was the drop (`drop`, x`topDropBoost` 8 high in the pocket), switching on at full in one
  frame as the snap's fins gripped (-13 -> +21 mph/s); bottom turns were pinned at the turn-drive cap. Raglan only (Pipe
  pins its old values in reef.js, the user: don't change Pipe; Queens unaffected; both checked identical):
  `topDropBoost` 2 (was 8), `highDropAccel` 0, `bottomDrive` 5 / `topDrive` 0.3 / `driveMaxAccel` 4 (were 7 / 1.28 / 7),
  `postMoveDrop` 0 (the drop off a move adds nothing until you're below mid-face: the wave's own feed brings speed back),
  `moveEase` 0.4 s (speed eases back in after a move instead of switching on), and against speed building on speed:
  `driveRefSpeed` 9 m/s (above ~20 mph a radian of turn pays less, since turns come round faster when fast) and
  `dropTerminal` 17 m/s (a drop adds less the faster you go, nothing by ~38 mph). Now: snap 27 -> 18 at the grip -> 21 mph
  0.5 s later (was -> 26); bottom turn +2 mph at 20 mph, ~0 at 27 (was +6 / +3); on the flats at 25 mph it now loses ~1;
  top turn makes ~0 in the turn; pocket rider avg 23 mph, max 28 (was 26 / 30), still riding all 30 s.
- **Color and the surfer's light** (2026-11-18, the user): every color goes through `vibrance` in `tonemap`
  (shaders.js, `VIBRANCE` 0.45: muted colors pushed most, greys and whites like foam untouched), so the whole game
  is more saturated. The surfer (skinned body, and the parts surfer in the real look) is lit by its own key light
  (`keyLight`: the sun pulled round toward the camera and up), since from the riding camera we see the side away
  from the sun and the user liked her colors seen from behind / in the barrel; plus `camGlow`, a little fill and a
  warm rim. Water and sky keep the real sun.
- **Ripple size** (`rippleK`, Frame `misc.y`): Queens and Raglan both use 2x finer ripples than the base (Raglan
  since 2026-11-17: the user thought its texture looked slightly off next to Queens; at 1x it read as coarse,
  blotchy streaks). Real ripples come from the wind, so they shouldn't grow with the wave. Pipe uses 1.5x (2x made the distant flats grainy seen from inside the barrel).
- **Texture on the flats:** the ripples carry on out across the flats in front of the wave (`flatsReach` in
  shaders.js), fading over ~50 m, instead of stopping at the bottom.
- 2026-11-17: the project was rolled back to the surfboard commit (a3cc07a) after later reef work broke the
  waves; the glow band, the smooth bend and the flats texture were then re-applied one at a time. The water
  still flows the original way (up the face, drifting with the peel).
- **HUD** (2026-11-18, the user): score, speed and best. The speed readout was dropped and then brought back the same
  day; it glows neon pink, pulsing, while your speed would give a BIG AIR where you are (`bigAirSpeedAt`; shows whole mph rounded down). And "Drop in!" no longer says which wave of the set or the face size (sets still vary the waves).
- `src/sea.js`: **sets and sections**, from the wave's `sea` settings. Each ride is the next wave of the
  set (`setWaveSize`: bigger waves peel a bit faster). Sections (`SECTIONS` in wave.js) are stretches
  ahead that break early for a while (fixed to the reef, so in the peel frame they move back toward
  the curl; `phaseAt` raises the phase there). **Sections are currently off on both waves**
  (`sea.sections: false`); they didn't play well yet. Seeded (`seedSea`, `?seed=`); `?nosea` turns the
  sea off. Tests run without the sea.
  **Wave addresses** (2026-11-23, accounts plan task 1): every wave is (the sea's seed `SEA.seed`, its number `SEA.n`).
  `goToWave(n)` builds wave n from its own seed (`waveSeed(seed, n)`: the seed itself for wave 0, a hash after), so its
  set place (n % set), sections, ridges and a bar's map (map n + 1, the old order) don't depend on the waves before it or
  on the title demo. `nextWave()` is `goToWave(SEA.n + 1)`. The physics already ran at a fixed 1/120 s step (main.js `STEP`)
  and nothing random touches a ride, so a ride is a pure function of (wave, seed, n, the inputs each step): contests
  and replays rely on that. `node test/determinism.mjs` rides wave 3 of every wave three ways (after other waves, straight
  there, after other rides) and needs them identical, scores included. (energy.mjs's Trestles and Dynamic trim rows had
  each run on a different map, as the map counter ran on across its reseeded rides; they're now all on one.)
- **Water rendering:** the GPU builds the surface every frame from a cross-section table (512 phases,
  built per wave in `buildWaterTable`) and each slice's current phase (`slicePhases`), so the wave can
  change over time. The spray emitter table is refreshed every frame too. (`buildLipTable` works out each cross-section's shape
  once and reads every point off it, ~0.3 ms; it used to call `surface()` 18 times per xs, ~1 ms of the ~1.3 ms of
  JS per frame, with identical output.)
- **Riding camera** (main.js, `camMode` 0): out in the channel a little ahead of the surfer, so the
  shoulder ahead and the broken part behind are both in frame. On a phone held upright (aspect < 1) it sits 1.3x further out
  and aims 2 m ahead of the surfer, so they're in the left third with the shoulder in view (2026-11-18, the user:
  it used to come 25% closer and you lost the shoulder).
- **Ink outlines** (shaders.js `vsOutline`): an object's `outline` is its thickness seen from the riding camera
  (~14.8 m out); closer than 14 m it thins with distance so the line keeps the same weight on screen. In the barrel
  view (~5.5 m behind) it was ~3x heavier and the surfer looked like a cartoon cut-out next to the shoulder view. The
  part itself fills out by the ink it loses (`vs`, `inkK`), so every part keeps its shoulder-view size (thinning the
  line alone made the neck, arms and wrists 20-25% skinnier). A negative `outline` draws no ink but still fills out
  (waistband, shorts logo, stringer, which sit flush on parts that grow).
- **Real look** (2026-11-18, Step 1 toward a realistic body; the user's reference more-refined-body.jpg in
  braickish/reference-images, a realism target only): `?look=real` / `?look=toon` or **V** in the game (remembered,
  `LOOK.real` in surfer.js; default the illustrated look, which is unchanged). Smooth shading instead of toon bands
  and ink (shaders.js `realShade`: wrapped sunlight, sky and water-bounce light, sheen by material `spec`: cloth 0.1,
  skin 0.35, hair 0.25, board 0.7; Obj `mat`, Frame `misc.w`), shaped limbs and torso (mesh.js `LIMB_PROFILES`:
  thigh taper, calf, deltoid/bicep, forearm, V torso), joint spheres sized to meet them (`jr`), hands (palm and
  thumb), feet (long, toes to the toe side), a nose and ears, board graphics (nose logo, tail pad on shortboards),
  boardshorts hem and side stripe, and the surfer's shadow on water the sun lights (not on the face, which is in
  the wave's own shade with the sun behind it). Saved for later (not built): Step 2, one continuous skinned body
  driven by the pose skeleton; Step 3, motion detail (spine bend, weight shifts, arm follow-through).
- **Skinned body: the only surfer** (2026-11-18, Step 2 toward a realistic surfer; made the default and the parts
  surfer of spheres and cylinders dropped the same day, the user's call: no `?body`/B/V switches any more, surfer.js
  draws only the board and works out the pose, `pose.J`; both bodies are fetched at start-up, the current wave's
  before the first frame). `assets/body/guy.glb` and `girl.glb` (~0.95 MB each, 13.7-13.9k
  quads, MakeHuman's 53-bone `game_engine` skeleton) are built from MakeHuman's **CC0 core assets only** (MPFB2's
  bundled base mesh, targets and skeleton, plus the official system asset pack's `male_generic` / `female_generic`
  body meshes); no community assets (some are CC-BY: the user's rule; we make clothes and hair ourselves). Built by
  `~/workspace/research/body/scripts/build_surfer.py` (repo braickish/surfer-body, private; its release
  `sources-2026-11-18` keeps the full CC0 system pack and the MPFB 2.0.18 build) in Blender 4.5 LTS with the MPFB extension (body settings
  there; `feet_on_ground=False`, or MPFB fits the skeleton 0.86 m off the mesh). Game side, no dependencies:
  `src/glb.js` reads the .glb; `src/body.js` poses it from the same procedural pose as the parts surfer
  (`pose.J` from surfer.js): torso, neck and head by mapping the rest body frame onto ours (the head kept up and
  looking down the line), arms and legs re-solved with the body's own bone lengths to our hands and feet (the
  hips lowered by the leg-length ratio so crouches survive), fingers and toes riding along; tumbles in wipeouts.
  The renderer skins it on the GPU (`skinnedWGSL`, the real-look lighting, one draw). Clothes and hair are ours,
  painted per vertex in main.js `bodyColors` (by bone and rest position: boardshorts and waistband; the girl's
  rash guard with cuffs and floral bottoms; scalp hair and eyebrows from each head's measured top and face) plus
  hair volume riding the head bone (`hairObjects`). Lighter (2026-11-18, the user found them dark): a soft fill light from
  the camera's side in `skinnedWGSL` and lighter skin tones. Arms smoothed (the user: jerky): surfer.js eases each
  hand toward its pose spot (~0.07 s, measured from its shoulder in the body frame, for both surfers), and the
  skinned elbows use the pose's steady `elbowPole`; test/arms.mjs: worst riding jump per frame 21 -> 4.6 cm
  (Raglan), 91 -> 15 cm (Pipe), 12 -> 4.4 cm (Queens). Elbow glitches (the user, same day): the skinned arms
  bent toward one shared, mostly-downward pole, so a hanging arm lined up with it and the elbow spun round (the
  upper arm twisting up to 180 deg in a frame). Now each arm has its own pole (back, out to its side, a little
  down: `poleF`/`poleB`), and body.js holds and eases the bend side in the body frame (~0.06 s) when the arm lines
  up with it; test/elbows.mjs: worst twist 180 -> 28 deg/frame (Raglan), 177 -> 53 (Pipe). Both surfers tanned.
  **Longboarder after the user's references** (2026-11-18: `stance for longboard.jpg`, `walking-position.jpg`,
  `nose-ride-position.jpg` in braickish/reference-images; surfer.js, both surfers): in the middle the front arm
  hangs nearly straight by her side and the back arm is bent with the hand out a little at hip height (`lbMid`;
  turns still move the arms from there); walking (`pose.walkW`, while `foot` moves toward `footGoal`) the front arm
  reaches forward and down and the back arm is bent, elbow back, hand by her chest; on the nose the front arm
  reaches low toward the nose and the back arm is raised high behind, bent, the hand above her head. The skinned
  head looks down at the board (`lookDown`). Her body was rebuilt slimmer with longer legs (build_surfer.py
  `girl` macros) and her hair pulled back in a ponytail (`hairObjects`). She stands more upright with her feet closer together (the user): `stance`
  [-0.19, 0.17] (36 cm apart, was 54), `noseStance` [0.9, 1.23] (33 cm, was 49), knees 40% straighter and the torso
  leaning less (`upr`), except all the way back on the tail. Drawing only: the riding is unchanged.
  **Her look after hana-likeness.jpg** (the user's reference, 2026-11-18; styling only, not the face): long brown
  hair worn loose (the ponytail removed) as a smooth fall down her back in three flattened pieces (head, a long
  sheet on the upper back riding `spine_03`, lighter ends) (no locks over the shoulders, the user's call; she's also more tan), swaying on a spring
  with the head's movement (`hairObjects`, `b.sway`); a light-blue floral bralette top with thin straps and a scoop
  neck, a bare midriff, floral boy-short bottoms (sage, cream, brown), bracelets, and a black leash cuff on the back
  ankle (main.js `bodyColors`). Skinned body only: the parts surfer keeps the rash guard and bikini bottoms. With the body on, everything uses the real look. Cost
  (test/profile.mjs, retina): no measurable change (GPU about the same as the parts; JS +0.01 ms).
  Future (saved, not built): a skin texture and eyes from the system pack, Step 3 motion detail (spine bend,
  weight shift, arm and hair follow-through), proper hair and clothing meshes.
- **Round body parts** (surfer.js): spheres on the axes across / along the torso / toward the chest shear as the
  torso leans; the shear is capped at `SHEAR_MAX` 0.6 (ordinary riding reaches ~0.57, so riding is unchanged; the deep
  barrel stance squashed the chest and head). The neck, head and hair follow `headDir` (in the barrel stance the head
  used to lift off the end of the neck, leaving a skinny strip), and the head squares up as the stance builds. The flat water's sun reflection is
  damped (shaders.js `flatness`), since facing the sun more it blew out into a white smear.
- **Scoring:** only moves, airs and barrels score; riding by itself doesn't. Bottom turns and top
  turns aren't called out as moves: they add their points quietly (main.js `handleEvents`).
- `src/mesh.js`: builds the water's cross-section table and grid, a lip lookup table for particle emitters, and the box/sphere primitives for the surfer.
  **Boards** (`BOARDS`): each wave picks one with `board` in its definition (default the fish). The point rides a
  1.6 m twin-fin fish; the reef a 6'6" thruster shortboard (19.3" wide, pointed nose, pin tail, ~7" nose rocker
  and ~3" tail lift; the user asked for more rocker). Shape, stance, fins and stringer live together in the
  board's entry; the stringer, fins and feet follow the rocker.
- `src/shaders.js`: WGSL. Water (fresnel sky reflection, backlit translucency in the lip, flowing
  ripple normals, foam; fine ripples up close plus a coarse, slanted, streaky layer (`coarseTex`) that fades
  in with distance, so the wall seen from the channel or the riding camera has the same texture as inside the
  tube; it used to look smooth and plastic from outside), sky, solid shading, and particles (compute-shader sim of 65k particles: lip
  feathering, whitewater mist, rail spray, barrel spit; drawn as soft billboards).
- `src/renderer.js`: WebGPU setup and draw order. `src/main.js`: loop, input (keyboard + touch),
  cameras, surfer model, scoring, HUD.

## Tests

```sh
node test/determinism.mjs # a ride is the same whatever came before (wave addresses; contests and replays need it)
node test/replay.mjs   # record, save, replay: the same ride bit for bit; checkpoints put a knocked-off replay back
node test/camera-water.mjs # headless Chrome: on Pipe the camera is never in the water (barrel view, chase view)
node test/tubedepth.mjs # tube speed by depth: never slower deeper (Pipe, Dynamic, a built barrel)
node test/heat.mjs     # heats: the seed's waves in order, best two, places and tie-breaks, needs, the horn, wave counts, bots
node test/heat-browser.mjs [shots] # in headless Chrome: a 1 min heat (board, sheet, horn, results, watch your best wave) and a 2 wave heat
node test/replay-browser.mjs # in headless Chrome: ride, "Watch it" at 4x slower CPU, ?replay=<file>: all the same (WAVE=trestles ...)
node test/feel.mjs     # the feel numbers: climb time, drop speed, cutback re-entries, pocket riding
node test/tube.mjs     # barrel riding: balance and speed choices and their outcomes
node test/moves.mjs    # audit every move: peak acceleration, speed before/after, bogged in foam
node test/controls.mjs # human-style inputs on both waves: no glitches, Up/Down never flips you
node test/pocket.mjs   # where different riding styles spend their time vs. the curl
node test/shuffle.mjs  # shortboard feet: back / middle / forward, turn and speed effects on Raglan and Pipe
node test/crest.mjs    # holding a line near the crest: the curl catches you above ~0.8 of the face, not mid-face
node test/idle.mjs     # idle decay: no loss for 2 s, then ~0.5 mph/s growing, none with a key held; Queens untouched
node test/built.mjs    # DROP IN: a builder loop peels forever with no jump at the seam, a full ride ends at the end of the wave
node test/judging.mjs  # competition judging: each criterion, the scale, a real ride judged
node test/builder.mjs  # Build a Break's fast break model on Dynamic's reef vs the Python model / FUNWAVE, and its speed
node test/sections.mjs # Raglan+: trimming vs pumping through the random faster sections (WAVE=point to compare)
node test/takeoff.mjs  # from the drop-in, nose held at 0 / -20 / -40 / -60 / -80 deg: speed and height over 3 s
node test/energy.mjs   # energy pocket per wave: trim / peel at three heights, foot spots, drop, lip speed, pocket bot
node test/pivotshare.mjs # longboard tail turns at 7 / 11 / 15 mph: pivot share, turn time, speed (vs the middle)
node test/skid.mjs     # shortboard bottom turns at 10 / 13 / 17 mph: skid share and drive (NOSKID=1 to compare)
node test/tubetrim.mjs # Pipe: holding a line in the tube with each foot spot: speed / peel, depth, time in
node test/elbows.mjs   # skinned-body elbows: jump per frame and upper-arm twist flips (lower is smoother)
node test/arms.mjs     # how jerkily the hands move against the shoulders while riding (lower is smoother)
node test/slash.mjs    # the slash: when it fires (and doesn't), climb, speed scrub, slide, turn; point, reef, barrel
node test/trestles.mjs [dynamic] # Trestles (or Dynamic): the ride along the bar (speed, section, tube size), phase smoothness, bots riding it
node test/plot-slices.mjs out.svg [crumble|barrel]   # draw the wave cross-sections
node test/steepness.mjs  # reef face angle at fixed heights from the tube out to the shoulder
node test/concave.mjs    # bulges along the wave (should wrap in, never bulge out)
node test/corners.mjs    # sharpest bend in each cross-section (no corners)
node test/drive.mjs test/out/<name> "<query>" <ms,...> ['<input json>']   # headless Chrome screenshots + console (test/out is git-ignored)
MOBILE=1 node test/drive.mjs ...   # same, emulating a phone (390x844, touch)
```

`node test/profile.mjs "<query>" [s]` (add `RETINA=1` for MacBook size): frame rate, JS and GPU time per frame,
and a CPU profile of where the JS time goes. 2026-11-18 at retina size: JS ~1.0 ms/frame on every wave; GPU ~12 ms
on Pipe (spray particles ~7 ms of it), ~6.4 ms on Queens. Culling particles that have faded out made no measurable
difference. Idea for later: lower the render resolution a little only while frames run late.

Performance: `RETINA=1 node test/drive.mjs ...` renders at 2880x1800 like a MacBook; the game's
debug object reports smoothed frame time (`ms`). Keep it near 16.7 ms there. Big translucent particles
near the camera were the expensive thing (overdraw); particle screen size is capped by distance and the
render resolution is capped at `MAX_PIXELS` (renderer.js).

Input json entries: `[ms, 'down'|'up', 'ArrowLeft']` for keys, `[ms, 'touchStart'|'touchMove'|'touchEnd', x, y]`
for touch. `drive.mjs` needs the local server running. It drives headless Chrome over the DevTools protocol with
WebGPU enabled, so it catches WGSL/pipeline errors and shows real frames.

## Ideas not done yet

Sound (surf roar, spray), more trick moves, wave sets with varying size and peel speed, bringing
the barrel back into the default wave, and testing on a real iPhone (only emulated so far; GPU errors
now show on screen to help).
