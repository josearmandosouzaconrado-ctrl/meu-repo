// Campo de batalha: baterias Flak, infantaria alemã e as duas IAs de comando
// (QG da 101ª Divisão americana e o comando alemão).
import { world, system } from '@minecraft/server';
import { CFG, SQUAD_NAMES, FLAK_NAMES, DE_NAMES, US_NAMES, RADIO_DE } from './config.js';
import { HUB } from './hub.js';
import {
  dim, now, add, dist, dist2d, rand, randi, pick, valid, safe, sound, particle, cmd, players, nearestPlayer,
  perm, setBlock, findGround, isPassable, compass, hp, setProp, title, msgAll, getJSON, setJSON,
} from './util.js';

const NS = 8; // esquadrões americanos
const NG = 8; // grupos alemães
let B = null;               // estado persistente
const us = new Map();       // id -> { e, squad, mode }
const de = new Map();       // id -> { e, group, mode, retreatUntil, retreated }
const flakEnts = new Map(); // idx -> entity
const charges = [];
let loaded = false;
let lastMedic = 0, lastKillMsg = 0;

const squads = [];
for (let k = 0; k < NS; k++) {
  squads.push({ k, name: SQUAD_NAMES[k], order: k === 0 ? 'follow' : 'auto', point: null, objective: -1, waitFor: -1,
    marker: null, markerPos: null, respawn: false, owner: null, lastContact: 0, announced: '' });
}
const groups = [];
for (let k = 0; k < NG; k++) groups.push({ k, kind: null, home: null, target: null, marker: null, markerPos: null, respawn: false });

function save() {
  if (!B) { setJSON('ww2:battle', undefined); return; }
  B.groups = groups.map((g) => ({ kind: g.kind, home: g.home, target: g.target }));
  B.squads = squads.map((s) => ({ order: s.order, point: s.point, objective: s.objective, owner: s.owner }));
  setJSON('ww2:battle', B);
}

function load() {
  loaded = true;
  B = getJSON('ww2:battle', null);
  if (!B) return;
  (B.groups || []).forEach((g, i) => { if (groups[i]) Object.assign(groups[i], g); });
  (B.squads || []).forEach((s, i) => { if (squads[i]) Object.assign(squads[i], s); });
}

const hq = (t) => msgAll(`§2[Rádio QG 101ª]§f ${t}`);
const oname = (f) => (f && f.kind === 'pak' ? 'Canhão Pak ' : 'Bateria ') + (f ? f.name : '?');
const deRadio = (i) => { const [de_, pt] = RADIO_DE[i]; msgAll(`§8[Rádio alemão interceptado]§7 "${de_}" §8(${pt})`); };

function groundAt(loc, up = 4, down = 40) {
  const g = findGround(loc.x, loc.z, Math.floor(loc.y) + up, Math.floor(loc.y) - down);
  return g ? { x: loc.x, y: g.y, z: loc.z } : { ...loc };
}

function centroid(list) {
  const c = { x: 0, y: 0, z: 0 };
  for (const e of list) { const l = e.location; c.x += l.x; c.y += l.y; c.z += l.z; }
  const n = Math.max(1, list.length);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}

// ---------------------------------------------------------------------------
// Preparação: baterias antiaéreas, trincheiras de sacos de areia, guarnições
// ---------------------------------------------------------------------------
function buildEmplacement(c) {
  const bag = perm(['minecraft:packed_mud', 'minecraft:coarse_dirt', 'minecraft:dirt']);
  const air = perm(['minecraft:air']);
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 3;
      const gap = (dx === 0 && Math.abs(dz) === 3) || (dz === 0 && dx === 3);
      for (let dy = 0; dy <= 2; dy++) {
        const l = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
        const b = safe(() => dim().getBlock(l));
        if (!b) continue;
        if (ring && !gap && dy <= (Math.abs(dx) === 3 && Math.abs(dz) === 3 ? 1 : 0)) {
          if (isPassable(b)) safe(() => b.setPermutation(bag));
        } else if (!ring && isPassable(b) && !b.typeId.endsWith('air')) {
          safe(() => b.setPermutation(air));
        }
      }
    }
  }
}

function spawnGerman(loc, group, weapon) {
  let e;
  try { e = dim().spawnEntity('ww2:german_soldier', loc); } catch { return undefined; }
  try {
    e.setDynamicProperty('ww2:managed', true);
    e.setDynamicProperty('ww2:group', group);
    e.addTag('ww2_unit');
    e.nameTag = pick(DE_NAMES);
    if (weapon === 'mp44' || (weapon === undefined && Math.random() < 0.4)) e.triggerEvent('ww2:weapon_mp44');
  } catch { /* ignore */ }
  de.set(e.id, { e, group, mode: 'guard', retreatUntil: 0, retreated: false });
  return e;
}

function prepare(dz) {
  if (!loaded) load();
  if (B) return;
  B = { phase: 'air', dz, flaks: [], airReinf: CFG.AIR_REINFORCEMENTS, lastReinf: now(), counter: false, alerted: [], kills: 0, losses: 0 };
  const base = rand(0, Math.PI * 2);
  for (let i = 0; i < CFG.FLAK_COUNT; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 14 && !placed; attempt++) {
      const ang = base + i * (Math.PI * 2 / CFG.FLAK_COUNT) + rand(-0.4, 0.4);
      const r = rand(30, 44) - attempt;
      const x = Math.floor(dz.x + Math.cos(ang) * r), z = Math.floor(dz.z + Math.sin(ang) * r);
      const g = findGround(x, z, Math.floor(dz.y) + 30, Math.floor(dz.y) - 30);
      if (!g || g.water || g.leaves) continue;
      const c = { x, y: g.y, z };
      buildEmplacement(c);
      let f;
      try { f = dim().spawnEntity('ww2:flak38', { x: x + 0.5, y: g.y, z: z + 0.5 }); } catch { continue; }
      safe(() => { f.addTag('ww2_flak_' + i); f.addTag('ww2_unit_flak'); f.nameTag = `Flak 38 — Bateria ${FLAK_NAMES[i]}`; });
      flakEnts.set(i, f);
      B.flaks.push({ x: x + 0.5, y: g.y, z: z + 0.5, name: FLAK_NAMES[i], destroyed: false });
      groups[i].kind = 'flak'; groups[i].home = { x: x + 0.5, y: g.y, z: z + 0.5 }; groups[i].target = null;
      for (let k = 0; k < CFG.FLAK_CREW; k++) {
        const a = k * 2.1;
        spawnGerman({ x: x + 0.5 + Math.cos(a) * 1.8, y: g.y, z: z + 0.5 + Math.sin(a) * 1.8 }, i);
      }
      placed = true;
    }
  }
  for (let p = 0; p < CFG.PATROLS; p++) {
    const gi = CFG.FLAK_COUNT + p;
    if (gi >= NG) break;
    const ang = base + (p + 0.5) * (Math.PI * 2 / Math.max(2, CFG.FLAK_COUNT)) + rand(-0.3, 0.3);
    const r = rand(20, 30);
    const x = dz.x + Math.cos(ang) * r, z = dz.z + Math.sin(ang) * r;
    const g = findGround(x, z, Math.floor(dz.y) + 30, Math.floor(dz.y) - 30);
    if (!g || g.water) continue;
    groups[gi].kind = 'patrol'; groups[gi].home = { x, y: g.y, z }; groups[gi].target = null;
    for (let k = 0; k < CFG.PATROL_SIZE; k++) spawnGerman({ x: x + rand(-2, 2), y: g.y, z: z + rand(-2, 2) }, gi);
  }
  save();
}

function begin(dz, player) {
  if (!loaded) load();
  if (!B) prepare(dz);
  if (!B) return;
  if (player && !squads[0].owner) squads[0].owner = player.id;
  if (B.phase === 'air') {
    B.phase = 'battle';
    B.lastReinf = now();
    hq(`Pathfinders reportam §e${B.flaks.filter((f) => !f.destroyed).length} baterias antiaéreas§f na zona de salto. Neutralizem as baterias!`);
    hq('Esquadrões Able, Baker, Charlie e Dog: a IA do QG vai coordenar o ataque. Pelotão Easy: siga o líder (você).');
    save();
  }
}

function announceDrop() {
  if (!loaded) load();
  deRadio(0);
  deRadio(2);
}

// ---------------------------------------------------------------------------
// Registro de unidades
// ---------------------------------------------------------------------------
function landedUS(e, squad) {
  if (!valid(e)) return;
  try {
    e.triggerEvent('ww2:to_ground');
    e.setDynamicProperty('ww2:managed', true);
    e.setDynamicProperty('ww2:squad', squad);
    e.addTag('ww2_unit');
    if (!e.nameTag) e.nameTag = pick(US_NAMES);
  } catch { /* ignore */ }
  us.set(e.id, { e, squad, mode: 'hold' });
  const sq = squads[squad];
  if (sq && squad > 0 && sq.order === 'auto' && !sq.landAnnounced) {
    sq.landAnnounced = true;
    hq(`Esquadrão ${sq.name} no solo. Reagrupando.`);
  }
}

function adopt(e) {
  if (!valid(e)) return;
  if (safe(() => e.getDynamicProperty('ww2:managed'))) return;
  if (!loaded) load();
  if (e.typeId === 'ww2:us_paratrooper') {
    safe(() => e.triggerEvent(pick(['ww2:weapon_garand', 'ww2:weapon_thompson', 'ww2:weapon_bar'])));
    safe(() => { e.nameTag = pick(US_NAMES); });
    const p = nearestPlayer(e.location);
    if (p && !squads[0].owner) squads[0].owner = p.id;
    landedUS(e, 0);
  } else if (e.typeId === 'ww2:german_soldier') {
    safe(() => { e.setDynamicProperty('ww2:managed', true); e.setDynamicProperty('ww2:group', NG - 1); e.addTag('ww2_unit'); e.nameTag = pick(DE_NAMES); });
    if (Math.random() < 0.4) safe(() => e.triggerEvent('ww2:weapon_mp44'));
    if (!groups[NG - 1].kind) groups[NG - 1].kind = 'free';
    de.set(e.id, { e, group: NG - 1, mode: 'guard', retreatUntil: 0, retreated: false });
  }
}

function scanUnits() {
  let list = [];
  try { list = dim().getEntities({ tags: ['ww2_unit'] }); } catch { return; }
  for (const e of list) {
    if (us.has(e.id) || de.has(e.id)) continue;
    if (e.typeId === 'ww2:us_paratrooper') {
      const st = safe(() => e.getProperty('ww2:state'), 5);
      const riding = safe(() => e.getComponent('minecraft:riding')?.entityRidingOn);
      if (st === 5) us.set(e.id, { e, squad: safe(() => e.getDynamicProperty('ww2:squad'), 0) ?? 0, mode: null });
      else if (!riding && st >= 3) landedUS(e, safe(() => e.getDynamicProperty('ww2:squad'), 0) ?? 0);
    } else if (e.typeId === 'ww2:german_soldier') {
      de.set(e.id, { e, group: safe(() => e.getDynamicProperty('ww2:group'), NG - 1) ?? NG - 1, mode: null, retreatUntil: 0 });
    }
  }
  if (B) {
    B.flaks.forEach((f, i) => {
      if (valid(flakEnts.get(i))) return;
      const found = safe(() => dim().getEntities({ type: 'ww2:flak38', tags: ['ww2_flak_' + i] }), []);
      if (found && found[0]) flakEnts.set(i, found[0]);
    });
  }
  // marcadores órfãos
  const known = new Set([...squads, ...groups].map((s) => s.marker && safe(() => s.marker.id)).filter(Boolean));
  for (const m of safe(() => dim().getEntities({ type: 'ww2:marker' }), [])) if (!known.has(m.id)) safe(() => m.remove());
}

// ---------------------------------------------------------------------------
// Marcadores de movimento (as tropas "atacam" o marcador do seu esquadrão = andar até ele)
// ---------------------------------------------------------------------------
function placeMarker(unit, pos, tag) {
  if (!pos) {
    if (unit.marker) safe(() => unit.marker.remove());
    unit.marker = null; unit.markerPos = null; unit.respawn = false;
    return;
  }
  if (unit.respawn && unit.marker) { safe(() => unit.marker.remove()); unit.marker = null; }
  unit.respawn = false;
  if (!valid(unit.marker)) {
    try {
      unit.marker = dim().spawnEntity('ww2:marker', pos);
      unit.marker.addTag(tag);
    } catch { unit.marker = null; }
  } else if (dist(unit.marker.location, pos) > 2) {
    safe(() => unit.marker.teleport(pos));
  }
  unit.markerPos = pos;
}

function stepToward(from, goal) {
  const d = dist2d(from, goal);
  if (d <= 20) return goal;
  const k = 16 / d;
  const p = { x: from.x + (goal.x - from.x) * k, y: Math.max(from.y, goal.y), z: from.z + (goal.z - from.z) * k };
  return groundAt(p, 14, 40);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
function nearest(loc, radius, families) {
  let best, bd = radius + 1;
  try {
    for (const e of dim().getEntities({ location: loc, maxDistance: radius, families })) {
      const d = dist(e.location, loc);
      if (d < bd) { bd = d; best = e; }
    }
  } catch { /* ignore */ }
  return best;
}

function nearestUSTarget(loc, radius) {
  let best, bd = radius;
  for (const u of us.values()) {
    if (!valid(u.e)) continue;
    const d = dist2d(u.e.location, loc);
    if (d < bd) { bd = d; best = u.e; }
  }
  for (const p of players()) {
    if (HUB.intro && HUB.intro.active(p)) continue;
    const d = dist2d(p.location, loc);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function liveFlaks() {
  const out = [];
  if (!B) return out;
  B.flaks.forEach((f, i) => {
    if (f.destroyed) return;
    const e = flakEnts.get(i);
    if (valid(e)) out.push({ e, idx: i, kind: f.kind || 'flak' });
  });
  return out;
}

function crewCount(i) {
  let n = 0;
  for (const d of de.values()) if (d.group === i && valid(d.e)) n++;
  return n;
}

function membersOfSquad(k) {
  const out = [];
  for (const u of us.values()) if (u.squad === k && valid(u.e)) out.push(u);
  return out;
}

function membersOfGroup(k) {
  const out = [];
  for (const d of de.values()) if (d.group === k && valid(d.e)) out.push(d);
  return out;
}

function defendersNear(pos, r = 18) {
  let n = 0;
  for (const d of de.values()) if (valid(d.e) && dist(d.e.location, pos) < r) n++;
  return n;
}

function usNear(pos, r = 30) {
  let n = 0;
  for (const u of us.values()) if (valid(u.e) && dist(u.e.location, pos) < r) n++;
  for (const p of players()) if (dist(p.location, pos) < r) n++;
  return n;
}

// ---------------------------------------------------------------------------
// IA individual (máquina de estados por soldado)
// ---------------------------------------------------------------------------
// Plano B: se o pathfinding nativo não avançar, empurra o soldado na direção do marcador.
function nudge(u, target) {
  const e = u.e;
  const l = e.location;
  const d = dist2d(l, target);
  if (u.lastD !== undefined && u.lastD - d < 0.5) u.stuck = (u.stuck || 0) + 1; else u.stuck = 0;
  u.lastD = d;
  if (u.stuck < 3 || d < 2) return;
  const k = 0.3 / Math.max(d, 0.1);
  const dx = (target.x - l.x) * k, dz = (target.z - l.z) * k;
  const ahead = safe(() => dim().getBlock({ x: l.x + dx * 4, y: l.y + 0.2, z: l.z + dz * 4 }));
  const blocked = ahead && !isPassable(ahead);
  safe(() => e.applyImpulse({ x: dx, y: blocked ? 0.42 : 0, z: dz }));
}

function setModeUS(u, mode) {
  if (u.mode !== 'move' || mode !== 'move') { u.lastD = undefined; u.stuck = 0; }
  if (u.mode === mode) return;
  const prev = u.mode;
  u.mode = mode;
  safe(() => u.e.triggerEvent(mode === 'move' ? `ww2:mode_move_${u.squad}` : `ww2:mode_${mode}`));
  if (prev === 'move' || prev === null) squads[u.squad].respawn = true;
}

function thinkUS(u) {
  const e = u.e;
  if (safe(() => e.getProperty('ww2:state'), 5) !== 5) return;
  const loc = e.location;
  const sq = squads[u.squad] || squads[0];
  const enemy = nearest(loc, 26, ['german']);
  let mode;
  if (enemy) {
    mode = 'combat';
    if (now() - sq.lastContact > 700) {
      sq.lastContact = now();
      msgAll(`§a[${sq.name}] ${e.nameTag}:§f Contato! Alemães a ${compass(loc, enemy.location)}, ${Math.round(dist(loc, enemy.location))} metros!`);
    }
  } else if (sq.markerPos && dist(loc, sq.markerPos) > (sq.order === 'follow' ? 6 : 4)) {
    mode = 'move';
  } else {
    mode = 'hold';
  }
  setModeUS(u, mode);
  if (mode === 'move' && sq.markerPos) nudge(u, sq.markerPos);
}

function setModeDE(d, mode) {
  if (d.mode !== 'move' || mode !== 'move') { d.lastD = undefined; d.stuck = 0; }
  if (d.mode === mode) return;
  const prev = d.mode;
  d.mode = mode;
  safe(() => d.e.triggerEvent(mode === 'move' ? `ww2:mode_move_${d.group}` : `ww2:mode_${mode}`));
  if (prev === 'move' || prev === null) groups[d.group].respawn = true;
}

function thinkDE(d) {
  const e = d.e;
  const loc = e.location;
  const grp = groups[d.group] || groups[NG - 1];
  let enemy = nearest(loc, 28, ['us_army']);
  for (const p of players()) {
    if (HUB.intro && HUB.intro.inPlane(p)) continue;
    if (dist(p.location, loc) < 28 && (!enemy || dist(p.location, loc) < dist(enemy.location, loc))) enemy = p;
  }
  const h = hp(e);
  let mode;
  if (d.retreatUntil > now()) mode = 'retreat';
  else if (enemy && !d.retreated && h.cur < h.max * 0.3 && dist(enemy.location, loc) < 16) {
    d.retreated = true;
    d.retreatUntil = now() + 160;
    mode = 'retreat';
    if (Math.random() < 0.3) msgAll(`§8[${e.nameTag}]§7 "Rückzug! Ich bin verwundet!" §8(Recuar! Estou ferido!)`);
  } else if (enemy) mode = 'combat';
  else if (grp.markerPos && dist(loc, grp.markerPos) > 5) mode = 'move';
  else if (grp.target) mode = 'hold';
  else mode = 'guard';
  setModeDE(d, mode);
  if (mode === 'move' && grp.markerPos) nudge(d, grp.markerPos);
}

// ---------------------------------------------------------------------------
// IA de comando: QG americano (divisão) e comando alemão
// ---------------------------------------------------------------------------
function owner(sq) {
  if (sq.owner) {
    const p = players().find((x) => x.id === sq.owner);
    if (p) return p;
  }
  return players()[0];
}

function squadGoal(sq, c) {
  if (sq.order === 'hold') return null;
  if (sq.order === 'follow') {
    const o = owner(sq);
    return o ? groundAt(o.location, 2, 90) : null;
  }
  if (sq.order === 'point') return sq.point;
  if (!B || B.phase === 'air' || B.phase === 'convoy' || B.phase === 'm1_done') return null;
  if (B.phase !== 'battle') {
    const o = nearestPlayer(c);
    return o ? groundAt(o.location, 2, 90) : null;
  }
  const f = B.flaks[sq.objective];
  if (!f || f.destroyed) return null;
  if (sq.waitFor >= 0) {
    const partner = membersOfSquad(sq.waitFor);
    if (partner.length) {
      const pc = centroid(partner.map((u) => u.e));
      if (dist2d(pc, f) > 38 && dist2d(c, f) < 34) return null; // espera o ataque coordenado
    }
  }
  return { x: f.x, y: f.y, z: f.z };
}

function tickSquads() {
  for (const sq of squads) {
    const m = membersOfSquad(sq.k);
    if (!m.length) { placeMarker(sq, null); continue; }
    const c = centroid(m.map((u) => u.e));
    const goal = squadGoal(sq, c);
    placeMarker(sq, goal ? stepToward(c, goal) : null, 'rally_s' + sq.k);
    // engenheiro: planta explosivos quando a bateria está sem defensores
    if (B && B.phase === 'battle' && sq.objective >= 0 && (sq.order === 'auto' || sq.order === 'assault')) {
      const f = B.flaks[sq.objective];
      if (f && !f.destroyed && !charges.some((ch) => ch.idx === sq.objective) && defendersNear(f, 10) === 0) {
        const eng = m.find((u) => dist(u.e.location, f) < 5);
        if (eng) plantCharge(sq.objective, `${eng.e.nameTag} (${sq.name})`);
      }
    }
  }
}

function tickGroups() {
  for (const g of groups) {
    const m = membersOfGroup(g.k);
    if (!m.length || !g.target) { placeMarker(g, null); continue; }
    if (g.kind === 'counter') {
      const p = nearestPlayer(g.target);
      if (p) g.target = groundAt(p.location, 2, 90);
    }
    const c = centroid(m.map((d) => d.e));
    placeMarker(g, dist2d(c, g.target) < 6 ? null : stepToward(c, g.target), 'rally_g' + g.k);
  }
}

function freeSquad() {
  for (let k = 1; k < NS; k++) if (!membersOfSquad(k).length) return k;
  return -1;
}

function freeGroup() {
  for (let k = CFG.FLAK_COUNT; k < NG - 1; k++) if (!membersOfGroup(k).length) return k;
  return -1;
}

function division() {
  if (!B || B.phase !== 'battle') return;
  const alive = B.flaks.map((f, i) => ({ f, i })).filter((x) => !x.f.destroyed);
  if (!alive.length) return;
  const auto = squads.filter((s) => s.k > 0 && s.order === 'auto' && membersOfSquad(s.k).length);
  // esquadrões muito pequenos se juntam ao mais próximo
  for (const s of auto) {
    const m = membersOfSquad(s.k);
    if (m.length !== 1) continue;
    const c = centroid(m.map((u) => u.e));
    let best, bd = 45;
    for (const o of auto) {
      if (o === s || membersOfSquad(o.k).length < 1) continue;
      const d = dist2d(centroid(membersOfSquad(o.k).map((u) => u.e)), c);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      for (const u of m) { u.squad = best.k; u.mode = null; safe(() => u.e.setDynamicProperty('ww2:squad', best.k)); }
      hq(`${m[0].e.nameTag} (último do Esquadrão ${s.name}) juntou-se ao Esquadrão ${best.name}.`);
    }
  }
  const assigned = new Map();
  for (const s of auto) {
    const m = membersOfSquad(s.k);
    if (!m.length) continue;
    const c = centroid(m.map((u) => u.e));
    let cur = B.flaks[s.objective];
    if (!cur || cur.destroyed) {
      let best, bs = 1e9;
      for (const a of alive) {
        const score = dist2d(c, a.f) + defendersNear(a.f) * 7 + (assigned.get(a.i) || 0) * 18;
        if (score < bs) { bs = score; best = a.i; }
      }
      s.objective = best;
      s.waitFor = -1;
      cur = B.flaks[best];
    }
    assigned.set(s.objective, (assigned.get(s.objective) || 0) + 1);
    const defenders = defendersNear(cur);
    const msg = `${s.objective}:${m.length >= defenders}`;
    if (s.announced !== msg) {
      s.announced = msg;
      if (m.length >= defenders) {
        hq(`Esquadrão §e${s.name}§f (${m.length} homens) → atacar a §c${oname(cur)}§f (${defenders} defensores).`);
      } else {
        // pouca força: pede apoio a outro esquadrão e coordena o ataque
        const partner = auto.find((o) => o !== s && o.waitFor < 0 && membersOfSquad(o.k).length);
        if (partner) {
          partner.objective = s.objective; s.waitFor = partner.k; partner.announced = '';
          hq(`Esquadrão §e${s.name}§f (${m.length}) é fraco contra ${defenders} defensores na ${oname(cur)}. Ataque coordenado com o Esquadrão §e${partner.name}§f!`);
        } else {
          hq(`Esquadrão §e${s.name}§f: avancem com cautela sobre a ${oname(cur)}.`);
        }
      }
    }
  }
}

function germanCommand() {
  if (!B || (B.phase !== 'battle' && B.phase !== 'counter')) return;
  B.alerted = B.alerted || [];
  const alive = B.flaks.map((f, i) => ({ f, i })).filter((x) => !x.f.destroyed);
  // alerta: manda patrulha defender a bateria ameaçada
  for (const a of alive) {
    const threat = usNear(a.f, 30);
    if (threat > 0 && !B.alerted[a.i]) {
      B.alerted[a.i] = true;
      const patrol = groups.find((g) => g.kind === 'patrol' && !g.target && membersOfGroup(g.k).length);
      if (patrol) {
        patrol.target = { x: a.f.x, y: a.f.y, z: a.f.z };
        deRadio(1);
        hq(`Inteligência: patrulha alemã se deslocando para defender a ${oname(a.f)}!`);
      }
    }
  }
  // reforços
  if (B.phase === 'battle' && alive.length && now() - B.lastReinf > CFG.REINFORCE_EVERY && de.size < CFG.GERMAN_CAP) {
    B.lastReinf = now();
    const gi = freeGroup();
    if (gi >= 0) {
      let target = alive[0].f, tmax = -1;
      for (const a of alive) { const th = usNear(a.f, 35); if (th > tmax) { tmax = th; target = a.f; } }
      const spot = edgeSpot(target, 46);
      if (spot) {
        groups[gi].kind = 'reinf'; groups[gi].home = spot; groups[gi].target = { x: target.x, y: target.y, z: target.z };
        for (let k = 0; k < CFG.REINFORCE_SIZE; k++) spawnGerman({ x: spot.x + rand(-2, 2), y: spot.y, z: spot.z + rand(-2, 2) }, gi);
        deRadio(1);
        hq(`Reforços alemães se aproximando pelo §c${compass(B.dz, spot)}§f, rumo à ${oname(target)}!`);
      }
    }
  }
  save();
}

function edgeSpot(around, r) {
  const ps = players();
  const avg = ps.length ? centroid(ps) : B.dz;
  const away = Math.atan2(around.z - avg.z, around.x - avg.x);
  for (let i = 0; i < 8; i++) {
    const ang = away + rand(-0.8, 0.8);
    const rr = r - i * 3;
    const x = around.x + Math.cos(ang) * rr, z = around.z + Math.sin(ang) * rr;
    const g = findGround(x, z, Math.floor(around.y) + 30, Math.floor(around.y) - 30);
    if (g && !g.water) return { x, y: g.y, z };
  }
  return undefined;
}

function startCounter() {
  B.phase = 'counter';
  B.counter = true;
  title_all('§c§lCONTRA-ATAQUE!', '§fOs alemães estão vindo. Defendam a zona de pouso!');
  deRadio(3);
  hq('Todas as baterias neutralizadas! Mas o inimigo prepara um contra-ataque. Todos os esquadrões: defender a posição!');
  for (const s of squads) if (s.k > 0 && s.order === 'auto') s.objective = -1;
  const p = nearestPlayer(B.dz);
  const target = p ? groundAt(p.location, 2, 90) : B.dz;
  let left = CFG.COUNTER_WAVE;
  for (let w = 0; w < 2 && left > 0; w++) {
    const gi = freeGroup();
    if (gi < 0) break;
    const spot = edgeSpot(target, 44);
    if (!spot) continue;
    const n = w === 0 ? Math.ceil(left / 2) : left;
    groups[gi].kind = 'counter'; groups[gi].home = spot; groups[gi].target = target;
    for (let k = 0; k < n; k++) spawnGerman({ x: spot.x + rand(-2, 2), y: spot.y, z: spot.z + rand(-2, 2) }, gi, k % 3 === 0 ? 'mp44' : undefined);
    left -= n;
  }
  save();
}

function title_all(t, s) { for (const p of players()) title(p, t, s, 10, 80, 20); }

function checkVictory() {
  if (!B) return;
  if (B.phase === 'battle' && B.flaks.length && B.flaks.every((f) => f.destroyed)) {
    if ((B.mission || 1) === 1 && HUB.mission2) {
      B.phase = 'm1_done';
      title_all('§6§lMISSÃO CUMPRIDA', '§fTodas as baterias antiaéreas foram destruídas!');
      hq('Excelente trabalho! A zona de salto está segura. Preparem-se para a próxima operação...');
      for (const p of players()) sound('ww2.radio', p.location, 1, 1);
      save();
      system.runTimeout(() => safe(() => HUB.mission2.start(B.dz)), 110);
      return;
    }
    if ((B.mission || 1) === 2) {
      B.phase = 'victory';
      title_all('§6§lVITÓRIA!', '§fOs canhões foram destruídos e a estrada está aberta!');
      hq(`O bosque é nosso! Baixas inimigas: §c${B.kills}§f. Nossas baixas: §e${B.losses}§f. A estrada para Carentan está aberta!`);
      for (const p of players()) sound('ww2.radio', p.location, 1, 1);
      if (HUB.mission2) safe(() => HUB.mission2.finished());
      save();
      return;
    }
    startCounter();
  } else if (B.phase === 'counter' && ![...de.values()].some((d) => valid(d.e))) {
    B.phase = 'victory';
    title_all('§6§lMISSÃO CUMPRIDA', '§fA zona de salto está segura. Bom trabalho, soldado!');
    hq(`Vitória! Baixas inimigas: §c${B.kills}§f. Nossas baixas: §e${B.losses}§f. A 101ª segura a Normandia!`);
    for (const p of players()) sound('ww2.radio', p.location, 1, 1);
    for (const s of squads) { if (s.k > 0) { s.order = 'follow'; s.owner = squads[0].owner; } }
    save();
  }
}

// ---------------------------------------------------------------------------
// Explosivos
// ---------------------------------------------------------------------------
function plantCharge(idx, by) {
  if (!B || !B.flaks[idx] || B.flaks[idx].destroyed) return false;
  if (charges.some((c) => c.idx === idx)) return false;
  charges.push({ idx, at: now() + 100, by });
  msgAll(`§e${by}:§f Explosivos armados na ${oname(B.flaks[idx])}! §cPROTEJAM-SE!`);
  return true;
}

function nearestFlak(loc, radius) {
  let best, bd = radius;
  for (const f of liveFlaks()) {
    const d = dist(f.e.location, loc);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function destroyFlak(idx, by) {
  const f = B && B.flaks[idx];
  if (!f || f.destroyed) return;
  f.destroyed = true;
  const e = flakEnts.get(idx);
  const loc = valid(e) ? { ...e.location } : { x: f.x, y: f.y, z: f.z };
  if (valid(e)) setProp(e, 'ww2:destroyed', true);
  particle('ww2:explosion', add(loc, { x: 0, y: 1, z: 0 }));
  particle('minecraft:huge_explosion_emitter', add(loc, { x: 0, y: 1, z: 0 }));
  sound('ww2.explosion', loc, 4, 0.9);
  try { dim().createExplosion(add(loc, { x: 0, y: 0.5, z: 0 }), 3, { breaksBlocks: false, causesFire: false }); } catch { /* ignore */ }
  title_all(f.kind === 'pak' ? '§a§lCANHÃO PAK DESTRUÍDO' : '§a§lBATERIA AA DESTRUÍDA', `§f${oname(f)} — por ${by}`);
  const left = B.flaks.filter((x) => !x.destroyed).length;
  hq(left ? `${oname(f)} fora de combate! Restam §e${left}§f.` : (f.kind === 'pak' ? 'Último canhão antitanque destruído!' : 'Última bateria antiaérea destruída!'));
  for (const s of squads) if (s.objective === idx) { s.objective = -1; s.waitFor = -1; s.announced = ''; }
  save();
  checkVictory();
}

function tickCharges() {
  for (let i = charges.length - 1; i >= 0; i--) {
    const c = charges[i];
    const f = B && B.flaks[c.idx];
    if (!f) { charges.splice(i, 1); continue; }
    const left = c.at - now();
    if (left % 20 === 0 && left > 0) sound('ww2.beep', f, 2, left < 40 ? 1.5 : 1.0);
    if (left <= 0) { charges.splice(i, 1); destroyFlak(c.idx, c.by); }
  }
}

// ---------------------------------------------------------------------------
// Placar lateral
// ---------------------------------------------------------------------------
function sidebar() {
  if (!B) return;
  try {
    const sb = world.scoreboard;
    let obj = sb.getObjective('ww2');
    const label = (B.mission || 1) === 2 ? '§eCanhões Pak' : '§eBaterias AA';
    if (!obj) {
      obj = sb.addObjective('ww2', '§6§lD-DAY');
      sb.setObjectiveAtDisplaySlot('Sidebar', { objective: obj });
    }
    const set = (name, v) => { try { obj.setScore(name, v); } catch { /* ignore */ } };
    set(label, B.flaks.filter((f) => !f.destroyed).length);
    set('§aParaquedistas', us.size);
    set('§cAlemães', de.size);
    set('§7Reforço aéreo', B.airReinf);
  } catch { /* scoreboard indisponível */ }
}

// ---------------------------------------------------------------------------
// Rádio (ordens do jogador)
// ---------------------------------------------------------------------------
function order0(player, order, point) {
  if (!loaded) load();
  const sq = squads[0];
  sq.owner = player.id;
  sq.order = order;
  sq.point = point ?? null;
  if (order === 'assault') {
    const f = nearestFlak(player.location, 200);
    if (f) { sq.objective = f.idx; } else { sq.order = 'follow'; }
  }
  sq.respawn = true;
  save();
  return membersOfSquad(0).length;
}

function regroupAll(player) {
  const pt = groundAt(player.location, 2, 90);
  for (const s of squads) {
    if (!membersOfSquad(s.k).length) continue;
    s.order = s.k === 0 ? 'follow' : 'point';
    s.point = s.k === 0 ? null : pt;
    s.owner = player.id;
  }
  hq('Todos os esquadrões: reagrupar na posição do líder!');
  save();
}

function generalAssault() {
  for (const s of squads) if (s.k > 0) { s.order = 'auto'; s.objective = -1; s.announced = ''; s.waitFor = -1; }
  hq('Ataque geral! O QG assume a coordenação dos esquadrões.');
  save();
  division();
}

function airReinforcement(player) {
  if (!loaded) load();
  if (!B) return 'Nenhuma operação em andamento.';
  if (B.airReinf <= 0) return '§cSem aviões disponíveis para reforço.';
  const k = freeSquad();
  if (k < 0) return '§cTodos os esquadrões estão em campo.';
  if (!HUB.air || !HUB.air.reinforcement(player.location, k)) return '§cO avião não consegue chegar aqui agora.';
  B.airReinf--;
  squads[k].order = 'follow'; squads[k].owner = player.id; squads[k].landAnnounced = false;
  hq(`C-47 a caminho com o Esquadrão §e${squads[k].name}§f! Lançamento sobre a sua posição.`);
  save();
  return `§aReforço a caminho (restam ${B.airReinf}).`;
}

function report() {
  if (!B) return 'Nenhuma operação em andamento. Use /scriptevent ww2:battle para iniciar uma batalha aqui.';
  const lines = [];
  const phaseName = { air: 'Lançamento aéreo', battle: (B.mission || 1) === 2 ? 'Destruir os canhões Pak 40 no bosque' : 'Destruir as baterias AA', counter: 'Repelir contra-ataque', victory: 'Missão cumprida', m1_done: 'Missão cumprida', convoy: 'Coluna blindada a caminho' }[B.phase];
  lines.push(`§6Objetivo:§f ${phaseName}`);
  B.flaks.forEach((f, i) => lines.push(`  ${f.destroyed ? '§a✔' : '§c✖'} ${oname(f)} §7(${Math.round(f.x)}, ${Math.round(f.z)})${f.destroyed ? '' : ` — ${defendersNear(f)} defensores`}`));
  lines.push('');
  for (const s of squads) {
    const m = membersOfSquad(s.k);
    if (!m.length) continue;
    const ord = { follow: 'seguindo o líder', hold: 'mantendo posição', point: 'indo ao ponto marcado', auto: 'QG decide', assault: 'atacando' }[s.order];
    const obj = s.objective >= 0 && B.flaks[s.objective] ? ` → ${oname(B.flaks[s.objective])}` : '';
    lines.push(`§a${s.name}§f: ${m.length} homens, ${ord}${obj}`);
  }
  lines.push('');
  lines.push(`§cAlemães vivos: ${de.size}  §7| abatidos: ${B.kills}  | nossas baixas: ${B.losses}`);
  lines.push(`§7Reforços aéreos disponíveis: ${B.airReinf}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
function onDeath(e, source) {
  if (!B) return;
  if (us.has(e.id)) {
    const u = us.get(e.id);
    us.delete(e.id);
    B.losses = (B.losses || 0) + 1;
    if (now() - lastMedic > 200) {
      lastMedic = now();
      const sq = squads[u.squad] || squads[0];
      msgAll(`§a[${sq.name}]§f ${pick(['MÉDICO!', 'Homem abatido!', 'Perdemos um!'])} ${safe(() => e.nameTag, '')} foi atingido!`);
    }
  } else if (de.has(e.id)) {
    de.delete(e.id);
    B.kills = (B.kills || 0) + 1;
    const killer = source && source.damagingEntity;
    if (killer && killer.typeId === 'minecraft:player' && now() - lastKillMsg > 100) {
      lastKillMsg = now();
      sound('random.orb', killer.location, 0.4, 0.6);
    }
    checkVictory();
  }
}

function onHurt(e) {
  const u = us.get(e.id);
  if (u && u.mode !== 'combat') setModeUS(u, 'combat');
  const d = de.get(e.id);
  if (d && d.mode !== 'combat' && d.mode !== 'retreat') setModeDE(d, 'combat');
}

function clearUnits() {
  for (const tag of ['ww2_unit', 'ww2_unit_flak']) {
    for (const e of safe(() => dim().getEntities({ tags: [tag] }), [])) safe(() => e.remove());
  }
  for (const t of ['ww2:marker', 'ww2:flak38', 'ww2:pak40']) {
    for (const e of safe(() => dim().getEntities({ type: t }), [])) safe(() => e.remove());
  }
  us.clear(); de.clear(); flakEnts.clear(); charges.length = 0;
  for (const s of squads) Object.assign(s, { order: s.k === 0 ? 'follow' : 'auto', point: null, objective: -1, waitFor: -1, marker: null, markerPos: null, announced: '', landAnnounced: false });
  for (const g of groups) Object.assign(g, { kind: null, home: null, target: null, marker: null, markerPos: null });
  safe(() => world.scoreboard.removeObjective('ww2'));
}

function prepareMission2(base, layout) {
  if (!loaded) load();
  const air = B ? B.airReinf : CFG.AIR_REINFORCEMENTS;
  const owner = squads[0].owner;
  clearUnits();
  squads[0].owner = owner;
  B = { mission: 2, phase: 'convoy', dz: { ...base }, flaks: [], airReinf: Math.max(1, air), lastReinf: now(),
    alerted: [], kills: 0, losses: 0, pending: [] };
  layout.paks.forEach((p, i) => {
    const pos = { x: base.x + p.x + 0.5, y: base.y, z: base.z + p.z + 0.5 };
    B.flaks.push({ ...pos, name: p.name, kind: 'pak', destroyed: false, spawned: false });
    groups[i].kind = 'flak'; groups[i].home = pos;
    B.pending.push({ t: 'pak', i });
    B.pending.push({ t: 'grp', g: i, x: pos.x, z: pos.z, n: 2 });
  });
  let gi = layout.paks.length;
  groups[gi].kind = 'post';
  B.pending.push({ t: 'grp', g: gi, x: base.x + layout.mg.x, z: base.z + layout.mg.z, n: 3, weapon: 'mp44', bags: true });
  gi++;
  for (const g of layout.groups) {
    if (gi >= NG - 1) break;
    groups[gi].kind = 'patrol';
    B.pending.push({ t: 'grp', g: gi, x: base.x + g.x, z: base.z + g.z, n: 4 });
    gi++;
  }
  save();
}

function tickPending() {
  if (!B || !B.pending || !B.pending.length) return;
  for (let i = B.pending.length - 1; i >= 0; i--) {
    const it = B.pending[i];
    const x = it.t === 'pak' ? B.flaks[it.i].x : it.x;
    const z = it.t === 'pak' ? B.flaks[it.i].z : it.z;
    const g = findGround(x, z, Math.floor(B.dz.y || 0) + 60, Math.floor(B.dz.y || 0) - 60) ?? findGround(x, z, 300);
    if (!g) continue;
    const pos = { x, y: g.y, z };
    if (it.t === 'pak') {
      let e;
      try { e = dim().spawnEntity('ww2:pak40', pos); } catch { continue; }
      const f = B.flaks[it.i];
      buildEmplacement({ x: Math.floor(x), y: g.y, z: Math.floor(z) });
      safe(() => { e.addTag('ww2_flak_' + it.i); e.addTag('ww2_unit_flak'); e.nameTag = oname(f); });
      safe(() => e.teleport(pos, { facingLocation: { x: x - 30, y: g.y, z: B.dz.z } }));
      f.y = g.y; f.spawned = true;
      flakEnts.set(it.i, e);
    } else {
      if (it.bags) buildEmplacement({ x: Math.floor(x), y: g.y, z: Math.floor(z) });
      groups[it.g].home = pos;
      for (let k = 0; k < it.n; k++) spawnGerman({ x: x + rand(-1.5, 1.5), y: g.y, z: z + rand(-1.5, 1.5) }, it.g, it.weapon);
    }
    B.pending.splice(i, 1);
  }
  save();
}

function beginMission2() {
  if (!B) return;
  B.phase = 'battle';
  B.lastReinf = now();
  hq('Contato! Canhões antitanque Pak 40 escondidos no bosque. Infantaria à frente, os tanques dão cobertura!');
  hq('O QG coordena os esquadrões Able, Baker e Charlie. Pelotão Easy: com você.');
  save();
}

function reset() {
  for (const tag of ['ww2_unit', 'ww2_unit_flak', 'ww2_plane']) {
    for (const e of safe(() => dim().getEntities({ tags: [tag] }), [])) safe(() => e.remove());
  }
  for (const t of ['ww2:marker', 'ww2:flak38', 'ww2:parachute', 'ww2:c47', 'ww2:propeller']) {
    for (const e of safe(() => dim().getEntities({ type: t }), [])) safe(() => e.remove());
  }
  us.clear(); de.clear(); flakEnts.clear(); charges.length = 0;
  for (const s of squads) Object.assign(s, { order: s.k === 0 ? 'follow' : 'auto', point: null, objective: -1, waitFor: -1, marker: null, markerPos: null, owner: null, announced: '' });
  for (const g of groups) Object.assign(g, { kind: null, home: null, target: null, marker: null, markerPos: null });
  B = null;
  save();
  safe(() => world.scoreboard.removeObjective('ww2'));
}

// ---------------------------------------------------------------------------
export function tick() {
  if (!loaded) load();
  const t = now();
  if (t % 100 === 7) scanUnits();
  if (t % 10 === 0) {
    for (const [id, u] of us) { if (!valid(u.e)) { us.delete(id); continue; } safe(() => thinkUS(u)); }
  }
  if (t % 10 === 5) {
    for (const [id, d] of de) { if (!valid(d.e)) { de.delete(id); continue; } safe(() => thinkDE(d)); }
  }
  if (t % 20 === 0) { safe(tickSquads); safe(tickGroups); }
  if (t % 20 === 10) safe(tickPending);
  tickCharges();
  if (t % 100 === 50) { safe(division); safe(germanCommand); safe(checkVictory); }
  if (t % 40 === 0) sidebar();
  if (t % 60 === 0) {
    for (const u of us.values()) {
      if (u.mode === 'combat' || !valid(u.e)) continue;
      const h = hp(u.e);
      if (h.comp && h.cur < h.max) safe(() => h.comp.setCurrentValue(Math.min(h.max, h.cur + 2)));
    }
  }
  if (B && t % 10 === 3) {
    for (const f of B.flaks) {
      if (!f.destroyed) continue;
      particle('ww2:engine_smoke', { x: f.x, y: f.y + 1.2, z: f.z });
      if (Math.random() < 0.5) particle('minecraft:basic_flame_particle', { x: f.x + rand(-0.6, 0.6), y: f.y + 0.8, z: f.z + rand(-0.6, 0.6) });
    }
  }
}

HUB.battle = {
  prepare, begin, announceDrop, landedUS, adopt, liveFlaks, crewCount, nearestUSTarget, onDeath, onHurt,
  order0, regroupAll, generalAssault, airReinforcement, report, reset, plantCharge, nearestFlak,
  clearUnits, prepareMission2, beginMission2, membersOfSquad, mission: () => (B ? (B.mission || 1) : 0),
  germans: () => [...de.values()].filter((d) => valid(d.e)).map((d) => d.e),
  usSoldiers: () => [...us.values()].filter((u) => valid(u.e)).map((u) => u.e),
  phase: () => (B ? B.phase : 'none'),
  active: () => !!B,
};
export const _debug = { squads, groups, us, de, rand, randi, cmd };
