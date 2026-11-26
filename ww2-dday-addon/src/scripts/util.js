import { world, system, BlockPermutation } from '@minecraft/server';

export const dim = () => world.getDimension('overworld');
export const now = () => system.currentTick;

export const V = (x, y, z) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist = (a, b) => len(sub(a, b));
export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n) => (Math.round(n * 100) / 100).toString();

export function valid(e) {
  try { return !!e && e.isValid(); } catch { return false; }
}

export function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** Run a slash command on a dimension or entity, compatible with every 1.x API level. */
export function cmd(target, c) {
  try {
    if (typeof target.runCommand === 'function') return target.runCommand(c);
  } catch { /* fall through */ }
  try {
    if (typeof target.runCommandAsync === 'function') return target.runCommandAsync(c);
  } catch { /* ignore */ }
  return undefined;
}

export function sound(id, loc, vol = 1, pitch = 1) {
  try {
    world.playSound(id, loc, { volume: vol, pitch });
    return;
  } catch { /* fallback below */ }
  cmd(dim(), `playsound ${id} @a ${fmt(loc.x)} ${fmt(loc.y)} ${fmt(loc.z)} ${vol} ${pitch}`);
}

export function soundTo(player, id, vol = 1, pitch = 1, loc) {
  try { player.playSound(id, { volume: vol, pitch, location: loc }); } catch { /* ignore */ }
}

export function particle(id, loc) {
  try { dim().spawnParticle(id, loc); } catch { /* unloaded chunk */ }
}

export function msgAll(text) {
  try { world.sendMessage(text); } catch { /* ignore */ }
}

export function players() {
  try { return world.getAllPlayers(); } catch { return []; }
}

export function nearestPlayer(loc) {
  let best, bd = 1e9;
  for (const p of players()) {
    const d = dist(p.location, loc);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
const permCache = new Map();

export function perm(ids, states) {
  const key = ids.join('|') + JSON.stringify(states || {});
  if (permCache.has(key)) return permCache.get(key);
  let p;
  for (const id of ids) {
    if (states) p = safe(() => BlockPermutation.resolve(id, states));
    if (!p) p = safe(() => BlockPermutation.resolve(id));
    if (p) break;
  }
  permCache.set(key, p);
  return p;
}

/** returns true on success, false when the chunk is not loaded */
export function setBlock(loc, permutation) {
  const b = safe(() => dim().getBlock(loc));
  if (!b) return false;
  try { b.setPermutation(permutation); } catch { return false; }
  return true;
}

const NOT_GROUND = ['leaves', 'log', 'wood', 'short_grass', 'tall_grass', 'tallgrass', 'seagrass', 'flower', 'fern', 'bush', 'vine', 'snow_layer', 'tallgrass',
  'sapling', 'mushroom', 'torch', 'carpet', 'sugar_cane', 'kelp', 'seagrass', 'water', 'lava', 'bamboo', 'cactus',
  'glass', 'barrier', 'chain', 'slab', 'froglight', 'concrete', 'terracotta', 'planks', 'barrel', 'wool', 'lantern'];

export function isGroundBlock(b) {
  if (!b) return false;
  const id = b.typeId;
  if (id === 'minecraft:air' || id === 'minecraft:cave_air' || id === 'minecraft:void_air') return false;
  if (safe(() => b.isLiquid, false)) return false;
  for (const w of NOT_GROUND) if (id.includes(w)) return false;
  return true;
}

export function isPassable(b) {
  if (!b) return false;
  const id = b.typeId;
  if (id.endsWith('air')) return true;
  return ['short_grass', 'tall_grass', 'flower', 'fern', 'tallgrass', 'sapling', 'snow_layer', 'bush', 'dandelion', 'poppy', 'tulip']
    .some((w) => id.includes(w));
}

/**
 * Scan downwards for the first walkable ground block.
 * Returns { y: standingY, water: bool } or undefined if the column is not loaded.
 */
export function findGround(x, z, fromY, minY) {
  const d = dim();
  const top = Math.min(fromY, d.heightRange.max - 1);
  const bottom = Math.max(minY ?? d.heightRange.min, d.heightRange.min);
  for (let y = top; y >= bottom; y--) {
    const b = safe(() => d.getBlock({ x: Math.floor(x), y, z: Math.floor(z) }));
    if (!b) return undefined;
    const id = b.typeId;
    if (id.endsWith('air')) continue;
    if (safe(() => b.isLiquid, false)) return { y: y + 1, water: true };
    if (id.includes('leaves')) return { y: y + 1, leaves: true };
    if (isGroundBlock(b)) return { y: y + 1, water: false };
  }
  return undefined;
}

export function compass(from, to) {
  const ang = Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI; // 0 = north (-Z), 90 = east (+X)
  const names = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
  return names[(Math.round(((ang + 360) % 360) / 45)) % 8];
}

export function hp(e) {
  const h = safe(() => e.getComponent('minecraft:health'));
  if (!h) return { cur: 0, max: 1 };
  return { cur: h.currentValue, max: h.effectiveMax ?? h.defaultValue ?? 20, comp: h };
}

export function mainhand(player) {
  const eq = safe(() => player.getComponent('minecraft:equippable'));
  if (eq) {
    const it = safe(() => eq.getEquipment('Mainhand'));
    return { item: it, set: (i) => safe(() => eq.setEquipment('Mainhand', i)) };
  }
  const inv = safe(() => player.getComponent('minecraft:inventory').container);
  const slot = safe(() => player.selectedSlotIndex ?? player.selectedSlot, 0);
  return { item: safe(() => inv.getItem(slot)), set: (i) => safe(() => inv.setItem(slot, i)) };
}

export function consumeMainhand(player) {
  const mh = mainhand(player);
  if (!mh.item) return;
  if (mh.item.amount > 1) {
    mh.item.amount -= 1;
    mh.set(mh.item);
  } else {
    mh.set(undefined);
  }
}

export function teleportFacing(e, loc, face) {
  try {
    if (face) e.teleport(loc, { facingLocation: face });
    else e.teleport(loc);
  } catch { /* ignore */ }
}

export function setProp(e, k, v) {
  try { if (e.getProperty(k) !== v) e.setProperty(k, v); } catch { /* ignore */ }
}

export function title(player, t, sub, fadeIn = 10, stay = 60, fadeOut = 20) {
  try {
    player.onScreenDisplay.setTitle(t, { subtitle: sub ?? '', fadeInDuration: fadeIn, stayDuration: stay, fadeOutDuration: fadeOut });
  } catch {
    cmd(player, `title @s title ${t}`);
  }
}

export function actionbar(player, text) {
  try { player.onScreenDisplay.setActionBar(text); } catch { /* ignore */ }
}

export function getJSON(key, fallback) {
  const raw = safe(() => world.getDynamicProperty(key));
  if (typeof raw !== 'string') return fallback;
  return safe(() => JSON.parse(raw), fallback);
}

export function setJSON(key, value) {
  try { world.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value)); } catch { /* ignore */ }
}
