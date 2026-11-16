# Ry's Rad Waves

A WebGPU surfing prototype: one endless peeling wave that barrels, a surfer you steer along the face,
and GPU particle spray. It's an original game in the spirit of the PS1/PS2 surf games, not a remake of
any of them. Plain ES modules, no build step, no dependencies. Static site (GitHub Pages ready).

## Run

```sh
python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

It needs a WebGPU browser (recent Chrome/Edge, or Safari on macOS/iOS 26+).

URL options: `?wave=barrel` (the barreling wave; default is a crumbling wave), `?play` (skip the
title), `?auto` (autopilot works the pocket), `?xs=-4` (start behind the peel), `?cam=1` (chase
camera), `?noparticles`.

Controls: one control, from the surfer's point of view. Left (or Up) turns the board to the surfer's
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
- `src/wave.js`: the wave model. Two wave types share one 16-point layout: **crumble** (default, the
  crest spills foam down the face, no overhang) and **barrel** (the lip throws over into a tube). The game runs in the **peel frame** (moves with the breaking point),
  where the wave shape is static. Each distance `xs` from the peel point has a 2D cross-section curve
  through 16 control points, keyframed by phase (swell → steep → pitching → barrel → closing →
  whitewater) and smoothed with centripetal Catmull-Rom. Because it's one curve and not a heightfield,
  it can wrap around into a tube. Surface coords are `(xs, t)`, with `t` in `[0, 15]` along the curve.
- `src/rider.js`: **arcade surf control, designed for feel, not physics** (the physics-driven
  versions were tried and weren't fun). State on the face: `xs` (distance ahead of the curl), `t`
  (surface coordinate; smaller = higher), board speed `speed`, direction `phi` (0 = down the line,
  +π/2 = straight up the face, π = back toward the curl). Knobs are in `TUNE`.
  - Speed: the pocket feeds you toward a fast cruising speed (`vPocket`, faster higher on the face);
    the shoulder, flat water and foam bleed you down (`vLow`, `vFoam`). Dropping pays a lot (`drop`);
    climbing costs real speed (`climb`) and the pocket stops feeding you while you point up the face; dropping from
    the top half of the pocket pays most (`topDropBoost`, scaled by pocket power so the shoulder still bogs); pointing down high up also
    raises the acceleration cap (`highDropAccel`) and the soft speed limit (`highDropSoftMax`).
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
    it = only a quick 180 (`lip180Rate`) ending straight back down the wave. Not turning, you go
    up and over the back (wipeout), or launch an air if fast enough (`airSpeed`, ~26 mph) and out of
    the whitewater. Within `airCurlZone` of the whitewater it's always an air (above `airMinSpeed`),
    never over the back. Airs pop up at `airPop`, and the wave carries you along in the air
    (`airDrift`) so you don't drift back into the whitewater; within `airBoostZone` (~2 ft) of the whitewater it launches higher (`airBoostUp`,
    "BIG AIR").
  - Moves are decided by where you hit the top and how steep: in the whitewater (behind `curlZone`)
    → **re-entry**, at the curl → **snap**, on the open face → **off the lip** (shallow hits are a
    **top turn**). Within `comboWindow` of a bottom turn it's a combo. Snaps are a short fin release:
    a quick assisted pivot back down the face (`snapRate`, ~0.17s), then control is yours again.
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
  - Moves need at least `moveGap` (1s) between them. Inside the gap the lip is just a plain turn and
    the whitewater just slows you.
    Sit in heavy foam longer than `foamLimit` and it takes you. Land an air backwards (nose pointing
    back along the line) and you ride it backwards (`fakie`) for `fakieTime`, then the board spins
    back round ("Revert"). Airs: straight up the open face above
    `airSpeed`.
  - **Tube riding** (`tube: true` waves): the barrel is normal surfing (same turning, rail, drop speed)
    with rules on top (`checkHazards`). Normal surfing outruns the barrel, so you **pull in**: high on the
    face within `pullInZone` of the curl and turning, you stall (`pullInSpeed`, settling at `pullInLine`)
    until the curl passes you. In the tube: past `tubeCollapse` = pinched; driving straight into the
    roof (steeper than `roofCrash`) = over the falls. On the reef the water rushes up the face
    (`faceFlow`, scaled by steepness and pocket power): riding level drifts you up, you hold your line
    pointing about 15 degrees down. In the tube, trimming flat or pointing down the
    line adds acceleration (`tubeDrive`) (brushing it deflects you down); way below the bottom
    (`tubeLow`) = the lip lands on you; back past `tubeExit` = out. Caught way up in the lip as it throws
    (`tubeTooHigh`), or riding in the top 3/8 of the barrel (`tubeFallHeight`) = over the falls. The barrel
    picks you up once you're on the face or just below its base (`tubeEnterLow`). Scored by time x average depth. HUD: depth across, height up/down.
    Camera: low and deep in the tube behind the surfer, looking out through the barrel (only once you are actually in). Reef shape is `KF_PIPE`
    (waves/shapes.js); `faceTop` lowers smoothly as the lip throws.
- Heavy waves (`floaters: false, rebounds: false` in the wave's tune, e.g. the reef): hitting the
  whitewater or the lip next to it is a crash ("Over the falls"), not a floater or rebound.
- `src/sea.js`: **sets and sections**, from the wave's `sea` settings. Each ride is the next wave of the
  set (`setWaveSize`: bigger waves peel a bit faster). Sections (`SECTIONS` in wave.js) are stretches
  ahead that break early for a while (fixed to the reef, so in the peel frame they move back toward
  the curl; `phaseAt` raises the phase there). **Sections are currently off on both waves**
  (`sea.sections: false`); they didn't play well yet. Seeded (`seedSea`, `?seed=`); `?nosea` turns the
  sea off. Tests run without the sea.
- **Water rendering:** the GPU builds the surface every frame from a cross-section table (512 phases,
  built per wave in `buildWaterTable`) and each slice's current phase (`slicePhases`), so the wave can
  change over time. The spray emitter table is refreshed every frame too.
- Tube camera: low in front of the opening; if water blocks that view (a section has thrown over) it
  cuts to the shot from inside the tube behind the surfer.
- `src/mesh.js`: builds the water's cross-section table and grid, a lip lookup table for particle emitters, and the box/sphere primitives for the surfer.
- `src/shaders.js`: WGSL. Water (fresnel sky reflection, backlit translucency in the lip, flowing
  ripple normals, foam), sky, solid shading, and particles (compute-shader sim of 65k particles: lip
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
node test/plot-slices.mjs out.svg [crumble|barrel]   # draw the wave cross-sections
node test/drive.mjs test/out/<name> "<query>" <ms,...> ['<input json>']   # headless Chrome screenshots + console (test/out is git-ignored)
MOBILE=1 node test/drive.mjs ...   # same, emulating a phone (390x844, touch)
```

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
