# Ry's Rad Waves

A WebGPU surfing prototype: one endless peeling wave that barrels, a surfer you steer along the face,
and GPU particle spray. It's an original game in the spirit of the PS1/PS2 surf games, not a remake of
any of them. Plain ES modules, no build step, no dependencies. Static site (GitHub Pages ready).

## Run

```sh
python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

It needs a WebGPU browser (recent Chrome/Edge, or Safari on macOS/iOS 26+).

URL test hooks: `?play` (skip the title), `?auto` (autopilot S-turns), `?xs=-4` (start deep, behind the
peel), `?cam=1` (chase camera), `?noparticles`.

## How it works

- `src/wave.js`: the wave model. The game runs in the **peel frame** (moves with the breaking point),
  where the wave shape is static. Each distance `xs` from the peel point has a 2D cross-section curve
  through 16 control points, keyframed by phase (swell → steep → pitching → barrel → closing →
  whitewater) and smoothed with centripetal Catmull-Rom. Because it's one curve and not a heightfield,
  it can wrap around into a tube. Surface coords are `(xs, t)`, with `t` in `[0, 15]` along the curve.
- `src/rider.js`: surf physics, pure JS. Rider pinned to the surface in `(xs, t)`; gravity, fin/keel
  grip, rail carving (turns redirect forward momentum only), landing via segment/curve intersection,
  and barrel clearance (crouch to fit). All knobs are in `TUNE`.
  **Speed model:** speed comes from going up and down. Climbing the face is partly subsidized by the
  rising wave (`lift`, capped below gravity by `liftCap` so climbing never speeds you up), dropping
  isn't, so linked turns net energy. Pumping only works on the drop. A `glide` floor stops the board
  stalling on a live wave. Sharp turns scrub speed.
  **Arcade rules (deliberately not physics):** steering is relative to riding down the line: Up/Down
  tilt the nose (Up ≈ 65°, Right+Up ≈ 34°), turns always swing through the front, and only Left
  (cutback) can point the board back at the curl. The lip, the barrel's roof, and the trough are soft
  walls with automatic top and bottom turns. You only launch an air off the open lip above `airSpeed`,
  airs go up (not out to sea), spins need a fresh Left/Right press in the air, and landings line the
  board up for re-entry. Being on the thrown lip itself as it pitches = "Over the falls!".
- `src/mesh.js`: builds the static water mesh (plus far flat ocean), per-vertex foam/translucency
  attributes, a lip lookup table for particle emitters, and the box/sphere primitives for the surfer.
- `src/shaders.js`: WGSL. Water (fresnel sky reflection, backlit translucency in the lip, flowing
  ripple normals, foam), sky, solid shading, and particles (compute-shader sim of 65k particles: lip
  feathering, whitewater mist, rail spray, barrel spit; drawn as soft billboards).
- `src/renderer.js`: WebGPU setup and draw order. `src/main.js`: loop, input (keyboard + touch),
  cameras, surfer model, scoring, HUD.

## Tests

```sh
node test/controls.mjs # human-style inputs: board never flips to face the curl, never flung backward
node test/energy.mjs   # riding styles vs. the peel: linked turns with pumps should do best
node test/sim.mjs      # scripted riders: survival time, barrel time, wipeout reasons
node test/sweep.mjs    # parameter sweep for the speed model
node test/plot-slices.mjs out.svg   # draw the wave cross-sections
node test/drive.mjs <outPrefix> "<query>" <ms,...> ['<keys json>']   # headless Chrome screenshots + console
```

`drive.mjs` needs the local server running. It drives headless Chrome over the DevTools protocol with
WebGPU enabled, so it catches WGSL/pipeline errors and shows real frames.

## Ideas not done yet

Sound (surf roar, spray), more trick moves, wave sets with varying size and peel speed, a better surfer
model, and touch controls tested on a real phone.
