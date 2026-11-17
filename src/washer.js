// The "washing machine": wipe out in the barrel and the screen goes to a
// churning white foam ball, as if the wave is tumbling you around inside it.
// Drawn on a 2D canvas laid over the game.

const canvas = document.getElementById('foam');
const ctx = canvas.getContext('2d');
let amount = 0; // 0..1 how much of the screen is foam
let spin = 0, time = 0;
let blobs = [];

function seed() {
  blobs = [];
  for (let i = 0; i < 140; i++) {
    blobs.push({
      a: Math.random() * Math.PI * 2, // angle around the swirl
      r: Math.pow(Math.random(), 0.7), // 0..1 out from the middle
      size: 0.02 + Math.random() * 0.09,
      speed: 0.6 + Math.random() * 1.4,
      shade: Math.random(),
      wobble: Math.random() * 6.28,
    });
  }
}

// on: tumbling in the foam right now. Fades in fast, fades out as you surface.
export function updateWasher(dt, on) {
  const was = amount;
  amount += ((on ? 1 : 0) - amount) * (1 - Math.exp(-dt * (on ? 14 : 2.5)));
  if (amount < 0.004) amount = 0;
  if (!was && amount) seed();
  if (!amount) {
    if (was) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  time += dt;
  // Tumbling: the whole swirl spins, fast at first, slowing as it lets go.
  spin += dt * (on ? 5.5 + 2.5 * Math.sin(time * 1.7) : 2);
  const R = Math.hypot(W, H) * 0.6;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = amount;
  // Churned-up white water, a hint of green-blue where it's thinner.
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.55, '#eef7f8');
  bg.addColorStop(1, '#bcdcdf');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + Math.sin(time * 3.1) * W * 0.03, H / 2 + Math.cos(time * 2.3) * H * 0.03);
  ctx.rotate(spin);
  // Swirling streaks of darker water and bright foam.
  for (let k = 0; k < 7; k++) {
    ctx.beginPath();
    const base = (k / 7) * Math.PI * 2 + time * 0.8;
    for (let s = 0; s <= 40; s++) {
      const f = s / 40, a = base + f * 3.2, r = R * (0.1 + f * 0.9);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = k % 2 ? 'rgba(120,175,185,0.28)' : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = R * (k % 2 ? 0.05 : 0.09);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // Bubbles and clumps of foam spiralling round.
  for (const b of blobs) {
    b.a += dt * b.speed * (1.4 - b.r);
    b.r += dt * 0.08 * Math.sin(time * 2 + b.wobble);
    if (b.r < 0.03 || b.r > 1.05) b.r = 0.05 + Math.random() * 0.9;
    const x = Math.cos(b.a) * b.r * R, y = Math.sin(b.a) * b.r * R, s = b.size * R * 0.5;
    if (b.shade < 0.7) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 + b.shade * 0.3})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    } else {
      // A bubble: a thin ring with a highlight.
      ctx.strokeStyle = 'rgba(110,165,180,0.55)';
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(x - s * 0.18, y - s * 0.18, s * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
