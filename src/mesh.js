// Geometry built once on the CPU: the wave surface (static in the peel
// frame), a lip lookup table for the GPU particle emitters, and simple
// primitives for the surfer.

import { NP, FAR, phaseAt, surface, WAVE_TYPE } from './wave.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sliceXs() {
  const xs = [-FAR, -800, -400, -200, -120, -90, -70];
  for (let x = -60; x < -40; x += 2) xs.push(x);
  for (let x = -40; x < 60; x += 0.5) xs.push(x);
  for (let x = 60; x < 120; x += 2) xs.push(x);
  xs.push(120, 160, 250, 400, 800, FAR);
  return xs;
}

// Water mesh. Vertex: pos(3) normal(3) attr(3: phase, foam, thin) = 9 floats.
export function buildWaterMesh(perSeg = 10) {
  const xsList = sliceXs();
  const rows = (NP - 1) * perSeg + 1;
  const cols = rows + 2; // plus far-flat ocean at each end
  const nx = xsList.length;
  const P = new Float32Array(nx * cols * 3);
  const A = new Float32Array(nx * cols * 3);
  const tOf = new Float32Array(cols);
  const o = [0, 0, 0];
  for (let i = 0; i < nx; i++) {
    const xs = xsList[i];
    const s = phaseAt(xs);
    for (let j = 0; j < cols; j++) {
      const k = (i * cols + j) * 3;
      let t;
      if (j === 0) { P[k] = xs; P[k + 1] = 0; P[k + 2] = -FAR; t = 0; }
      else if (j === cols - 1) { P[k] = xs; P[k + 1] = 0; P[k + 2] = FAR; t = NP - 1; }
      else {
        t = (j - 1) / perSeg;
        surface(xs, t, o);
        P[k] = o[0]; P[k + 1] = o[1]; P[k + 2] = o[2];
      }
      tOf[j] = t;
      let foam, thin;
      if (WAVE_TYPE === 'crumble') {
        // Foam spills from the crest down the face behind the curl, reaching
        // further down as the section crumbles, until the whole face is white.
        const reach = 6 + 7 * sstep(0.0, 0.7, s); // how far down the face (in t) the foam has spilled
        foam = sstep(-0.15, 0.35, s) * sstep(3.6, 4.6, t) * (1 - sstep(reach - 1.2, reach + 0.6, t));
        foam = Math.max(foam, sstep(0.8, 1.4, s) * sstep(3.5, 5.0, t) * (1 - sstep(10, 40, -xs) * 0.5));
        // Feathering along the crest just ahead of the curl.
        foam = Math.max(foam, Math.exp(-(((t - 4.8) / 0.7) ** 2)) * sstep(-0.6, -0.1, s) * 0.35);
        thin = Math.exp(-(((t - 6.5) / 2.2) ** 2)) * sstep(-1.6, -0.4, s) * (1 - sstep(0.1, 0.6, s)) * 0.7;
      } else {
        // Foam: whitewater behind the barrel, plus the lip and where it lands.
        const front = sstep(3.5, 5.5, t); // the front half of the wave, not the back
        foam = sstep(1.4, 2.0, s) * front * (1 - sstep(10, 40, -xs) * 0.5);
        foam = Math.max(foam, Math.exp(-(((t - 8.2) / 0.8) ** 2)) * sstep(0.6, 1.2, s) * (1 - sstep(1.7, 2.5, s)) * 0.45);
        foam = Math.max(foam, sstep(13.6, 14.3, t) * sstep(0.9, 1.3, s) * (1 - sstep(3, 6, s)) * 0.55);
        // Thin water that glows when backlit: the lip, and the top of a steep face.
        const lipW = Math.exp(-(((t - 8) / 2.4) ** 2));
        thin = Math.min(1, lipW * sstep(-0.6, 0.1, s) * (1 - sstep(1.2, 1.8, s)) * 1.1
          + Math.exp(-(((t - 9.5) / 2.5) ** 2)) * sstep(-1.6, -0.3, s) * (1 - sstep(0.3, 0.8, s)) * 0.45);
      }
      A[k] = s; A[k + 1] = foam; A[k + 2] = thin;
    }
  }
  // Normals from the grid: cross(dP/dt, dP/dx) points out of the water.
  const N = new Float32Array(nx * cols * 3);
  const g = (i, j, c) => P[(i * cols + j) * 3 + c];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < cols; j++) {
      const k = (i * cols + j) * 3;
      if (j === 0 || j === cols - 1) { N[k + 1] = 1; continue; }
      const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
      const j0 = Math.max(1, j - 1), j1 = Math.min(cols - 2, j + 1);
      const tu = [g(i, j1, 0) - g(i, j0, 0), g(i, j1, 1) - g(i, j0, 1), g(i, j1, 2) - g(i, j0, 2)];
      const tx = [g(i1, j, 0) - g(i0, j, 0), g(i1, j, 1) - g(i0, j, 1), g(i1, j, 2) - g(i0, j, 2)];
      let n = [tu[1] * tx[2] - tu[2] * tx[1], tu[2] * tx[0] - tu[0] * tx[2], tu[0] * tx[1] - tu[1] * tx[0]];
      const l = Math.hypot(...n) || 1;
      N[k] = n[0] / l; N[k + 1] = n[1] / l; N[k + 2] = n[2] / l;
    }
  }
  const verts = new Float32Array(nx * cols * 9);
  for (let v = 0; v < nx * cols; v++) {
    verts.set([P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], A[v * 3], A[v * 3 + 1], A[v * 3 + 2]], v * 9);
  }
  const idx = new Uint32Array((nx - 1) * (cols - 1) * 6);
  let q = 0;
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
  }
  return { verts, idx, count: idx.length };
}

// Lip table for particle emitters: per xs, two vec4s:
//   [tipY, tipZ, dirY, dirZ], [tubeCenterY, tubeCenterZ, phase, 0]
export const LIP = { x0: -45, step: 0.25, count: 241 };
export function buildLipTable() {
  const data = new Float32Array(LIP.count * 8);
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (let i = 0; i < LIP.count; i++) {
    const xs = LIP.x0 + i * LIP.step;
    const tipT = WAVE_TYPE === 'crumble' ? 5.0 : 8;
    surface(xs, tipT, a);
    surface(xs, tipT + 0.15, b);
    surface(xs, 12.6, c);
    let dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dy, dz) || 1;
    data.set([a[1], a[2], dy / l, dz / l, (a[1] + c[1]) * 0.5, (a[2] + c[2]) * 0.5, phaseAt(xs), 0], i * 8);
  }
  return data;
}

// Unit primitives (pos + normal, 6 floats).
export function boxMesh() {
  const f = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const v = [];
  for (const [n, u, w] of f) {
    const corner = (su, sw) => [n[0] * 0.5 + u[0] * su * 0.5 + w[0] * sw * 0.5, n[1] * 0.5 + u[1] * su * 0.5 + w[1] * sw * 0.5, n[2] * 0.5 + u[2] * su * 0.5 + w[2] * sw * 0.5];
    const c = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    for (const k of [0, 1, 2, 0, 2, 3]) v.push(...c[k], ...n);
  }
  return new Float32Array(v);
}

export function sphereMesh(lat = 10, lon = 16) {
  const v = [];
  const pt = (i, j) => {
    const th = (i / lat) * Math.PI, ph = (j / lon) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      for (const p of [a, c, b, a, d, c]) v.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, ...p);
    }
  }
  return new Float32Array(v);
}

// Surfboard, in board space: x along the board (+x = nose), y up, z across.
// Pointed nose with kick, squared-off tail, rounded rails. Built in two
// pieces over [u0, u1] of the length (u = -1 tail .. +1 nose) so the nose can
// be a different color.
export function boardMesh(u0 = -1, u1 = 1, segs = 28, ring = 14) {
  const L = 1.0, W = 0.27; // half-length, half-width
  const width = (u) => {
    const uu = Math.max(u, -0.93); // squash tail: cut off before it narrows to a point
    return (W * Math.pow(1 - uu, 0.6) * Math.pow(1 + uu, 0.3)) / 1.051;
  };
  const rocker = (u) => 0.11 * Math.max(0, u - 0.3) ** 2 / 0.49 + 0.03 * Math.max(0, -u - 0.6) ** 2 / 0.16;
  const thick = (u) => 0.034 * (1 - 0.55 * u * u);
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const u = u0 + (u1 - u0) * (i / segs);
    const w = Math.max(width(u), 0.004), y0 = rocker(u), th = thick(u);
    const row = [];
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // Flatter deck and bottom, rounded rails.
      const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.6);
      const p = [u * L, y0 + th * sy, w * c];
      const n = [0, sy / th, c / w];
      const l = Math.hypot(...n);
      row.push([p, [n[0] / l, n[1] / l, n[2] / l]]);
    }
    pts.push(row);
  }
  const v = [];
  const push = ([p, n]) => v.push(...p, ...n);
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < ring; k++) {
      const a = pts[i][k], b = pts[i][(k + 1) % ring], c = pts[i + 1][k], d = pts[i + 1][(k + 1) % ring];
      push(a); push(c); push(b); push(b); push(c); push(d);
    }
  }
  // Cap the tail end.
  if (u0 <= -1) {
    const row = pts[0], ctr = [u0 * L, rocker(u0), 0];
    for (let k = 0; k < ring; k++) {
      push([ctr, [-1, 0, 0]]); push([row[(k + 1) % ring][0], [-1, 0, 0]]); push([row[k][0], [-1, 0, 0]]);
    }
  }
  return new Float32Array(v);
}
