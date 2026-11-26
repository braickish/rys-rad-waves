// A contest's recap (accounts plan task 17, step 1: no commentary yet). Pure: no DOM, no network.
//
// buildRecap({ contest, entrants, heats, rides }) picks the heat to tell (the final: the last round's one heat) and its
// story: every wave in the order it was caught, the standings after each (best two, the WSL tie-breaks), when the lead
// changed hands, and the waves worth showing (each surfer's best, every wave that took the lead, and the winner's
// last), at most MAX_SHOWN, in order. Each shown wave is a segment the recap player rides again from its log.
import { standings } from './heat.js';

export const MAX_SHOWN = 6;

// The heat a recap tells: the final (the last round, when it's a single heat), else the last heat.
export function recapHeat(heats) {
  if (!heats?.length) return null;
  const last = Math.max(...heats.map((h) => h.round));
  const inLast = heats.filter((h) => h.round === last);
  return inLast.length === 1 ? inLast[0] : inLast[inLast.length - 1];
}

export function buildRecap({ contest, entrants, heats, rides }) {
  const heat = recapHeat(heats);
  if (!heat) return null;
  const name = (id) => entrants.find((e) => e.id === id)?.name || '?';
  const jerseyOf = (id) => heat.heat_entries.find((x) => x.entrant_id === id)?.jersey || 'red';
  const final = heats.filter((h) => h.round === heat.round).length === 1, rounds = Math.max(...heats.map((h) => h.round));
  const waves = rides.filter((r) => r.heat_id === heat.id)
    .map((r) => ({ ...r, score: Number(r.score), at: Date.parse(r.caught_at) }))
    .sort((a, b) => a.at - b.at || a.wave_no - b.wave_no);
  // the standings after each wave, as the heat engine scores them
  const h = { advance: 0, surfers: heat.heat_entries.map((x) => ({ id: x.entrant_id, name: name(x.entrant_id), jersey: x.jersey, waves: [] })) };
  let leader = null;
  const story = waves.map((w) => {
    h.surfers.find((s) => s.id === w.entrant_id)?.waves.push({ score: w.score });
    const st = standings(h);
    const top = st[0], tookLead = top.total > 0 && top.surfer.id === w.entrant_id && leader !== w.entrant_id && (st.length < 2 || st[1].total < top.total);
    if (st[0].total > 0 && (st.length < 2 || st[1].total < st[0].total)) leader = st[0].surfer.id;
    return {
      ride: w, entrant: w.entrant_id, name: name(w.entrant_id), jersey: jerseyOf(w.entrant_id), waveNo: w.wave_no, score: w.score,
      tookLead, standings: st.map((r) => ({ id: r.surfer.id, name: r.surfer.name, jersey: r.surfer.jersey, total: r.total, place: r.place })),
    };
  });
  // which to show
  const pick = new Set();
  const byEntrant = new Map();
  for (const s of story) if (!byEntrant.has(s.entrant) || s.score > byEntrant.get(s.entrant).score) byEntrant.set(s.entrant, s);
  for (const s of byEntrant.values()) pick.add(s);
  for (const s of story) if (s.tookLead) pick.add(s);
  const final_st = story.length ? story[story.length - 1].standings : [];
  const winner = final_st[0]?.id;
  const winnersLast = [...story].reverse().find((s) => s.entrant === winner);
  if (winnersLast) pick.add(winnersLast);
  let shown = story.filter((s) => pick.has(s) && s.ride.replay_path);
  if (shown.length > MAX_SHOWN) { // (keep the lead changes and the best scores)
    const keep = [...shown].sort((a, b) => (b.tookLead - a.tookLead) || (b.score - a.score)).slice(0, MAX_SHOWN);
    shown = shown.filter((s) => keep.includes(s));
  }
  return {
    contest: { name: contest.name, code: contest.code, wave: contest.spot?.wave || null, spotName: contest.spot?.name || null },
    heat: { id: heat.id, round: heat.round, number: heat.number, final, rounds },
    story, shown,
    final: final_st,
    winner: final_st[0] ? { name: final_st[0].name, total: final_st[0].total, jersey: final_st[0].jersey } : null,
  };
}
