// A ride as a video you can post (plans/2026-11-24-share-ride-video.md step 1, the user 2026-11-24): the replay re-run
// frame by frame at a fixed 30 fps (main.js drives it: one game frame per video frame, each copied here as soon as it's drawn),
// encoded on the device by the browser's WebCodecs H.264 encoder and put in an MP4 by Mediabunny, then handed to the phone's
// share sheet (Instagram, TikTok, YouTube ...) or downloaded. Nothing goes through a server.
// Mediabunny (one self-contained module, ~720 KB) is fetched only when you make a video.

const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.65.0/dist/bundles/mediabunny.min.mjs';
export const VIDEO = {
  fps: 30,
  maxSide: 1920, // (px: the long side at most this (phones' hardware encoders and Instagram both top out around 1080x1920))
  bitrate: 8e6, // (bit/s: ~6 MB for 6 s; Instagram re-encodes anyway)
  maxSeconds: 90, // (a longer ride's video stops here)
};

// Can this browser make one? (WebCodecs is there; whether it does H.264 at the size is checked when it starts.)
export const canMakeVideo = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';

// Start a video of what's drawn on `src` (the game's canvas, WebGPU). capture() must be called in the same task the frame was
// drawn in (a WebGPU canvas's picture is only readable until it's shown); it resolves when the encoder is ready for the next.
export async function createVideo(src) {
  if (!canMakeVideo()) throw new Error("this browser can't encode video (no WebCodecs)");
  const mb = await import(MEDIABUNNY);
  const k = Math.min(1, VIDEO.maxSide / Math.max(src.width, src.height));
  const w = Math.max(2, Math.round(src.width * k / 2) * 2), h = Math.max(2, Math.round(src.height * k / 2) * 2); // (H.264: even sizes)
  if (!(await mb.canEncodeVideo('avc', { width: w, height: h, bitrate: VIDEO.bitrate }))) throw new Error(`this browser can't encode H.264 video at ${w}x${h}`);
  // (a 2D copy at the video's size: scaled, and still there while the encoder takes its time)
  const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { alpha: false });
  const logo = await makeLogo(Math.round(0.06 * Math.min(w, h))), pad = Math.round(0.03 * Math.min(w, h));
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const source = new mb.CanvasSource(cv, { codec: 'avc', bitrate: VIDEO.bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: VIDEO.fps });
  await output.start();
  let n = 0;
  return {
    w, h,
    get frames() { return n; },
    get seconds() { return n / VIDEO.fps; },
    capture() { ctx.drawImage(src, 0, 0, w, h); ctx.drawImage(logo, pad, pad); const p = source.add(n / VIDEO.fps, 1 / VIDEO.fps); n++; return p; },
    async finish() { await output.finalize(); return new Blob([output.target.buffer], { type: 'video/mp4' }); },
    cancel() { output.cancel().catch(() => {}); },
  };
}

// Hand the video to the share sheet where the browser can share files (phones), else download it. Must run from a tap.
export async function shareVideo(blob, name, title) {
  const file = new File([blob], name, { type: 'video/mp4' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  saveVideo(blob, name);
  return 'saved';
}
export function saveVideo(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// The start screen's logo (index.html .logo: Bungee Shade, "Ry's Rad" yellow over "Waves" white, each with a pink and a teal
// drop shadow, tilted 4 degrees), drawn once at `px` (font size) for the video's top left.
async function makeLogo(px) {
  const font = `${px}px "Bungee Shade", Bungee, sans-serif`;
  try { await document.fonts.load(font, "Ry's Rad Waves"); } catch {}
  const lines = [["Ry's Rad", '#ffd426'], ['Waves', '#fff']], lh = 0.92 * px, sh = [[0.105, '#00c2c7'], [0.053, '#ff3d8b']];
  const m = Object.assign(document.createElement('canvas').getContext('2d'), { font });
  const tw = Math.max(...lines.map(([t]) => m.measureText(t).width)), th = lh * lines.length;
  const a = -4 * Math.PI / 180, W = tw + 0.12 * px, H = th + 0.12 * px; // (with the shadows)
  const bw = Math.ceil(Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))), bh = Math.ceil(Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a)));
  const cv = Object.assign(document.createElement('canvas'), { width: bw, height: bh }), g = cv.getContext('2d');
  g.translate(bw / 2, bh / 2); g.rotate(a); g.translate(-W / 2, -H / 2);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, c], i) => {
    const x = tw / 2, y = lh * (i + 0.5);
    for (const [o, sc] of sh) { g.fillStyle = sc; g.fillText(t, x + o * px, y + o * px); }
    g.fillStyle = c; g.fillText(t, x, y);
  });
  return cv;
}
