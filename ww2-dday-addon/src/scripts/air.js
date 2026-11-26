// Céu: formação de C-47, lançamento de paraquedistas da IA, fogo antiaéreo (Flak) e atmosfera.
import { CFG, US_NAMES } from './config.js';
import { HUB } from './hub.js';
import * as Chute from './parachute.js';
import {
  dim, now, add, sub, mul, norm, dist, dist2d, rand, randi, pick, valid, safe, sound, particle, cmd, players,
  setProp, findGround,
} from './util.js';

const planes = [];          // aviões de entidade (formação, o seu ao partir, reforços)
const shells = new Map();   // projéteis da Flak em voo
const flakState = new Map(); // flak.id -> { next, burst }
const DOOR_OFFSET = { x: -4.1, y: -1.4, z: -4.8 }; // centro do avião -> lado de fora da porta

function spawnPlane(loc) {
  try {
    const e = dim().spawnEntity('ww2:c47', loc);
    e.teleport(loc, { rotation: { x: 0, y: -90 } });
    e.addTag('ww2_plane');
    return e;
  } catch {
    return undefined;
  }
}

/** Cria a formação ao redor do avião do jogador. */
function spawnFormation(sid, center, dz) {
  let squad = 1;
  CFG.FORMATION.forEach((f, i) => {
    const base = add(center, { x: f.x, y: f.y, z: f.z });
    const e = spawnPlane(base);
    if (!e) return;
    const p = { e, base, sid, mode: 'hover', phase: Math.random() * 6, drops: f.drops ? CFG.DROPS_PER_PLANE : 0,
      squad: f.drops ? squad++ : -1, smoke: !!f.smoke, nextDrop: -1, born: now(), speed: 0 };
    p.lz = { x: dz.x + f.x * 0.55 + rand(-6, 6), z: dz.z + f.z * 0.6 + rand(-6, 6) };
    planes.push(p);
    if (i === 0) p.lead = true;
  });
}

function startDrops(sid) {
  let k = 0;
  for (const p of planes) {
    if (p.sid === sid && p.drops > 0) p.nextDrop = now() + 8 + (k++) * 14;
  }
}

function flyAway(sid) {
  for (const p of planes) {
    if (p.sid === sid && p.mode === 'hover') {
      p.mode = 'away'; p.awayAt = now() + randi(0, 60); p.speed = 0.25;
    }
  }
}

/** Seu avião (agora entidade) parte junto com a formação. */
function addDeparting(sid, center) {
  const e = spawnPlane(center);
  if (!e) return;
  planes.push({ e, base: { ...center }, sid, mode: 'away', awayAt: now(), speed: 0.3, phase: 0, drops: 0, squad: -1, born: now() });
}

/** Reforço aéreo pedido pelo rádio: um C-47 passa e lança 4 paraquedistas. */
function reinforcement(target, squad) {
  const g = findGround(target.x, target.z, Math.floor(target.y) + 40) ?? { y: target.y };
  const start = { x: target.x - 44, y: g.y + 58, z: target.z + 6 };
  const e = spawnPlane(start);
  if (!e) return false;
  planes.push({ e, base: start, sid: 'reinf', mode: 'pass', speed: 0.85, phase: 0, drops: 4, squad, born: now(),
    lz: { x: target.x, z: target.z }, dropX: target.x - 6 });
  sound('ww2.engine', target, 2.5, 1);
  return true;
}

function dropSoldier(p, doorLoc) {
  let s;
  try { s = dim().spawnEntity('ww2:us_paratrooper', doorLoc); } catch { return; }
  try {
    s.setDynamicProperty('ww2:managed', true);
    s.setDynamicProperty('ww2:squad', p.squad);
    s.triggerEvent('ww2:to_air');
    s.triggerEvent(pick(['ww2:weapon_garand', 'ww2:weapon_garand', 'ww2:weapon_thompson', 'ww2:weapon_bar']));
    setProp(s, 'ww2:state', 3);
    s.nameTag = pick(US_NAMES);
    s.addTag('ww2_unit');
    s.applyImpulse({ x: -0.15, y: 0, z: -0.3 });
  } catch { /* ignore */ }
  const lz = { x: p.lz.x + rand(-5, 5), z: p.lz.z + rand(-5, 5) };
  const squad = p.squad;
  scheduleDeploy(s, 14, lz, squad);
}

const pendingDeploys = [];
function scheduleDeploy(s, delay, lz, squad) {
  pendingDeploys.push({ s, at: now() + delay, lz, squad });
}

function doorOf(loc) { return add(loc, DOOR_OFFSET); }

function tickPlanes() {
  const t = now();
  for (let i = planes.length - 1; i >= 0; i--) {
    const p = planes[i];
    if (!valid(p.e)) { planes.splice(i, 1); continue; }
    let pos;
    if (p.mode === 'hover') {
      pos = add(p.base, { x: Math.sin(t * 0.021 + p.phase) * 0.8, y: Math.sin(t * 0.05 + p.phase) * 0.6, z: Math.cos(t * 0.03 + p.phase) * 0.5 });
      if (p.drops > 0 && p.nextDrop >= 0 && t >= p.nextDrop) {
        dropSoldier(p, doorOf(pos));
        p.drops--; p.nextDrop = t + 20;
      }
    } else if (p.mode === 'away') {
      if (t < p.awayAt) {
        pos = p.base;
      } else {
        p.speed = Math.min(1.5, p.speed + 0.012);
        p.base = add(p.base, { x: p.speed, y: 0.05, z: 0 });
        pos = p.base;
        if (t - p.awayAt > 320) { safe(() => p.e.remove()); planes.splice(i, 1); continue; }
      }
    } else if (p.mode === 'pass') {
      p.base = add(p.base, { x: p.speed, y: 0, z: 0 });
      pos = p.base;
      if (p.drops > 0 && pos.x >= p.dropX && t % 6 === 0) {
        dropSoldier(p, doorOf(pos)); p.drops--;
      }
      if (t - p.born > 260) { safe(() => p.e.remove()); planes.splice(i, 1); continue; }
    }
    try { p.e.teleport(pos, { rotation: { x: 0, y: -90 } }); } catch { /* chunk */ }
    p.pos = pos;
    if (p.smoke && t % 4 === 0) particle('ww2:engine_smoke', add(pos, { x: 8, y: -1, z: -5.5 }));
  }
  for (let i = pendingDeploys.length - 1; i >= 0; i--) {
    const d = pendingDeploys[i];
    if (t < d.at) continue;
    pendingDeploys.splice(i, 1);
    if (!valid(d.s)) continue;
    Chute.deploy(d.s, { target: d.lz, onLand: (s) => HUB.battle && HUB.battle.landedUS(s, d.squad) });
  }
}

// ---------------------------------------------------------------------------
// P-51 Mustang: passagem rasante (3 aviões em V) e ataque metralhando o solo
// ---------------------------------------------------------------------------
const mustangs = [];

/**
 * over: ponto sobre o qual passam; dir: +1/-1 ao longo do eixo X;
 * strafe: alvo no chão para metralhar (opcional)
 */
function mustangPass(over, opts = {}) {
  const dir = opts.dir ?? 1;
  const g = findGround(over.x, over.z, Math.floor(over.y) + 40) ?? { y: over.y };
  const alt = g.y + (opts.strafe ? 26 : 20);
  const startX = over.x - dir * 70;
  const form = [{ x: 0, z: 0, y: 0 }, { x: -7, z: -9, y: 2 }, { x: -7, z: 9, y: 2 }];
  let n = 0;
  for (const f of form) {
    const loc = { x: startX + f.x * dir, y: alt + f.y, z: over.z + f.z };
    let e;
    try { e = dim().spawnEntity('ww2:p51', loc); } catch { continue; }
    safe(() => e.teleport(loc, { rotation: { x: 0, y: dir > 0 ? -90 : 90 } }));
    mustangs.push({ e, dir, born: now(), over: { ...over, y: g.y }, alt: alt + f.y, strafe: opts.strafe,
      lead: n === 0, heard: false, z: over.z + f.z });
    n++;
  }
  return n > 0;
}

function tickMustangs() {
  for (let i = mustangs.length - 1; i >= 0; i--) {
    const m = mustangs[i];
    if (!valid(m.e)) { mustangs.splice(i, 1); continue; }
    const l = m.e.location;
    const rel = (l.x - m.over.x) * m.dir;          // < 0 chegando, > 0 já passou
    let vy = 0;
    if (m.strafe) {
      const target = rel < 0 ? m.over.y + 9 + Math.max(0, -rel - 25) * 0.4 : m.over.y + 9 + rel * 0.6;
      vy = Math.max(-0.6, Math.min(0.8, (Math.min(target, m.alt) - l.y) * 0.15));
      if (rel > 0 && l.y < m.alt + 15) vy = 0.7;
      // metralhadoras .50: rajadas na aproximação
      if (rel > -45 && rel < -6 && now() % 2 === 0) {
        const tgt = { x: m.strafe.x + rand(-3, 3), y: m.strafe.y + 0.5, z: m.strafe.z + rand(-3, 3) };
        for (const side of [-2.5, 2.5]) {
          const from = { x: l.x + m.dir * 3, y: l.y + 0.4, z: l.z + side };
          const dirv = norm(sub(tgt, from));
          try {
            const b = dim().spawnEntity('ww2:bullet_us_mg', add(from, mul(dirv, 2)));
            const pc = b.getComponent('minecraft:projectile');
            if (pc) pc.shoot(mul(dirv, 5)); else b.applyImpulse(mul(dirv, 5));
          } catch { /* ignore */ }
        }
        if (now() % 4 === 0) sound('ww2.bar', l, 3, 1.35);
      }
    }
    try {
      m.e.clearVelocity();
      m.e.applyImpulse({ x: 1.55 * m.dir, y: vy, z: (m.z - l.z) * 0.1 });
    } catch { /* chunk */ }
    if (m.lead && !m.heard && rel > -55) {
      m.heard = true;
      sound('ww2.p51', { x: m.over.x - m.dir * 10, y: m.over.y + 8, z: m.over.z }, 5, 1);
    }
    if (rel > -12 && rel < 12 && m.lead && now() % 10 === 0) {
      for (const p of players()) if (dist(p.location, l) < 40) cmd(p, 'camerashake add @s 0.15 0.5 positional');
    }
    if (rel > 90 || now() - m.born > 400) { safe(() => m.e.remove()); mustangs.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------------
// Flak 38
// ---------------------------------------------------------------------------
function airTargets() {
  const out = [];
  for (const p of planes) if (p.pos && valid(p.e)) out.push(p.pos);
  if (HUB.intro) for (const c of HUB.intro.planeCenters()) { out.push(c); out.push(c); }
  return out;
}

function aimFlak(flak, aim) {
  const f = flak.location;
  try { flak.teleport(f, { facingLocation: { x: aim.x, y: f.y, z: aim.z } }); } catch { /* ignore */ }
  const pitch = Math.atan2(aim.y - (f.y + 1.1), Math.max(0.1, dist2d(aim, f))) * 180 / Math.PI;
  setProp(flak, 'ww2:pitch', Math.max(-8, Math.min(88, Math.round(pitch))));
}

function fireShell(flak, aim, airburst, opts = {}) {
  const muzzle = opts.from ?? add(flak.location, { x: 0, y: 1.15, z: 0 });
  const dir = norm(sub(aim, muzzle));
  const start = opts.from ? muzzle : add(muzzle, mul(dir, 2.9));
  let s;
  try { s = dim().spawnEntity('ww2:flak_shell', start); } catch { return; }
  const speed = opts.speed ?? 3.4;
  try {
    const pc = s.getComponent('minecraft:projectile');
    if (pc) { safe(() => { pc.owner = flak; }); pc.shoot(mul(dir, speed)); } else s.applyImpulse(mul(dir, speed));
  } catch { safe(() => s.applyImpulse(mul(dir, speed))); }
  const fuse = airburst ? Math.max(4, Math.floor(dist(aim, start) / speed) + randi(-3, 2)) : 70;
  shells.set(s.id, { e: s, fuse: opts.fuse ?? fuse, air: airburst, power: opts.power ?? 1.4, src: flak });
  particle('ww2:muzzle_flash', start);
  if (opts.big) { particle('ww2:flak_flash', start); particle('ww2:flak_smoke', start); }
  sound(opts.sound ?? 'ww2.flak_shot', muzzle, opts.big ? 5 : 3, rand(0.9, 1.1));
}

function tickFlak() {
  if (!HUB.battle) return;
  const t = now();
  const targets = airTargets();
  for (const f of HUB.battle.liveFlaks()) {
    const e = f.e;
    if (f.kind !== 'flak') continue;
    let st = flakState.get(e.id);
    if (!st) { st = { next: t + randi(10, 60), burst: 0, aim: null }; flakState.set(e.id, st); }
    if (t < st.next) continue;
    const near = targets.filter((p) => dist2d(p, e.location) < 120);
    if (near.length) {
      if (st.burst <= 0) {
        const tgt = pick(near);
        st.aim = add(tgt, { x: rand(-8, 8), y: rand(-5, 6), z: rand(-8, 8) });
        st.burst = randi(3, 5);
        aimFlak(e, st.aim);
      }
      fireShell(e, add(st.aim, { x: rand(-2, 2), y: rand(-2, 2), z: rand(-2, 2) }), true);
      st.burst--;
      st.next = st.burst > 0 ? t + 3 : t + randi(16, 40);
    } else if (HUB.battle.phase() !== 'air') {
      // modo terrestre: atira em paraquedistas e jogadores próximos
      const enemy = HUB.battle.nearestUSTarget(e.location, 38);
      if (!enemy || HUB.battle.crewCount(f.idx) === 0) { st.next = t + 40; continue; }
      const aim = add(enemy.location, { x: rand(-1.5, 1.5), y: 0.8, z: rand(-1.5, 1.5) });
      aimFlak(e, aim);
      if (st.burst <= 0) st.burst = 2;
      fireShell(e, aim, false);
      st.burst--;
      st.next = st.burst > 0 ? t + 5 : t + randi(50, 90);
    } else {
      st.next = t + 20;
    }
  }
}

function flakBurst(loc) {
  particle('ww2:flak_flash', loc);
  particle('ww2:flak_smoke', loc);
  sound('ww2.flak_burst', loc, 4, rand(0.8, 1.15));
  for (const p of players()) {
    const d = dist(p.location, loc);
    if (d < 24) cmd(p, `camerashake add @s ${(0.35 * (1 - d / 24)).toFixed(2)} 0.6 positional`);
    if (d < 14 && HUB.intro && HUB.intro.inPlane(p)) sound('ww2.clank', p.location, 0.6, rand(0.8, 1.3));
  }
  try {
    for (const e of dim().getEntities({ location: loc, maxDistance: 3.5 })) {
      if (e.typeId === 'ww2:c47' || e.typeId === 'ww2:parachute' || e.typeId === 'ww2:propeller' || e.typeId === 'minecraft:player') continue;
      if (e.typeId === 'ww2:us_paratrooper' || e.typeId === 'ww2:german_soldier') {
        const inChute = !!safe(() => e.getComponent('minecraft:riding')?.entityRidingOn);
        safe(() => e.applyDamage(inChute ? 1 : 3));
      }
    }
  } catch { /* ignore */ }
}

function groundImpact(loc, flak, power = 1.4) {
  particle('ww2:explosion', loc);
  if (power > 2) particle('ww2:flak_smoke', loc);
  sound('ww2.explosion', loc, power > 2 ? 3 : 2, power > 2 ? rand(0.9, 1.1) : rand(1.2, 1.5));
  try { dim().createExplosion(loc, power, { breaksBlocks: false, causesFire: false, source: valid(flak) ? flak : undefined }); } catch { /* ignore */ }
}

function onShellHit(projectile, loc) {
  const id = safe(() => projectile.id);
  const d = id !== undefined ? shells.get(id) : undefined;
  if (d) { if (d.handled) return; d.handled = true; shells.delete(id); }
  if (d && d.air) { flakBurst(loc); return; }
  groundImpact(loc, d && d.src, d ? d.power : 1.4);
}

function tickShells() {
  for (const [id, s] of shells) {
    if (!valid(s.e)) {
      // removido ao acertar algo (o evento de impacto pode não ter chegado)
      shells.delete(id);
      if (!s.handled && s.last) { s.handled = true; if (s.air) flakBurst(s.last); else groundImpact(s.last, s.src, s.power); }
      continue;
    }
    s.last = safe(() => ({ ...s.e.location }), s.last);
    if (--s.fuse <= 0) {
      s.handled = true;
      const loc = { ...s.e.location };
      shells.delete(id);
      safe(() => s.e.remove());
      if (s.air) flakBurst(loc); else groundImpact(loc, s.src, s.power);
    }
  }
}

// ---------------------------------------------------------------------------
// Atmosfera durante o voo (nuvens passando, vento na porta, motores, flak distante)
// ---------------------------------------------------------------------------
function tickAtmosphere() {
  if (!HUB.intro) return;
  const t = now();
  for (const fl of HUB.intro.flights()) {
    const c = fl.center;
    if (t % 9 === 0) particle('ww2:cloud', add(c, { x: 55, y: rand(-30, 6), z: rand(-60, 60) }));
    if (t % 3 === 0) particle('ww2:wind', add(fl.door, { x: rand(-1, 3), y: rand(0, 2.5), z: rand(-2.5, -0.8) }));
    if (t % 88 === 0) {
      sound('ww2.engine', add(c, { x: 7, y: -1, z: 6 }), 1.6, 1);
      sound('ww2.engine', add(c, { x: 7, y: -1, z: -5 }), 1.6, 0.97);
    }
    if (t % 96 === 0) sound('ww2.wind', fl.door, 0.9, 1);
    if (t % 100 === 0 && fl.player && fl.onboard) cmd(fl.player, 'camerashake add @s 0.06 5.5 positional');
    if (fl.flak && t % randi(20, 45) === 0) {
      const off = { x: rand(-45, 45), y: rand(-10, 14), z: rand(-45, 45) };
      if (Math.hypot(off.x, off.z) > 14) flakBurst(add(c, off));
    }
  }
}

export function tick() {
  tickMustangs();
  tickPlanes();
  tickShells();
  tickFlak();
  tickAtmosphere();
}

export function removeAll() {
  for (const m of mustangs) safe(() => m.e.remove());
  mustangs.length = 0;
  for (const p of planes) safe(() => p.e.remove());
  planes.length = 0;
}

HUB.air = { mustangPass, fireShell, groundImpact, aimGun: aimFlak, spawnFormation, startDrops, flyAway, addDeparting, reinforcement, onShellHit, removeAll,
  planeCount: () => planes.length };
