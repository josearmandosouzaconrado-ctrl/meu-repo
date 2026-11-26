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
import * as Mission2 from './mission2.js';
import { dim, safe, valid, sound, particle, rand, players, setJSON, cmd } from './util.js';
import { CFG } from './config.js';

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

// ---- sem monstros do Minecraft: só ficam os animais ---------------------------
const HOSTILE = new Set(['zombie', 'zombie_villager', 'zombie_villager_v2', 'husk', 'drowned', 'skeleton', 'stray',
  'bogged', 'creeper', 'spider', 'cave_spider', 'enderman', 'witch', 'slime', 'phantom', 'pillager', 'vindicator',
  'evocation_illager', 'ravager', 'vex', 'guardian', 'elder_guardian', 'silverfish', 'endermite', 'magma_cube',
  'ghast', 'blaze', 'wither_skeleton', 'piglin', 'piglin_brute', 'hoglin', 'zoglin', 'zombie_pigman', 'shulker',
  'breeze', 'creaking', 'warden', 'illusioner'].map((x) => 'minecraft:' + x));
const BOSSES = new Set(['minecraft:ender_dragon', 'minecraft:wither']);

function isVanillaHostile(e, t) {
  if (!t || !t.startsWith('minecraft:') || t === 'minecraft:player' || BOSSES.has(t)) return false;
  if (HOSTILE.has(t)) return true;
  return safe(() => e.matches({ families: ['monster'] }), false);
}

function sweepHostiles() {
  if (!CFG.NO_HOSTILE_MOBS) return;
  for (const id of ['overworld', 'nether', 'the_end']) {
    const d = safe(() => world.getDimension(id));
    if (!d) continue;
    for (const e of safe(() => d.getEntities({ families: ['monster'] }), [])) {
      if (isVanillaHostile(e, typeOf(e))) safe(() => e.remove());
    }
  }
}

// ---- tiros da IA: som + clarão; soldados colocados com ovo entram na batalha --
world.afterEvents.entitySpawn.subscribe((ev) => {
  const e = ev.entity;
  const t = typeOf(e);
  if (CFG.NO_HOSTILE_MOBS && isVanillaHostile(e, t)) { safe(() => e.remove()); return; }
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
    case 'ww2:mission2':
      if (!isPlayer) return;
      Mission2.reset();
      Mission2.start({ ...p.location });
      break;
    case 'ww2:reset':
      Mission2.reset();
      HUB.battle.reset();
      Air.removeAll();
      Chute.cleanupAll();
      setJSON('ww2:planes', {});
      if (isPlayer) p.sendMessage('§a[WW2] Batalha reiniciada. Use /scriptevent ww2:intro para saltar de novo.');
      break;
    default:
      if (isPlayer && ev.id.startsWith('ww2:')) {
        p.sendMessage('§6[WW2] Comandos:§f /scriptevent ww2:intro §7(saltar de novo)§f, ww2:battle §7(batalha aqui)§f, ww2:mission2 §7(ir para a missão do bosque)§f, ww2:reset');
      }
  }
}, { namespaces: ['ww2'] });

// ---- laço principal ---------------------------------------------------------
const loops = [
  ['intro', Intro.tick], ['chute', Chute.tick], ['air', Air.tick], ['battle', Battle.tick], ['weapons', Weapons.tick],
  ['mission2', Mission2.tick],
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
system.runTimeout(() => {
  cleanupLeftovers();
  for (const p of players()) Weapons.track(p);
  if (CFG.NO_HOSTILE_MOBS) { cmd(dim(), 'gamerule doinsomnia false'); sweepHostiles(); }
}, 10);
system.runInterval(sweepHostiles, 200);
system.runTimeout(() => cleanupLeftovers(), 200);
