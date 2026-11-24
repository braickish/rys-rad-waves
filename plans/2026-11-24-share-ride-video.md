# Share a ride as a video (Instagram, YouTube, Facebook)

Agreed with the user 2026-11-24: turn the "Save replay" at the end of a wave into a share that gives you a video of the ride
you can post. It must stay cheap at scale ("if a million people were sharing a ride a day, not have that be a high server
cost"). Order (the user): first a prototype that uses the replay as it is, turns it into a video, and posts it to your
Instagram; the polish after.

Each step ends live on Pages and is tried by the user before the next. Rules: no video ever goes through our servers; the
game's riding and replays are unchanged by this work.

## How it stays cheap

- **Rides already replay exactly** (src/replay.js, plans/2026-11-23-accounts-and-paid-plans.md task 2): a ride is its wave's
  address, the physics options and the inputs, a few KB. A video is rendered from that, on the player's device, after the ride.
- **Encoding on the device**: the browser's **WebCodecs** `VideoEncoder` uses the phone's or laptop's hardware H.264 encoder.
  Rendering offscreen frame by frame (not recording the screen in real time) means no dropped frames and it can run faster
  than real time.
- **Sharing from the device**: the **Web Share API** (`navigator.share({ files: [mp4] })`) opens the phone's own share sheet,
  with Instagram, TikTok, YouTube, Facebook, WhatsApp in it; on desktop, a download. The video never touches a server.
- So the server cost of a video share is **nothing**. The only optional server piece is a short "watch this ride" link
  (later, step 6): a replay is a few KB; in the URL itself it's free, as small files on Cloudflare R2/KV it's ~$100-200 a month
  at a million a day (mostly per-write charges; R2 has no bandwidth fees).

## Libraries

- **Mediabunny** (Vanilagy; the successor to his mp4-muxer / webm-muxer): small, dependency-free, wraps WebCodecs output into an
  MP4 (H.264 video, AAC audio later) that Instagram accepts. Loaded from a pinned CDN URL, like the game's other modules (no
  build step).
- **WebCodecs** (`VideoEncoder`, `VideoFrame`): built into the browser.
- **MediaRecorder** + `canvas.captureStream()`: the fallback where WebCodecs H.264 isn't there (real time; some browsers give
  only WebM, which Instagram may reject).
- Not ffmpeg.wasm (a 25+ MB download, slow, software encoding) or Remotion (server-side rendering).

## 1. Prototype: the replay as it is, to a video, to your Instagram

- The end-of-wave card's **⬇ Save replay** becomes **Share video** (Save replay stays, smaller, for the .json).
- Share video: re-runs the last ride's recording (the replay as it plays today, the same camera and look) offscreen at a fixed
  step, one frame per 1/30 s of ride, the canvas at its current size (rounded to even pixels), each frame copied into a
  `VideoFrame` and encoded by WebCodecs (H.264, ~6 Mbit/s), muxed by Mediabunny into an MP4. A progress bar while it renders
  (the game paused under it). No sound yet.
- Then `navigator.share({ files: [ride.mp4], title })` where the browser can share files (phones: pick Instagram, post it as a
  Reel or to your story); elsewhere a download of ride.mp4 to upload by hand.
- Check before building: which browsers encode H.264 with WebCodecs (Chrome / Edge; Safari 17+ should; Firefox has been
  patchy) and can share files (iOS Safari, Android Chrome; desktop mostly not). Where WebCodecs can't, the prototype just says
  so and keeps Save replay (the fallback is step 5).
- Test: test/video.mjs in headless Chrome (test/drive.mjs style): ride, Share video, and the file it would share is an MP4 of
  the right length, size and frame count, that a browser `<video>` plays. The user: post one to Instagram from a phone.

## 2. A camera made for video

- A follow camera for the video (smooth, ahead of the surfer, the barrel view inside the tube) instead of the game's.
- Vertical 1080x1920 (Reels / Shorts / TikTok), with square and landscape as options later.

## 3. Intro, end card and branding

- A short title (the break's name, the wave, the board), the score sheet as the end card (judging.js), a small watermark.

## 4. Sound

- The game is silent; videos post better with sound: wave, spray and wipeout sounds first (licensed music is legal work,
  later if ever). AAC through Mediabunny.

## 5. Fallbacks and limits

- MediaRecorder where WebCodecs H.264 isn't available (MP4 where the browser offers it, else WebM with a note); cap videos at
  ~60 s (Reels and Shorts); old phones: lower resolution if encoding is slow.

## 6. A "watch this ride" link (optional)

- With the video, a link that plays the ride in the game: in the URL itself (free, long) or a short link to the replay stored on
  Cloudflare R2 / KV (~$100-200/month at a million a day; expire after 30 days unless kept). With the accounts plan's Storage
  for replays, this moves there. Link previews: one static branded image.

## Not in scope

Posting through Instagram / YouTube / Facebook APIs (business accounts, app review, per-user sign-in): the share sheet and the
download are the route.
