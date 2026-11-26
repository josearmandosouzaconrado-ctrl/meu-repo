// =============================================================================
//  WW2 D-Day: Paraquedistas — ponto de entrada
//  Primeira vez no mundo -> você acorda dentro de um C-47 da 101ª Divisão
//  Aerotransportada sobre a Normandia, salta com o seu pelotão e enfrenta
//  as baterias antiaéreas e a infantaria alemã.
// =============================================================================
import { world, system } from '@minecraft/server';
import { HUB } from './hub.js';
import * as Intro from './intro.js';
import * as Air from './air.js';
import * as Battle from './battle.js';
import * as Chute from './parachute.js';
import * as Weapons from './weapons.js';
import { dim, safe, valid, sound, particle, rand, players, setJSON } from './util.js';

const BULLET_SOUNDS = {
  'ww2:bullet_us_rifle': 'ww2.garand', 'ww2:bullet_us_smg': 'ww2.thompson', 'ww2:bullet_us_mg': 'ww2.bar',
  'ww2:bullet_de_rifle': 'ww2.kar98', 'ww2:bullet_de_smg': 'ww2.mp44',
};
const SOLDIERS = ['ww2:us_paratrooper', 'ww2:german_soldier'];

function typeOf(e) {
  try { return e.typeId; } catch { return undefined; }
}

// ---- jogadores --------------------------------------------------------------
world.afterEvents.playerSpawn.subscribe((ev) => {
  const p = ev.player;
  Weapons.track(p);
  if (!ev.initialSpawn) return;
  const done = safe(() => p.getDynamicProperty('ww2:introDone'));
  if (!done) {
    system.runTimeout(() => { if (valid(p)) Intro.start(p); }, 30);
  }
});

world.afterEvents.playerLeave.subscribe((ev) => {
  safe(() => Intro.onPlayerLeave(ev.playerId));
});

// ---- mortes / dano ----------------------------------------------------------
world.afterEvents.entityDie.subscribe((ev) => {
  const e = ev.deadEntity;
  const t = typeOf(e);
  if (t === 'minecraft:player') { safe(() => Intro.onPlayerDeath(e)); return; }
  if (SOLDIERS.includes(t)) safe(() => HUB.battle.onDeath(e, ev.damageSource));
});

world.afterEvents.entityHurt.subscribe((ev) => {
  const e = ev.hurtEntity;
  if (SOLDIERS.includes(typeOf(e))) safe(() => HUB.battle.onHurt(e));
});

// ---- tiros da IA: som + clarão; soldados colocados com ovo entram na batalha --
world.afterEvents.entitySpawn.subscribe((ev) => {
  const e = ev.entity;
  const t = typeOf(e);
  if (!t || !t.startsWith('ww2:')) return;
  const snd = BULLET_SOUNDS[t];
  if (snd) {
    const l = safe(() => ({ ...e.location }));
    if (l) { sound(snd, l, 1.3, rand(0.93, 1.07)); particle('ww2:muzzle_flash', l); }
    return;
  }
  if (SOLDIERS.includes(t)) system.runTimeout(() => safe(() => HUB.battle.adopt(e)), 3);
});

// ---- impactos ---------------------------------------------------------------
world.afterEvents.projectileHitBlock.subscribe((ev) => {
  const t = typeOf(ev.projectile);
  if (t === 'ww2:flak_shell') { safe(() => HUB.air.onShellHit(ev.projectile, ev.location)); return; }
  if (t && t.startsWith('ww2:bullet')) particle('ww2:dust', ev.location);
});

world.afterEvents.projectileHitEntity.subscribe((ev) => {
  const t = typeOf(ev.projectile);
  if (t === 'ww2:flak_shell') { safe(() => HUB.air.onShellHit(ev.projectile, ev.location)); return; }
  const src = ev.source;
  if (t && t.startsWith('ww2:bullet_p') && src && typeOf(src) === 'minecraft:player') {
    safe(() => src.playSound('random.click', { volume: 0.35, pitch: 1.9 }));
  }
});

// ---- itens ------------------------------------------------------------------
world.afterEvents.itemUse.subscribe((ev) => {
  if (typeOf(ev.source) !== 'minecraft:player') return;
  safe(() => Weapons.onItemUse(ev.source, ev.itemStack));
});
world.afterEvents.itemStartUse.subscribe((ev) => {
  if (typeOf(ev.source) !== 'minecraft:player') return;
  safe(() => Weapons.onStartUse(ev.source, ev.itemStack));
});
world.afterEvents.itemStopUse.subscribe((ev) => safe(() => Weapons.onStopUse(ev.source)));
world.afterEvents.itemReleaseUse.subscribe((ev) => safe(() => Weapons.onStopUse(ev.source)));

// ---- comandos: /scriptevent ww2:<intro|battle|reset|help> --------------------
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const p = ev.sourceEntity;
  const isPlayer = typeOf(p) === 'minecraft:player';
  switch (ev.id) {
    case 'ww2:intro':
      if (!isPlayer) return;
      safe(() => p.setDynamicProperty('ww2:introDone', false));
      Intro.start(p);
      break;
    case 'ww2:battle':
      if (!isPlayer) return;
      HUB.battle.prepare({ ...p.location });
      HUB.battle.begin({ ...p.location }, p);
      break;
    case 'ww2:reset':
      HUB.battle.reset();
      Air.removeAll();
      Chute.cleanupAll();
      setJSON('ww2:planes', {});
      if (isPlayer) p.sendMessage('§a[WW2] Batalha reiniciada. Use /scriptevent ww2:intro para saltar de novo.');
      break;
    default:
      if (isPlayer && ev.id.startsWith('ww2:')) {
        p.sendMessage('§6[WW2] Comandos:§f /scriptevent ww2:intro §7(saltar de novo)§f, ww2:battle §7(batalha aqui)§f, ww2:reset');
      }
  }
}, { namespaces: ['ww2'] });

// ---- laço principal ---------------------------------------------------------
const loops = [
  ['intro', Intro.tick], ['chute', Chute.tick], ['air', Air.tick], ['battle', Battle.tick], ['weapons', Weapons.tick],
];
const errors = {};
system.runInterval(() => {
  for (const [name, fn] of loops) {
    try {
      fn();
    } catch (err) {
      errors[name] = (errors[name] || 0) + 1;
      if (errors[name] < 5) console.warn(`[WW2] erro em ${name}: ${err}\n${err && err.stack}`);
    }
  }
}, 1);

// limpa aviões/paraquedas que sobraram de uma sessão anterior
function cleanupLeftovers() {
  if (HUB.intro && HUB.intro.flights().length) return;
  if (HUB.air && HUB.air.planeCount()) return;
  for (const t of ['ww2:c47', 'ww2:propeller', 'ww2:parachute']) {
    for (const e of safe(() => dim().getEntities({ type: t }), [])) {
      if (t === 'ww2:propeller' || t === 'ww2:c47') {
        const tags = safe(() => e.getTags(), []);
        if (tags.some((x) => x.startsWith('ww2_intro_'))) continue;
      }
      safe(() => e.remove());
    }
  }
}
system.runTimeout(() => { cleanupLeftovers(); for (const p of players()) Weapons.track(p); }, 10);
system.runTimeout(() => cleanupLeftovers(), 200);
