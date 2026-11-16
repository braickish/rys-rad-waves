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

Controls: Left/Right carve the board around (counterclockwise/clockwise as you see it), Up/Down point
the nose up or down the face, Space pumps (only on the way down), Shift crouches, C switches camera.
Touch: drag on the left half to point the board, buttons for pump and crouch.

## How it works

- `src/wave.js`: the wave model. Two wave types share one 16-point layout: **crumble** (default, the
  crest spills foam down the face, no overhang) and **barrel** (the lip throws over into a tube). The game runs in the **peel frame** (moves with the breaking point),
  where the wave shape is static. Each distance `xs` from the peel point has a 2D cross-section curve
  through 16 control points, keyframed by phase (swell → steep → pitching → barrel → closing →
  whitewater) and smoothed with centripetal Catmull-Rom. Because it's one curve and not a heightfield,
  it can wrap around into a tube. Surface coords are `(xs, t)`, with `t` in `[0, 15]` along the curve.
- `src/rider.js`: surf physics, pure JS. Rider pinned to the surface in `(xs, t)`; gravity, fin/keel
  grip, rail carving (turns redirect forward momentum only), landing via segment/curve intersection,
  and barrel clearance (crouch to fit). All knobs are in `TUNE`.
  **Speed model: the pocket.** `pocketPower(xs)` is full at the curl and fades fast out on the
  shoulder (`pocketWidth`) and behind it into the foam. All the wave's drive scales with it: the climb
  subsidy (`lift`, capped below gravity by `liftCap`), the curl's push when trimming high on the face
  (`curlPush`), and the `glide` floor (only while turning back up the face, only on the face). Out on
  the shoulder and on flat water the board bogs down (`shoulderDrag`); in crumbling foam harder
  (`foamDrag`). So you can trim high in the pocket, but anywhere else you have to work: drop and pump
  (pump only works on the way down), turn back up, snap off the crumble. Sharp turns scrub speed.
  **Arcade rules (deliberately not physics):** the lip, the barrel's roof, and the trough are soft
  walls with automatic top and bottom turns (a "snap" when it's the crumbling crest). You only launch
  an air off the open face ahead of the curl above `airSpeed`; airs go up (not out to sea), spins need
  a fresh Left/Right press in the air, and landings line the board up for re-entry. On the barrel
  wave, being on the thrown lip itself = "Over the falls!" and the lip only hurts once it's landing.
- `src/surfer.js`: the articulated surfer. Two-bone IK legs (feet planted on the board) and arms.
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
node test/controls.mjs # human-style inputs on both waves: no glitches, Up/Down never flips you
node test/pocket.mjs   # where riders spend their time vs. the curl; who survives and why
node test/plot-slices.mjs out.svg [crumble|barrel]   # draw the wave cross-sections
node test/drive.mjs <outPrefix> "<query>" <ms,...> ['<input json>']   # headless Chrome screenshots + console
MOBILE=1 node test/drive.mjs ...   # same, emulating a phone (390x844, touch)
```

Input json entries: `[ms, 'down'|'up', 'ArrowLeft']` for keys, `[ms, 'touchStart'|'touchMove'|'touchEnd', x, y]`
for touch. `drive.mjs` needs the local server running. It drives headless Chrome over the DevTools protocol with
WebGPU enabled, so it catches WGSL/pipeline errors and shows real frames.

## Ideas not done yet

Sound (surf roar, spray), more trick moves, wave sets with varying size and peel speed, bringing
the barrel back into the default wave, and testing on a real iPhone (only emulated so far; GPU errors
now show on screen to help).
