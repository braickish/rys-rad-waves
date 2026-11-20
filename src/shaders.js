// WGSL shaders. All share the Frame uniform (group 0, binding 0).

const common = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  camPos: vec4f,    // xyz, time
  sunDir: vec4f,    // xyz, peel speed
  rider: vec4f,     // xyz, spray amount (0..1)
  riderVel: vec4f,  // xyz, dt
  spray: vec4f,     // spray direction xyz, frame index
  params: vec4f,    // lip table x0, step, count, wipeout burst
  misc: vec4f,      // x: particle scale (smaller on small waves), y: water ripple scale (finer on small waves),
                    // z: which way the wave peels in the world (WAVE.dir: 1 toward +x, -1 toward -x, a right seen from the beach), -
  // (The wave, its peel frame and the particle sim work along the wave: +x is ahead of the curl. dirX() places
  // that in the world; rider/riderVel/spray stay in the peel frame, camPos and everything drawn is in the world.)
  flow: vec4f,      // x: how far the water texture has flowed along the wave (m): the peel speed added up frame by frame;
                    // y: the peel speed beyond its smoothed value (m/s; main.js camPeel), for the spray
                    // (not time x peel speed: on Trestles the speed changes, and that made the whole texture lurch)
};
@group(0) @binding(0) var<uniform> F: Frame;
fn dirX(p: vec3f) -> vec3f { return vec3f(p.x * F.misc.z, p.y, p.z); } // peel frame <-> world (its own inverse)

const HORIZON = vec3f(0.70, 0.84, 0.92);

fn sky(d: vec3f) -> vec3f {
  let sun = F.sunDir.xyz;
  let h = d.y;
  var c = mix(HORIZON, vec3f(0.16, 0.42, 0.78), pow(clamp(h, 0.0, 1.0), 0.55));
  let s = max(dot(d, sun), 0.0);
  c += vec3f(1.0, 0.9, 0.7) * pow(s, 900.0) * 10.0 + vec3f(1.0, 0.85, 0.6) * pow(s, 10.0) * 0.22;
  return c;
}

fn hash2(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}
fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fogMix(col: vec3f, wpos: vec3f) -> vec3f {
  let d = length(F.camPos.xyz - wpos);
  return mix(col, HORIZON, 1.0 - exp(-d * 0.0045));
}
fn tonemap(c: vec3f) -> vec3f {
  return vibrance(c / (1.0 + max(vec3f(0.0), c - 0.8) * 0.6));
}
// More saturated, vibrant colors (2026-11-18, the user): muted colors are pushed the most, already-strong ones
// less, and greys and whites (foam, spray, clouds) not at all.
const VIBRANCE = 0.45;
fn vibrance(c: vec3f) -> vec3f {
  let lum = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  let k = 1.0 + VIBRANCE * (1.0 - clamp(sat * 1.6, 0.0, 1.0)) * smoothstep(0.0, 0.08, sat);
  return max(vec3f(lum) + (c - vec3f(lum)) * k, vec3f(0.0));
}
`;

export const skyWGSL = common + /* wgsl */ `
struct VO { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var tri = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = tri[i];
  var o: VO;
  o.pos = vec4f(p, 1.0, 1.0);
  o.ndc = p;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let w = F.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let d = normalize(w.xyz / w.w - F.camPos.xyz);
  return vec4f(tonemap(sky(d)), 1.0);
}
`;

export const waterWGSL = common + /* wgsl */ `
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) attr: vec3f,
};
// The water surface, built from the cross-section table (see mesh.js).
struct WaterInfo { cols: u32, nx: u32, rows: u32, setA: u32, sMin: f32, sMax: f32, scale: f32, turquoise: f32, green: f32, blend: f32, setB: u32, pad3: f32 };
@group(0) @binding(1) var<uniform> W: WaterInfo;
@group(0) @binding(2) var<storage, read> table: array<vec4f>;   // [z, y, foam, thin] per (row, col)
@group(0) @binding(3) var<storage, read> slices: array<vec2f>;  // [xs, phase] per slice

fn tableSet(si: u32, s: f32, j: u32) -> vec4f {
  let f = clamp((s - W.sMin) / (W.sMax - W.sMin), 0.0, 1.0) * f32(W.rows - 1u);
  let r0 = u32(floor(f));
  let r1 = min(r0 + 1u, W.rows - 1u);
  let base = si * W.rows * W.cols;
  return mix(table[base + r0 * W.cols + j], table[base + r1 * W.cols + j], f - floor(f));
}
// (a wave with shape sets, Trestles: set A blended toward set B, as wave.js controlPoints does)
fn tableAt(s: f32, j: u32) -> vec4f {
  let a = tableSet(W.setA, s, j);
  if (W.blend <= 0.0 || W.setB == W.setA) { return a; }
  return mix(a, tableSet(W.setB, s, j), W.blend);
}
// Surface point for slice i, column j.
fn surfacePoint(i: u32, j: u32) -> vec3f {
  let sl = slices[i];
  let e = tableAt(sl.y, j);
  if (j == 0u || j == W.cols - 1u) { return vec3f(sl.x, 0.0, e.x); }
  return vec3f(sl.x, e.y * W.scale, e.x * W.scale);
}

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var o: VO;
  let i = vi / W.cols;
  let j = vi % W.cols;
  let p = surfacePoint(i, j);
  var n = vec3f(0.0, 1.0, 0.0);
  if (j > 0u && j < W.cols - 1u) {
    let jt0 = max(j - 1u, 1u);
    let jt1 = min(j + 1u, W.cols - 2u);
    let i0 = select(i - 1u, 0u, i == 0u);
    let i1 = min(i + 1u, W.nx - 1u);
    let tu = surfacePoint(i, jt1) - surfacePoint(i, jt0);
    let tx = surfacePoint(i1, j) - surfacePoint(i0, j);
    n = normalize(cross(tu, tx));
  }
  let sl = slices[i];
  let e = tableAt(sl.y, j);
  // Whitewater fades a little far behind the curl.
  let foam = e.z * (1.0 - smoothstep(10.0, 40.0, -sl.x) * 0.5 * smoothstep(0.8, 1.4, sl.y));
  let pw = dirX(p); // (built along the wave, placed in the world)
  o.pos = F.viewProj * vec4f(pw, 1.0);
  o.wpos = pw;
  o.n = dirX(n);
  o.attr = vec3f(sl.y, foam, e.w);
  return o;
}

fn ripple(q: vec2f, t: f32) -> f32 {
  return noise(q * 0.7) * 0.5 + noise(q * 1.9 + vec2f(t * 0.4, 0.0)) * 0.3 + noise(q * 4.7 - vec2f(0.0, t * 0.6)) * 0.15;
}

// Coarse water texture for the wave seen from further off: streaky ribs plus a
// mottled octave so it doesn't read as regular stripes.
fn coarseTex(q: vec2f, t: f32) -> f32 {
  return noise(q) * 0.5 + noise(q * 2.3 + vec2f(0.0, t * 0.3)) * 0.3 + noise(vec2f(q.x * 0.6, q.y * 2.4) * 2.0 - vec2f(t * 0.2, 0.0)) * 0.2;
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  let t = F.camPos.w;
  let peel = F.sunDir.w;
  let sun = F.sunDir.xyz;
  let v = normalize(F.camPos.xyz - i.wpos);
  var n = normalize(i.n);
  if (dot(n, v) < 0.0) { n = -n; } // looking at the inside of the lip from below

  // Water texture flows backward along x (the peel runs away from it) and
  // up the face (the wave moves through it).
  let rk = F.misc.y; // (ripples sized to the wave: finer on a small one)
  let ax = i.wpos.x * F.misc.z; // (along the wave, ahead of the curl: the texture flows with the peel whichever way it runs)
  let q = vec2f(ax + F.flow.x, i.wpos.z * 0.9 + i.wpos.y * 0.9 - t * 1.5) * 1.8 * rk;
  let e = 0.06;
  let h0 = ripple(q, t);
  let gx = (ripple(q + vec2f(e, 0.0), t) - h0) / e;
  let gy = (ripple(q + vec2f(0.0, e), t) - h0) / e;
  let xa = vec3f(F.misc.z, 0.0, 0.0); // (the 'along the wave' axis in the world)
  let t1 = normalize(xa - n * dot(n, xa));
  let t2 = cross(n, t1);
  let dist = length(F.camPos.xyz - i.wpos);
  // Ripples on the sloped part of the wave, carrying on out across the flats
  // in front of it (weaker, fading out over ~50 m), not stopping at the bottom.
  let zb = i.wpos.z;
  let flatsReach = smoothstep(-3.0, 3.0, zb) * (1.0 - smoothstep(14.0, 60.0, zb));
  let slope = max(smoothstep(0.03, 0.2, 1.0 - n.y), 0.65 * flatsReach);
  let detail = 0.09 * exp(-dist * 0.03) * slope;
  // Coarser texture that still reads from out in the channel: ribs of water
  // drawn up the face (stretched along the flow), plus broad lumps. Up close
  // the fine ripples above carry it, so this fades in with distance.
  // (slanted a little, the way the water draws up and along the wall)
  let fx = ax + F.flow.x;
  let fy = i.wpos.z * 0.9 + i.wpos.y * 0.9 - t * 1.5;
  let qc = vec2f((fx + fy * 0.35) * 1.3, fy * 0.6) * rk;
  let rib = coarseTex(qc, t);
  let ec = 0.05;
  let cgx = (coarseTex(qc + vec2f(ec, 0.0), t) - rib) / ec;
  let cgy = (coarseTex(qc + vec2f(0.0, ec), t) - rib) / ec;
  let coarse = 0.26 * smoothstep(4.0, 14.0, dist) * exp(-dist * 0.008) * slope;
  n = normalize(n - (t1 * (gx * detail + cgx * coarse * 1.3) + t2 * (gy * detail + cgy * coarse * 0.6)));

  // The surfer's shadow on the water (the real look): the body as a short segment up from where they stand,
  // seen along the sunlight; points behind it (away from the sun) within ~0.3 m of it are shaded.
  var shade = 1.0;
  let lit = smoothstep(0.0, 0.25, dot(normalize(i.n), F.sunDir.xyz)); // (only on water the sun lights: with the sun behind the wave, the face is already in its shade)
  if (F.misc.w > 0.9 && lit > 0.0) { // (0.75: real look, but no one to cast a shadow)
    let rw = dirX(F.rider.xyz);
    let sd = F.sunDir.xyz;
    let d = i.wpos - rw;
    let behind = -dot(d, sd);
    if (behind > 0.0) {
      let axis = vec3f(0.0, 1.5 * min(1.0, F.misc.x * 1.25 + 0.3), 0.0);
      let pq = d - sd * dot(d, sd);
      let pa = axis - sd * dot(axis, sd);
      let k = clamp(dot(pq, pa) / max(dot(pa, pa), 1e-4), 0.0, 1.0);
      let dd = length(pq - pa * k);
      shade = 1.0 - 0.38 * lit * (1.0 - smoothstep(0.12, 0.34, dd)) * smoothstep(0.0, 0.3, behind) * (1.0 - smoothstep(6.0, 12.0, behind));
    }
  }

  let phase = i.attr.x;
  let foamAmt = i.attr.y;
  let thin = i.attr.z;

  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  // On the flat water the sun's mirror image is damped (no ripples there to
  // break it up, so it blew out into a big white smear in front of the wave).
  let flatness = 1.0 - smoothstep(0.03, 0.2, 1.0 - abs(normalize(i.n).y));
  var refl = sky(reflect(-v, n));
  refl = mix(refl, min(refl, vec3f(1.05)), flatness);
  let deep = vec3f(0.01, 0.12, 0.19);
  let upper = vec3f(0.03, 0.34, 0.40);
  var body = mix(deep, upper, smoothstep(-0.5, 4.0, i.wpos.y));
  // Clear, shallow, sunlit water (W.turquoise, e.g. Queens): brighter turquoise throughout.
  body = mix(body, mix(vec3f(0.02, 0.36, 0.42), vec3f(0.08, 0.62, 0.6), smoothstep(-0.3, 1.2, i.wpos.y)), W.turquoise);
  // Cold, green water (W.green, Raglan: raglan-1/2.png in braickish/reference-images): bottle green, the flats a
  // greyer teal-green, the face a deeper emerald.
  body = mix(body, mix(vec3f(0.02, 0.105, 0.09), vec3f(0.035, 0.21, 0.14), smoothstep(-0.5, 4.0, i.wpos.y)), W.green);
  let diff = max(dot(n, sun), 0.0);
  body *= 0.6 + 0.4 * diff;
  // The ribs also show as lighter and darker streaks of water up the face.
  body *= 1.0 + (rib - 0.5) * 0.9 * slope * smoothstep(3.0, 12.0, dist);
  // Light shining through thin water (the lip) glows green.
  let toward = max(dot(-v, sun), 0.0);
  let sss = mix(vec3f(0.10, 0.66, 0.72), vec3f(0.15, 0.46, 0.30), W.green) * thin * (0.35 + 1.6 * pow(toward, 2.5));
  var col = body + sss;
  col = mix(col, refl, fres * (1.0 - thin * 0.5));
  let hv = normalize(sun + v);
  col += vec3f(1.0, 0.95, 0.85) * pow(max(dot(n, hv), 0.0), 500.0) * 4.0 * (1.0 - 0.85 * flatness);

  // Foam: broken up with noise, plus faint streaks on the face.
  let fq = vec2f(ax + F.flow.x * 0.9, i.wpos.y * 1.3 + i.wpos.z * 0.6 - t * 0.8) * F.misc.y;
  let fn1 = noise(fq * 1.4) * 0.6 + noise(fq * 3.9 + vec2f(t, 0.0)) * 0.4;
  var foam = clamp(foamAmt * 1.6 - (1.0 - fn1) * 0.9, 0.0, 1.0);
  let streak = smoothstep(0.78, 0.95, noise(vec2f((ax + F.flow.x) * 0.6, (i.wpos.y + i.wpos.z) * 4.0)));
  let onFace = smoothstep(-1.5, -0.3, phase) * (1.0 - smoothstep(1.0, 1.4, phase)) * smoothstep(0.3, 1.5, i.wpos.y);
  foam = max(foam, streak * onFace * 0.18);
  let foamCol = vec3f(0.93, 0.97, 1.0) * (0.72 + 0.28 * diff + 0.1);
  col = mix(col, foamCol, foam);
  col *= shade; // (the surfer's shadow, real look)

  col = fogMix(col, i.wpos);
  return vec4f(tonemap(col), 1.0);
}
`;

const realShadeWGSL = /* wgsl */ `
// The real look (F.misc.w, ?look=real / V): smooth light instead of toon bands and ink. Wrapped sunlight (soft
// terminator, a hint of light through skin), sky light from above and light bounced off the water from below
// and in front, a soft sheen by material (mat.x: cloth ~0.08, skin ~0.35, a glassed board ~0.7) and a faint rim
// so the figure still separates from the water.
// The surfer's own key light (2026-11-18, the user liked her colors seen from behind / in the barrel, where we see
// the side the sun lights; from the riding camera we look at her shaded side, the sun being behind the wave): the
// sun's direction pulled round toward the camera and up a little, so she always looks sunlit. Water and sky keep
// the real sun.
fn keyLight(v: vec3f) -> vec3f { return normalize(F.sunDir.xyz * 0.45 + v * 0.75 + vec3f(0.0, 0.35, 0.0)); }
fn realShade(n: vec3f, v: vec3f, wpos: vec3f, base: vec3f, shine: f32) -> vec3f {
  let sun = keyLight(v);
  let ndl = dot(n, sun);
  let wrap = clamp((ndl + 0.4) / 1.4, 0.0, 1.0);
  let skyL = mix(vec3f(0.2, 0.33, 0.36), vec3f(0.62, 0.74, 0.88), n.y * 0.5 + 0.5); // (water-tinted from below)
  let bounce = vec3f(0.3, 0.42, 0.42) * max(dot(n, normalize(vec3f(0.0, -0.35, 1.0))), 0.0) * 0.5;
  var col = base * (skyL * 0.62 + bounce + vec3f(1.0, 0.93, 0.82) * wrap * 0.85);
  let h = normalize(sun + v);
  let spec = pow(max(dot(n, h), 0.0), mix(10.0, 70.0, shine)) * shine * smoothstep(-0.1, 0.2, ndl);
  col += vec3f(1.0, 0.95, 0.88) * spec * 0.7;
  let fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += skyL * fres * 0.22;
  return col;
}
`;

const camGlowWGSL = /* wgsl */ `
// Light from the camera's side on the surfer (2026-11-18, the user: more camera glow): a fill on the faces turned
// toward us and a soft, warm rim round the edges, so the figure glows a little against the water.
fn camGlow(n: vec3f, v: vec3f, base: vec3f) -> vec3f {
  let ndv = max(dot(n, v), 0.0);
  return base * (0.2 * ndv + 0.06) + vec3f(1.0, 0.94, 0.84) * pow(1.0 - ndv, 2.5) * 0.2; // (the key light now does most of it)
}
`;

export const solidWGSL = common + realShadeWGSL + camGlowWGSL + /* wgsl */ `
struct Obj { model: mat4x4f, color: vec4f, mat: vec4f }; // mat.x: shine (the real look)
@group(1) @binding(0) var<uniform> O: Obj;
struct VO { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) n: vec3f };
// Ink thinner than O.color.w closer in than the riding camera (see vsOutline): this much of it, 1 from 14 m out.
fn inkK(base: vec3f) -> f32 { return clamp(length(base - F.camPos.xyz) / 14.0, 0.2, 1.0); }
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  let nw = normalize((O.model * vec4f(n, 0.0)).xyz);
  let base = (O.model * vec4f(p, 1.0)).xyz;
  // Up close the part fills out by the ink it lost, so it keeps its size as seen from the shoulder (thin parts,
  // the neck, arms and wrists, looked 20-25% skinnier in the barrel view when the line just got thinner).
  // (a negative O.color.w: no ink drawn, but fills out the same, for flush details: waistband, logo, stringer)
  let w = base + nw * abs(O.color.w) * (1.0 - inkK(base)) * (1.0 - F.misc.w); // (no ink in the real look: nothing to fill out)
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.wpos = w;
  o.n = nw;
  return o;
}
// Illustrated look: toon shading in a few flat bands, plus a thin ink
// outline drawn by the outline pass below.
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n);
  let sun = F.sunDir.xyz;
  let v = normalize(F.camPos.xyz - i.wpos);
  let l = dot(n, sun);
  let band = 0.5 + 0.25 * smoothstep(-0.05, 0.05, l) + 0.25 * smoothstep(0.45, 0.55, l);
  let sky = mix(vec3f(0.55, 0.62, 0.72), vec3f(0.85, 0.92, 1.0), smoothstep(-0.2, 0.2, n.y));
  let rim = smoothstep(0.62, 0.7, 1.0 - max(dot(n, v), 0.0)) * 0.18;
  var col = O.color.rgb * mix(sky * 0.55, vec3f(1.05, 0.97, 0.88), band) + rim;
  if (F.misc.w > 0.5) { col = realShade(n, v, i.wpos, O.color.rgb, O.mat.x) + camGlow(n, v, O.color.rgb); }
  col = fogMix(col, i.wpos);
  return vec4f(tonemap(col), 1.0);
}

// Ink outline: the back faces of each part, pushed out along the normal.
// O.color.w is the line thickness (m) as seen from the riding camera, ~15 m out in the channel (14 m or further: unchanged).
// Closer than that (the barrel view, ~5.5 m behind) the line thins with distance so it keeps the same weight on
// screen (it was ~3x heavier there), and the part fills out by the difference (vs), so each part's overall size
// is the same as from out on the shoulder.
@vertex fn vsOutline(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  let nw = normalize((O.model * vec4f(n, 0.0)).xyz);
  let base = (O.model * vec4f(p, 1.0)).xyz;
  let w = base + nw * O.color.w; // (the outer edge stays put: the part itself fills out up close, vs above)
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.wpos = w;
  o.n = nw;
  return o;
}
@fragment fn fsOutline(i: VO) -> @location(0) vec4f {
  return vec4f(tonemap(fogMix(vec3f(0.07, 0.07, 0.1), i.wpos)), 1.0);
}
`;

// Particles: pos (xyz, life), vel (xyz, kind), extra (maxLife, size, -, -).
// Kinds: 0 lip spray, 1 whitewater mist, 2 rider spray, 3 barrel spit,
// 4 offshore plume (spray blowing back off the crest).
const particleCommon = /* wgsl */ `
struct P { pos: vec4f, vel: vec4f, extra: vec4f };
`;

export const particleComputeWGSL = common + particleCommon + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> parts: array<P>;
@group(0) @binding(2) var<storage, read> lip: array<vec4f>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
var<private> seed: u32;
fn rnd() -> f32 { seed = pcg(seed); return f32(seed) / 4294967295.0; }
fn rs() -> f32 { return rnd() * 2.0 - 1.0; }

fn lipAt(xs: f32) -> array<vec4f, 3> {
  let n = i32(F.params.z);
  let k = clamp(i32((xs - F.params.x) / F.params.y), 0, n - 1);
  return array<vec4f, 3>(lip[k * 3], lip[k * 3 + 1], lip[k * 3 + 2]);
}

fn respawn(id: u32) -> P {
  var p: P;
  let peel = F.sunDir.w;
  let r0 = rnd();
  let sprayAmt = F.rider.w;
  let burst = F.params.w;
  if (r0 < sprayAmt * 0.07 + burst * 0.5) {
    // Spray off the rider's rail (or a wipeout splash).
    let b = burst;
    p.pos = vec4f(F.rider.xyz + vec3f(rs(), rs() * 0.3, rs()) * (0.25 + b * 0.6), 0.45 + rnd() * 0.5 + b * 0.5);
    let v = F.spray.xyz * (3.0 + rnd() * 4.0) * (1.0 - b) + vec3f(rs(), 0.0, rs()) * (1.2 + b * 4.0)
          + vec3f(0.0, 1.8 + rnd() * 3.5 + b * 4.0, 0.0) + F.riderVel.xyz * 0.35;
    p.vel = vec4f(v, 2.0);
    p.extra = vec4f(p.pos.w, 0.06 + rnd() * 0.07 + b * 0.15, 0.0, 0.0);
    return p;
  }
  if (r0 >= 0.37 && r0 < 0.43) {
    // Where the lip lands: whitewater bursting up off the water in front of
    // the tube and blowing out toward shore (away from the tube).
    let xs = mix(-22.0, 0.0, rnd());
    let L = lipAt(xs);
    if (rnd() > L[2].w || L[0].x > 1.2) { p.pos = vec4f(0.0, -10.0, 0.0, 0.05 + rnd() * 0.2); return p; }
    let pos = vec3f(xs + rs() * 0.3, max(L[0].x, -0.4) + rnd() * 0.3, L[0].y + 0.2 + rnd() * 0.6);
    let v = vec3f(-peel * (0.3 + rnd() * 0.3) + rs() * 1.0, 2.0 + rnd() * 5.0, 1.0 + rnd() * 3.5);
    p.pos = vec4f(pos, 0.8 + rnd() * 0.9);
    p.vel = vec4f(v, 1.0);
    p.extra = vec4f(p.pos.w, 0.22 + rnd() * 0.35, 0.0, 0.0);
    return p;
  }
  if (r0 >= 0.43 && r0 < 0.5) {
    // Offshore plume: spray torn off the top of the wave, rising and blowing
    // back over it (away from the face, so it never fills the tube).
    let xs = mix(-18.0, 14.0, rnd());
    let L = lipAt(xs);
    if (rnd() > L[2].z) { p.pos = vec4f(0.0, -10.0, 0.0, 0.05 + rnd() * 0.2); return p; }
    let pos = vec3f(xs, L[2].x - 0.1 + rnd() * 0.2, L[2].y + 0.2 + rs() * 0.3);
    // fanning up and back off the lip: some straight up, some streaming back
    let up = 2.0 + rnd() * 4.0;
    let v = vec3f(-peel * (0.25 + rnd() * 0.3) + rs() * 0.5, up, -(0.5 + rnd() * 4.5));
    p.pos = vec4f(pos, 1.0 + rnd() * 1.2);
    p.vel = vec4f(v, 4.0);
    p.extra = vec4f(p.pos.w, 0.12 + rnd() * 0.22, 0.0, 0.0);
    return p;
  }
  if (r0 < 0.37) {
    // The lip: a light feathering along the tip, heavier where it lands.
    let xs = mix(-14.0, 3.0, rnd());
    let L = lipAt(xs);
    let ph = L[1].z;
    let impact = L[1].w; // how active the whitewater is here
    // (no spray off the tip where it has thrown down into a tube: it would fill the tube)
    if (ph < -0.15 || ph > 1.8 || (L[0].x < 2.5 && ph > 0.15) || rnd() > 0.06 + impact * 0.6) { p.pos = vec4f(0.0, -10.0, 0.0, 0.05 + rnd() * 0.2); return p; }
    let pos = vec3f(xs, L[0].x, L[0].y) + vec3f(rs() * 0.25, rs() * 0.15, rs() * 0.15);
    let dir = vec3f(0.0, L[0].z, L[0].w);
    let v = dir * (1.0 + rnd() * 2.5) + vec3f(-peel * (0.3 + rnd() * 0.3), 0.4 + rnd() * 1.2 + impact * 2.0, 0.6 + rnd() * 0.8) + vec3f(rs(), rs(), rs()) * 0.5;
    p.pos = vec4f(pos, 0.35 + rnd() * 0.6);
    p.vel = vec4f(v, 0.0);
    p.extra = vec4f(p.pos.w, 0.07 + rnd() * 0.09, 0.0, 0.0);
    return p;
  }
  if (r0 < 0.88) {
    // Whitewater mist and chunks, thickest where the wave is crumbling, a
    // lighter haze behind it.
    let xs = mix(-40.0, 1.0, rnd());
    let L = lipAt(xs);
    let w = max(L[1].w, 0.15 * smoothstep(0.8, 1.6, L[1].z));
    if (rnd() > w * 0.6) { p.pos = vec4f(0.0, -10.0, 0.0, 0.05 + rnd() * 0.2); return p; }
    let pos = vec3f(xs, L[0].x + 0.1 + rnd() * 0.5, L[0].y + rs() * 0.9);
    let v = vec3f(rs() * 1.5 - peel * 0.3, 1.2 + rnd() * 3.5 * w, 0.6 + rnd() * 2.0);
    p.pos = vec4f(pos, 0.9 + rnd() * 1.4);
    p.vel = vec4f(v, 1.0);
    p.extra = vec4f(p.pos.w, 0.25 + rnd() * 0.4, 0.0, 0.0);
    return p;
  }
  // The barrel spitting: an occasional puff of mist blasting out of the
  // tube. Only where there is a tube (the lip tip has thrown down low).
  let xs = mix(-10.5, -7.5, rnd());
  let L = lipAt(xs);
  if (L[0].x > 2.5 || rnd() > 0.15) { p.pos = vec4f(0.0, -10.0, 0.0, 0.05 + rnd() * 0.2); return p; }
  let c = vec3f(xs, L[1].x, L[1].y);
  p.pos = vec4f(c + vec3f(rs() * 0.4, rs() * 0.6, rs() * 0.6), 0.45 + rnd() * 0.45);
  p.vel = vec4f(12.0 + rnd() * 9.0, rs() * 0.8, rs() * 0.8 + 0.4, 3.0);
  p.extra = vec4f(p.pos.w, 0.12 + rnd() * 0.15, 0.0, 0.0);
  return p;
}

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= arrayLength(&parts)) { return; }
  seed = pcg(id * 9781u + u32(F.spray.w) * 6271u + 17u);
  let dt = F.riderVel.w;
  var p = parts[id];
  p.pos.w -= dt;
  if (p.pos.w <= 0.0) {
    parts[id] = respawn(id);
    return;
  }
  let kind = p.vel.w;
  var grav = 9.8;
  var drag = 0.5;
  if (kind == 1.0) { grav = 1.5; drag = 1.2; }
  if (kind == 3.0) { grav = 0.6; drag = 2.2; }
  if (kind == 4.0) { grav = 0.7; drag = 0.7; }
  var v = p.vel.xyz;
  v.y -= grav * dt;
  v *= max(0.0, 1.0 - drag * dt);
  p.pos = vec4f(p.pos.xyz + v * dt - vec3f(F.flow.y * dt, 0.0, 0.0), p.pos.w); // (flow.y: the frame's speed beyond its smoothed speed: a fast
  // section on Trestles mustn't drag the spray along with the frame; 0 on a steady peel)
  p.vel = vec4f(v, kind);
  if (p.pos.y < -0.7) { p.pos.w = 0.0; }
  parts[id] = p;
}
`;

export const particleRenderWGSL = common + particleCommon + /* wgsl */ `
@group(0) @binding(1) var<storage, read> parts: array<P>;
@group(0) @binding(2) var<uniform> cam: array<vec4f, 2>; // right, up
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) a: f32, @location(2) wpos: vec3f, @location(3) kind: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let p = parts[ii];
  let pp = dirX(p.pos.xyz); // (simulated in the peel frame, drawn in the world)
  let rw = dirX(F.rider.xyz);
  if (p.pos.w <= 0.0 || p.pos.y < -5.0) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); return o; }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let corner = corners[vi];
  let age = 1.0 - p.pos.w / max(p.extra.x, 0.001);
  // Skip particles right in front of the camera, and cap how big any one can
  // get on screen: big translucent sprites near the lens are what cost the
  // most (overdraw), especially on high-DPI screens.
  let camDist = length(pp - F.camPos.xyz);
  if (camDist < 2.5) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); return o; }
  let grow = select(1.0, 1.0 + age * 2.5, p.vel.w == 4.0); // the plume billows out as it goes
  let size = min(p.extra.y * (0.7 + age * 1.0) * grow * F.misc.x, camDist * 0.06);
  let w = pp + (cam[0].xyz * corner.x + cam[1].xyz * corner.y) * size;
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.uv = corner;
  let kind = p.vel.w;
  var alpha = 0.32;
  if (kind == 0.0) { alpha = 0.2; }
  if (kind == 1.0) { alpha = 0.15; }
  if (kind == 3.0) { alpha = 0.10; }
  if (kind == 4.0) { alpha = 0.07 * (1.0 - age * 0.6); } // wispy, thinning out as it billows
  o.a = alpha * smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.55, 1.0, age));
  o.a *= smoothstep(0.8, 5.0, length(w - F.camPos.xyz)); // don't fog the lens
  if (kind == 3.0) { o.a *= smoothstep(1.0, 4.0, length(pp - rw)); } // spit never hides the surfer
  if (kind == 1.0 || kind == 3.0 || kind == 4.0) {
    // Mist never covers the surfer: fade it near the line from the camera to them.
    let ab = rw + vec3f(0.0, 0.9, 0.0) - F.camPos.xyz;
    let u = clamp(dot(pp - F.camPos.xyz, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    o.a *= smoothstep(0.6, 2.2, length(pp - (F.camPos.xyz + ab * u)) - size);
  }
  o.wpos = w;
  o.kind = kind;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let soft = 1.0 - r2;
  let sun = max(dot(normalize(F.camPos.xyz - i.wpos), -F.sunDir.xyz), 0.0);
  var col = vec3f(0.86, 0.93, 0.97) + vec3f(0.14, 0.1, 0.05) * pow(sun, 3.0);
  col = fogMix(col, i.wpos);
  let a = i.a * soft;
  return vec4f(tonemap(col) * a, a);
}
`;

// The skinned body (body.js): each vertex blends up to four bones' skinning matrices (already in the world), lit
// with the real look. Vertex color: rgb the material color (skin, boardshorts), a its shine.
export const skinnedWGSL = common + realShadeWGSL + camGlowWGSL + /* wgsl */ `
@group(1) @binding(0) var<storage, read> bones: array<mat4x4f>;
struct VO { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) n: vec3f, @location(2) col: vec4f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) j: vec4u, @location(3) w: vec4f, @location(4) c: vec4f) -> VO {
  var o: VO;
  let m = bones[j.x] * w.x + bones[j.y] * w.y + bones[j.z] * w.z + bones[j.w] * w.w;
  let wp = m * vec4f(p, 1.0);
  o.pos = F.viewProj * wp;
  o.wpos = wp.xyz;
  o.n = (m * vec4f(n, 0.0)).xyz;
  o.col = c;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  var n = normalize(i.n);
  let v = normalize(F.camPos.xyz - i.wpos);
  var col = realShade(n, v, i.wpos, i.col.rgb, i.col.a);
  // a soft fill light from the camera's side (2026-11-18, the user: the body read too dark; with the sun behind
  // the wave we mostly see its shaded side), so the figure stays easy to see against the water
  col += camGlow(n, v, i.col.rgb);
  col = fogMix(col, i.wpos);
  return vec4f(tonemap(col), 1.0);
}
`;
