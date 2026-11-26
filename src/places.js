// Towns for "where you surf from" (accounts plan task 14): suggestions as you type, from Open-Meteo's geocoder (free, no
// key; only the town name you type is sent). A pick gives the town's name, its region and country, and the town's own
// map position (to 2 decimals, about a km), never yours.
const API = 'https://geocoding-api.open-meteo.com/v1/search';
const r2 = (x) => Math.round(x * 100) / 100;

export async function searchTowns(q, { signal } = {}) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  const lang = (navigator.language || 'en').slice(0, 2);
  const r = await fetch(`${API}?name=${encodeURIComponent(q)}&count=6&language=${lang}&format=json`, { signal });
  if (!r.ok) throw new Error(`geocoder ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter((x) => /^[A-Z]{2}$/.test(x.country_code || '')).map((x) => ({
    name: x.name, region: x.admin1 || '', country: x.country_code, lat: r2(x.latitude), lng: r2(x.longitude),
  }));
}
