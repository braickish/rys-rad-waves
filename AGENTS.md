# Ry's Rad Waves

A WebGPU surfing prototype: one endless peeling wave that barrels, a surfer you steer along the face,
and GPU particle spray. It's an original game in the spirit of the PS1/PS2 surf games, not a remake of
any of them. Plain ES modules, no build step, no dependencies. Static site (GitHub Pages ready).

## Run

```sh
python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

It needs a WebGPU browser (recent Chrome/Edge, or Safari on macOS/iOS 26+).

Waves (2026-11-17 names, after real waves): **Raglan** (`point`, the crumbling point; was "Mellow Point"),
**Pipe** (`reef`, the simulated barrel; was "Reef Barrel"), **Queens** (`queens`, a small longboard wave: a right, ridden regular foot; see below). The title
screen is just the wave picker and a DROP IN button (the instructions were dropped, the user's call).
URL options: `?wave=point|reef|queens` (older `?wave=barrel` / `crumble` still work), `?play` (skip the
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

**Feet on every wave** (2026-11-18, the user: carry Queens's Up/Down walking to the other waves): all waves have
`walkKeys`, so Up/Down (and up/down swipes) move the feet and only Left/Right turn. On Queens they walk the longboard
(tail / middle / nose, below). On the shortboards (Raglan, Pipe: `shuffle`) they shuffle the feet one spot, subtly,
in `shuffleTime` 0.2 s: back (-1), middle (0, the normal stance; where you start) and forward (1) (rider.js `r.shuf`;
drawn as both feet sliding ~10 cm in two little lifted steps). Back: sharper turns (`backRadius` 0.9, `backTurn` 1.1),
slightly more pivot (`backPivot` 0.05 of the turn rate stops depending on speed; turning scrubs `backScrub` 0.03 per
radian), slightly slower (`backSpeed` 0.95). Forward: helps you accelerate (`fwdFeed` 1.25, `fwdAccel` 1.15,
`fwdSpeed` 1.04) and turns more rail to rail (`fwdRadius` 1.15, `fwdTurn` 0.9). `node test/shuffle.mjs` measures it:
back turns ~17-24% sharper and runs ~1 mph slower, forward turns ~12-17% wider; the middle is unchanged.
The Up = Left / Down = Right steering below still exists in the rider (`tilt`, tested) but no wave's keys use it now.
Controls (before 2026-11-18; Queens was the exception: see `walkKeys` below): one control, from the surfer's point of view. Left (or Up) turns the board to the surfer's
left, Right (or Down) to their right; Up is exactly Left and Down exactly Right in every situation
(tested). Riding right along the wave, the surfer's left is up the face. Air spins turn the same way
(about the face normal at takeoff). Holding a turn progressively leans you into it harder (`hardAfter`: tighter arc,
more drive, more rail roll). C switches camera (`?cam=2` is a
close-up for testing). Shift crouches, only needed on the barrel wave. Touch: swipes do exactly what the keys
do (swipe left/up = Left, right/down = Right, harder the further you swipe; anywhere on the
button).

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
  lifts a little standing there and up to ~29 deg swinging round in a pivot (`pose.tip`, about a point ahead of the
  back foot so the tail sinks), with less rail roll and lean. (A first version stepped back automatically when you
  held a turn; replaced by walking the same day.)
  **On the nose** you steer a little (`noseTurnDamp` 0.55, was 0.8); in the pocket the nose
  trims you to just under the curl's speed (`noseHold`, `noseUnder` 0.8 m/s under; was 0.45, the user wanted it slower), so you stay there; out on the shoulder (pocket
  power below `nosePocket`) it drags and the nose dips under (`r.noseRisk`, drawn as the board pitching nose-down, the feet going with it) until
  you pearl (wipeout). Scores: HANG FIVE! on reaching the nose, then a noseride bonus by time when you walk back.
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
  - Speed: the pocket feeds you toward a fast cruising speed (`vPocket`, faster higher on the face);
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
    up and over the back (wipeout), or launch an air if fast enough (`airSpeed`, ~26 mph) and out of
    the whitewater. Within `airCurlZone` of the whitewater it's always an air (above `airMinSpeed`),
    never over the back. Airs pop up at `airPop`, and the wave carries you along in the air
    (`airDrift`) so you don't drift back into the whitewater; within `airBoostZone` (~2 ft) of the whitewater it launches higher (`airBoostUp`,
    "BIG AIR").
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
    pointing about 23 degrees down. The point has 2/3 of the reef's flow (3.8 vs 5.7 m/s): you hold
    your line about 12 degrees down there. In the tube, trimming flat or pointing down the
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
- **Ripple size** (`rippleK`, Frame `misc.y`): Queens and Raglan both use 2x finer ripples than the base (Raglan
  since 2026-11-17: the user thought its texture looked slightly off next to Queens; at 1x it read as coarse,
  blotchy streaks). Real ripples come from the wind, so they shouldn't grow with the wave. Pipe uses 1.5x (2x made the distant flats grainy seen from inside the barrel).
- **Texture on the flats:** the ripples carry on out across the flats in front of the wave (`flatsReach` in
  shaders.js), fading over ~50 m, instead of stopping at the bottom.
- 2026-11-17: the project was rolled back to the surfboard commit (a3cc07a) after later reef work broke the
  waves; the glow band, the smooth bend and the flats texture were then re-applied one at a time. The water
  still flows the original way (up the face, drifting with the peel).
- `src/sea.js`: **sets and sections**, from the wave's `sea` settings. Each ride is the next wave of the
  set (`setWaveSize`: bigger waves peel a bit faster). Sections (`SECTIONS` in wave.js) are stretches
  ahead that break early for a while (fixed to the reef, so in the peel frame they move back toward
  the curl; `phaseAt` raises the phase there). **Sections are currently off on both waves**
  (`sea.sections: false`); they didn't play well yet. Seeded (`seedSea`, `?seed=`); `?nosea` turns the
  sea off. Tests run without the sea.
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
- **Skinned body** (2026-11-18, Step 2 toward a realistic surfer; `?body=mh` / `?body=parts` or **B** in the game,
  remembered; the parts surfer stays the default). `assets/body/guy.glb` and `girl.glb` (~0.95 MB each, 13.7-13.9k
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
  (Raglan), 91 -> 15 cm (Pipe), 12 -> 4.4 cm (Queens). With the body on, everything uses the real look. Cost
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
node test/feel.mjs     # the feel numbers: climb time, drop speed, cutback re-entries, pocket riding
node test/tube.mjs     # barrel riding: balance and speed choices and their outcomes
node test/moves.mjs    # audit every move: peak acceleration, speed before/after, bogged in foam
node test/controls.mjs # human-style inputs on both waves: no glitches, Up/Down never flips you
node test/pocket.mjs   # where different riding styles spend their time vs. the curl
node test/shuffle.mjs  # shortboard feet: back / middle / forward, turn and speed effects on Raglan and Pipe
node test/arms.mjs     # how jerkily the hands move against the shoulders while riding (lower is smoother)
node test/slash.mjs    # the slash: when it fires (and doesn't), climb, speed scrub, slide, turn; point, reef, barrel
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
