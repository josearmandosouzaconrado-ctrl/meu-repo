// Paraquedas T-5: física de descida, direção (olhando) e pouso.
import { dim, valid, safe, sound, setProp, add, rand, findGround, actionbar, now } from './util.js';

const chutes = new Map(); // chute.id -> data
const DESCENT = 0.21;      // blocos por tick (~4,2 b/s)
const STEER = 0.13;

/**
 * Abre um paraquedas para `rider` (jogador ou soldado de IA).
 * opts: { target?: {x,z}, onLand?: (rider, loc) => void, isPlayer?: bool }
 */
export function deploy(rider, opts = {}) {
  if (!valid(rider)) return;
  let chute;
  try {
    chute = dim().spawnEntity('ww2:parachute', rider.location);
  } catch {
    return;
  }
  const data = { chute, rider, isPlayer: !!opts.isPlayer, target: opts.target, onLand: opts.onLand,
    born: now(), still: 0, remounts: 0, last: { ...rider.location }, drift: { x: rand(-0.03, 0.03), z: rand(-0.03, 0.03) } };
  chutes.set(chute.id, data);
  mount(data);
  if (!data.isPlayer) setProp(rider, 'ww2:state', 4);
  sound('ww2.chute_open', rider.location, 1.2, rand(0.9, 1.1));
}

function mount(data) {
  const rc = safe(() => data.chute.getComponent('minecraft:rideable'));
  if (rc) safe(() => rc.addRider(data.rider));
}

function riding(data) {
  const r = safe(() => data.rider.getComponent('minecraft:riding'));
  const on = safe(() => r && r.entityRidingOn);
  return !!on && safe(() => on.id === data.chute.id, false);
}

export function isRiding(entity) {
  for (const d of chutes.values()) if (d.rider === entity || safe(() => d.rider.id === entity.id, false)) return true;
  return false;
}

function land(data, reason) {
  chutes.delete(safe(() => data.chute.id));
  const rc = safe(() => data.chute.getComponent('minecraft:rideable'));
  safe(() => rc.ejectRiders());
  const loc = valid(data.chute) ? { ...data.chute.location } : (valid(data.rider) ? { ...data.rider.location } : undefined);
  safe(() => data.chute.remove());
  if (valid(data.rider)) {
    if (reason === 'air') {
      safe(() => data.rider.addEffect('slow_falling', 200, { amplifier: 0, showParticles: false }));
    }
    if (data.onLand) safe(() => data.onLand(data.rider, loc));
  }
}

export function tick() {
  for (const data of [...chutes.values()]) {
    if (!valid(data.chute)) {
      chutes.delete(data.chute?.id);
      if (valid(data.rider)) safe(() => data.rider.addEffect('slow_falling', 300, { amplifier: 0, showParticles: false }));
      if (data.onLand && valid(data.rider)) safe(() => data.onLand(data.rider, data.rider.location));
      continue;
    }
    if (!valid(data.rider)) {
      chutes.delete(data.chute.id);
      safe(() => data.chute.remove());
      continue;
    }
    const c = data.chute.location;
    const g = findGround(c.x, c.z, Math.floor(c.y), Math.floor(c.y) - 6);
    const groundNear = g && c.y - g.y < 0.6;
    if (groundNear || safe(() => data.chute.isOnGround, false) || now() - data.born > 2400) {
      land(data, 'ground');
      continue;
    }
    if (!riding(data)) {
      // jogador apertou "agachar": reconecta enquanto estiver alto
      if (data.isPlayer && data.remounts < 4 && (!g || c.y - g.y > 5)) {
        data.remounts++;
        safe(() => data.chute.teleport(data.rider.location));
        mount(data);
        if (data.remounts === 1) actionbar(data.rider, '§eNão solte o paraquedas no ar!');
      } else {
        land(data, 'air');
        continue;
      }
    }
    // direção
    let hx = data.drift.x, hz = data.drift.z;
    if (data.isPlayer) {
      const dir = safe(() => data.rider.getViewDirection(), { x: 0, y: 0, z: 0 });
      const h = Math.hypot(dir.x, dir.z);
      if (h > 0.05) { hx += dir.x / h * STEER; hz += dir.z / h * STEER; }
    } else if (data.target) {
      const dx = data.target.x - c.x, dz = data.target.z - c.z;
      const h = Math.hypot(dx, dz);
      if (h > 1.5) { hx += dx / h * Math.min(STEER * 0.9, h * 0.02); hz += dz / h * Math.min(STEER * 0.9, h * 0.02); }
    }
    const vy = (now() - data.born) < 12 ? -0.45 + (now() - data.born) * 0.02 : -DESCENT;
    try {
      data.chute.clearVelocity();
      data.chute.applyImpulse({ x: hx, y: vy, z: hz });
    } catch { /* ignore */ }
    // preso em árvore?
    const moved = Math.abs(c.y - data.last.y) + Math.abs(c.x - data.last.x) + Math.abs(c.z - data.last.z);
    data.still = moved < 0.02 ? data.still + 1 : 0;
    data.last = { ...c };
    if (data.still > 30) land(data, 'air');
    if (data.isPlayer && now() % 20 === 0 && g) {
      actionbar(data.rider, `§fAltitude: §e${Math.max(0, Math.round(c.y - g.y))} m  §7| Olhe para onde quer planar`);
    }
  }
}

export function cleanupAll() {
  for (const d of chutes.values()) land(d, 'air');
  chutes.clear();
}

export function offsetLoc(loc, dy) { return add(loc, { x: 0, y: dy, z: 0 }); }
