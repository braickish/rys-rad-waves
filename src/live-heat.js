// A live heat (accounts plan task 12): your waves to the server and everyone else's onto your board.
//
// boot.js sets window.__contestHeat from the contest (its heat, your entry, everyone's names and jerseys) when a contest
// page loads into its heat; main.js runs the heat as a solo heat whose rivals are the other entrants, and calls in here:
//   clock()              seconds into the heat by the server's clock (each screen measures its offset once)
//   submit(wave)         your scored wave: its replay to Storage (replays/<you>/<heat>/<n>.json), then submit_ride,
//                        then a "score" ping on the contest's channel so the others' boards fill in at once. In order,
//                        one at a time, retried while the network's away.
//   finish()             you're done: finish_heat, a "finished" ping, and then closing the heat until it closes (as soon
//                        as everyone's finished, or the grace after the horn); hooks.closed(results) then.
// Rivals' waves come from the pings and from a read of the heat's rides every 10 s (and on load, so a reload fills the
// board back in, your own waves too).
import { initAccount, currentUser } from './account.js';
import { contestChannel } from './contests.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// hooks: { wave({ entrant_id, wave_no, score, caught_s }), closed({ entries, rides }), note(text) }
export async function connectLive(info, hooks) {
  const c = await initAccount();
  const uid = currentUser()?.id;
  const startsAt = Date.parse(info.startsAt);
  // The server's clock: its time against the middle of the round trip.
  let offset = 0;
  try {
    const t0 = Date.now();
    const { data } = await c.rpc('server_time');
    const t1 = Date.now();
    if (data) offset = Date.parse(data) - (t0 + t1) / 2;
  } catch (e) { console.warn('server time', e); }
  const clock = () => (Date.now() + offset - startsAt) / 1000;

  let closed = false, finished = false, closing = null;
  const rideRow = (r) => ({ entrant_id: r.entrant_id, wave_no: r.wave_no, score: Number(r.score), caught_s: (Date.parse(r.caught_at) - startsAt) / 1000 });
  async function refill() {
    const { data, error } = await c.from('rides').select('entrant_id, wave_no, score, caught_at').eq('heat_id', info.heatId);
    if (error) throw error;
    for (const r of data) hooks.wave(rideRow(r));
    return data;
  }
  async function tryClose() {
    if (closed) return true;
    const { data, error } = await c.rpc('close_heat', { heat_id: info.heatId });
    if (error) { if ((error.hint || error.message) !== 'heat_still_on') console.warn('close', error); return false; }
    const rides = await refill().catch(() => []);
    closed = true;
    live?.send('changed'); // (lobbies and bracket views read the contest again: a round may just have been built)
    hooks.closed({ entries: data, rides });
    return true;
  }
  const live = await contestChannel(info.contestId, {
    score: (p) => { if (p?.heat_id === info.heatId) hooks.wave(p); },
    finished: () => { if (finished) tryClose(); },
  }).catch((e) => { console.warn('live channel', e); return null; });
  refill().catch((e) => console.warn('rides', e));
  const poll = setInterval(() => { if (!closed) refill().catch(() => {}); if (finished && !closed) tryClose(); }, 10000);

  // Your waves, one at a time and in order.
  let queue = Promise.resolve();
  function submit({ n, score, judges, caughtS, sheet, recording }) {
    queue = queue.then(async () => {
      let path = null;
      if (recording) {
        path = `${uid}/${info.heatId}/${n}.json`;
        const up = await c.storage.from('replays').upload(path, new Blob([recording], { type: 'application/json' }), { upsert: false, contentType: 'application/json' });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) { console.warn('replay upload', up.error); path = null; }
      }
      for (let tries = 0; tries < 6; tries++) {
        const { error } = await c.rpc('submit_ride', { heat_id: info.heatId, wave_no: n, score, judges, caught_s: Math.max(0, caughtS), sheet, replay_path: path, sim_version: 1 });
        if (!error) break;
        const code = error.hint || error.message;
        if (/duplicate|23505/.test(code) || error.code === '23505') break; // (it went in already: a retry after a lost answer)
        if (['after_horn', 'too_late', 'heat_over', 'no_more_waves', 'wave_out_of_order', 'not_in_heat'].includes(code)) { hooks.note?.(code); return; }
        await sleep(1000 * (tries + 1)); // (the network: try again)
      }
      live?.send('score', { heat_id: info.heatId, entrant_id: info.entrantId, wave_no: n, score, caught_s: caughtS });
    }).catch((e) => console.warn('submit', e));
    return queue;
  }

  async function finish() {
    if (finished) return closing;
    finished = true;
    closing = (async () => {
      await queue; // (your last wave first)
      try { await c.rpc('finish_heat', { heat_id: info.heatId }); } catch (e) { console.warn('finish', e); }
      live?.send('finished');
      while (!closed && !(await tryClose())) await sleep(3000);
      clearInterval(poll);
    })();
    return closing;
  }

  return { clock, submit, finish, tryClose, isClosed: () => closed };
}
