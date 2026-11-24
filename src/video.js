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
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const source = new mb.CanvasSource(cv, { codec: 'avc', bitrate: VIDEO.bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: VIDEO.fps });
  await output.start();
  let n = 0;
  return {
    w, h,
    get frames() { return n; },
    get seconds() { return n / VIDEO.fps; },
    capture() { ctx.drawImage(src, 0, 0, w, h); const p = source.add(n / VIDEO.fps, 1 / VIDEO.fps); n++; return p; },
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
