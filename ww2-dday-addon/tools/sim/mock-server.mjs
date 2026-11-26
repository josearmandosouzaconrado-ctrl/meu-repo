// Simulador mínimo da API @minecraft/server para testar os scripts fora do jogo.
// Não reproduz o Minecraft: só o suficiente para executar a lógica e pegar erros.
let tick = 0;
let nextId = 1;
const log = [];
export const SIM = { log, entities: new Map(), blocks: new Map(), commands: [], messages: [], groundY: 64, errors: [] };

function ev() {
  const subs = [];
  return { subscribe: (fn) => { subs.push(fn); return fn; }, unsubscribe: () => {}, _fire: (e) => subs.forEach((f) => f(e)) };
}

const key = (l) => `${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`;

export class BlockPermutation {
  constructor(type, states) { this.type = { id: type }; this.states = states || {}; }
  static resolve(id, states) {
    if (!id.startsWith('minecraft:')) throw new Error('bad block ' + id);
    if (states && states.pillar_axis && id !== 'minecraft:chain') throw new Error('bad state');
    return new BlockPermutation(id, states);
  }
}

class Block {
  constructor(loc) { this.location = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) }; }
  get typeId() {
    const k = key(this.location);
    if (SIM.blocks.has(k)) return SIM.blocks.get(k);
    if (this.location.y < SIM.groundY - 1) return 'minecraft:stone';
    if (this.location.y === SIM.groundY - 1) return 'minecraft:grass_block';
    return 'minecraft:air';
  }
  get isLiquid() { return false; }
  get isAir() { return this.typeId === 'minecraft:air'; }
  setPermutation(p) { SIM.blocks.set(key(this.location), p.type.id); }
  setType(t) { SIM.blocks.set(key(this.location), t); }
}

function solidAt(l) {
  const t = new Block(l).typeId;
  return t !== 'minecraft:air' && t !== 'minecraft:barrier_air' && !t.includes('chain');
}

class Container {
  constructor(n) { this.size = n; this.items = new Array(n).fill(undefined); }
  getItem(i) { return this.items[i]; }
  setItem(i, it) { this.items[i] = it; }
  addItem(it) { const i = this.items.findIndex((x) => !x); if (i >= 0) this.items[i] = it; return undefined; }
}

export class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; }
}

export class Entity {
  constructor(typeId, loc) {
    this.id = String(nextId++);
    this.typeId = typeId;
    this.location = { ...loc };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.tags = new Set();
    this.props = {};
    this.dyn = {};
    this.nameTag = '';
    this.valid = true;
    this.riders = [];
    this.mount = null;
    this.rotation = { x: 0, y: 0 };
    this.health = typeId === 'ww2:us_paratrooper' ? 30 : 20;
    this.effects = {};
    this.events = [];
    this.isSneaking = false;
    this.dimension = DIM;
    this.gravity = ['minecraft:player', 'ww2:us_paratrooper', 'ww2:german_soldier', 'ww2:flak38'].includes(typeId);
    if (typeId === 'ww2:us_paratrooper') this.props['ww2:state'] = 5;
    SIM.entities.set(this.id, this);
  }
  isValid() { return this.valid; }
  get isOnGround() { return solidAt({ x: this.location.x, y: this.location.y - 0.05, z: this.location.z }); }
  teleport(loc, opts) { this._chk(); if (this.mount) { this.mount.riders = this.mount.riders.filter((r) => r !== this); this.mount = null; } this.location = { ...loc }; if (opts && opts.rotation) this.rotation = opts.rotation; }
  setRotation(r) { this.rotation = r; }
  getRotation() { return this.rotation; }
  applyImpulse(v) { this._chk(); if (this.typeId === 'minecraft:player') throw new Error('applyImpulse on player'); this.velocity.x += v.x; this.velocity.y += v.y; this.velocity.z += v.z; }
  applyKnockback(x, z, h, v) { this.velocity.x += x * h; this.velocity.z += z * h; this.velocity.y += v; }
  clearVelocity() { this.velocity = { x: 0, y: 0, z: 0 }; }
  getVelocity() { return this.velocity; }
  _chk() { if (!this.valid) throw new Error('Entity invalid ' + this.typeId); }
  getComponent(name) {
    this._chk();
    const self = this;
    switch (name) {
      case 'minecraft:rideable':
        if (this.typeId !== 'ww2:parachute') return undefined;
        return { addRider(r) { if (r.mount) return false; r.mount = self; self.riders.push(r); r.location = { ...self.location }; return true; },
          ejectRiders() { for (const r of self.riders) r.mount = null; self.riders = []; }, getRiders: () => self.riders };
      case 'minecraft:riding':
        return this.mount ? { entityRidingOn: this.mount } : undefined;
      case 'minecraft:health':
        return { get currentValue() { return self.health; }, effectiveMax: this.typeId === 'ww2:us_paratrooper' ? 30 : 20,
          setCurrentValue(v) { self.health = v; } };
      case 'minecraft:projectile':
        if (!this.typeId.includes('bullet') && !this.typeId.includes('shell')) return undefined;
        return { owner: undefined, shoot(v) { self.velocity = { ...v }; } };
      case 'minecraft:inventory':
        if (!this.container) this.container = new Container(36);
        return { container: this.container };
      case 'minecraft:equippable':
        if (!this.container) this.container = new Container(36);
        return { getEquipment: () => self.container.items[0], setEquipment: (s, it) => { self.container.items[0] = it; } };
      default: return undefined;
    }
  }
  triggerEvent(e) {
    this._chk();
    this.events.push(e);
    if (e === 'ww2:to_ground') this.props['ww2:state'] = 5;
    if (e === 'ww2:to_plane') this.props['ww2:state'] = 0;
    if (e.startsWith('ww2:mode_')) this.props['ww2:aim'] = e === 'ww2:mode_combat';
    if (!/^ww2:(to_|mode_|weapon_)/.test(e)) throw new Error('unknown event ' + e);
  }
  setProperty(k, v) { this._chk(); if (!k.startsWith('ww2:')) throw new Error('bad prop'); this.props[k] = v; }
  getProperty(k) { this._chk(); return this.props[k]; }
  setDynamicProperty(k, v) { this.dyn[k] = v; }
  getDynamicProperty(k) { return this.dyn[k]; }
  addTag(t) { this.tags.add(t); return true; }
  removeTag(t) { return this.tags.delete(t); }
  hasTag(t) { return this.tags.has(t); }
  getTags() { return [...this.tags]; }
  remove() { this.valid = false; for (const r of this.riders) r.mount = null; if (this.mount) this.mount.riders = this.mount.riders.filter((r) => r !== this); SIM.entities.delete(this.id); }
  kill() { this.remove(); return true; }
  addEffect(t, d, o) { this.effects[t] = d; }
  removeEffect(t) { delete this.effects[t]; }
  applyDamage(n) { this.health -= n; if (this.health <= 0) { const e = this; this.remove(); world.afterEvents.entityDie._fire({ deadEntity: e, damageSource: {} }); } return true; }
  getViewDirection() { return { x: 0.3, y: -0.4, z: 0.86 }; }
  getHeadLocation() { return { x: this.location.x, y: this.location.y + 1.6, z: this.location.z }; }
  matches() { return true; }
  runCommand(c) { SIM.commands.push(c); return { successCount: 1 }; }
  playSound() {}
  sendMessage(m) { SIM.messages.push(m); }
  getBlockFromViewDirection() { return { block: new Block({ x: this.location.x + 5, y: SIM.groundY - 1, z: this.location.z + 5 }) }; }
  getEntitiesFromViewDirection() { return []; }
}

class Player extends Entity {
  constructor(name, loc) {
    super('minecraft:player', loc);
    this.name = name;
    this.health = 20;
    this.onScreenDisplay = { setTitle: (t, o) => SIM.log.push(['title', t, o && o.subtitle]), setActionBar: () => {} };
  }
}

const DIM = {
  id: 'minecraft:overworld',
  heightRange: { min: -64, max: 320 },
  getBlock(l) { return new Block(l); },
  spawnEntity(id, loc) {
    if (!id.startsWith('ww2:')) throw new Error('spawn ' + id);
    const e = new Entity(id, loc);
    world.afterEvents.entitySpawn._fire({ entity: e, cause: 'Spawned' });
    return e;
  },
  getEntities(o = {}) {
    let list = [...SIM.entities.values()].filter((e) => e.valid);
    if (o.type) list = list.filter((e) => e.typeId === o.type);
    if (o.tags) list = list.filter((e) => o.tags.every((t) => e.tags.has(t)));
    if (o.families) {
      const fam = { 'ww2:us_paratrooper': ['us_army'], 'ww2:german_soldier': ['german', 'monster'], 'minecraft:player': ['player'] };
      list = list.filter((e) => o.families.every((f) => (fam[e.typeId] || []).includes(f)));
    }
    if (o.location && o.maxDistance !== undefined) {
      list = list.filter((e) => Math.hypot(e.location.x - o.location.x, e.location.y - o.location.y, e.location.z - o.location.z) <= o.maxDistance);
    }
    return list;
  },
  spawnParticle(id) { if (!id.includes(':')) throw new Error('particle'); },
  runCommand(c) { SIM.commands.push(c); return { successCount: 1 }; },
  createExplosion() { return true; },
};

const scoreboardObjs = new Map();
export const world = {
  afterEvents: {
    playerSpawn: ev(), playerLeave: ev(), entityDie: ev(), entityHurt: ev(), entitySpawn: ev(),
    projectileHitBlock: ev(), projectileHitEntity: ev(), itemUse: ev(), itemStartUse: ev(), itemStopUse: ev(),
    itemReleaseUse: ev(),
  },
  _dyn: {},
  getDimension() { return DIM; },
  getAllPlayers() { return [...SIM.entities.values()].filter((e) => e.typeId === 'minecraft:player' && e.valid); },
  getPlayers() { return this.getAllPlayers(); },
  getDynamicProperty(k) { return this._dyn[k]; },
  setDynamicProperty(k, v) { if (v !== undefined && typeof v === 'string' && v.length > 32767) throw new Error('too big'); this._dyn[k] = v; },
  setTimeOfDay() {},
  sendMessage(m) { SIM.messages.push(m); },
  playSound(id) { if (!id) throw new Error('sound'); },
  scoreboard: {
    getObjective: (id) => scoreboardObjs.get(id),
    addObjective: (id, name) => { const o = { id, name, scores: {}, setScore(p, v) { this.scores[p] = v; } }; scoreboardObjs.set(id, o); return o; },
    setObjectiveAtDisplaySlot: () => {},
    removeObjective: (id) => scoreboardObjs.delete(id),
  },
};

const intervals = [];
const timeouts = [];
export const system = {
  get currentTick() { return tick; },
  runInterval(fn, n = 1) { intervals.push({ fn, n }); return intervals.length; },
  runTimeout(fn, n = 1) { timeouts.push({ fn, at: tick + n }); return timeouts.length; },
  run(fn) { return this.runTimeout(fn, 1); },
  afterEvents: { scriptEventReceive: ev() },
};

function physics() {
  for (const e of [...SIM.entities.values()]) {
    if (!e.valid) continue;
    if (e.mount) {
      e.location = { ...e.mount.location };
      continue;
    }
    const proj = e.typeId.includes('bullet') || e.typeId.includes('shell');
    if (e.gravity && !e.isOnGround) e.velocity.y = Math.max(-3.9, e.velocity.y - 0.08);
    const next = { x: e.location.x + e.velocity.x, y: e.location.y + e.velocity.y, z: e.location.z + e.velocity.z };
    if (solidAt(next) && (e.gravity || proj || e.typeId === 'ww2:parachute')) {
      if (proj) {
        e.remove();
        world.afterEvents.projectileHitBlock._fire({ projectile: e, location: next, source: undefined });
        continue;
      }
      next.y = Math.floor(next.y) + 1;
      e.velocity = { x: 0, y: 0, z: 0 };
    }
    e.location = next;
    if (proj) { e.age = (e.age || 0) + 1; if (e.age > 60) e.remove(); }
    else if (!e.gravity && e.typeId !== 'ww2:parachute') e.velocity = { x: 0, y: 0, z: 0 };
    else if (e.typeId === 'ww2:parachute') { /* impulses are reset by the script each tick */ }
    else { e.velocity.x *= 0.6; e.velocity.z *= 0.6; }
  }
}

export function step(n = 1) {
  for (let i = 0; i < n; i++) {
    tick++;
    for (let j = timeouts.length - 1; j >= 0; j--) {
      if (timeouts[j].at <= tick) { const t = timeouts.splice(j, 1)[0]; t.fn(); }
    }
    for (const iv of intervals) if (tick % iv.n === 0) iv.fn();
    physics();
  }
}

export function addPlayer(name, loc) {
  const p = new Player(name, loc);
  world.afterEvents.playerSpawn._fire({ player: p, initialSpawn: true });
  return p;
}

export const EntityComponentTypes = {};
export const EquipmentSlot = { Mainhand: 'Mainhand' };
export { tick };
