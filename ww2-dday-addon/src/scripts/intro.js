// Primeira entrada no mundo: o jogador acorda dentro de um C-47 sobre a Normandia.
import { world, ItemStack } from '@minecraft/server';
import { PLANE_BLOCKS, PLANE_CELLS, PLANE_META } from './plane_layout.js';
import { CFG, T, US_NAMES, JUMPMASTER, CHATTER } from './config.js';
import { HUB } from './hub.js';
import * as Chute from './parachute.js';
import {
  dim, now, add, dist, rand, randi, pick, valid, safe, sound, soundTo, cmd, perm, setBlock, findGround, setProp,
  title, actionbar, teleportFacing, getJSON, setJSON, fmt,
} from './util.js';

const sessions = new Map(); // player.id -> Session
let counter = 0;

const M = PLANE_META;
const L = (o, p) => ({ x: o.x + p[0], y: o.y + p[1], z: o.z + p[2] });

function say(player, who, text) {
  try { player.sendMessage(`§7[${who}]§f ${text}`); } catch { /* ignore */ }
}

class Session {
  constructor(player) {
    this.player = player;
    this.pid = player.id;
    this.sid = 'S' + (++counter);
    this.tag = 'ww2_intro_' + this.sid;
    this.phase = 'prep';
    this.t = 0;
    this.prep = 0;
    this.done = new Set();
    this.soldiers = [];
    this.pilots = [];
    this.props = [];
    this.jumpIdx = 0;
    this.nextJump = 0;
    this.start = { ...player.location };
    this.names = [...US_NAMES].sort(() => Math.random() - 0.5);
    this.later = [];
  }

  once(key) {
    if (this.done.has(key)) return false;
    this.done.add(key);
    return true;
  }

  // ------------------------------------------------------------------ setup
  computeOrigin() {
    const saved = getJSON('ww2:planes', {})[this.pid];
    if (saved && typeof saved.x === 'number') { this.O = saved; this.dz = saved.dz ?? { x: saved.x + 7, y: saved.y - CFG.PLANE_ALTITUDE, z: saved.z }; return true; }
    const p = this.start;
    const fromY = Math.min(dim().heightRange.max - 1, Math.floor(p.y) + 60);
    let top = -999;
    let center;
    for (const [dx, dz] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16], [10, 10], [-10, -10]]) {
      const g = findGround(p.x + dx, p.z + dz, fromY);
      if (!g) return false;
      if (dx === 0 && dz === 0) center = g.y;
      top = Math.max(top, g.y);
    }
    const gx = Math.floor(p.x), gz = Math.floor(p.z);
    const y = Math.min(top + CFG.PLANE_ALTITUDE, dim().heightRange.max - 14);
    this.dz = { x: gx + 0.5, y: center, z: gz + 0.5 };
    const others = [...sessions.values()].filter((s) => s !== this && s.O).length;
    this.O = { x: gx - 7, y, z: gz + others * 44, dz: this.dz };
    const all = getJSON('ww2:planes', {});
    all[this.pid] = this.O;
    setJSON('ww2:planes', all);
    return true;
  }

  build() {
    const O = this.O;
    let ok = true;
    for (const [x, y, z, k] of PLANE_CELLS) {
      const def = PLANE_BLOCKS[k];
      if (!def) continue;
      let p = perm(def.ids, def.states);
      if (k === 'jl') p = perm(['minecraft:black_concrete']);
      if (!p) continue;
      if (!setBlock({ x: O.x + x, y: O.y + y, z: O.z + z }, p)) ok = false;
    }
    const air = perm(['minecraft:air']);
    for (let x = -10; x <= 23; x++) {
      for (let y = 1; y <= 4; y++) {
        for (let z = -2; z <= 2; z++) {
          const key = PLANE_CELLS_SET.has(`${x},${y},${z}`);
          if (!key && x >= 1 && x <= 20) setBlock({ x: O.x + x, y: O.y + y, z: O.z + z }, air);
        }
      }
    }
    const barrier = perm(['minecraft:barrier']);
    for (const c of M.door_cells) setBlock(L(O, c), barrier);
    return ok;
  }

  removePlane() {
    if (this.planeRemoved) return;
    this.planeRemoved = true;
    const air = perm(['minecraft:air']);
    const O = this.O;
    for (const [x, y, z] of PLANE_CELLS) setBlock({ x: O.x + x, y: O.y + y, z: O.z + z }, air);
    for (const c of M.door_cells) setBlock(L(O, c), air);
    for (const e of [...this.pilots, ...this.props]) safe(() => e.remove());
    this.pilots = []; this.props = [];
    const all = getJSON('ww2:planes', {});
    delete all[this.pid];
    setJSON('ww2:planes', all);
    if (HUB.air) HUB.air.addDeparting(this.sid, this.center());
  }

  center() { return L(this.O, M.center); }

  killOld() {
    try {
      for (const e of dim().getEntities({ location: this.center(), maxDistance: 60 })) {
        const tags = safe(() => e.getTags(), []);
        if (tags.some((t) => t.startsWith('ww2_intro_')) || e.typeId === 'ww2:propeller' || e.typeId === 'ww2:c47') safe(() => e.remove());
      }
    } catch { /* ignore */ }
  }

  spawnUS(loc, name, weaponEvent) {
    const e = dim().spawnEntity('ww2:us_paratrooper', loc);
    e.setDynamicProperty('ww2:managed', true);
    e.setDynamicProperty('ww2:squad', 0);
    e.triggerEvent('ww2:to_plane');
    if (weaponEvent) e.triggerEvent(weaponEvent);
    e.nameTag = name;
    e.addTag(this.tag);
    return e;
  }

  populate() {
    const O = this.O;
    const seats = M.ai_seats.slice(0, CFG.AI_STICK);
    const door = M.door;
    const order = seats.map((s, i) => ({ s, i, d: Math.hypot(s[0] - door[0], s[2] - door[2]) }))
      .sort((a, b) => a.d - b.d);
    order.forEach((o, k) => {
      const s = o.s;
      const loc = L(O, s);
      const face = L(O, [s[0], s[1], s[2] < 0 ? s[2] + 3 : s[2] - 3]);
      try {
        const e = this.spawnUS(loc, this.names[k % this.names.length],
          pick(['ww2:weapon_garand', 'ww2:weapon_garand', 'ww2:weapon_thompson', 'ww2:weapon_bar']));
        setProp(e, 'ww2:state', 0);
        teleportFacing(e, loc, face);
        this.soldiers.push({ e, order: k, local: { x: s[0], y: s[1], z: s[2] }, seat: s, path: [], name: e.nameTag, jumped: false });
      } catch { /* ignore */ }
    });
    try {
      const jm = this.spawnUS(L(O, M.jumpmaster), `${JUMPMASTER} (Mestre de Salto)`, 'ww2:weapon_thompson');
      setProp(jm, 'ww2:state', 1);
      teleportFacing(jm, L(O, M.jumpmaster), L(O, [8, 1.6, 0]));
      this.jm = jm;
    } catch { /* ignore */ }
    M.pilots.forEach((p, i) => {
      try {
        const e = this.spawnUS(L(O, p), i === 0 ? 'Piloto' : 'Copiloto', 'ww2:weapon_none');
        setProp(e, 'ww2:state', 0);
        teleportFacing(e, L(O, p), L(O, [p[0] + 5, p[1], p[2]]));
        this.pilots.push(e);
      } catch { /* ignore */ }
    });
    for (const p of M.props) {
      try {
        const e = dim().spawnEntity('ww2:propeller', L(O, p));
        e.teleport(L(O, p), { rotation: { x: 0, y: -90 } });
        e.addTag(this.tag);
        this.props.push(e);
      } catch { /* ignore */ }
    }
  }

  loadout() {
    const inv = safe(() => this.player.getComponent('minecraft:inventory').container);
    if (!inv) return;
    const has = (id) => {
      for (let i = 0; i < inv.size; i++) { const it = inv.getItem(i); if (it && it.typeId === id) return true; }
      return false;
    };
    const give = [['ww2:thompson', 1], ['ww2:m1_garand', 1], ['ww2:radio', 1], ['ww2:explosive', 3], ['ww2:medkit', 4]];
    for (const [id, n] of give) {
      if (!has(id)) safe(() => inv.addItem(new ItemStack(id, n)));
    }
  }

  // ------------------------------------------------------------------ helpers
  lights(id) {
    const p = perm([id]);
    for (const c of M.jump_lights) setBlock(L(this.O, c), p);
  }

  jmSay(text) { say(this.player, JUMPMASTER, `§l${text}`); }

  walkTo(s, points, state = 2, after) {
    s.path = points.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
    s.after = after;
    setProp(s.e, 'ww2:state', state);
  }

  stepSoldiers() {
    for (const s of this.soldiers) {
      if (s.jumped || !valid(s.e) || !s.path.length) continue;
      const tgt = s.path[0];
      const dx = tgt.x - s.local.x, dy = tgt.y - s.local.y, dz = tgt.z - s.local.z;
      const d = Math.hypot(dx, dy, dz);
      const sp = 0.16;
      if (d <= sp) {
        s.local = { ...tgt };
        s.path.shift();
      } else {
        s.local = { x: s.local.x + dx / d * sp, y: s.local.y + dy / d * sp, z: s.local.z + dz / d * sp };
      }
      const look = s.path.length ? s.path[0] : { x: s.local.x - 3, y: s.local.y, z: s.local.z };
      teleportFacing(s.e, L(this.O, [s.local.x, s.local.y, s.local.z]), L(this.O, [look.x, look.y + 1.5, look.z]));
      if (!s.path.length) {
        if (s.after) { const f = s.after; s.after = undefined; f(s); } else setProp(s.e, 'ww2:state', 1);
      }
    }
  }

  queueSpot(s) {
    const idx = s.order - this.jumpIdx;
    return M.queue[Math.max(0, idx)];
  }

  exitSoldier(s, isJm) {
    const e = s.e;
    s.jumped = true;
    try {
      e.removeTag(this.tag);
      e.addTag('ww2_unit');
      e.triggerEvent('ww2:to_air');
      setProp(e, 'ww2:state', 3);
      e.teleport(L(this.O, M.door_out));
      e.applyImpulse({ x: -0.18, y: 0.05, z: -0.32 });
    } catch { /* ignore */ }
    sound('ww2.wind', e.location, 0.6, 1.2);
    const lz = { x: this.dz.x + rand(-7, 7) + (isJm ? 0 : (s.order - 6) * 1.2), z: this.dz.z + rand(-7, 7) };
    const at = now() + 13;
    this.later.push({ at, fn: () => { if (valid(e)) Chute.deploy(e, { target: lz, onLand: (x) => HUB.battle && HUB.battle.landedUS(x, 0) }); } });
  }

  // ------------------------------------------------------------------ main loop
  tick() {
    const p = this.player;
    if (!valid(p)) { this.abort(); return; }
    for (let i = this.later.length - 1; i >= 0; i--) {
      if (now() >= this.later[i].at) { const f = this.later[i].fn; this.later.splice(i, 1); safe(f); }
    }
    if (this.phase === 'prep') return this.tickPrep();
    this.t++;
    this.stepSoldiers();
    const t = this.t;
    const O = this.O;
    if (this.phase === 'flight') this.tickFlight(t);
    if (this.phase === 'jump') this.tickJump(t);
    if (this.phase === 'turn') this.tickTurn(t);
    if (['flight', 'jump', 'turn'].includes(this.phase)) {
      // jogador saiu pela porta?
      if (p.location.y < O.y - 1.2) this.onPlayerExit();
    }
    if (this.phase === 'falling') this.tickFalling();
  }

  tickPrep() {
    const p = this.player;
    this.prep++;
    if (this.prep === 1 || this.prep % 40 === 0) {
      cmd(p, 'camera @s fade time 0 2.5 1 color 0 0 0');
      safe(() => p.addEffect('resistance', 20 * 240, { amplifier: 4, showParticles: false }));
      safe(() => p.addEffect('fire_resistance', 20 * 240, { amplifier: 0, showParticles: false }));
    }
    safe(() => p.teleport(this.start));
    if (!this.O) {
      if (!this.computeOrigin()) {
        if (this.prep > 200) { this.start = { ...p.location }; this.O = undefined; }
        return;
      }
      this.killOld();
    }
    if (!this.build() && this.prep < 160) return;
    this.populate();
    this.loadout();
    safe(() => world.setTimeOfDay(CFG.DAWN_TIME));
    cmd(dim(), 'weather clear');
    if (HUB.battle) HUB.battle.prepare(this.dz);
    if (HUB.air) HUB.air.spawnFormation(this.sid, this.center(), this.dz);
    // jogador no assento (último da fila)
    teleportFacing(p, L(this.O, M.player_seat), L(this.O, M.player_face));
    this.phase = 'flight';
    this.t = 0;
    this.startCinematic();
  }

  startCinematic() {
    const p = this.player;
    const O = this.O;
    const a = L(O, [-16, 5, -24]), fa = L(O, [8, 2, 0]);
    const b = L(O, [16, 0, -16]), fb = L(O, [3, 2, 0]);
    cmd(p, 'inputpermission set @s movement disabled');
    cmd(p, `camera @s set minecraft:free pos ${fmt(a.x)} ${fmt(a.y)} ${fmt(a.z)} facing ${fmt(fa.x)} ${fmt(fa.y)} ${fmt(fa.z)}`);
    cmd(p, `camera @s set minecraft:free ease 7 in_out_sine pos ${fmt(b.x)} ${fmt(b.y)} ${fmt(b.z)} facing ${fmt(fb.x)} ${fmt(fb.y)} ${fmt(fb.z)}`);
    cmd(p, 'camera @s fade time 0 0.3 1.5 color 0 0 0');
    title(p, '§l6 DE JUNHO DE 1944', '§7Céu da Normandia, França — 01:15', 20, 100, 30);
    sound('ww2.engine', this.center(), 2, 1);
  }

  tickFlight(t) {
    const p = this.player;
    if (t === T.CINE_END) {
      cmd(p, 'camera @s fade time 0.3 0.3 0.6 color 0 0 0');
    }
    if (t === T.CINE_END + 8) {
      cmd(p, 'camera @s clear');
      cmd(p, 'inputpermission set @s movement enabled');
      teleportFacing(p, L(this.O, M.player_seat), L(this.O, M.player_face));
      title(p, '§a101ª Divisão Aerotransportada', '§fVocê é o último da fila. Aguarde a luz verde.', 10, 70, 20);
    }
    if (t === T.CINE_END + 60) actionbar(p, '§eDica: o Rádio dá ordens ao seu pelotão depois do pouso.');
    // conversa no avião
    if (t > T.CINE_END + 40 && t < T.RED && t % 70 === 0) {
      const line = CHATTER[Math.floor(t / 70) % CHATTER.length];
      const who = line[0] === '%j' ? JUMPMASTER : (pick(this.soldiers)?.name ?? 'Pvt. Miller');
      say(p, who, line[1]);
    }
    if (t === T.RED) {
      this.lights('minecraft:red_concrete');
      sound('ww2.buzzer', this.center(), 0.6, 0.6);
      this.jmSay('LUZ VERMELHA! QUATRO MINUTOS PARA A ZONA DE SALTO!');
    }
    if (t === T.STAND) {
      this.jmSay('DE PÉ! (STAND UP!)');
      for (const s of this.soldiers) {
        const q = this.queueSpot(s);
        const mid = [s.seat[0], 1.0, -0.5];
        this.walkTo(s, [[s.seat[0], 1.5, s.seat[2] < 0 ? -1.0 : 1.8], mid, q], 2);
      }
    }
    if (t === T.HOOK) {
      this.jmSay('ENGANCHEM! (HOOK UP!)');
      for (let i = 0; i < 4; i++) this.later.push({ at: now() + i * 5, fn: () => sound('ww2.clank', this.center(), 0.7, rand(0.9, 1.2)) });
    }
    if (t === T.CHECK) this.jmSay('VERIFIQUEM O EQUIPAMENTO! (CHECK EQUIPMENT!)');
    if (t === T.COUNT) {
      this.jmSay('CONTAGEM! (SOUND OFF!)');
      const n = this.soldiers.length + 1;
      say(p, 'Você', `§e${n} OK!`);
      [...this.soldiers].sort((a, b) => b.order - a.order).forEach((s, i) => {
        this.later.push({ at: now() + 8 + i * 8, fn: () => say(p, s.name, `${s.order + 1} OK!`) });
      });
    }
    if (t === T.DOOR) {
      this.jmSay('FIQUEM NA PORTA! (STAND IN THE DOOR!)');
      const first = this.soldiers.find((s) => s.order === 0);
      if (first) this.walkTo(first, [M.door_inside], 2, (s) => setProp(s.e, 'ww2:state', 1));
    }
    if (t === T.GREEN) {
      this.lights('minecraft:lime_concrete');
      const air = perm(['minecraft:air']);
      for (const c of M.door_cells) setBlock(L(this.O, c), air);
      sound('ww2.buzzer', this.center(), 1.2, 1.0);
      this.jmSay('§aLUZ VERDE! VAI! VAI! VAI!');
      title(p, '§a§lLUZ VERDE!', '§fGO! GO! GO!', 5, 40, 10);
      this.phase = 'jump';
      this.jumpIdx = 0;
      this.nextJump = t;
      if (HUB.air) HUB.air.startDrops(this.sid);
      if (HUB.battle) HUB.battle.announceDrop();
    }
  }

  tickJump(t) {
    if (t < this.nextJump) return;
    const s = this.soldiers.find((x) => x.order === this.jumpIdx);
    this.nextJump = t + T.JUMP_GAP;
    if (!s) { this.phase = 'turn'; this.turnAt = t; this.onTurn(); return; }
    if (valid(s.e)) {
      this.walkTo(s, [M.door_inside, M.door, M.door_out], 2, (x) => this.exitSoldier(x));
    } else {
      s.jumped = true;
    }
    this.jumpIdx++;
    for (const o of this.soldiers) {
      if (o.jumped || o === s || o.order < this.jumpIdx) continue;
      const q = this.queueSpot(o);
      this.walkTo(o, [q], 2);
    }
  }

  onTurn() {
    const p = this.player;
    this.jmSay('SUA VEZ, SOLDADO! PULA! PULA!');
    title(p, '§e§lSUA VEZ!', '§fVá até a porta (luz verde) e pule!', 5, 60, 10);
    if (this.jm) teleportFacing(this.jm, L(this.O, [1.5, 1.0, -0.8]), L(this.O, M.door));
  }

  tickTurn(t) {
    const p = this.player;
    const since = t - this.turnAt;
    if (since > 0 && since % 160 === 0 && since < T.PUSH_AFTER) {
      this.jmSay(pick(['O que você tá esperando?! PULA!', 'Todo mundo já foi! VAI!', 'Não me faça te empurrar!']));
    }
    if (since % 30 === 0) actionbar(p, '§a>>> PORTA DE SALTO: lado esquerdo, no fundo do avião <<<');
    if (since === T.PUSH_AFTER) {
      this.jmSay('Desculpa, garoto... VAI!');
      teleportFacing(p, L(this.O, M.door_out), L(this.O, [M.door_out[0], 0, -10]));
      safe(() => p.applyKnockback(0, -1, 0.6, 0.1));
    }
  }

  onPlayerExit() {
    if (this.phase === 'falling') return;
    const p = this.player;
    this.phase = 'falling';
    this.exitAt = this.t;
    sound('ww2.wind', p.location, 1.2, 1.1);
    title(p, ' ', '§7Mil e um... mil e dois... mil e três...', 0, 30, 10);
    // pula quem ainda está no avião (caso o jogador tenha furado a fila)
    for (const s of this.soldiers) {
      if (!s.jumped && valid(s.e)) { s.path = []; this.exitSoldier(s); }
    }
    this.later.push({ at: now() + 11, fn: () => {
      if (!valid(p)) return;
      Chute.deploy(p, { isPlayer: true, onLand: () => this.finish('landed') });
      title(p, ' ', '§aParaquedas aberto!', 0, 30, 10);
    } });
    this.later.push({ at: now() + 40, fn: () => {
      if (this.jm && valid(this.jm)) this.exitSoldier({ e: this.jm, order: 6 }, true);
    } });
    this.later.push({ at: now() + 70, fn: () => HUB.air && HUB.air.flyAway(this.sid) });
  }

  tickFalling() {
    const p = this.player;
    if (!this.planeRemoved && (p.location.y < this.O.y - 22 || this.t - this.exitAt > 240)) this.removePlane();
    if (this.t - this.exitAt > 1800) this.finish('timeout');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    const p = this.player;
    if (!this.planeRemoved && this.O) {
      if (this.jm && valid(this.jm) && !this.jm.hasTag('ww2_unit')) this.exitSoldier({ e: this.jm, order: 6 }, true);
      for (const s of this.soldiers) if (!s.jumped && valid(s.e)) { s.path = []; this.exitSoldier(s); }
      const pending = this.later; this.later = [];
      for (const l of pending) safe(l.fn);
      this.removePlane();
      if (HUB.air) HUB.air.flyAway(this.sid);
    }
    sessions.delete(this.pid);
    if (valid(p)) {
      safe(() => p.setDynamicProperty('ww2:introDone', true));
      safe(() => p.removeEffect('resistance'));
      safe(() => p.addEffect('resistance', 600, { amplifier: 1, showParticles: false }));
      cmd(p, 'camera @s clear');
      cmd(p, 'inputpermission set @s movement enabled');
      if (reason === 'landed') {
        title(p, '§lNORMANDIA', '§fReúna seu pelotão! Segure o §eRádio§f para dar ordens.', 10, 80, 20);
        sound('ww2.radio', p.location, 1, 1);
      }
    }
    if (HUB.battle) HUB.battle.begin(this.dz, valid(p) ? p : undefined);
  }

  abort() {
    sessions.delete(this.pid);
    for (const s of this.soldiers) if (!s.jumped) safe(() => s.e.remove());
    for (const e of [...this.pilots, ...this.props]) safe(() => e.remove());
    safe(() => this.jm && !this.jm.hasTag('ww2_unit') && this.jm.remove());
    if (HUB.air) HUB.air.flyAway(this.sid);
  }
}

const PLANE_CELLS_SET = new Set(PLANE_CELLS.map(([x, y, z]) => `${x},${y},${z}`));

// ------------------------------------------------------------------ API
export function start(player) {
  if (sessions.has(player.id)) return;
  sessions.set(player.id, new Session(player));
}

export function tick() {
  for (const s of [...sessions.values()]) {
    try { s.tick(); } catch (err) { console.warn('[WW2] intro tick: ' + err); }
  }
}

export function onPlayerDeath(player) {
  const s = sessions.get(player.id);
  if (s && s.phase !== 'prep') s.finish('died');
}

export function onPlayerLeave(playerId) {
  const s = sessions.get(playerId);
  if (s) s.abort();
}

export function active(player) { return sessions.has(player.id); }

HUB.intro = {
  flights: () => [...sessions.values()].filter((s) => s.O && s.phase !== 'prep' && !s.planeRemoved).map((s) => ({
    center: s.center(), door: L(s.O, M.door_out), player: s.player,
    onboard: ['flight', 'jump', 'turn'].includes(s.phase), flak: s.phase !== 'prep' && s.t > T.CINE_END - 60,
  })),
  planeCenters: () => [...sessions.values()].filter((s) => s.O && s.phase !== 'prep' && !s.planeRemoved).map((s) => s.center()),
  inPlane: (player) => { const s = sessions.get(player.id); return !!s && ['flight', 'jump', 'turn'].includes(s.phase); },
  active: (player) => sessions.has(player.id),
};

export const _debug = { sessions, dist, randi };
