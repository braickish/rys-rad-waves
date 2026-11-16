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
};
@group(0) @binding(0) var<uniform> F: Frame;

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
  return c / (1.0 + max(vec3f(0.0), c - 0.8) * 0.6);
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
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) a: vec3f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.wpos = p;
  o.n = n;
  o.attr = a;
  return o;
}

fn ripple(q: vec2f, t: f32) -> f32 {
  return noise(q * 0.7) * 0.5 + noise(q * 1.9 + vec2f(t * 0.4, 0.0)) * 0.3 + noise(q * 4.7 - vec2f(0.0, t * 0.6)) * 0.15;
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
  let q = vec2f(i.wpos.x + t * peel, i.wpos.z * 0.9 + i.wpos.y * 0.9 - t * 1.5);
  let e = 0.06;
  let h0 = ripple(q, t);
  let gx = (ripple(q + vec2f(e, 0.0), t) - h0) / e;
  let gy = (ripple(q + vec2f(0.0, e), t) - h0) / e;
  let t1 = normalize(vec3f(1.0, 0.0, 0.0) - n * n.x);
  let t2 = cross(n, t1);
  let dist = length(F.camPos.xyz - i.wpos);
  let detail = 0.22 * exp(-dist * 0.025);
  n = normalize(n - (t1 * gx + t2 * gy) * detail);

  let phase = i.attr.x;
  let foamAmt = i.attr.y;
  let thin = i.attr.z;

  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let refl = sky(reflect(-v, n));
  let deep = vec3f(0.01, 0.12, 0.19);
  let upper = vec3f(0.03, 0.34, 0.40);
  var body = mix(deep, upper, smoothstep(-0.5, 4.0, i.wpos.y));
  let diff = max(dot(n, sun), 0.0);
  body *= 0.6 + 0.4 * diff;
  // Light shining through thin water (the lip) glows green.
  let toward = max(dot(-v, sun), 0.0);
  let sss = vec3f(0.18, 0.85, 0.62) * thin * (0.35 + 1.6 * pow(toward, 2.5));
  var col = body + sss;
  col = mix(col, refl, fres * (1.0 - thin * 0.5));
  let hv = normalize(sun + v);
  col += vec3f(1.0, 0.95, 0.85) * pow(max(dot(n, hv), 0.0), 500.0) * 4.0;

  // Foam: broken up with noise, plus faint streaks on the face.
  let fq = vec2f(i.wpos.x + t * peel * 0.9, i.wpos.y * 1.3 + i.wpos.z * 0.6 - t * 0.8);
  let fn1 = noise(fq * 1.4) * 0.6 + noise(fq * 3.9 + vec2f(t, 0.0)) * 0.4;
  var foam = clamp(foamAmt * 1.6 - (1.0 - fn1) * 0.9, 0.0, 1.0);
  let streak = smoothstep(0.78, 0.95, noise(vec2f((i.wpos.x + t * peel) * 0.6, (i.wpos.y + i.wpos.z) * 4.0)));
  let onFace = smoothstep(-1.5, -0.3, phase) * (1.0 - smoothstep(1.0, 1.4, phase)) * smoothstep(0.3, 1.5, i.wpos.y);
  foam = max(foam, streak * onFace * 0.18);
  let foamCol = vec3f(0.93, 0.97, 1.0) * (0.72 + 0.28 * diff + 0.1);
  col = mix(col, foamCol, foam);

  col = fogMix(col, i.wpos);
  return vec4f(tonemap(col), 1.0);
}
`;

export const solidWGSL = common + /* wgsl */ `
struct Obj { model: mat4x4f, color: vec4f };
@group(1) @binding(0) var<uniform> O: Obj;
struct VO { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) n: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  let w = O.model * vec4f(p, 1.0);
  o.pos = F.viewProj * w;
  o.wpos = w.xyz;
  o.n = (O.model * vec4f(n, 0.0)).xyz;
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
  col = fogMix(col, i.wpos);
  return vec4f(tonemap(col), 1.0);
}

// Ink outline: the back faces of each part, pushed out along the normal.
// O.color.w is the line thickness (m).
@vertex fn vsOutline(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  let nw = normalize((O.model * vec4f(n, 0.0)).xyz);
  let w = (O.model * vec4f(p, 1.0)).xyz + nw * O.color.w;
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
// Kinds: 0 lip spray, 1 whitewater mist, 2 rider spray, 3 barrel spit.
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

fn lipAt(xs: f32) -> array<vec4f, 2> {
  let n = i32(F.params.z);
  let k = clamp(i32((xs - F.params.x) / F.params.y), 0, n - 1);
  return array<vec4f, 2>(lip[k * 2], lip[k * 2 + 1]);
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
  if (r0 < 0.5) {
    // The lip: a light feathering along the tip, heavier where it lands.
    let xs = mix(-14.0, 3.0, rnd());
    let L = lipAt(xs);
    let ph = L[1].z;
    let impact = L[1].w; // how active the whitewater is here
    if (ph < -0.15 || ph > 1.8 || rnd() > 0.06 + impact * 0.6) { p.pos = vec4f(0.0, -10.0, 0.0, 0.05 + rnd() * 0.2); return p; }
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
  // The barrel spitting: air and mist blasting out of the tube.
  let xs = mix(-10.5, -7.5, rnd());
  let L = lipAt(xs);
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
  var v = p.vel.xyz;
  v.y -= grav * dt;
  v *= max(0.0, 1.0 - drag * dt);
  p.pos = vec4f(p.pos.xyz + v * dt, p.pos.w);
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
  if (p.pos.w <= 0.0 || p.pos.y < -5.0) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); return o; }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let corner = corners[vi];
  let age = 1.0 - p.pos.w / max(p.extra.x, 0.001);
  // Skip particles right in front of the camera, and cap how big any one can
  // get on screen: big translucent sprites near the lens are what cost the
  // most (overdraw), especially on high-DPI screens.
  let camDist = length(p.pos.xyz - F.camPos.xyz);
  if (camDist < 2.5) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); return o; }
  let size = min(p.extra.y * (0.7 + age * 1.0), camDist * 0.06);
  let w = p.pos.xyz + (cam[0].xyz * corner.x + cam[1].xyz * corner.y) * size;
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.uv = corner;
  let kind = p.vel.w;
  var alpha = 0.32;
  if (kind == 0.0) { alpha = 0.2; }
  if (kind == 1.0) { alpha = 0.15; }
  if (kind == 3.0) { alpha = 0.10; }
  o.a = alpha * smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.55, 1.0, age));
  o.a *= smoothstep(0.8, 5.0, length(w - F.camPos.xyz)); // don't fog the lens
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
