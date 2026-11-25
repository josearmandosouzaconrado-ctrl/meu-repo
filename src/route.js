// Linha de ônibus: rota, pontos de parada, passageiros e pontuação.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { graph, ROAD_TYPES, nearestNode, shortestPath, edgePoint, zoneAt, ZONE_NAMES } from './map.js';
import { groundY } from './scenery.js';
import { rng } from './textures.js';

export const FARE = 4.7;
const STOP_NAMES = {
  centro: ['Central do Brasil', 'Praça XV', 'Candelária', 'Cinelândia', 'Carioca', 'Rua da Assembleia', 'Presidente Vargas'],
  zn: ['Méier', 'Jacaré', 'Engenho Novo', 'Maracanã', 'Tijuca', 'Vila Isabel', 'Cachambi', 'Del Castilho'],
  zs: ['Copacabana', 'Posto 6', 'Ipanema', 'Leblon', 'Praça General Osório', 'Posto 9', 'Arpoador', 'Jardim de Alah'],
  barra: ['Barra Shopping', 'Jardim Oceânico', 'Alvorada', 'Pepê', 'Reserva', 'Recreio'],
  industrial: ['Av. Brasil', 'Penha', 'Bonsucesso', 'Irajá', 'Deodoro', 'Realengo', 'Bangu'],
  rural: ['Sítio Boa Vista', 'Fazenda Esperança', 'Porteira Azul', 'Grota Funda', 'Rio da Prata', 'Pedra Branca', 'Mato Alto', 'Cachoeira'],
  vila: ['Vila Santa Rita', 'Igreja Matriz', 'Praça da Vila'],
  suburb: ['Jacarepaguá', 'Taquara', 'Freguesia', 'Cidade de Deus', 'Curicica', 'Tanque'],
  aterro: ['Glória', 'Flamengo', 'Botafogo', 'Aterro', 'Largo do Machado'],
  tijuca: ['Túnel Rebouças', 'Rio Comprido', 'Lagoa'],
};

function personGeo() {
  const col = (g, hex) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const c = new THREE.Color(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  return mergeGeometries([
    col(new THREE.CylinderGeometry(0.16, 0.18, 0.85, 6).translate(0, 0.42, 0), '#2e3b55'),
    col(new THREE.CylinderGeometry(0.22, 0.2, 0.7, 6).translate(0, 1.2, 0), '#ffffff'),
    col(new THREE.SphereGeometry(0.15, 6, 5).translate(0, 1.7, 0), '#c68e63'),
  ]);
}
function shelterGeo() {
  const col = (g, hex) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const c = new THREE.Color(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  return mergeGeometries([
    col(new THREE.BoxGeometry(4.2, 0.12, 1.8).translate(0, 2.6, 0), '#2a6fb0'),
    col(new THREE.BoxGeometry(4.2, 2.0, 0.08).translate(0, 1.5, -0.85), '#9fc6e0'),
    col(new THREE.BoxGeometry(0.1, 2.6, 0.1).translate(-2, 1.3, -0.8), '#888888'),
    col(new THREE.BoxGeometry(0.1, 2.6, 0.1).translate(2, 1.3, -0.8), '#888888'),
    col(new THREE.BoxGeometry(3, 0.1, 0.45).translate(0, 0.5, -0.55), '#7a5a3a'),
    col(new THREE.BoxGeometry(0.08, 3.2, 0.08).translate(2.6, 1.6, 0.6), '#666666'),
    col(new THREE.BoxGeometry(0.7, 0.7, 0.05).translate(2.6, 3.0, 0.6), '#1d5fb3'),
  ]);
}

export class Route {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.pGeo = personGeo(); this.sGeo = shelterGeo();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  start(line, seed = Date.now()) {
    this.clear(); this.line = line; const r = rng(seed); this.r = r;
    const nodes = line.way.map(w => nearestNode(w[0], w[1]));
    this.segments = [];
    for (let i = 0; i < nodes.length - 1; i++) this.segments.push(...shortestPath(nodes[i].id, nodes[i + 1].id));
    this.free = this.segments.length === 0;
    // polilinha da rota na faixa da direita
    this.pts = []; this.cum = [0];
    const add = (x, z) => { const n = this.pts.length; if (n && Math.hypot(x - this.pts[n - 1][0], z - this.pts[n - 1][1]) < 0.5) return; if (n) this.cum.push(this.cum[n - 1] + Math.hypot(x - this.pts[n - 1][0], z - this.pts[n - 1][1])); this.pts.push([x, z]); };
    const startNode = nodes[0];
    this.next = 0; this.progress = 0; this.lastIdx = 0; this.onboard = 0; this.boarded = 0; this.alighted = 0; this.earn = 0; this.fines = 0; this.skipped = 0; this.served = 0;
    if (this.free) { this.startPose = this.poseOnEdge(graph.edges[startNode.edges[0]], 1, 20); this.stops = []; return; }
    for (const sg of this.segments) {
      const e = sg.edge; const T = ROAD_TYPES[e.type];
      const n = Math.max(2, Math.ceil(e.len / 12));
      for (let k = 0; k <= n; k++) {
        const s = sg.dir > 0 ? (k / n) * e.len : (1 - k / n) * e.len; const p = edgePoint(e, s);
        const dx = p.dx * sg.dir, dz = p.dz * sg.dir; add(p.x - dz * T.lane, p.z + dx * T.lane);
      }
    }
    this.length = this.cum[this.cum.length - 1];
    // pontos de parada
    this.stops = []; let acc = 0; let routeS = 0; const used = new Set();
    const spacing = line.id.startsWith('8') ? 700 : 480;
    this.segments.forEach((sg, idx) => {
      const e = sg.edge; const na = graph.nodes[sg.dir > 0 ? e.a : e.b], nb = graph.nodes[sg.dir > 0 ? e.b : e.a];
      const first = idx === 0, last = idx === this.segments.length - 1;
      const s0 = na.trim + 18, s1 = e.len - nb.trim - 22;
      const cand = [];
      if (first && s1 > s0) cand.push(Math.min(s1, s0 + 10));
      if (!e.tunnel && s1 > s0) for (let s = s0; s <= s1; s += 30) if (acc + (s - s0) >= spacing) { cand.push(s); acc = -(s - s0); break; }
      if (last && s1 > s0) cand.push(s1);
      for (const s of cand) {
        const key = `${e.id}|${Math.round(s / 20)}`; if (used.has(key)) continue; used.add(key);
        this.addStop(e, sg.dir, s, routeS + s, first && s === cand[0], last && s === cand[cand.length - 1]);
      }
      acc += Math.max(0, s1 - s0); routeS += e.len;
    });
    // ajusta distância de cada parada para a polilinha
    for (const st of this.stops) st.d = this.project(st.x, st.z, 0, true).s;
    this.stops.sort((a, b) => a.d - b.d);
    this.stops[0].terminal = 'start'; this.stops[this.stops.length - 1].terminal = 'end';
    this.stops[0].waiting = Math.max(3, this.stops[0].waiting);
    this.stops[this.stops.length - 1].waiting = 0;
    for (const st of this.stops) this.makeStopMesh(st);
    this.next = 0; this.progress = 0; this.lastIdx = 0;
    this.onboard = 0; this.boarded = 0; this.alighted = 0; this.earn = 0; this.fines = 0; this.skipped = 0; this.served = 0;
    const s0 = this.stops[0]; this.startPose = { x: s0.lx - s0.dx * 25, z: s0.lz - s0.dz * 25, h: Math.atan2(s0.dx, s0.dz) };
    this.startTime = performance.now();
  }

  poseOnEdge(e, dir, s) { const p = edgePoint(e, s); const T = ROAD_TYPES[e.type]; return { x: p.x - p.dz * T.lane, z: p.z + p.dx * T.lane, h: Math.atan2(p.dx, p.dz) }; }

  addStop(e, dir, s, approxD, isStart, isEnd) {
    const sa = dir > 0 ? s : e.len - s; const p = edgePoint(e, sa); const T = ROAD_TYPES[e.type];
    const dx = p.dx * dir, dz = p.dz * dir; const rx = -dz, rz = dx;
    const zone = zoneAt(p.x, p.z); const off = e.type === 'terra' ? T.half + 2.2 : T.width / 2 - 1.5; const names = STOP_NAMES[zone] || STOP_NAMES.suburb;
    const name = isStart || isEnd ? (isStart ? 'Terminal ' : 'Terminal ') + names[Math.floor(this.r() * names.length)] : names[Math.floor(this.r() * names.length)];
    const w = isEnd ? 0 : Math.floor(this.r() * (zone === 'rural' ? 4 : 8)) + (this.r() < 0.2 ? 0 : 1);
    this.stops.push({
      e, dir, s, name, zone: ZONE_NAMES[zone] || zone, waiting: w, x: p.x + rx * off, z: p.z + rz * off,
      lx: p.x + rx * T.lane, lz: p.z + rz * T.lane, dx, dz, rx, rz, served: false, d: approxD, people: [],
    });
  }

  makeStopMesh(st) {
    const g = new THREE.Group(); const y = groundY(st.x, st.z);
    const sh = new THREE.Mesh(this.sGeo, this.mat); sh.position.set(st.x + st.rx * 0.8, y, st.z + st.rz * 0.8);
    sh.rotation.y = Math.atan2(-st.rx, -st.rz); g.add(sh);
    // placa com nome
    const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d');
    x.fillStyle = '#1d5fb3'; x.fillRect(0, 0, 256, 48); x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center';
    x.fillText(st.name.slice(0, 22), 128, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    pl.position.set(sh.position.x, y + 3.1, sh.position.z); pl.rotation.y = sh.rotation.y; g.add(pl);
    // marcador no chão (área de parada)
    const mk = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 14), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false }));
    mk.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group(); holder.add(mk); holder.position.set(st.lx, y + 0.07, st.lz); holder.rotation.y = Math.atan2(st.dx, st.dz); g.add(holder); st.marker = mk;
    // passageiros
    if (st.waiting) {
      const im = new THREE.InstancedMesh(this.pGeo, this.mat, st.waiting); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
      const shirts = ['#ffffff', '#e63946', '#f1c40f', '#2a9d8f', '#457b9d', '#f4a261', '#8e44ad', '#2ecc71'];
      for (let i = 0; i < st.waiting; i++) {
        const along = (i - st.waiting / 2) * 0.9 + (this.r() - 0.5) * 0.3, side = 0.3 + this.r() * 0.9;
        const px = st.x + st.dx * along + st.rx * side, pz = st.z + st.dz * along + st.rz * side;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-st.rx, -st.rz) + (this.r() - 0.5));
        m4.compose(new THREE.Vector3(px, y, pz), q, new THREE.Vector3(1, 0.9 + this.r() * 0.2, 1)); im.setMatrixAt(i, m4);
        im.setColorAt(i, new THREE.Color(shirts[Math.floor(this.r() * shirts.length)]));
      }
      g.add(im); st.crowd = im;
    }
    this.group.add(g); st.group = g;
  }

  // Projeção na rota (busca local a partir do último índice)
  project(x, z, from = this.lastIdx || 0, full = false) {
    let best = { d: Infinity, s: 0, i: from };
    const a = full ? 0 : Math.max(0, from - 30), b = full ? this.pts.length - 1 : Math.min(this.pts.length - 1, from + 60);
    for (let i = a; i < b; i++) {
      const p = this.pts[i], q = this.pts[i + 1]; const dx = q[0] - p[0], dz = q[1] - p[1]; const l2 = dx * dx + dz * dz || 1;
      let t = ((x - p[0]) * dx + (z - p[1]) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const px = p[0] + dx * t, pz = p[1] + dz * t; const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, s: this.cum[i] + Math.sqrt(l2) * t, i };
    }
    return best;
  }

  update(dt, bus, ui) {
    if (this.free || !this.stops.length) return;
    let pr = this.project(bus.x, bus.z);
    if (pr.d > 60) { const f = this.project(bus.x, bus.z, 0, true); if (f.d < pr.d) pr = f; }
    this.lastIdx = pr.i; this.offRoute = pr.d > 35; this.progress = pr.s;
    const st = this.stops[this.next]; if (!st) return;
    st.marker.material.opacity = 0.25 + Math.sin(performance.now() / 250) * 0.15;
    const along = pr.s - st.d; const lat = Math.hypot(bus.x - st.lx, bus.z - st.lz);
    this.distToStop = Math.max(0, st.d - pr.s);
    this.atStop = Math.abs(along) < 12 && lat < 14;
    // atendimento no ponto
    if (this.atStop && bus.kmh < 2 && bus.doors) {
      if (!st.arrived) {
        st.arrived = true; st.timer = 0;
        st.toAlight = st.terminal === 'end' ? this.onboard : Math.min(this.onboard, Math.floor(this.r() * (this.onboard * 0.5 + 1)));
        if (st.toAlight || st.waiting) ui.toast(`${st.name}: ${st.toAlight} descem, ${st.waiting} sobem`);
      }
      st.timer += dt;
      if (st.timer > 0.45) {
        st.timer = 0;
        if (st.toAlight > 0) { st.toAlight--; this.onboard--; this.alighted++; ui.sfx?.('step'); }
        else if (st.waiting > 0 && this.onboard < 70) {
          st.waiting--; this.onboard++; this.boarded++; this.earn += FARE; ui.sfx?.('coin');
          if (st.crowd) st.crowd.count = st.waiting;
        } else if (!st.served) {
          st.served = true; this.served++; ui.toast(st.terminal === 'end' ? 'Fim da linha! 🏁' : 'Embarque concluído — feche as portas 🚪');
        }
      }
    }
    if (st.served && !bus.doors) {
      if (st.terminal === 'end') { this.finished = true; return; }
      st.marker.visible = false; this.next++;
    }
    // passou do ponto sem parar
    if (!st.served && along > 25) {
      if (st.waiting > 0 || (st.arrived && st.toAlight > 0)) { this.skipped++; this.fines += 20; ui.toast(`Ponto "${st.name}" pulado! −R$ 20`, true); }
      st.marker.visible = false;
      if (st.terminal === 'end') { this.finished = true; return; }
      this.next++;
    }
  }

  get nextStop() { return this.stops?.[this.next]; }

  results(fines) {
    const total = this.earn - fines;
    const secs = (performance.now() - this.startTime) / 1000;
    const stars = Math.max(1, Math.min(5, 5 - this.skipped - Math.floor(fines / 150)));
    return { total, secs, stars };
  }

  clear() { this.group.clear(); this.stops = []; this.finished = false; }
}
