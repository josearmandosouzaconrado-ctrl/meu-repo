// Missão 2: "Operação Bosque" — briefing com mapa, coluna de tanques Sherman por uma estrada
// de terra até um bosque fechado, emboscada de canhões Pak 40, desembarque e ataque com IA.
import { world } from '@minecraft/server';
import { US_NAMES } from './config.js';
import { HUB } from './hub.js';
import { M2_LAYOUT as LY } from './mission2_layout.js';
import {
  dim, now, add, dist, dist2d, rand, randi, pick, valid, safe, sound, particle, cmd, players, perm, setBlock,
  findGround, setProp, title, actionbar, getJSON, setJSON, fmt, msgAll,
} from './util.js';

let M = null;            // { phase, base, t, knocked }
let loaded = false;
const tanks = [];        // { e, idx, dead, next }
let board = null;
const pakState = new Map();
const gen = { queue: [], retry: [], total: 0, done: 0, hcache: new Map() };
const TANK_SPEED = 0.17;

const SQUAD_ON_TANK = [1, 0, 2, 3];  // esquadrão em cada tanque (0 = Easy, com o jogador)
const SOLDIERS_ON_TANK = [5, 4, 6, 6];

function save() { setJSON('ww2:m2', M ? { phase: M.phase, base: M.base, t: M.t, knocked: M.knocked || 0 } : undefined); }

function load() {
  loaded = true;
  M = getJSON('ww2:m2', null);
  for (const e of safe(() => dim().getEntities({ type: 'ww2:map_board' }), [])) safe(() => e.remove());
  if (!M) return;
  for (const e of safe(() => dim().getEntities({ type: 'ww2:sherman' }), [])) {
    const idx = safe(() => e.getDynamicProperty('ww2:tank'), undefined);
    if (typeof idx === 'number') tanks[idx] = { e, idx, dead: !!safe(() => e.getProperty('ww2:destroyed')), next: now() + 100 };
  }
  if (['fade', 'briefing', 'deploy'].includes(M.phase)) {
    for (const t of tanks) if (t) safe(() => t.e.remove());
    tanks.length = 0;
    M.phase = 'fade'; M.t = 0;
  } else if (M.phase === 'convoy') {
    M.phase = 'ambush'; M.t = 20;
  }
}

const L = (dx, dy, dz) => ({ x: M.base.x + dx, y: (M.base.y || 0) + dy, z: M.base.z + dz });
const hold = new Map();  // jogadores presos na posição da câmera durante o briefing

// ---------------------------------------------------------------------------
// início
// ---------------------------------------------------------------------------
function start(dz) {
  if (!loaded) load();
  if (M && M.phase !== 'done') return;
  M = { phase: 'fade', base: { x: Math.floor(dz.x) + 320, y: 0, z: Math.floor(dz.z) }, t: 0, knocked: 0 };
  save();
}

function finished() {
  if (!M) return;
  M.phase = 'done';
  save();
  for (const t of tanks) if (t && !t.dead) setProp(t.e, 'ww2:moving', false);
}

// ---------------------------------------------------------------------------
// geração do terreno: estrada de terra, cercas vivas (bocage) e bosque fechado
// ---------------------------------------------------------------------------
const P = {};
function perms() {
  if (P.ready) return;
  P.path = perm(['minecraft:grass_path', 'minecraft:dirt_path', 'minecraft:coarse_dirt']);
  P.air = perm(['minecraft:air']);
  P.oakLog = perm(['minecraft:oak_log', 'minecraft:log']);
  P.darkLog = perm(['minecraft:dark_oak_log', 'minecraft:log2', 'minecraft:oak_log']);
  P.oakLeaves = perm(['minecraft:oak_leaves', 'minecraft:leaves'], { persistent_bit: true });
  P.darkLeaves = perm(['minecraft:dark_oak_leaves', 'minecraft:leaves2', 'minecraft:oak_leaves'], { persistent_bit: true });
  P.fern = perm(['minecraft:fern', 'minecraft:short_grass', 'minecraft:tallgrass']);
  P.ready = true;
}

const SOFT = ['air', 'leaves', 'log', 'grass', 'flower', 'fern', 'bush', 'vine', 'sapling', 'snow_layer', 'mushroom', 'wood'];

function isSoft(id) {
  return SOFT.some((w) => id.includes(w)) && !id.includes('grass_block') && !id.includes('grass_path');
}

/** y do bloco sólido do chão (ignora árvores e plantas); undefined se não carregado */
function ground(x, z) {
  const key = `${x},${z}`;
  if (gen.hcache.has(key)) return gen.hcache.get(key);
  const d = dim();
  let top = 200;
  if (typeof d.getTopmostBlock === 'function') {
    const b = safe(() => d.getTopmostBlock({ x, z }));
    if (b) top = b.location.y;
  } else {
    const n = gen.hcache.get(`${x - 1},${z}`) ?? gen.hcache.get(`${x},${z - 1}`);
    if (n !== undefined) top = n.y + 26;
    else if (M && M.base.y) top = M.base.y + 34;
  }
  for (let y = Math.min(top, d.heightRange.max - 1); y > d.heightRange.min; y--) {
    const b = safe(() => d.getBlock({ x, y, z }));
    if (!b) return undefined;
    const id = b.typeId;
    if (isSoft(id)) continue;
    const r = { y, water: !!safe(() => b.isLiquid, false) };
    gen.hcache.set(key, r);
    return r;
  }
  return undefined;
}

function put(x, y, z, p, onlySoft = true) {
  const b = safe(() => dim().getBlock({ x, y, z }));
  if (!b) return false;
  if (onlySoft && !isSoft(b.typeId)) return true;
  safe(() => b.setPermutation(p));
  return true;
}

function planGeneration() {
  const bx = M.base.x, bz = M.base.z;
  const q = [];
  for (let x = LY.road.x0; x <= LY.road.x1; x++) q.push({ k: 'road', x: bx + x });
  for (let z = -40; z <= 40; z++) q.push({ k: 'road2', x: bx + LY.objective_x, z: bz + z });
  for (const hz of LY.hedges) {
    for (let x = LY.road.x0; x < LY.forest.x0 - 3; x++) if (Math.random() < 0.92) q.push({ k: 'hedge', x: bx + x, z: bz + hz, tree: Math.random() < 0.1 });
  }
  const keep = [...LY.paks, LY.mg, ...LY.groups];
  for (let x = LY.forest.x0; x <= LY.forest.x1; x += 4) {
    for (let z = -LY.forest.zmax; z <= LY.forest.zmax; z += 4) {
      const tx = x + randi(-1, 1), tz = z + randi(-1, 1);
      if (Math.abs(tz) < 5) continue;
      if (keep.some((p) => Math.hypot(p.x - tx, p.z - tz) < 5.5)) continue;
      if (Math.abs(tx - LY.objective_x) < 4) continue;
      q.push({ k: 'tree', x: bx + tx, z: bz + tz, h: randi(6, 9), dark: Math.random() < 0.45 });
      if (Math.random() < 0.5) q.push({ k: 'bush', x: bx + tx + randi(-2, 2), z: bz + tz + 2 });
    }
  }
  // árvores mais perto da estrada para o bosque parecer "fechado"
  for (let x = LY.forest.x0; x <= LY.forest.x1; x += 5) {
    for (const s of [-1, 1]) q.push({ k: 'tree', x: bx + x + randi(0, 2), z: bz + s * randi(5, 6), h: randi(7, 9), dark: true });
  }
  gen.queue = q; gen.retry = []; gen.total = q.length; gen.done = 0;
}

function doTask(t) {
  if (t.k === 'road') {
    for (let dz = -LY.road.half; dz < LY.road.half; dz++) {
      const z = M.base.z + dz;
      const g = ground(t.x, z);
      if (!g) return false;
      if (g.water) continue;
      put(t.x, g.y, z, P.path, false);
      for (let y = 1; y <= 7; y++) put(t.x, g.y + y, z, P.air, false);
    }
    if (t.x === M.base.x) M.base.y = (ground(t.x, M.base.z) || { y: 64 }).y + 1;
    return true;
  }
  if (t.k === 'road2') {
    const g = ground(t.x, t.z);
    if (!g) return false;
    for (let dx = -1; dx <= 1; dx++) { put(t.x + dx, g.y, t.z, P.path, false); for (let y = 1; y <= 5; y++) put(t.x + dx, g.y + y, t.z, P.air, false); }
    return true;
  }
  const g = ground(t.x, t.z);
  if (!g) return false;
  if (g.water) return true;
  const y0 = g.y + 1;
  if (t.k === 'hedge') {
    put(t.x, y0, t.z, P.oakLeaves); put(t.x, y0 + 1, t.z, P.oakLeaves);
    if (Math.random() < 0.5) put(t.x, y0 + 2, t.z, P.oakLeaves);
    if (t.tree) treeAt(t.x, y0, t.z, 6, false);
    return true;
  }
  if (t.k === 'bush') {
    put(t.x, y0, t.z, P.darkLeaves);
    if (Math.random() < 0.6) put(t.x + 1, y0, t.z, P.fern);
    return true;
  }
  if (t.k === 'tree') { treeAt(t.x, y0, t.z, t.h, t.dark); return true; }
  return true;
}

function treeAt(x, y0, z, h, dark) {
  const log = dark ? P.darkLog : P.oakLog;
  const leaves = dark ? P.darkLeaves : P.oakLeaves;
  for (let y = 0; y < h; y++) put(x, y0 + y, z, log);
  for (let dy = h - 3; dy <= h + 1; dy++) {
    const r = dy >= h ? 1 : (dy === h - 3 ? 2 : 3);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        if (dx === 0 && dz === 0 && dy < h) continue;
        put(x + dx, y0 + dy, z + dz, leaves);
      }
    }
  }
}

const COST = { road: 5, road2: 2, hedge: 1, bush: 1, tree: 9 };

function tickGeneration(budget = 120) {
  if (!gen.queue.length && gen.retry.length && now() % 40 === 0) { gen.queue = gen.retry; gen.retry = []; }
  let n = 0;
  while (gen.queue.length && n < budget) {
    const t = gen.queue.shift();
    perms();
    if (doTask(t)) gen.done++; else { t.tries = (t.tries || 0) + 1; if (t.tries < 400) gen.retry.push(t); }
    n += COST[t.k] || 1;
  }
}

const progress = () => (gen.total ? gen.done / gen.total : 1);

// ---------------------------------------------------------------------------
// tanques
// ---------------------------------------------------------------------------
function roadY(x) {
  const g = ground(Math.floor(x), M.base.z);
  return g ? g.y + 1 : undefined;
}

function spawnTanks() {
  LY.tanks_start.forEach((dx, idx) => {
    const x = M.base.x + dx;
    const y = roadY(x) ?? (M.base.y || 70);
    let e;
    try { e = dim().spawnEntity('ww2:sherman', { x: x + 0.5, y, z: M.base.z + 0.0 }); } catch { return; }
    safe(() => e.teleport({ x: x + 0.5, y, z: M.base.z }, { rotation: { x: 0, y: -90 } }));
    safe(() => { e.setDynamicProperty('ww2:tank', idx); e.addTag('ww2_tank'); e.nameTag = `Sherman "${['Easy Eight', 'Cobra King', 'Fury', 'Lucky Lady'][idx]}"`; });
    tanks[idx] = { e, idx, dead: false, next: now() + randi(100, 200) };
  });
}

function boardTroops() {
  const rideable = (e) => safe(() => e.getComponent('minecraft:rideable'));
  let names = [...US_NAMES].sort(() => Math.random() - 0.5);
  tanks.forEach((t, i) => {
    if (!t) return;
    const rc = rideable(t.e);
    if (i === 1) {
      for (const p of players()) {
        safe(() => p.teleport(add(t.e.location, { x: 0, y: 2.6, z: 0 })));
        safe(() => rc.addRider(p));
      }
    }
    for (let k = 0; k < SOLDIERS_ON_TANK[i]; k++) {
      let s;
      try { s = dim().spawnEntity('ww2:us_paratrooper', add(t.e.location, { x: 0, y: 2.6, z: 0 })); } catch { continue; }
      safe(() => {
        s.setDynamicProperty('ww2:managed', true);
        s.setDynamicProperty('ww2:squad', SQUAD_ON_TANK[i]);
        s.triggerEvent('ww2:to_plane');
        s.triggerEvent(pick(['ww2:weapon_garand', 'ww2:weapon_garand', 'ww2:weapon_thompson', 'ww2:weapon_bar']));
        s.nameTag = names.pop() || 'Pvt. Smith';
        s.addTag('ww2_m2rider');
      });
      safe(() => rc.addRider(s));
    }
  });
}

function dismountAll() {
  for (const t of tanks) {
    if (!t) continue;
    const rc = safe(() => t.e.getComponent('minecraft:rideable'));
    const riders = safe(() => rc.getRiders(), []) || [];
    safe(() => rc.ejectRiders());
    for (const r of riders) {
      if (safe(() => r.typeId) === 'ww2:us_paratrooper') {
        safe(() => r.removeTag('ww2_m2rider'));
        safe(() => r.applyImpulse({ x: rand(-0.2, 0.2), y: 0.3, z: rand(0.25, 0.4) * (Math.random() < 0.5 ? -1 : 1) }));
        const squad = safe(() => r.getDynamicProperty('ww2:squad'), 0) ?? 0;
        if (HUB.battle) HUB.battle.landedUS(r, squad);
      }
    }
  }
  // soldados que perderam o assento (ex.: recarregar o mundo)
  for (const s of safe(() => dim().getEntities({ tags: ['ww2_m2rider'] }), [])) {
    safe(() => s.removeTag('ww2_m2rider'));
    if (HUB.battle) HUB.battle.landedUS(s, safe(() => s.getDynamicProperty('ww2:squad'), 0) ?? 0);
  }
}

function driveTank(t, targetX, speed) {
  const e = t.e;
  const l = e.location;
  const moving = !t.dead && targetX - l.x > 0.6;
  const gy = roadY(l.x + 1);
  const vy = gy === undefined ? 0 : Math.max(-0.35, Math.min(0.35, (gy - l.y) * 0.3));
  try {
    e.clearVelocity();
    e.applyImpulse({ x: moving ? Math.min(speed, targetX - l.x) : 0, y: vy, z: (M.base.z - l.z) * 0.15 });
  } catch { /* chunk */ }
  setProp(e, 'ww2:moving', moving);
  if (moving && now() % 4 === t.idx % 4) particle('ww2:dust', add(l, { x: -4, y: 0.3, z: rand(-1.5, 1.5) }));
  return moving;
}

function knockOut(t, why) {
  if (!t || t.dead) return;
  t.dead = true;
  M.knocked = (M.knocked || 0) + 1;
  setProp(t.e, 'ww2:destroyed', true);
  setProp(t.e, 'ww2:moving', false);
  const l = t.e.location;
  particle('ww2:explosion', add(l, { x: 0, y: 2, z: 0 }));
  particle('minecraft:huge_explosion_emitter', add(l, { x: 0, y: 2, z: 0 }));
  sound('ww2.explosion', l, 5, 0.8);
  for (const p of players()) if (dist(p.location, l) < 40) cmd(p, 'camerashake add @s 0.6 1.0 positional');
  msgAll(`§c[Rádio blindados]§f ${why}`);
}

function tankAimAndFire(t) {
  const e = t.e;
  const l = e.location;
  let target, best = 55;
  const cands = [];
  if (HUB.battle) {
    for (const f of HUB.battle.liveFlaks()) if (f.kind === 'pak') cands.push({ e: f.e, w: 0.6 });
    for (const g of HUB.battle.germans()) cands.push({ e: g, w: 1 });
  }
  for (const c of cands) {
    const d = dist(c.e.location, l) * c.w;
    if (d < best && c.e.location.x > l.x - 8) { best = d; target = c.e; }
  }
  if (!target) return false;
  const tl = target.location;
  const ang = Math.atan2(tl.z - l.z, tl.x - l.x) * 180 / Math.PI;
  setProp(e, 'ww2:turret', Math.max(-170, Math.min(170, Math.round(ang))));
  const rad = ang * Math.PI / 180;
  const from = { x: l.x + Math.cos(rad) * 5.2 - 0.3, y: l.y + 2.9, z: l.z + Math.sin(rad) * 5.2 };
  const aim = add(tl, { x: rand(-1.2, 1.2), y: 0.6, z: rand(-1.2, 1.2) });
  if (HUB.air) HUB.air.fireShell(e, aim, false, { from, speed: 4.5, power: 2.4, sound: 'ww2.tank_gun', big: true });
  for (const p of players()) if (dist(p.location, l) < 18) cmd(p, 'camerashake add @s 0.25 0.4 positional');
  return true;
}

function pakFire(f) {
  const e = f.e;
  const live = tanks.filter((t) => t && !t.dead && valid(t.e));
  if (!live.length) return;
  let tgt = live[0], bd = 1e9;
  for (const t of live) { const d = dist(t.e.location, e.location); if (d < bd) { bd = d; tgt = t; } }
  if (bd > 85) return;
  const aim = add(tgt.e.location, { x: 0, y: 1.4, z: 0 });
  if (HUB.air) {
    HUB.air.aimGun(e, aim);
    HUB.air.fireShell(e, add(aim, { x: rand(-2.5, 2.5), y: rand(-0.5, 1), z: rand(-2.5, 2.5) }), false,
      { speed: 4.8, power: 2.2, sound: 'ww2.tank_gun', big: true });
  }
  const alive = live.length;
  if (M.knocked < 2 && alive > 2 && Math.random() < 0.3) {
    const t = tgt;
    M.later = M.later || [];
    M.later.push({ at: now() + Math.ceil(bd / 4.8), fn: () => knockOut(t, `Fomos atingidos! O ${t.e.nameTag} está em chamas!`) });
  }
}

// ---------------------------------------------------------------------------
// laço
// ---------------------------------------------------------------------------
function holdPlayers(pos, face) {
  for (const p of players()) {
    safe(() => p.teleport(pos));
    if (now() % 40 === 0) safe(() => p.addEffect('slow_falling', 60, { amplifier: 0, showParticles: false }));
    hold.set(p.id, face);
  }
}

function tick() {
  if (!loaded) load();
  if (!M || M.phase === 'done') return;
  M.t++;
  const t = M.t;
  if (M.later) {
    for (let i = M.later.length - 1; i >= 0; i--) if (now() >= M.later[i].at) { const f = M.later[i].fn; M.later.splice(i, 1); safe(f); }
  }
  if (M.phase === 'fade' || M.phase === 'briefing' || M.phase === 'deploy') tickGeneration(140);
  else if (gen.queue.length || gen.retry.length) tickGeneration(40);

  const maxY = dim().heightRange.max - 12;
  const cam = { x: M.base.x + 10, y: Math.min(250, maxY), z: M.base.z + 22 };
  const boardPos = { x: M.base.x + 10, y: cam.y - 4, z: M.base.z + 10 };

  if (M.phase === 'fade') {
    if (t === 1) {
      for (const p of players()) {
        cmd(p, 'camera @s fade time 1.5 3 1 color 0 0 0');
        cmd(p, 'inputpermission set @s movement disabled');
      }
    }
    if (t === 32) {
      if (HUB.battle) HUB.battle.clearUnits();
      for (const e of safe(() => dim().getEntities({ type: 'ww2:sherman' }), [])) safe(() => e.remove());
      tanks.length = 0;
      safe(() => world.setTimeOfDay(1200));
      cmd(dim(), 'weather clear');
      gen.hcache.clear();
      planGeneration();
    }
    if (t >= 32) holdPlayers(cam);
    if (t === 40) {
      try {
        board = dim().spawnEntity('ww2:map_board', boardPos);
        board.teleport(boardPos, { facingLocation: { x: cam.x, y: boardPos.y, z: cam.z } });
      } catch { board = null; }
    }
    if (t === 60) {
      const s0 = { x: cam.x - 3, y: boardPos.y + 4.5, z: M.base.z + 25 };
      const s1 = { x: cam.x + 1, y: boardPos.y + 4.0, z: M.base.z + 19 };
      const f0 = { x: boardPos.x - 2, y: boardPos.y + 4, z: boardPos.z };
      const f1 = { x: boardPos.x + 2, y: boardPos.y + 3.8, z: boardPos.z };
      for (const p of players()) {
        cmd(p, `camera @s set minecraft:free pos ${fmt(s0.x)} ${fmt(s0.y)} ${fmt(s0.z)} facing ${fmt(f0.x)} ${fmt(f0.y)} ${fmt(f0.z)}`);
        cmd(p, `camera @s set minecraft:free ease 13 in_out_sine pos ${fmt(s1.x)} ${fmt(s1.y)} ${fmt(s1.z)} facing ${fmt(f1.x)} ${fmt(f1.y)} ${fmt(f1.z)}`);
        cmd(p, 'camera @s fade time 0 0.2 1.2 color 0 0 0');
      }
      M.phase = 'briefing'; M.t = 0;
      save();
    }
    return;
  }

  if (M.phase === 'briefing') {
    holdPlayers(cam);
    const ps = players();
    if (t === 20) for (const p of ps) title(p, '§6§lPRÓXIMO OBJETIVO', '§fBosque de Hautot — 7 de junho de 1944, 09:00', 10, 90, 20);
    if (t === 60) msgAll('§2[Briefing]§f Uma estrada de terra atravessa o bosque até a encruzilhada. Ela precisa ser aberta para a divisão avançar.');
    if (t === 120) for (const p of ps) title(p, ' ', '§cCanhões antitanque Pak 40 escondidos no bosque', 10, 70, 20);
    if (t === 130) msgAll('§2[Briefing]§f Os alemães têm §cdois canhões Pak 40§f, um ninho de metralhadora e infantaria entre as árvores.');
    if (t === 200) for (const p of ps) title(p, ' ', '§fVocês vão em cima dos tanques. Desembarquem quando houver contato!', 10, 70, 20);
    if (t === 205) msgAll('§2[Briefing]§f Seu pelotão vai no segundo Sherman. Os esquadrões Able, Baker e Charlie vão nos outros.');
    if (t >= 280 && (progress() > 0.55 || t > 700)) { M.phase = 'deploy'; M.t = 0; save(); }
    else if (t >= 280 && t % 60 === 0) for (const p of ps) actionbar(p, `§7Preparando o terreno... ${Math.round(progress() * 100)}%`);
    return;
  }

  if (M.phase === 'deploy') {
    if (t === 1) for (const p of players()) cmd(p, 'camera @s fade time 0.8 1.5 1.2 color 0 0 0');
    if (t < 20) { holdPlayers(cam); return; }
    if (t === 20) {
      safe(() => board && board.remove());
      board = null;
      if (HUB.battle) HUB.battle.prepareMission2({ ...M.base }, LY);
      spawnTanks();
      const sx = M.base.x + LY.tanks_start[1] - 4;
      const sy = roadY(sx) ?? (M.base.y || 70);
      cmd(dim(), `spawnpoint @a ${Math.floor(sx)} ${Math.floor(sy)} ${Math.floor(M.base.z + 3)}`);
      boardTroops();
    }
    if (t === 24) {
      for (const p of players()) {
        cmd(p, 'camera @s clear');
        cmd(p, 'inputpermission set @s movement enabled');
        title(p, '§a§lAVANÇAR!', '§fColuna blindada rumo ao Bosque de Hautot', 10, 60, 20);
      }
      hold.clear();
      M.phase = 'convoy'; M.t = 0;
      save();
    }
    return;
  }

  const lead = tanks.find((x) => x && !x.dead);
  if (M.phase === 'convoy') {
    tanks.forEach((tk, i) => {
      if (!tk || !valid(tk.e)) return;
      driveTank(tk, M.base.x + LY.ambush_x - i * 12 + 0.5, TANK_SPEED);
    });
    if (t % 80 === 1 && lead) sound('ww2.tank_engine', lead.e.location, 3, 1);
    if (t % 80 === 41 && tanks[1]) sound('ww2.tank_engine', tanks[1].e.location, 3, 0.95);
    if (t === 60) msgAll('§a[Easy] Sgt. Holloway:§f Fiquem de olho nas árvores. Esse bosque é perfeito para uma emboscada...');
    if (t === 200) msgAll('§a[Easy] Pvt. Kowalski:§f Silêncio demais por aqui...');
    if (tanks[0] && valid(tanks[0].e) && tanks[0].e.location.x >= M.base.x + LY.ambush_x - 0.5) { M.phase = 'ambush'; M.t = 0; save(); }
    if (t > 1600) { M.phase = 'ambush'; M.t = 0; }
    return;
  }

  if (M.phase === 'ambush') {
    for (const tk of tanks) if (tk && valid(tk.e)) driveTank(tk, tk.e.location.x, 0);
    if (t === 1) {
      const f = HUB.battle && HUB.battle.liveFlaks().find((x) => x.kind === 'pak');
      const from = f ? f.e : null;
      if (from && tanks[0] && HUB.air) {
        HUB.air.aimGun(from, add(tanks[0].e.location, { x: 0, y: 1.4, z: 0 }));
        HUB.air.fireShell(from, add(tanks[0].e.location, { x: 0, y: 1.6, z: 0 }), false, { speed: 5, power: 2, sound: 'ww2.tank_gun', big: true });
      } else if (tanks[0]) {
        sound('ww2.tank_gun', L(LY.paks[0].x, 0, LY.paks[0].z), 5, 1);
      }
    }
    if (t === 9) knockOut(tanks[0], 'PAK! PAK! O tanque da frente foi atingido!');
    if (t === 14) {
      msgAll('§a[Easy] Sgt. Holloway:§f §lEMBOSCADA! DESEMBARCAR! DESEMBARCAR!');
      for (const p of players()) title(p, '§c§lEMBOSCADA!', '§fDesembarque e ataque os canhões Pak 40!', 5, 50, 15);
    }
    if (t === 26) {
      dismountAll();
      if (HUB.battle) HUB.battle.beginMission2();
      M.phase = 'battle'; M.t = 0;
      save();
    }
    return;
  }

  if (M.phase === 'battle') {
    // tanques avançam atrás da infantaria e atiram
    const us = HUB.battle ? HUB.battle.usSoldiers() : [];
    const front = us.length ? us.reduce((a, s) => a + s.location.x, 0) / us.length : M.base.x;
    tanks.forEach((tk, i) => {
      if (!tk || !valid(tk.e)) return;
      if (tk.dead) {
        if (now() % 6 === i) {
          particle('ww2:engine_smoke', add(tk.e.location, { x: rand(-1, 1), y: 2.5, z: rand(-1, 1) }));
          particle('minecraft:basic_flame_particle', add(tk.e.location, { x: rand(-1, 1), y: 2.2, z: rand(-1, 1) }));
        }
        driveTank(tk, tk.e.location.x, 0);
        return;
      }
      const ahead = tanks.slice(0, i).filter((x) => x && valid(x.e));
      let limit = Math.min(front - 7, M.base.x + LY.objective_x - 6);
      for (const a of ahead) limit = Math.min(limit, a.e.location.x - 11);
      driveTank(tk, limit, 0.07);
      if (now() >= tk.next) {
        tk.next = now() + (tankAimAndFire(tk) ? randi(110, 190) : 40);
      }
    });
    if (t % 100 === 1 && lead) sound('ww2.tank_engine', lead.e.location, 2.5, 0.9);
    if (HUB.battle) {
      for (const f of HUB.battle.liveFlaks()) {
        if (f.kind !== 'pak') continue;
        let st = pakState.get(f.e.id);
        if (!st) { st = { next: now() + randi(80, 160) }; pakState.set(f.e.id, st); }
        if (now() < st.next) continue;
        st.next = now() + randi(200, 320);
        pakFire(f);
      }
    }
  }
}

function reset() {
  for (const e of safe(() => dim().getEntities({ type: 'ww2:sherman' }), [])) safe(() => e.remove());
  for (const e of safe(() => dim().getEntities({ type: 'ww2:map_board' }), [])) safe(() => e.remove());
  tanks.length = 0;
  M = null; gen.queue = []; gen.retry = [];
  save();
}

HUB.mission2 = { start, finished, reset, active: () => !!M && M.phase !== 'done', phase: () => (M ? M.phase : 'none'),
  holding: (p) => hold.has(p.id) };
export { tick, start, reset };
export const _debug = { tanks, gen, dist2d, actionbar };
