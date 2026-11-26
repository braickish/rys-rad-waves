# Wave rules: riding settings from what the wave is like, not per-wave numbers

Agreed with the user 2026-11-25. Riding settings come from rules over the wave's traits, read live where the rider is, so a
wave built from any reef design rides right without hand-tuning. The first rule is in (7707e4f): turn drive's speed limit.
The tasks below move the remaining per-wave speed settings over. Do them after the vertical snap, one at a time; each ends
live on the site with its tests passing, and the user plays it before the next.

## The traits (read live)

| Trait | How it's read | Raglan | Pipe | Trestles | Queens |
| --- | --- | --- | --- | --- | --- |
| Curl speed | `PEEL_SPEED`, smoothed over 2 s (`r.curlS`) | 8.3 m/s | 11.5 | 3.6-25, by section | 4.8 |
| Face steepness | `faceSteepness(xs)`: upper face angle, 30% of the height up to the lip | ~40 deg | ~54 | ~30 (24 on the shoulder) | ~41 near the curl, 28 out |
| Face height | lip height above the trough at xs | 4.0 m | 4.8-5.1 | 2.8 | 1.4 |

Possibly later: tube size (`tubeAt`), how far the wave has broken (foam), pocket power. Board traits (length, rocker,
longboard or not) are separate from wave traits: Queens' longboard values belong to the board, not the wave.

## How each task goes

1. Measure: what each wave's setting is now, and its traits there.
2. Propose a rule anchored on Raglan (Raglan keeps its feel), with the physics reason for its shape: gravity pulls down a
   face with g sin(angle), a drop from height h is worth sqrt(2 g h), keeping up with the curl takes its speed.
3. Show a table of every wave before and after: Raglan, Raglan+, Pipe, Trestles, Dynamic, Queens, a built break.
4. Delete the per-wave values, bump `SIM_VERSION` (replay.js), and run the test scripts (feel, controls, moves,
   determinism, replay, trestles, airs, slash, tube, floater, energy, pocketspeed, judging, built), comparing before and after.
5. Push. The user plays it.

**Test break for every task:** the user's built break (a 60 m left loop, 3.7 m, shortboard), whose peel runs 9.5, 9.6, 11.6,
6.2, 3.8 and 8.6 m/s along it, so a rule read live has to handle the fast and slow sections in one ride:

```
index.html?wave=built&play#built=eyJ2IjoxLCJtb2RlIjoibG9vcCIsInNpZGUiOiJsZWZ0IiwibGVuZ3RoIjo2MCwiYmFzZSI6OC41NDM1MjE0MTUyOTc2NCwiSCI6My43Mjc3MTI0NDY3NDQwNTg1LCJjIjo2LjkyNDM1MjAxMTQzMjA5OSwic3dlbGwiOnsiSCI6My4xLCJUIjoxNSwiZGlyIjowfSwiYm9hcmQiOiJzaG9ydGJvYXJkIiwic2hhcnAiOnRydWUsInByb2ZpbGUiOlt7InMiOjAsInBlZWwiOjkuNTMsImsiOjEsIkgiOjMuOTIsImMiOjcuMTgsInUiOjMuMjA1fSx7InMiOjEwLCJwZWVsIjo5LjY0LCJrIjoxLCJIIjozLjg4LCJjIjo3LjA0LCJ1IjozLjMxM30seyJzIjoyMCwicGVlbCI6MTEuNTUsImsiOjEsIkgiOjMuOCwiYyI6Ni45OCwidSI6My40MTl9LHsicyI6MzAsInBlZWwiOjYuMiwiayI6MSwiSCI6My43MywiYyI6Ni45MiwidSI6My4zNTN9LHsicyI6NDAsInBlZWwiOjMuNzYsImsiOjEsIkgiOjMuNiwiYyI6Ni43OCwidSI6Mi45Njl9LHsicyI6NTAsInBlZWwiOjguNTgsImsiOjEsIkgiOjMuNDYsImMiOjYuNiwidSI6Mi44MjR9LHsicyI6NjAsInBlZWwiOjguNTQsImsiOjAsIkgiOjMuMzQsImMiOjYuNjQsInUiOjIuNzY0LCJlIjowLjE5fV0sIndhdGVyIjo2NiwiZnVuIjp0cnVlLCJzY2FsZSI6MX0%3D
```

## Tasks

0. **Trait readout and test.** `test/wave-rules.mjs`: print every wave's traits (near the curl, +5 m, +15 m) and the value
   each rule gives there, and check the rules stay inside sane ranges on all waves and on the test break. Every later task
   adds its rule to it.

1. **Pocket speeds**: `vPocket`, `vLow`, `vFoam` (Raglan 14 / 4.5 / 3, Queens 5.2 / 2.7 / 2.1). Rule: from the curl's
   speed (the pocket has to carry you at least as fast as the curl; Raglan's pocket runs ~1.7x its curl, Queens ~1.1x:
   check whether face height explains the difference) and face height.

2. **Acceleration limits**: `maxAccel`, `maxAccelFast`, `accelTaper` (Raglan 6 / 0.3 / 7-14, Pipe 10, Queens 4.5 / 3.5-6,
   built 0.45 / 9-18). Rule: the limit from steepness (g sin angle), the taper's speeds from the curl's speed (acceleration
   fades as you pass the speed the wave can give).

3. **Speed ceilings**: `softMax`, `maxSpeed`, `overBleed`, `dropTerminal`, `highDropSoftMax` (Raglan 14.5 / 17.5 / 17,
   Queens 10 / 12, built 18 / 22 / 22). Rule: from face height (a drop from h is worth ~sqrt(2 g h)) and the curl's speed.

4. **Drops**: `topDropBoost`, `highDropAccel`, `heightSpeed`, `feed` (Raglan 2 / 0 / 0.7-0.35 / 1.0, Pipe 8 / 4 /
   0.45 / 2.0, Queens 1.0 / 0.8). Rule: from face height and steepness: steep, tall faces pay more for a high line.

5. **Turn drive, the rest**: `bottomDrive`, `bottomCarveDrive`, `topDrive`, `driveRefSpeed` (Raglan 5.75 / 1.5 / 0.3 / 9,
   Pipe 8 / 1.6 / 1.6 / off, Queens 1.8 / 0.4). Rule: `driveRefSpeed` from the curl's speed; the drive amounts from
   steepness, with Queens' smaller numbers coming from its board (task 9) rather than the wave.

6. **Walls**: `wallK`, `wallAngles` (Trestles 0.65 / 17-28, Raglan+ 0.65 / 55-...). Already trait-based (a wall's angle
   and height); make it rider-wide with the angles relative to the wave's own steepness, so every wave gets it.

7. **Bleed and drag**: `bleed`, `climbFoamDrag`, `idleDecay`, `lipSnapDrag`, `moveScrub`, `postMoveDrop`, `moveEase`.
   Most are about the board and the surfer, not the wave: check each, move them to rider (or board) defaults, and keep a
   rule only where the wave really matters (foam drag from how hard the wave broke).

8. **Barrel speed**: `tubeDrive`, `tubeCarry` (Pipe 5.2, built 1). Rule: from the tube's size and the curl's speed.

9. **Board traits**: move Queens' longboard numbers (drive, speeds, foam push, middle feed) to the board (mesh.js
   `BOARDS` / `boardShape()`), so any break ridden on a longboard gets them, and a shortboard at Queens rides like a
   shortboard.

10. **Clean up**: wave files keep only their shape and where they are (curl zone, start spot, look); no riding numbers.
    Update the wave-builder notes so built breaks need no caps of their own.

## Notes

- Raglan is the anchor: its feel was tuned most by the user. Where a rule moves another wave a lot, flag it before pushing.
- Pipe's old "don't change Pipe" pins are superseded by this plan (the user, 2026-11-25), but call out Pipe changes.
- Read traits live, not once per wave: built breaks and Trestles change section by section.
