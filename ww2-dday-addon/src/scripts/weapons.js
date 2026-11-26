// Armas do jogador (Garand, Thompson, BAR, MP44, Kar98k), rádio, explosivos e kit médico.
import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { HUB } from './hub.js';
import {
  now, add, mul, norm, rand, valid, safe, sound, particle, cmd, actionbar, mainhand, consumeMainhand, hp, findGround,
} from './util.js';

export const GUNS = {
  'ww2:m1_garand': { name: 'M1 Garand', mag: 8, rate: 5, auto: false, proj: 'ww2:bullet_p_rifle', speed: 6.5, spread: 0.008, snd: 'ww2.garand', reload: 42, ping: true },
  'ww2:thompson': { name: 'Thompson M1A1', mag: 30, rate: 2, auto: true, proj: 'ww2:bullet_p_smg', speed: 5.5, spread: 0.03, snd: 'ww2.thompson', reload: 46 },
  'ww2:bar': { name: 'BAR M1918', mag: 20, rate: 3, auto: true, proj: 'ww2:bullet_p_mg', speed: 6.5, spread: 0.022, snd: 'ww2.bar', reload: 56 },
  'ww2:mp44': { name: 'StG 44', mag: 30, rate: 3, auto: true, proj: 'ww2:bullet_p_smg', speed: 6, spread: 0.025, snd: 'ww2.mp44', reload: 48 },
  'ww2:kar98': { name: 'Kar98k', mag: 5, rate: 22, auto: false, proj: 'ww2:bullet_p_rifle', speed: 7, spread: 0.004, snd: 'ww2.kar98', reload: 54 },
};

const state = new Map(); // player.id -> { ammo:{}, reloadUntil, lastShot, firing }

function st(p) {
  let s = state.get(p.id);
  if (!s) { s = { ammo: {}, reloadUntil: 0, lastShot: -99, firing: null }; state.set(p.id, s); }
  s.player = p;
  return s;
}

function hud(p, id) {
  const g = GUNS[id];
  const s = st(p);
  const a = s.ammo[id] ?? g.mag;
  if (now() < s.reloadUntil) { actionbar(p, `§e${g.name}  §7recarregando...`); return; }
  const bar = '|'.repeat(Math.min(a, 30));
  actionbar(p, `§f${g.name}  §e${a}§7/${g.mag}  §6${bar}`);
}

function startReload(p, id) {
  const g = GUNS[id];
  const s = st(p);
  if (now() < s.reloadUntil) return;
  s.reloadUntil = now() + g.reload;
  s.firing = null;
  sound('ww2.reload', p.location, 0.8, 1);
  s.pendingReload = id;
}

function fire(p, id) {
  const g = GUNS[id];
  const s = st(p);
  if (now() < s.reloadUntil) return false;
  if (now() - s.lastShot < g.rate) return false;
  const ammo = s.ammo[id] ?? g.mag;
  if (ammo <= 0) { startReload(p, id); return false; }
  s.lastShot = now();
  s.ammo[id] = ammo - 1;
  const head = p.getHeadLocation();
  const dir = p.getViewDirection();
  const sp = g.spread * (p.isSneaking ? 0.35 : 1);
  const d = norm({ x: dir.x + rand(-sp, sp), y: dir.y + rand(-sp, sp), z: dir.z + rand(-sp, sp) });
  const start = add(head, mul(dir, 0.8));
  try {
    const b = p.dimension.spawnEntity(g.proj, start);
    const pc = b.getComponent('minecraft:projectile');
    if (pc) {
      safe(() => { pc.owner = p; });
      pc.shoot(mul(d, g.speed));
    } else {
      b.applyImpulse(mul(d, g.speed));
    }
  } catch { /* chunk/entity limit */ }
  particle('ww2:muzzle_flash', add(head, mul(dir, 1.1)));
  sound(g.snd, p.location, 1.4, rand(0.95, 1.05));
  cmd(p, `camerashake add @s ${g.auto ? 0.04 : 0.09} 0.08 rotational`);
  if (s.ammo[id] <= 0) {
    if (g.ping) sound('ww2.garand_ping', p.location, 0.9, 1);
    startReload(p, id);
  }
  hud(p, id);
  return true;
}

// ---------------------------------------------------------------------------
// Rádio
// ---------------------------------------------------------------------------
function radio(p) {
  sound('ww2.radio', p.location, 0.8, 1);
  const B = HUB.battle;
  const f = new ActionFormData()
    .title('§2Rádio SCR-536 — Pelotão Easy')
    .body('Escolha uma ordem. O QG da divisão coordena os outros esquadrões automaticamente.')
    .button('§lSiga-me\n§r§8o pelotão acompanha você')
    .button('§lManter posição\n§r§8defendam onde estão')
    .button('§lAtacar onde estou mirando\n§r§8ponto a até 120 blocos')
    .button('§lAtacar a bateria AA mais próxima')
    .button('§lDivisão: reagrupar em mim')
    .button('§lDivisão: ataque geral (IA do QG)')
    .button('§lPedir reforço aéreo (C-47)')
    .button('§lRelatório da situação');
  f.show(p).then((r) => {
    if (r.canceled || r.selection === undefined || !B) return;
    let n;
    switch (r.selection) {
      case 0: n = B.order0(p, 'follow'); p.sendMessage(`§a[Easy]§f Entendido, estamos com você! (${n} homens)`); break;
      case 1: n = B.order0(p, 'hold'); p.sendMessage(`§a[Easy]§f Mantendo posição! (${n} homens)`); break;
      case 2: {
        const hit = safe(() => p.getBlockFromViewDirection({ maxDistance: 120 }));
        const loc = hit && hit.block ? hit.block.location : undefined;
        if (!loc) { p.sendMessage('§cNenhum ponto à vista. Mire no chão.'); break; }
        const g = findGround(loc.x, loc.z, loc.y + 3, loc.y - 10);
        n = B.order0(p, 'point', { x: loc.x + 0.5, y: g ? g.y : loc.y + 1, z: loc.z + 0.5 });
        p.sendMessage(`§a[Easy]§f Avançando para o ponto marcado! (${n} homens)`);
        particle('ww2:flak_flash', { x: loc.x + 0.5, y: loc.y + 1.2, z: loc.z + 0.5 });
        break;
      }
      case 3: n = B.order0(p, 'assault'); p.sendMessage(`§a[Easy]§f Indo para a bateria! (${n} homens)`); break;
      case 4: B.regroupAll(p); break;
      case 5: B.generalAssault(); break;
      case 6: p.sendMessage(B.airReinforcement(p)); break;
      case 7: new MessageFormData().title('§2Relatório da situação').body(B.report()).button1('OK').button2('Fechar').show(p); break;
      default: break;
    }
  }).catch(() => { /* form busy */ });
}

function medkit(p) {
  const h = hp(p);
  if (!h.comp) return;
  if (h.cur >= h.max) { actionbar(p, '§7Você não está ferido.'); return; }
  safe(() => h.comp.setCurrentValue(Math.min(h.max, h.cur + 10)));
  safe(() => p.addEffect('regeneration', 100, { amplifier: 0, showParticles: false }));
  consumeMainhand(p);
  sound('random.drink', p.location, 0.7, 1.2);
  actionbar(p, '§aCurativo aplicado (+5 corações)');
}

function explosive(p) {
  const B = HUB.battle;
  const f = B && B.nearestFlak(p.location, 5);
  if (!f) { actionbar(p, '§eAproxime-se (5 blocos) de um canhão Flak 38 para plantar a carga.'); return; }
  if (B.plantCharge(f.idx, p.name)) consumeMainhand(p);
}

// ---------------------------------------------------------------------------
// Eventos de uso de item
// ---------------------------------------------------------------------------
export function onItemUse(p, item) {
  if (!item) return;
  const id = item.typeId;
  if (GUNS[id]) {
    const g = GUNS[id];
    const s = st(p);
    if (p.isSneaking && (s.ammo[id] ?? g.mag) < g.mag) { startReload(p, id); hud(p, id); return; }
    if (!g.auto) { fire(p, id); return; }
    // automática sem "segurar": dispara uma rajada curta
    if (!s.firing) {
      s.burst = { id, left: 4 };
    }
    return;
  }
  if (id === 'ww2:radio') radio(p);
  else if (id === 'ww2:medkit') medkit(p);
  else if (id === 'ww2:explosive') explosive(p);
}

export function onStartUse(p, item) {
  if (!item || !GUNS[item.typeId]) return;
  const g = GUNS[item.typeId];
  const s = st(p);
  if (g.auto) { s.firing = { id: item.typeId, since: now() }; s.burst = null; fire(p, item.typeId); }
}

export function onStopUse(p) {
  const s = state.get(p.id);
  if (s) s.firing = null;
}

export function tick() {
  const t = now();
  for (const [pid, s] of state) {
    const p = s.player;
    if (s.pendingReload && t >= s.reloadUntil) {
      s.ammo[s.pendingReload] = GUNS[s.pendingReload].mag;
      s.pendingReload = null;
    }
    if (!valid(p)) { state.delete(pid); continue; }
    const held = safe(() => mainhand(p).item?.typeId);
    if (s.firing) {
      if (held !== s.firing.id || t - s.firing.since > 20 * 30) { s.firing = null; continue; }
      fire(p, s.firing.id);
    } else if (s.burst) {
      if (held !== s.burst.id || s.burst.left <= 0) { s.burst = null; continue; }
      if (fire(p, s.burst.id)) s.burst.left--;
    }
    if (t % 10 === 0 && held && GUNS[held]) hud(p, held);
  }
}

export function track(p) {
  st(p);
}
