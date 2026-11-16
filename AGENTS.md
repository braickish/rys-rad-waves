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

Controls: every input is the same rail-to-rail carve. Left/Right carve counterclockwise/clockwise (as
seen from the beach); Up/Down carve whichever way swings the nose up/down the face, stopping at
straight up/down. Holding a turn progressively leans you into it harder (`hardAfter`: tighter arc,
more drive, more rail roll). Space pumps (best on the way down), C switches camera (`?cam=2` is a
close-up for testing). Shift crouches, only needed on the barrel wave. Touch: drag on the left half to
carve toward where you point (harder the further you push), a button to pump.

## How it works

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
    the shoulder, flat water and foam bleed you down (`vLow`, `vFoam`). Dropping pays a lot (`drop`),
    climbing costs little (`climb`), so getting high is easy and every drop is a burst. Pumping
    (`pump`) helps on the face, most on the drop.
  - Turns: the turn radius depends on height on the face (`rTop` snappy up top, `rBottom` a long
    rail-to-rail arc at the bottom), so turn rate = speed / radius. A bottom turn (nose coming up,
    low on the face) generates a lot of speed (`bottomDrive`); carving up near the top adds some too
    (`topDrive`), and cruising speed and pumping both climb with height, so the high line is fast. There's no automatic bottom turn: head down
    without turning and you ride out onto the flats (`tFlats`) and bog down.
  - Moves are decided by where you hit the top and how steep: in the whitewater (behind `curlZone`)
    → **re-entry**, at the curl → **snap**, on the open face → **off the lip** (shallow hits are a
    **top turn**). Within `comboWindow` of a bottom turn it's a combo. Snaps are a short fin release:
    a quick assisted pivot back down the face (`snapRate`, ~0.17s), then control is yours again.
  - Turning back into the whitewater (a cutback): you must meet its front edge (`foamContact`) in the
    top two thirds of the wave (`reboundMinHeight`) and be turning as you hit: Left → **rebound**
    (nose swings down and back down the line), Right → **rebound 180** (spins around through the
    top). Low, or not turning, and the whitewater buries you. Assisted pivots don't add speed.
    Sit in heavy foam longer than `foamLimit` and it takes you. Airs: straight up the open face above
    `airSpeed`.
  - Barrel wave: same model, the rideable face tops out under the roof, crouch to fit the tube.
- `src/surfer.js`: the articulated surfer on a surfboard (pointed yellow nose, squared tail, fin).
  Stance toward the tail (`STANCE`), chest opened toward the nose. In hard turns the board banks onto
  its inside rail (`MAX_ROLL`), more with speed and when leaning hard. Two-bone IK legs and arms.
  Knees bend with turns, crouch, and pumping (compress on the way up, extend driving down); the body
  leans into turns and the inside hand drags toward the water in a big one.
- `src/mesh.js`: builds the static water mesh (plus far flat ocean), per-vertex foam/translucency
  attributes, a lip lookup table for particle emitters, and the box/sphere primitives for the surfer.
- `src/shaders.js`: WGSL. Water (fresnel sky reflection, backlit translucency in the lip, flowing
  ripple normals, foam), sky, solid shading, and particles (compute-shader sim of 65k particles: lip
  feathering, whitewater mist, rail spray, barrel spit; drawn as soft billboards).
- `src/renderer.js`: WebGPU setup and draw order. `src/main.js`: loop, input (keyboard + touch),
  cameras, surfer model, scoring, HUD.

## Tests

```sh
node test/feel.mjs     # the feel numbers: climb time, drop speed, cutback re-entries, pocket riding
node test/controls.mjs # human-style inputs on both waves: no glitches, Up/Down never flips you
node test/pocket.mjs   # where different riding styles spend their time vs. the curl
node test/plot-slices.mjs out.svg [crumble|barrel]   # draw the wave cross-sections
node test/drive.mjs test/out/<name> "<query>" <ms,...> ['<input json>']   # headless Chrome screenshots + console (test/out is git-ignored)
MOBILE=1 node test/drive.mjs ...   # same, emulating a phone (390x844, touch)
```

Input json entries: `[ms, 'down'|'up', 'ArrowLeft']` for keys, `[ms, 'touchStart'|'touchMove'|'touchEnd', x, y]`
for touch. `drive.mjs` needs the local server running. It drives headless Chrome over the DevTools protocol with
WebGPU enabled, so it catches WGSL/pipeline errors and shows real frames.

## Ideas not done yet

Sound (surf roar, spray), more trick moves, wave sets with varying size and peel speed, bringing
the barrel back into the default wave, and testing on a real iPhone (only emulated so far; GPU errors
now show on screen to help).
