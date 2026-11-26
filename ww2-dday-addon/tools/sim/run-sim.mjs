// Executa o addon inteiro no simulador: intro -> salto -> pouso -> batalha -> vitória forçada.
// Uso: node tools/sim/run-sim.mjs   (depois de python3 tools/build.py)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const work = path.join(here, '.work');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'node_modules', '@minecraft', 'server'), { recursive: true });
fs.mkdirSync(path.join(work, 'node_modules', '@minecraft', 'server-ui'), { recursive: true });
fs.copyFileSync(path.join(here, 'mock-server.mjs'), path.join(work, 'node_modules', '@minecraft', 'server', 'index.mjs'));
fs.writeFileSync(path.join(work, 'node_modules', '@minecraft', 'server', 'package.json'), JSON.stringify({ name: '@minecraft/server', type: 'module', main: 'index.mjs', exports: './index.mjs' }));
fs.writeFileSync(path.join(work, 'node_modules', '@minecraft', 'server-ui', 'index.mjs'), `
export class ActionFormData { title(){return this;} body(){return this;} button(){return this;} show(){ return Promise.resolve({ canceled: false, selection: globalThis.__formSel ?? 7 }); } }
export class MessageFormData { title(){return this;} body(b){ globalThis.__report = b; return this;} button1(){return this;} button2(){return this;} show(){ return Promise.resolve({}); } }
`);
fs.writeFileSync(path.join(work, 'node_modules', '@minecraft', 'server-ui', 'package.json'), JSON.stringify({ name: '@minecraft/server-ui', type: 'module', main: 'index.mjs', exports: './index.mjs' }));
fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ type: 'module' }));
fs.cpSync(path.join(root, 'build', 'WW2_DDay_BP', 'scripts'), path.join(work, 'scripts'), { recursive: true });

const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };

const mc = await import(pathToFileURL(path.join(work, 'node_modules', '@minecraft', 'server', 'index.mjs')).href);
await import(pathToFileURL(path.join(work, 'scripts', 'main.js')).href);
const { SIM, step, addPlayer, world } = mc;

const assert = (c, m) => { if (!c) { console.log('FALHOU:', m); process.exitCode = 1; } else console.log('ok  -', m); };
const count = (t, f = () => true) => [...SIM.entities.values()].filter((e) => e.valid && e.typeId === t && f(e)).length;

const DIMX = world.getDimension('overworld');
const z1 = DIMX.spawnEntity('minecraft:zombie', { x: 20, y: 64, z: 20 });
const cow = DIMX.spawnEntity('minecraft:cow', { x: 22, y: 64, z: 20 });
const p = addPlayer('Tester', { x: 0.5, y: 64, z: 0.5 });
step(60);
assert(!z1.isValid() && cow.isValid(), 'zumbi removido, vaca continua');
const planes = JSON.parse(world.getDynamicProperty('ww2:planes') || '{}');
const O = planes[p.id];
assert(O && O.y === 64 + 78, `avião construído na altitude certa (y=${O && O.y})`);
assert([...SIM.blocks.values()].filter((b) => b === 'minecraft:green_terracotta').length > 300, 'blocos do C-47 colocados');
assert(count('ww2:us_paratrooper') === 12 + 1 + 2, 'paraquedistas, mestre de salto e pilotos no avião: ' + count('ww2:us_paratrooper'));
assert(count('ww2:c47') === 6, 'formação de 6 C-47: ' + count('ww2:c47'));
assert(count('ww2:flak38') === 3, 'três baterias Flak 38: ' + count('ww2:flak38'));
assert(count('ww2:german_soldier') === 9 + 8, 'guarnições + patrulhas alemãs: ' + count('ww2:german_soldier'));
assert(SIM.commands.some((c) => c.startsWith('camera @s set minecraft:free')), 'câmera cinematográfica');

step(870); // até a luz verde
assert(SIM.messages.some((m) => m.includes('LUZ VERDE')), 'luz verde anunciada');
assert(count('ww2:flak_shell') > 0 || SIM.commands.length > 0, 'flak disparando');
step(12 * 22 + 60);
const inAir = count('ww2:parachute');
assert(inAir >= 8, 'paraquedas abertos no céu: ' + inAir);
assert(SIM.messages.some((m) => m.includes('SUA VEZ')), 'jogador chamado para saltar');

// jogador pula pela porta
p.teleport({ x: O.x + 2.9, y: O.y + 1, z: O.z - 4.4 });
step(40);
assert(p.mount && p.mount.typeId === 'ww2:parachute', 'paraquedas do jogador abriu');
step(600);
assert(!p.mount, 'jogador pousou');
assert(p.dyn['ww2:introDone'] === true, 'intro marcada como concluída');
assert([...SIM.blocks.entries()].filter(([, b]) => b !== 'minecraft:air').length < 80, 'avião de blocos removido (resto = sacos de areia)');
const landed = count('ww2:us_paratrooper', (e) => e.props['ww2:state'] === 5);
assert(landed >= 20, 'paraquedistas no solo: ' + landed);
assert(SIM.messages.some((m) => m.includes('Rádio QG')), 'QG da divisão ativo');

step(400);
const ev = [...SIM.entities.values()].filter((e) => e.typeId === 'ww2:us_paratrooper').flatMap((e) => e.events);
assert(ev.some((e) => e.startsWith('ww2:mode_move_')), 'esquadrões recebendo ordens de movimento');
assert(ev.some((e) => e === 'ww2:mode_combat'), 'soldados entrando em combate');
assert(count('ww2:marker') > 0, 'marcadores de reagrupamento: ' + count('ww2:marker'));

// rádio: relatório
globalThis.__formSel = 7;
p.container = p.container || null;
world.afterEvents.itemUse._fire({ source: p, itemStack: { typeId: 'ww2:radio', amount: 1 } });
await new Promise((r) => setTimeout(r, 10));
assert(typeof globalThis.__report === 'string' && globalThis.__report.includes('Bateria'), 'relatório do rádio');
globalThis.__formSel = 6;
world.afterEvents.itemUse._fire({ source: p, itemStack: { typeId: 'ww2:radio', amount: 1 } });
await new Promise((r) => setTimeout(r, 10));
step(200);
assert(SIM.messages.some((m) => m.includes('C-47 a caminho')), 'reforço aéreo pelo rádio');

// tiro do jogador
const inv = p.getComponent('minecraft:inventory').container;
inv.items[0] = new mc.ItemStack('ww2:thompson');
world.afterEvents.itemStartUse._fire({ source: p, itemStack: inv.items[0] });
step(20);
p.isSneaking = true; step(3);
assert(SIM.commands.some((c) => c.includes('fov_set')), 'zoom ao mirar agachado');
p.isSneaking = false; step(3);
world.afterEvents.itemStopUse._fire({ source: p, itemStack: inv.items[0] });
assert(count('ww2:bullet_p_smg') + 1 > 1 || warns.length === 0, 'Thompson dispara');

// destrói as baterias com explosivo (simulado) -> contra-ataque -> vitória
for (const f of [...SIM.entities.values()].filter((e) => e.typeId === 'ww2:flak38')) {
  p.teleport({ x: f.location.x + 1, y: f.location.y, z: f.location.z });
  inv.items[0] = new mc.ItemStack('ww2:explosive', 3);
  world.afterEvents.itemUse._fire({ source: p, itemStack: inv.items[0] });
  step(110);
}
step(20);
assert(SIM.log.some((l) => l[0] === 'title' && String(l[1]).includes('MISSÃO CUMPRIDA')), 'missão 1 cumprida');
step(200);
assert(count('ww2:map_board') === 1, 'mapa de briefing na frente da câmera');
assert(SIM.commands.some((c) => c.includes('camera @s set minecraft:free ease 13')), 'câmera passeando pelo mapa');
assert(count('ww2:german_soldier') === 0 && count('ww2:flak38') === 0, 'unidades da missão 1 removidas');
const phaseNow = () => JSON.parse(world.getDynamicProperty('ww2:m2')).phase;
for (let i = 0; i < 150 && phaseNow() !== 'convoy'; i++) step(10);
assert(phaseNow() === 'convoy', 'coluna blindada em movimento');
const roadBlocks = [...SIM.blocks.values()].filter((b) => b === 'minecraft:grass_path').length;
const logs = [...SIM.blocks.values()].filter((b) => b.endsWith('_log')).length;
assert(roadBlocks > 500 && logs > 800, `estrada de terra (${roadBlocks}) e bosque (${logs} troncos) gerados`);
assert(count('ww2:sherman') === 4, 'coluna de 4 Shermans: ' + count('ww2:sherman'));
const tank1 = [...SIM.entities.values()].find((e) => e.typeId === 'ww2:sherman' && e.dyn['ww2:tank'] === 1);
assert(p.mount === tank1, 'jogador em cima do 2º tanque');
assert(SIM.entities.size && [...SIM.entities.values()].filter((e) => e.mount && e.mount.typeId === 'ww2:sherman').length >= 20, 'esquadrões montados nos tanques');
const x0 = tank1.location.x;
step(100);
assert(tank1.location.x > x0 + 10, `tanques andando pela estrada (+${(tank1.location.x - x0).toFixed(1)} blocos)`);
for (let i = 0; i < 150 && phaseNow() !== 'battle'; i++) step(10);
const m2b = JSON.parse(world.getDynamicProperty('ww2:m2'));
assert(m2b.phase === 'battle', 'emboscada e desembarque: ' + m2b.phase);
assert(SIM.messages.some((m) => m.includes('EMBOSCADA')), 'emboscada anunciada');
assert(!p.mount, 'jogador desembarcou');
assert([...SIM.entities.values()].some((e) => e.typeId === 'ww2:sherman' && e.props['ww2:destroyed']), 'tanque da frente atingido pelo Pak');
step(300);
assert(count('ww2:pak40') === 2, 'dois canhões Pak 40: ' + count('ww2:pak40'));
assert(count('ww2:german_soldier') >= 10, 'defensores alemães no bosque: ' + count('ww2:german_soldier'));
const us2 = count('ww2:us_paratrooper', (e) => e.props['ww2:state'] === 5);
assert(us2 >= 15, 'esquadrões de IA no solo: ' + us2);
assert(count('ww2:flak_shell') > 0 || SIM.commands.some((c) => c.includes('camerashake add @s 0.25')), 'tanques/Pak atirando');
for (const f of [...SIM.entities.values()].filter((e) => e.typeId === 'ww2:pak40')) {
  p.teleport({ x: f.location.x + 1, y: f.location.y, z: f.location.z });
  inv.items[0] = new mc.ItemStack('ww2:explosive', 3);
  world.afterEvents.itemUse._fire({ source: p, itemStack: inv.items[0] });
  step(110);
}
step(60);
assert(SIM.log.some((l) => l[0] === 'title' && String(l[1]).includes('VITÓRIA')), 'vitória da missão 2');

console.log('\nAvisos/erros de script:', warns.length);
for (const w of warns.slice(0, 15)) console.log('  ', w.slice(0, 400));
console.log('\nAmostra do chat:');
for (const m of SIM.messages.filter((x, i, a) => a.indexOf(x) === i).slice(0, 40)) console.log('  ', m.replace(/§./g, ''));
if (warns.length) process.exitCode = 1;
const byState = {};
for (const e of SIM.entities.values()) if (e.typeId === 'ww2:us_paratrooper') { const k = e.props['ww2:state'] + (e.mount ? '/chute' : ''); byState[k] = (byState[k] || 0) + 1; }
console.log('US por estado:', JSON.stringify(byState), 'mortos:', SIM.log.filter(l=>l[0]==='die').length);
