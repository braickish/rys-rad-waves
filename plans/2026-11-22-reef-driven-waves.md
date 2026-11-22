# Reef-driven waves: shape, size and barrels from the built reef

Agreed with the user 2026-11-22, after Build a Break got DROP IN. Today a built wave is Raglan+ driven by the
builder's curl: its speed and where its sections are. Its shape (crumbly, steep, hollow) and size don't come from the reef.
The goal: a ramp feels soft, a ridge steep, a ledge heavy, and a good ledge barrels, all from the physics.

Done in order. Each step ends live on Pages, with its tests passing and the user testing it before the next one starts.
Rules that hold throughout: no fudge factors (fix causes); the other waves stay unchanged (their tests' output identical);
circles only for draggable things in the builder.

## 1. Breaking intensity, shown in the builder (done 2026-11-22, 97370b7)

How a wave breaks is set by the seabed's slope along the wave's path against the wave's own steepness: the surf-similarity
(Iribarren) number, xi = tan(beta) / sqrt(H0 / L0), L0 = g T^2 / 2 pi. Mead & Black (2001) tie reef breaking intensity to
the same orthogonal seabed gradient. Bands (Battjes 1974, deep-water H0): spilling < 0.5, plunging 0.5-3.3 (barrelling in
the upper part), surging > 3.3.

- rays.js: per break point, tan(beta) = the seabed slope along the ray over the last ~1/4 wavelength before breaking
  (as research/reef-generator's ray_zone.py / design_eval.py measure it: "orthogonal seabed slope"); xi per point, 5-strip
  median like the other strip values; carried on the curl points.
- Builder: the curl's colour or a band beside it by intensity (crumbly / steep / pitching / barrelling), and the panel's
  per-side summary ("plunging, xi 1.1"). Legend updated. No circles.
- Check: against the Python numbers for the same designs (README: Dynamic-style arms xi 0.92-1.02; the 1:8-1:25 line
  sweep; the Skeleton Bay beach faces 1:12 / 1:20 / 1:35 -> 0.93 / 0.63 / 0.37), and the trend in FUNWAVE where we have it.
- Test: test/builder.mjs gains intensity checks (Dynamic's arms in the plunging band; a gentler line lower, a steeper higher).

## 2. Wave size along the stretch (done 2026-11-22; with the takeoff speed and wave speed from the builder, the user)

A built wave is one size now; the builder knows the breaker height every 10 m.

- Payload: H per 10 m (already there). wave.js: a size factor per spot along the beach (profile H / the wave's reference
  H), crossfaded at a loop's seam like the rest.
- Physics: controlPoints(.., xs) scales by it (as the ridge blend does); caches keyed on SHAPE.ver already refresh.
- GPU: the 4th float of each slice (unused today: [xs, phase, ridge, 0]) carries it; shaders.js surfacePoint scales y/z
  by it. The lip/particle table follows controlPoints.
- Riding: speeds that follow the wave's size (faceFlow from the face height, waveC) already measure the shape live; check
  pocket, airs and the drop-in at a big and a small spot.
- Test: test/built.mjs: a profile with a step in H shows the face height following it smoothly (no jump), the loop seam
  included; other waves' tests unchanged.

## 3. Mellow <-> steep by intensity (no tube yet)

- Shapes: three sets on a scale, chosen by intensity: crumbly (Queens/KF_CRUMBLE-like, for spilling), Raglan's wall
  (mild plunging), Raglan+'s section shape (steep plunging). The per-slice blend becomes a position on that scale (two
  neighbouring sets mixed), on the CPU (controlPoints) and the GPU (tableAt with a per-slice index), as Trestles' sets do
  for the whole wave today.
- The section strength from step 1's curl kinds stays for the curl speed; the shape now follows intensity instead.
- Riding feel: a crumbly stretch is softer and slower to drop, a steep one faster; check the floater, snap and air rules on
  the crumbly shape (Queens' shapes were tuned for a longboard).
- Test: a built wave crossing spilling -> plunging shows the face steepness rising in step (test/steepness-style
  measure), and riders cope (pocket bot rides it).

## 4. Trustworthy heights before barrels

The ray model over-reads breaker heights on ledges (Python validation: 1.8-2.3 m where FUNWAVE had 0.8-1.45) because it
has no diffraction, one wave from one direction, and no energy lost to waves breaking upstream. Barrels from step 5 would
be wrong on exactly the blocks that make them.

- Port research/reef-generator/pewave.py to JS (src/builder/pewave.js): wide-angle parabolic mild-slope equation per
  spectral component (JONSWAP + 7 deg spread, NF x ND), Battjes-Janssen breaking (Battjes & Stive gamma), friction.
  ~3 s in numpy; the JS budget is a few hundred ms, run when a drag ends (the rays stay live while dragging).
- Heights (and so xi and the size in steps 1-2) come from pewave; timing and peel stay from the rays, as in design_eval.py.
- Check: pe_validate.py's numbers (reef-zone bias ~0.02 m, rms ~0.2 m against FUNWAVE) on the same recipes; the ledge
  case in particular.
- Builder: a small "refining..." state after a drag.

## 5. Barrel sections

- Shapes: Pipe's simulated tube shapes (sim-pipe.js) as the hollow end of step 3's scale, where intensity and height say it
  pitches far enough to make a tube (and the tube is tall enough: tubeMinHeight).
- Tube riding along part of a wave: today `tube` is a whole-wave setting tuned on Pipe. Make it follow the shape under you
  (in the tube only where the shape has one), with Pipe's tube rules (entry, depth, pinch, over the falls) reading the
  local shape's lines. The barrel view comes on and off with it.
- Riding: a built wave with one barrel section between open walls rides in and out of it cleanly; the open stretches
  keep Raglan+'s feel.
- Check: a ledge design that barrels in pewave + rays shows a tube; one that doesn't, doesn't. One design through FUNWAVE
  offline to confirm the chain end to end.
- Test: test/tube.mjs-style riders through a built barrel section; all other waves unchanged.

## Along the way

- Finer curl speed (the loop profile averages over ~40 m; sections soften).
- Per-side board tags in the builder (shortboard / longboard by peel and size), then a board choice at DROP IN.
