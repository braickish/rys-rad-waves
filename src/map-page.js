// map.html: where players surf from (accounts plan task 14; the user, 2026-11-25). A dot for each town players named
// (player_places(): counts only, no names; the town's own spot), bigger for more; and every country, counted. The land
// is Natural Earth's 1:110m (world-atlas), drawn with d3-geo.
import { initAccount, describeAuthError } from './account.js';
import { countryName, flag } from './countries.js';

const D3_GEO = 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
const TOPOJSON = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
const LAND = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

try {
  const [c, geo, topo, land] = await Promise.all([initAccount(), import(D3_GEO), import(TOPOJSON), fetch(LAND).then((r) => r.json())]);
  const { data: rows, error } = await c.rpc('player_places');
  if (error) throw error;
  const towns = rows.filter((r) => r.lat != null), countries = rows.filter((r) => r.lat == null).sort((a, b) => b.players - a.players || countryName(a.country).localeCompare(countryName(b.country)));
  const people = countries.reduce((a, r) => a + r.players, 0);
  $('m-sub').textContent = people ? `${people} surfer${people === 1 ? '' : 's'} in ${countries.length} countr${countries.length === 1 ? 'y' : 'ies'} have said where they surf from.` : 'Nobody has said where they surf from yet.';

  // the map
  const W = 960, H = 500, svg = $('map');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const projection = geo.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' });
  const path = geo.geoPath(projection);
  svg.append(svgEl('path', { d: path({ type: 'Sphere' }), class: 'sea' }));
  svg.append(svgEl('path', { d: path(geo.geoGraticule10()), class: 'grid' }));
  svg.append(svgEl('path', { d: path(topo.feature(land, land.objects.land)), class: 'land' }));
  const tip = $('tip');
  for (const t of [...towns].sort((a, b) => b.players - a.players)) { // (big dots under small ones)
    const [x, y] = projection([Number(t.lng), Number(t.lat)]);
    const dot = svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (4 + 3 * Math.sqrt(t.players)).toFixed(1), class: 'dot', tabindex: '0' });
    const label = `${flag(t.country)} ${t.city}, ${countryName(t.country)} · ${t.players} surfer${t.players === 1 ? '' : 's'}`;
    dot.append(svgEl('title', {})); dot.lastChild.textContent = label;
    const show = () => { tip.hidden = false; tip.textContent = label; const b = svg.getBoundingClientRect(); tip.style.left = `${(x / W) * b.width}px`; tip.style.top = `${(y / H) * b.height}px`; };
    dot.addEventListener('pointerenter', show); dot.addEventListener('focus', show);
    dot.addEventListener('pointerleave', () => { tip.hidden = true; }); dot.addEventListener('blur', () => { tip.hidden = true; });
    svg.append(dot);
  }
  window.__mapDots = towns.length;

  // by country
  $('m-none').hidden = countries.length > 0;
  for (const r of countries) {
    const row = document.createElement('div');
    row.className = 'country';
    row.innerHTML = '<span></span><b></b>';
    row.querySelector('span').textContent = `${flag(r.country)} ${countryName(r.country)}`;
    row.querySelector('b').textContent = r.players;
    $('m-countries').append(row);
  }
} catch (err) {
  $('m-sub').textContent = describeAuthError(err);
}
