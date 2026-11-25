import * as THREE from 'three';
import { graph, ROAD_TYPES, LINES, WORLD, isWater, nearestNode, shortestPath, totalRoadKm, zoneAt, ZONE_NAMES } from './map.js';
import { buildRoads } from './roads.js';
import { buildScenery, updateScenery, groundY } from './scenery.js';
import { Bus, LIVERIES } from './bus.js';
import { Traffic } from './traffic.js';
import { Route, FARE } from './route.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const fmt = (v) => 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------------- Salvamento ----------------
const SAVE_KEY = 'onibus-rio-3d';
const save = Object.assign({ money: 500, xp: 0, owned: ['original'], livery: 'original', quality: 1, steer: 'wheel', traffic: 40, sound: true, line: '474' },
  (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })());
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* sem armazenamento */ } };
const level = () => Math.floor(Math.sqrt(save.xp / 120)) + 1;

// ---------------- Renderizador ----------------
const canvas = $('game');
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
let renderer, scene, camera, hemi, sun;
const FOG = [0.0011, 0.0008, 0.0006], FAR = [1800, 3000, 4200], CULL = [{ tree: 450, build: 1000 }, { tree: 750, build: 1600 }, { tree: 1100, build: 2400 }];
function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: save.quality >= 1, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, [0.85, 1.25, 2][save.quality] * (isMobile ? 1 : 1.2)));
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, FAR[save.quality]);
  scene.fog = new THREE.FogExp2(0x9cc9f0, FOG[save.quality]);
  hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a40, 1.4); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1dc, 2.0); scene.add(sun); scene.add(sun.target);
}
window.addEventListener('resize', () => { if (!renderer) return; renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

// ---------------- Estado do jogo ----------------
const sound = new Sound();
let bus, traffic, route, sceneryRefs;
let state = 'loading';
let gameHour = 7, camMode = 0, camYaw = 0, fines = 0, lastNode = null;
const input = { throttle: 0, brake: 0, steer: 0, steerTarget: 0 };
let currentLine = null, toastTimer = 0, bellRung = -1;

const ui = {
  toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.style.background = bad ? '#a3262aee' : '#000c'; t.classList.add('show'); toastTimer = 3; },
  sfx(n) { sound.play(n); },
};

// ---------------- Carregamento ----------------
async function load() {
  const bar = $('loadbar'), txt = $('loadtxt');
  const step = async (p, t) => { bar.style.width = p + '%'; txt.textContent = t; await new Promise(r => setTimeout(r, 30)); };
  setupRenderer();
  await step(5, `Montando ${totalRoadKm().toFixed(0)} km de ruas do Rio...`);
  buildRoads(scene);
  await step(20, 'Gerando relevo, praias, prédios e florestas...');
  sceneryRefs = buildScenery(scene, save.quality, (t) => { txt.textContent = t; });
  console.log('cenario', sceneryRefs.buildingCount, 'predios', sceneryRefs.treeCount, 'arvores');
  await step(60, 'Carregando o ônibus Marcopolo Torino VW 17-230...');
  bus = new Bus();
  await bus.load((f) => { bar.style.width = (60 + f * 30) + '%'; });
  scene.add(bus.root);
  bus.setLivery(LIVERIES.find(l => l.id === save.livery));
  bus.onCrash = (v, hit) => {
    sound.play('crash');
    if (v > 3) { const f = hit.car ? 80 : 50; fines += f; ui.toast(`Batida! −${fmt(f)}`, true); }
  };
  await step(92, 'Colocando o trânsito nas ruas...');
  traffic = new Traffic(scene, save.traffic);
  route = new Route(scene);
  await step(100, 'Pronto!');
  renderer.compile(scene, camera);
  showMenu();
  requestAnimationFrame(loop);
}

// ---------------- Menu ----------------
function lineInfo(line) {
  const ns = line.way.map(w => nearestNode(w[0], w[1])); let len = 0; const zones = new Set();
  for (let i = 0; i < ns.length - 1; i++) for (const s of shortestPath(ns[i].id, ns[i + 1].id)) { len += s.edge.len; zones.add(ZONE_NAMES[zoneAt(s.edge.pts[0][0], s.edge.pts[0][1])]); }
  return { km: len / 1000, zones: [...zones].filter(Boolean) };
}
function showMenu() {
  state = 'menu'; $('loading').classList.add('hidden'); $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('menu').classList.remove('hidden');
  $('menuMoney').textContent = fmt(save.money); $('menuLevel').textContent = level();
  const ll = $('lineList'); ll.innerHTML = '';
  for (const L of LINES) {
    const inf = L.id === 'LIVRE' ? null : lineInfo(L);
    const d = document.createElement('div'); d.className = 'line-card';
    d.innerHTML = `<div class="num" style="background:${L.color}">${L.id}</div><div class="info"><b>${L.name}</b>${L.desc}<div class="tag">${inf ? `${inf.km.toFixed(1)} km • ${inf.zones.slice(0, 4).join(' • ')}` : 'Mapa completo: ' + totalRoadKm().toFixed(0) + ' km de vias'}</div></div><div>▶</div>`;
    d.onclick = () => { sound.init(); sound.resume(); startLine(L); };
    ll.appendChild(d);
  }
  const lv = $('liveryList'); lv.innerHTML = '';
  for (const L of LIVERIES) {
    const owned = save.owned.includes(L.id);
    const d = document.createElement('div'); d.className = 'livery' + (save.livery === L.id ? ' sel' : '');
    d.innerHTML = `<div class="sw" style="background:linear-gradient(90deg,#fff 0 40%,${L.sw} 40%)"></div>${L.name}<br>${owned ? (save.livery === L.id ? '✔ em uso' : 'usar') : fmt(L.price)}`;
    d.onclick = () => {
      if (!owned) { if (save.money < L.price) { alert('Saldo insuficiente. Faça mais viagens!'); return; } save.money -= L.price; save.owned.push(L.id); }
      save.livery = L.id; persist(); bus.setLivery(L); showMenu();
    };
    lv.appendChild(d);
  }
  $('optQuality').value = save.quality; $('optSteer').value = save.steer; $('optTraffic').value = save.traffic; $('optSound').checked = save.sound;
}
$('optQuality').onchange = (e) => { save.quality = +e.target.value; persist(); if (confirm('Reiniciar para aplicar os gráficos?')) location.reload(); };
$('optSteer').onchange = (e) => { save.steer = e.target.value; persist(); if (save.steer === 'tilt') requestTilt(); };
$('optTraffic').onchange = (e) => { save.traffic = +e.target.value; traffic.max = save.traffic; persist(); };
$('optSound').onchange = (e) => { save.sound = e.target.checked; sound.enabled = save.sound; persist(); };

function startLine(L) {
  currentLine = L; fines = 0; lastNode = null; bellRung = -1;
  traffic.clear(); route.start(L);
  const p = route.startPose; bus.place(p.x, p.z, p.h); bus.gear = 1; bus.doors = false;
  const dest = L.id === 'LIVRE' ? 'RIO DE JANEIRO' : `${L.id} ${L.name.split('⇄')[1].trim().toUpperCase()}`;
  bus.setSign(dest, '#ffb52e');
  gameHour = [7, 12, 17.4, 20][Math.floor(Math.random() * 4)];
  bus.setLights(gameHour > 18 || gameHour < 6);
  $('lineName').textContent = L.id === 'LIVRE' ? 'Modo Livre' : `${L.id} • ${L.name}`;
  $('lineName').style.background = L.color;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  applySteerMode(); state = 'driving';
  sound.enabled = save.sound;
  ui.toast(L.id === 'LIVRE' ? 'Dirija livremente pelo Rio!' : `Vá até o ponto inicial e abra as portas 🚪`);
  for (let i = 0; i < 25; i++) traffic.spawnNear(bus.x, bus.z);
}

function finishTrip() {
  state = 'result';
  const r = route.results(fines); const xp = Math.round(route.boarded * 6 + route.served * 10);
  save.money += Math.max(0, r.total); save.xp += xp; persist();
  $('pauseTitle').textContent = 'Viagem concluída! 🏁';
  $('pauseBody').innerHTML = `Linha <b>${currentLine.id}</b> — ${currentLine.name}<br>
    Passageiros: <b>${route.boarded}</b> embarcaram • Pontos atendidos: <b>${route.served}/${route.stops.length}</b><br>
    Passagens: <span class="good">+${fmt(route.earn)}</span> (${fmt(FARE)} cada)<br>
    Multas e danos: <span class="bad">−${fmt(fines + route.fines)}</span><br>
    Tempo: ${Math.floor(r.secs / 60)} min ${Math.floor(r.secs % 60)} s<br>
    Avaliação: ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)} • +${xp} XP<br>
    <b>Total: ${fmt(Math.max(0, r.total - route.fines))}</b>`;
  $('bResume').textContent = 'Voltar à garagem'; $('pause').classList.remove('hidden');
}

// ---------------- Controles ----------------
function applySteerMode() {
  $('steerZone').classList.toggle('hidden', save.steer !== 'wheel');
  $('steerBtns').classList.toggle('hidden', save.steer !== 'buttons');
}
function hold(el, on, off) {
  const down = (e) => { e.preventDefault(); el.classList.add('press'); on(); sound.init(); sound.resume(); };
  const up = (e) => { e.preventDefault(); el.classList.remove('press'); off(); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
}
hold($('bGas'), () => input.throttle = 1, () => input.throttle = 0);
hold($('bBrake'), () => input.brake = 1, () => input.brake = 0);
let btnL = 0, btnR = 0;
hold($('bLeft'), () => btnL = 1, () => btnL = 0);
hold($('bRight'), () => btnR = 1, () => btnR = 0);
// volante na tela
let wheelAng = 0, wheelPtr = null, wheelA0 = 0, wheelBase = 0;
const wz = $('steerZone');
const angOf = (e) => { const r = wz.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
wz.addEventListener('pointerdown', (e) => { e.preventDefault(); wheelPtr = e.pointerId; wz.setPointerCapture(e.pointerId); wheelA0 = angOf(e); wheelBase = wheelAng; });
wz.addEventListener('pointermove', (e) => {
  if (e.pointerId !== wheelPtr) return; let d = angOf(e) - wheelA0; if (d > 180) d -= 360; if (d < -180) d += 360;
  wheelAng = Math.max(-160, Math.min(160, wheelBase + d)); if (Math.abs(angOf(e) - wheelA0) > 90) { wheelA0 = angOf(e); wheelBase = wheelAng; }
});
const wheelUp = (e) => { if (e.pointerId === wheelPtr) wheelPtr = null; };
wz.addEventListener('pointerup', wheelUp); wz.addEventListener('pointercancel', wheelUp);
// inclinação
let tilt = 0;
function requestTilt() {
  const go = () => window.addEventListener('deviceorientation', (e) => {
    const ang = (screen.orientation?.angle ?? window.orientation ?? 90);
    const v = (ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma) || 0;
    tilt = Math.max(-1, Math.min(1, v / 28));
  });
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(go).catch(() => {}); else go();
}
if (save.steer === 'tilt') requestTilt();
// teclado
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true; sound.init(); sound.resume();
  if (state !== 'driving') return;
  if (e.code === 'KeyE') toggleDoors(); if (e.code === 'KeyH') honk(); if (e.code === 'KeyC') nextCam(); if (e.code === 'KeyL') bus.setLights(!bus.lights);
  if (e.code === 'KeyR') toggleGear(); if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
// câmera: arrastar na tela gira
let dragPtr = null, dragX = 0;
canvas.addEventListener('pointerdown', (e) => { dragPtr = e.pointerId; dragX = e.clientX; });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId === dragPtr) { camYaw += (e.clientX - dragX) * 0.008; dragX = e.clientX; } });
canvas.addEventListener('pointerup', () => { dragPtr = null; }); canvas.addEventListener('pointercancel', () => { dragPtr = null; });

function toggleDoors() {
  if (!bus.doors && bus.kmh > 3) { ui.toast('Pare o ônibus para abrir as portas!', true); return; }
  bus.doors = !bus.doors; sound.play('door'); $('bDoor').classList.toggle('on', bus.doors);
}
function honk() { sound.play('horn'); }
function nextCam() { camMode = (camMode + 1) % 4; camYaw = 0; }
function toggleGear() { if (bus.kmh > 3) { ui.toast('Pare para trocar a marcha'); return; } bus.gear = -bus.gear; $('gear').textContent = bus.gear > 0 ? 'D' : 'R'; }
const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); sound.init(); sound.resume(); fn(); });
tap('bDoor', toggleDoors); tap('bHorn', honk); tap('bCam', nextCam); tap('bLight', () => { bus.setLights(!bus.lights); $('bLight').classList.toggle('on', bus.lights); }); tap('bGear', toggleGear); tap('bPause', pause);
function pause() {
  if (state !== 'driving') return; state = 'paused';
  $('pauseTitle').textContent = 'Pausado'; $('bResume').textContent = 'Continuar';
  $('pauseBody').innerHTML = `<canvas id="bigmap" width="420" height="420" style="width:min(300px,46vh);height:min(300px,46vh);border-radius:12px"></canvas>
    <div>Passageiros: ${route.boarded} • Arrecadado: ${fmt(route.earn)} • Multas: ${fmt(fines + (route.fines || 0))}</div>`;
  drawBigMap($('bigmap'));
  $('pause').classList.remove('hidden');
}
$('bResume').onclick = () => { if (state === 'result') { route.clear(); showMenu(); return; } $('pause').classList.add('hidden'); state = 'driving'; };
$('bMenu').onclick = () => { route.clear(); traffic.clear(); showMenu(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------------- Minimapa ----------------
const mm = $('minimap'), mctx = mm.getContext('2d');
const ROAD_COL = { terra: '#a98a5c', corredor: '#e0c060', avenida: '#e8e8e8', orla: '#e8e8e8', rua: '#bfc5cc', paralelepipedo: '#c9b48a' };
function drawMinimap() {
  const W = mm.width, R = 260, sc = W / (2 * R);
  mctx.save(); mctx.fillStyle = '#2f4a2c'; mctx.fillRect(0, 0, W, W);
  mctx.translate(W / 2, W / 2); mctx.rotate(Math.PI + bus.h); mctx.scale(sc, sc); mctx.translate(-bus.x, -bus.z);
  mctx.lineCap = 'round';
  for (const e of graph.edges) {
    const p = e.pts; if (Math.abs(p[0][0] - bus.x) > R + e.len && Math.abs(p[0][1] - bus.z) > R + e.len) continue;
    mctx.strokeStyle = ROAD_COL[e.type]; mctx.lineWidth = ROAD_TYPES[e.type].half * 2.4;
    mctx.beginPath(); mctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) mctx.lineTo(p[i][0], p[i][1]); mctx.stroke();
  }
  if (route.pts?.length) {
    mctx.strokeStyle = '#ffd23f'; mctx.lineWidth = 5; mctx.beginPath();
    const a = Math.max(0, route.lastIdx - 5);
    for (let i = a; i < Math.min(route.pts.length, a + 120); i++) { const q = route.pts[i]; i === a ? mctx.moveTo(q[0], q[1]) : mctx.lineTo(q[0], q[1]); }
    mctx.stroke();
    for (let i = route.next; i < route.stops.length; i++) { const s = route.stops[i]; mctx.fillStyle = i === route.next ? '#ff3b3b' : '#3b8bff'; mctx.beginPath(); mctx.arc(s.lx, s.lz, 9, 0, 7); mctx.fill(); }
  }
  mctx.fillStyle = '#fff';
  for (const c of traffic.cars) mctx.fillRect(c.x - 3, c.z - 3, 6, 6);
  mctx.restore();
  // ônibus
  mctx.fillStyle = '#ffd23f'; mctx.strokeStyle = '#000'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(W / 2, W / 2 - 12); mctx.lineTo(W / 2 + 8, W / 2 + 9); mctx.lineTo(W / 2 - 8, W / 2 + 9); mctx.closePath(); mctx.fill(); mctx.stroke();
}
let bigMapCache = null;
function drawBigMap(cv) {
  const W = cv.width, sc = W / (WORLD * 2); const x = cv.getContext('2d');
  if (!bigMapCache) {
    bigMapCache = document.createElement('canvas'); bigMapCache.width = bigMapCache.height = W; const c = bigMapCache.getContext('2d');
    c.fillStyle = '#3d5a34'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#2a6f97'; for (let i = 0; i < W; i += 2) for (let j = 0; j < W; j += 2) { if (isWater(i / sc - WORLD, j / sc - WORLD)) c.fillRect(i, j, 2, 2); }
    for (const e of graph.edges) { c.strokeStyle = ROAD_COL[e.type]; c.lineWidth = e.type === 'corredor' ? 2.5 : 1.4; c.beginPath(); e.pts.forEach((p, i) => { const px = (p[0] + WORLD) * sc, py = (p[1] + WORLD) * sc; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); }
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif';
    for (const [t, px, pz] of [['CENTRO', 1500, -2350], ['ZONA NORTE', -1400, -2680], ['COPACABANA', 900, 2230], ['BARRA', -2600, 1700], ['ZONA RURAL', -3500, -900], ['AV. BRASIL', -1200, -3060], ['CORCOVADO', 760, -400], ['PÃO DE AÇÚCAR', 2800, 2150]]) c.fillText(t, (px + WORLD) * sc, (pz + WORLD) * sc);
  }
  x.drawImage(bigMapCache, 0, 0);
  if (route.pts?.length) { x.strokeStyle = '#ffd23f'; x.lineWidth = 3; x.beginPath(); route.pts.forEach((p, i) => { const px = (p[0] + WORLD) * sc, py = (p[1] + WORLD) * sc; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); }
  x.fillStyle = '#ff3b3b'; x.beginPath(); x.arc((bus.x + WORLD) * sc, (bus.z + WORLD) * sc, 5, 0, 7); x.fill();
}

// ---------------- Dia e noite ----------------
const skyDay = new THREE.Color(0x8fc3ee), skyNight = new THREE.Color(0x0a1224), skySet = new THREE.Color(0xf0a36a), tmpC = new THREE.Color();
function updateSky() {
  const h = gameHour % 24; const elev = Math.sin((h - 6) / 12 * Math.PI);
  const night = Math.max(0, Math.min(1, (0.12 - elev) / 0.3));
  const set = Math.max(0, 1 - Math.abs(elev - 0.08) / 0.25) * (1 - night * 0.6);
  tmpC.copy(skyDay).lerp(skyNight, night).lerp(skySet, set * 0.55);
  scene.background = tmpC; scene.fog.color.copy(tmpC);
  hemi.intensity = 0.35 + (1 - night) * 1.1; sun.intensity = Math.max(0, elev) * 2.3 + 0.05;
  sun.color.setHSL(0.09, 0.6 * set + 0.1, 0.85);
  const az = (h - 6) / 12 * Math.PI;
  sun.position.set(bus.x + Math.cos(az) * 400, Math.max(30, elev * 600), bus.z - 200 + Math.sin(az) * 100); sun.target.position.set(bus.x, 0, bus.z);
  return night;
}

// ---------------- Câmera ----------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camInit = false, freeCam = null;
function updateCamera(dt) {
  if (freeCam) { camera.position.set(...freeCam.p); camera.lookAt(...freeCam.q); return; }
  const f = bus.forward; const k = 1 - Math.exp(-dt * 5);
  if (dragPtr === null) camYaw *= Math.pow(0.1, dt);
  let tp, tl;
  const yaw = bus.h + camYaw; const fx = Math.sin(yaw), fz = Math.cos(yaw);
  if (camMode === 0) { tp = new THREE.Vector3(bus.x - fx * 17, bus.y + 6.5, bus.z - fz * 17); tl = new THREE.Vector3(bus.x + f[0] * 6, bus.y + 2.2, bus.z + f[1] * 6); }
  else if (camMode === 1) {
    const w = new THREE.Vector3(); bus.driverCam.getWorldPosition(w); camera.position.copy(w);
    camera.lookAt(w.x + Math.sin(yaw) * 20, w.y - 1.2, w.z + Math.cos(yaw) * 20); camInit = false; return;
  } else if (camMode === 2) { tp = new THREE.Vector3(bus.x + Math.sin(yaw + 1.9) * 14, bus.y + 3.5, bus.z + Math.cos(yaw + 1.9) * 14); tl = new THREE.Vector3(bus.x, bus.y + 1.8, bus.z); }
  else { tp = new THREE.Vector3(bus.x - fx * 4, bus.y + 60, bus.z - fz * 4); tl = new THREE.Vector3(bus.x + f[0] * 10, bus.y, bus.z + f[1] * 10); }
  // evita a câmera entrar no chão
  tp.y = Math.max(tp.y, groundY(tp.x, tp.z) + 1.5);
  if (!camInit) { camPos.copy(tp); camLook.copy(tl); camInit = true; }
  camPos.lerp(tp, k); camLook.lerp(tl, Math.min(1, k * 2));
  camera.position.copy(camPos); camera.lookAt(camLook);
}

// ---------------- Laço principal ----------------
let last = performance.now(), hudT = 0, t = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  if (!bus) return;
  if (state === 'driving') {
    // entrada
    let st = 0;
    if (save.steer === 'wheel') { if (wheelPtr === null) wheelAng *= Math.pow(0.02, dt); st = wheelAng / 160; $('wheel').style.transform = `rotate(${wheelAng}deg)`; }
    else if (save.steer === 'buttons') { input.steerTarget += ((btnR - btnL) - input.steerTarget) * Math.min(1, dt * 5); st = input.steerTarget; }
    else st = tilt;
    const kL = keys.ArrowLeft || keys.KeyA, kR = keys.ArrowRight || keys.KeyD;
    if (kL || kR) st = (kR ? 1 : 0) - (kL ? 1 : 0);
    const thr = Math.max(input.throttle, (keys.ArrowUp || keys.KeyW) ? 1 : 0), brk = Math.max(input.brake, (keys.ArrowDown || keys.KeyS || keys.Space) ? 1 : 0);
    bus.update(dt, { throttle: thr, brake: brk, steer: st }, traffic);
    traffic.update(dt, bus);
    route.update(dt, bus, ui);
    checkRedLight();
    if (route.finished) finishTrip();
    gameHour = (gameHour + dt * 12 / 3600) % 24;
    sound.engine(Math.min(1, bus.kmh / 70 + thr * 0.25), thr, bus.kmh);
    // sinal de parada
    const ns = route.nextStop;
    if (ns && route.onboard > 0 && route.distToStop < 180 && bellRung !== route.next) { bellRung = route.next; sound.play('bell'); ui.toast('🔔 Passageiro pediu parada'); }
    $('stopHint').classList.toggle('hidden', !(ns && route.distToStop < 70 && !ns.served));
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; updateHUD(); }
  } else sound.engine(0, 0, 0);
  const night = updateSky();
  if (state === 'driving' || state === 'paused') updateCamera(dt);
  else { // órbita no menu
    const a = t * 0.08; camera.position.set(bus.x + Math.sin(a) * 26, bus.y + 7, bus.z + Math.cos(a) * 26); camera.lookAt(bus.x, bus.y + 2, bus.z);
  }
  updateScenery(sceneryRefs, dt, t, night, camera.position, CULL[save.quality]);
  renderer.render(scene, camera);
}

function checkRedLight() {
  let inside = null;
  for (const id of nearNodes()) { const n = graph.nodes[id]; if (n.light && Math.hypot(n.x - bus.x, n.z - bus.z) < n.trim + 1) inside = n; }
  if (inside && inside !== lastNode && bus.kmh > 12) {
    const f = bus.forward; let best = null, bd = 2;
    for (const eid of inside.edges) {
      const e = graph.edges[eid]; const p = e.a === inside.id ? e.pts[1] : e.pts[e.pts.length - 2];
      const dx = p[0] - inside.x, dz = p[1] - inside.z, l = Math.hypot(dx, dz); const dot = (dx * f[0] + dz * f[1]) / l;
      if (dot < bd) { bd = dot; best = eid; }
    }
    if (best !== null && traffic.lightState(inside, best) === 2) { fines += 100; ui.toast('Avançou o sinal vermelho! −R$ 100', true); sound.play('fine'); }
  }
  lastNode = inside;
}
let nnCache = [], nnT = 0;
function nearNodes() {
  nnT -= 1; if (nnT > 0) return nnCache; nnT = 20;
  nnCache = graph.nodes.filter(n => Math.abs(n.x - bus.x) < 150 && Math.abs(n.z - bus.z) < 150).map(n => n.id); return nnCache;
}

function updateHUD() {
  $('spd').textContent = Math.round(bus.kmh); $('gear').textContent = bus.doors ? 'PORTAS' : (bus.gear > 0 ? 'D' : 'R');
  const hh = Math.floor(gameHour), mi = Math.floor((gameHour % 1) * 60); $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  $('cash').textContent = fmt((route.earn || 0) - fines - (route.fines || 0));
  $('pax').textContent = `👥 ${route.onboard || 0}/70`;
  const ns = route.nextStop;
  if (route.free) $('nextStop').textContent = `📍 ${ZONE_NAMES[zoneAt(bus.x, bus.z)] || ''}`;
  else if (route.offRoute) $('nextStop').textContent = '⚠ Fora da rota — siga a linha amarela';
  else if (ns) $('nextStop').textContent = `${ns.terminal === 'end' ? '🏁' : '🚏'} ${ns.name} • ${route.distToStop > 1000 ? (route.distToStop / 1000).toFixed(1) + ' km' : Math.round(route.distToStop || 0) + ' m'} • ${ns.waiting} esperando`;
  drawMinimap();
}

// atalhos de depuração (testes)
window.game = { look: (p, q) => { freeCam = p ? { p, q } : null; }, toggleDoors: () => toggleDoors(), get bus() { return bus; }, get route() { return route; }, setHour: (h) => { gameHour = h; }, cam: (m) => { camMode = m; camInit = false; },
  tp: (x, z, h = 0) => { bus.place(x, z, h); camInit = false; traffic.clear(); } };

load().catch(err => { $('loadtxt').textContent = 'Erro ao carregar: ' + err.message; console.error(err); });
