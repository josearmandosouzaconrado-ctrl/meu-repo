// Mapa do Rio de Janeiro (estilizado): malha viária, zonas, água e relevo.
// Coordenadas em metros: x = leste, z = sul (norte = -z).

export const WORLD = 4096; // metade do tamanho do mundo (8,2 km x 8,2 km)

// Tipos de via: textura, largura total, meia-largura do asfalto, deslocamento da faixa
export const ROAD_TYPES = {
  avenida: { tex: 'rua_amarela', width: 20, half: 5.6, lane: 2.8, speed: 60 },
  rua: { tex: 'rua_branca', width: 20, half: 5.6, lane: 2.8, speed: 50 },
  orla: { tex: 'rua_amarela', width: 20, half: 5.6, lane: 2.8, speed: 60 },
  paralelepipedo: { tex: 'rua_paralelepipedo', width: 20, half: 5.6, lane: 2.8, speed: 40 },
  corredor: { tex: 'rua_corredor', width: 26, half: 8.0, lane: 4.0, speed: 70 },
  terra: { tex: 'terra', width: 11, half: 4.6, lane: 2.2, speed: 50 },
};

export const TUNNEL = { x: 400, z0: -1088, z1: 192, name: 'Túnel Rebouças' };

const roads = [];
function road(pts, type, name, opts = {}) { roads.push({ pts: pts.map(p => [p[0], p[1]]), type, name, ...opts }); }

function grid(name, x0, z0, cols, rows, spx, spz, typeRow, typeCol) {
  for (let j = 0; j < rows; j++) {
    const z = z0 + j * spz; const t = typeof typeRow === 'function' ? typeRow(j) : typeRow;
    road([[x0, z], [x0 + (cols - 1) * spx, z]], t, `${name} - Rua ${j + 1}`);
  }
  for (let i = 0; i < cols; i++) {
    const x = x0 + i * spx; const t = typeof typeCol === 'function' ? typeCol(i) : typeCol;
    road([[x, z0], [x, z0 + (rows - 1) * spz]], t, `${name} - Travessa ${i + 1}`);
  }
}

// Curva suave passando pelos pontos de controle (Catmull-Rom)
function curvy(ctrl, step = 22) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([k === 0 ? p1[0] : f(p0[0], p1[0], p2[0], p3[0]), k === 0 ? p1[1] : f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

// ---------------- Definição das vias ----------------
// Centro
grid('Centro', 1400, -2280, 7, 6, 120, 120, j => (j === 2 ? 'avenida' : 'rua'), i => (i === 3 ? 'avenida' : 'rua'));
// Lapa (paralelepípedo) - quadras extras ao sul do Centro
road([[1400, -1560], [1880, -1560]], 'paralelepipedo', 'Rua da Lapa');
road([[1400, -1680], [1400, -1560]], 'paralelepipedo', 'Rua Mem de Sá');
road([[1640, -1680], [1640, -1560]], 'paralelepipedo', 'Rua Joaquim Silva');
road([[1880, -1680], [1880, -1560]], 'paralelepipedo', 'Rua do Riachuelo');
// Zona Norte
grid('Zona Norte', -1400, -2600, 9, 7, 110, 110, j => (j === 4 ? 'avenida' : 'rua'), i => (i === 4 ? 'avenida' : 'rua'));
// Zona Sul (Leblon, Ipanema, Copacabana)
grid('Zona Sul', -200, 1900, 19, 5, 120, 110, j => (j === 4 ? 'orla' : j === 2 ? 'avenida' : 'rua'), 'rua');
// Vila rural (paralelepípedo)
grid('Vila Santa Rita', -2900, -400, 3, 3, 120, 120, 'paralelepipedo', 'paralelepipedo');

// Avenida Brasil (corredor BRT)
road([[1400, -2280], [1400, -3000], [-3300, -3000], [-3450, -2880], [-3600, -2600]], 'corredor', 'Avenida Brasil');
road([[-1400, -2600], [-1400, -3000]], 'avenida', 'Av. dos Democráticos');
road([[-520, -2600], [-520, -3000]], 'avenida', 'Av. Leopoldina');
// Radial: Zona Norte -> Centro
road([[-520, -2160], [400, -2160], [1400, -2160]], 'avenida', 'Av. Presidente Vargas');
// Túnel Rebouças: Zona Norte -> Zona Sul
road([[400, -2160], [400, TUNNEL.z0], [400, TUNNEL.z1], [400, 1900]], 'avenida', 'Túnel Rebouças / Av. Epitácio Pessoa');
// Aterro do Flamengo: Centro -> Zona Sul
road([[2120, -1680], [2400, -1400], [2400, 1700], [2250, 1900], [1960, 1900]], 'avenida', 'Aterro do Flamengo');
// Orla do Leme
road([[1960, 2340], [2550, 2340]], 'orla', 'Av. Atlântica (Leme)');
// Orla oeste até a Barra
road([[-200, 2340], [-3400, 2340]], 'orla', 'Av. Lúcio Costa');
// Av. das Américas (corredor BRT)
road([[-200, 1900], [-500, 1900], [-700, 1800], [-3400, 1800], [-3700, 1600]], 'corredor', 'Av. das Américas');
for (const x of [-1000, -1400, -1800, -2200, -2600, -3000, -3400]) road([[x, 1800], [x, 2340]], 'rua', 'Barra - Rua ' + (x / -100));
road([[-1000, 2070], [-3400, 2070]], 'rua', 'Av. Olegário Maciel');
// Linha Amarela
road([[-1400, 1800], [-1400, -1940]], 'avenida', 'Linha Amarela');
// Jacarepaguá
road([[-1400, -800], [-900, -800], [-900, -300], [-1400, -300]], 'rua', 'Estrada do Tindiba');
road([[-1400, 900], [-1000, 900], [-1000, 1400], [-1400, 1400]], 'rua', 'Estrada do Gabinal');

// Zona rural (estradas de terra e asfalto antigo)
road(curvy([[-1400, 0], [-1700, 80], [-2000, -60], [-2300, -200], [-2500, -280], [-2660, -280]]), 'rua', 'Estrada dos Bandeirantes', { curvy: true });
road(curvy([[-2780, -400], [-2700, -800], [-2950, -1300], [-3150, -1800], [-3350, -2200], [-3600, -2600]]), 'terra', 'Estrada do Campinho', { curvy: true });
road(curvy([[-2780, -160], [-2650, 300], [-2850, 800], [-2800, 1300], [-3000, 1800]]), 'terra', 'Estrada da Grota Funda', { curvy: true });
road(curvy([[-2900, -280], [-3300, -250], [-3750, -100], [-3800, 500], [-3750, 1100], [-3700, 1600]]), 'terra', 'Estrada de Guaratiba', { curvy: true });
road(curvy([[-2000, -60], [-2100, -600], [-2400, -1000], [-2700, -800]]), 'terra', 'Estrada do Sítio', { curvy: true });
road(curvy([[-2850, 800], [-3300, 700], [-3800, 500]]), 'terra', 'Estrada da Serra', { curvy: true });
road(curvy([[-2300, -200], [-2250, -1400], [-2600, -2000], [-3150, -1800]]), 'terra', 'Estrada do Mato Alto', { curvy: true });

// ---------------- Construção do grafo ----------------
const key = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

function segInter(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return { t, u, p: [a[0] + r[0] * t, a[1] + r[1] * t] };
  return null;
}
function distPointSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + dx * t, z = a[1] + dz * t; return { d: Math.hypot(p[0] - x, p[1] - z), t };
}

function buildGraph() {
  // 1) cruzamentos entre vias
  const inserts = roads.map(r => r.pts.map(() => []));
  const anchors = new Set([key(TUNNEL.x, TUNNEL.z0), key(TUNNEL.x, TUNNEL.z1)]);
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    const A = roads[i].pts, B = roads[j].pts;
    for (let a = 0; a < A.length - 1; a++) {
      const minx = Math.min(A[a][0], A[a + 1][0]) - 1, maxx = Math.max(A[a][0], A[a + 1][0]) + 1;
      const minz = Math.min(A[a][1], A[a + 1][1]) - 1, maxz = Math.max(A[a][1], A[a + 1][1]) + 1;
      for (let b = 0; b < B.length - 1; b++) {
        if (Math.max(B[b][0], B[b + 1][0]) < minx || Math.min(B[b][0], B[b + 1][0]) > maxx) continue;
        if (Math.max(B[b][1], B[b + 1][1]) < minz || Math.min(B[b][1], B[b + 1][1]) > maxz) continue;
        const r = segInter(A[a], A[a + 1], B[b], B[b + 1]);
        if (r) { inserts[i][a].push({ t: r.t, p: r.p }); inserts[j][b].push({ t: r.u, p: r.p }); anchors.add(key(...r.p)); }
      }
    }
  }
  // 2) extremidades de uma via no meio de outra
  for (let i = 0; i < roads.length; i++) for (const end of [roads[i].pts[0], roads[i].pts[roads[i].pts.length - 1]]) {
    anchors.add(key(...end));
    for (let j = 0; j < roads.length; j++) {
      if (j === i) continue; const B = roads[j].pts;
      for (let b = 0; b < B.length - 1; b++) {
        const r = distPointSeg(end, B[b], B[b + 1]);
        if (r.d < 0.6) {
          if (r.t > 1e-4 && r.t < 1 - 1e-4) inserts[j][b].push({ t: r.t, p: [end[0], end[1]] });
          else anchors.add(key(...(r.t < 0.5 ? B[b] : B[b + 1])));
        }
      }
    }
  }
  for (let i = 0; i < roads.length; i++) {
    const out = [];
    roads[i].pts.forEach((p, a) => { out.push(p); inserts[i][a].sort((x, y) => x.t - y.t).forEach(q => out.push(q.p)); });
    // remove duplicados
    roads[i].pts = out.filter((p, k) => k === 0 || Math.hypot(p[0] - out[k - 1][0], p[1] - out[k - 1][1]) > 0.3);
  }
  // 3) nós
  const nodes = [], nodeMap = new Map();
  const getNode = (p) => { const k = key(p[0], p[1]); if (!nodeMap.has(k)) { nodeMap.set(k, nodes.length); nodes.push({ id: nodes.length, x: p[0], z: p[1], edges: [] }); } return nodeMap.get(k); };
  const edges = [];
  for (const r of roads) {
    const P = r.pts; let start = 0;
    for (let k = 1; k < P.length; k++) {
      let isNode = k === P.length - 1 || anchors.has(key(...P[k]));
      if (!isNode && !r.curvy) {
        const a1 = Math.atan2(P[k][1] - P[k - 1][1], P[k][0] - P[k - 1][0]);
        const a2 = Math.atan2(P[k + 1][1] - P[k][1], P[k + 1][0] - P[k][0]);
        let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da; if (da > 0.35) isNode = true;
      }
      if (isNode) {
        const pts = P.slice(start, k + 1);
        const a = getNode(pts[0]), b = getNode(pts[pts.length - 1]);
        if (a !== b) {
          const e = { id: edges.length, a, b, pts, type: r.type, name: r.name, len: 0, cum: [0] };
          for (let m = 1; m < pts.length; m++) { e.len += Math.hypot(pts[m][0] - pts[m - 1][0], pts[m][1] - pts[m - 1][1]); e.cum.push(e.len); }
          e.tunnel = pts.every(p => Math.abs(p[0] - TUNNEL.x) < 1 && p[1] >= TUNNEL.z0 - 1 && p[1] <= TUNNEL.z1 + 1);
          edges.push(e); nodes[a].edges.push(e.id); nodes[b].edges.push(e.id);
        }
        start = k;
      }
    }
  }
  // 4) raio de recorte nos nós + semáforos
  for (const n of nodes) {
    const es = n.edges.map(id => edges[id]);
    const maxHalf = Math.max(...es.map(e => ROAD_TYPES[e.type].half));
    let needs = es.length !== 2;
    if (es.length === 2) {
      const d1 = edgeDirAt(es[0], n.id), d2 = edgeDirAt(es[1], n.id);
      if (d1[0] * d2[0] + d1[1] * d2[1] > -0.985 || es[0].type !== es[1].type) needs = true;
    }
    n.trim = needs ? (es.length === 1 ? 0 : maxHalf + 0.2) : 0;
    n.disc = needs && es.length > 1 ? Math.max(...es.map(e => ROAD_TYPES[e.type].half)) * 1.45 : 0;
    n.dirt = es.every(e => e.type === 'terra');
    const z = zoneAt(n.x, n.z);
    n.light = es.length >= 3 && !es.some(e => e.type === 'terra') && ['centro', 'zs', 'zn', 'barra'].includes(z) && (es.length >= 4 || (n.id % 2 === 0));
  }
  return { nodes, edges };
}

export function edgeDirAt(e, nodeId) {
  // direção saindo do nó ao longo da aresta
  const P = e.pts;
  if (e.a === nodeId) { const dx = P[1][0] - P[0][0], dz = P[1][1] - P[0][1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; }
  const n = P.length; const dx = P[n - 2][0] - P[n - 1][0], dz = P[n - 2][1] - P[n - 1][1], l = Math.hypot(dx, dz); return [dx / l, dz / l];
}

// Ponto e direção a uma distância s ao longo da aresta (sentido a->b)
export function edgePoint(e, s) {
  s = Math.max(0, Math.min(e.len, s));
  let i = 1; while (i < e.cum.length - 1 && e.cum[i] < s) i++;
  const p0 = e.pts[i - 1], p1 = e.pts[i]; const seg = e.cum[i] - e.cum[i - 1] || 1; const t = (s - e.cum[i - 1]) / seg;
  const dx = (p1[0] - p0[0]) / seg, dz = (p1[1] - p0[1]) / seg;
  return { x: p0[0] + (p1[0] - p0[0]) * t, z: p0[1] + (p1[1] - p0[1]) * t, dx, dz };
}

// ---------------- Zonas ----------------
export const ZONE_NAMES = { centro: 'Centro', zs: 'Zona Sul', zn: 'Zona Norte', barra: 'Barra da Tijuca', rural: 'Zona Rural', vila: 'Vila Santa Rita', industrial: 'Av. Brasil', suburb: 'Jacarepaguá', tijuca: 'Floresta da Tijuca', aterro: 'Aterro do Flamengo' };
export function zoneAt(x, z) {
  if (Math.hypot(x + 2780, z + 280) < 320) return 'vila';
  if (x > 1300 && x < 2300 && z > -2400 && z < -1500) return 'centro';
  if (x > -400 && x < 2700 && z > 1700 && z < 2500) return 'zs';
  if (x > 2300 && z > -1500 && z < 1700) return 'aterro';
  if (x < -900 && z > 1600 && x > -3600) return 'barra';
  if (z < -2800) return 'industrial';
  if (x > -1600 && x < 1300 && z > -2800 && z < -1800) return 'zn';
  if (x > -200 && x < 1700 && z > -1300 && z < 800) return 'tijuca';
  if (x < -1900) return 'rural';
  return 'suburb';
}

// ---------------- Água e relevo ----------------
export const LAGOA = { x: 820, z: 1300, r: 250 };
export function isUrca(x, z) { return ((x - 3000) / 480) ** 2 + ((z - 1960) / 300) ** 2 < 1; }
export function isWater(x, z) {
  if (Math.hypot(x - LAGOA.x, z - LAGOA.z) < LAGOA.r) return true;
  if (z > 2600) return true;
  if (x > 2650 && !isUrca(x, z)) return true;
  return false;
}
export function isBeach(x, z) { return z > 2365 && z <= 2600 && x < 2600 && x > -3500; }

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; }

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Montanhas (altura sem recorte das vias)
export const PEAKS = {
  corcovado: { x: 900, z: -330, h: 340 },
  paoAcucar: { x: 3150, z: 2000, r: 170, h: 300 },
  urca: { x: 2880, z: 1890, r: 140, h: 170 },
  gavea: { x: -650, z: 1250, r: 300, h: 330 },
  morroFavela: { x: -900, z: -1480, r: 330, h: 85 },
  doisIrmaos: { x: -420, z: 1560, r: 170, h: 220 },
};
export function mountainHeight(x, z) {
  let h = 0;
  // Maciço da Tijuca (elipse) + pico do Corcovado
  const ex = (x - 650) / 1000, ez = (z + 420) / 900; const ed = Math.sqrt(ex * ex + ez * ez);
  if (ed < 1) h = Math.max(h, (1 - sstep(0.55, 1, ed)) * (120 + fbm(x / 260, z / 260) * 160));
  const dc = Math.hypot(x - PEAKS.corcovado.x, z - PEAKS.corcovado.z);
  h = Math.max(h, PEAKS.corcovado.h * Math.max(0, 1 - dc / 420) ** 1.6);
  for (const k of ['paoAcucar', 'urca', 'gavea', 'doisIrmaos', 'morroFavela']) {
    const p = PEAKS[k]; const d = Math.hypot(x - p.x, z - p.z) / p.r;
    if (d < 1) {
      const dome = k === 'gavea' ? Math.min(1, (1 - d * d) * 1.8) : k === 'morroFavela' ? (1 - d * d) : Math.pow(1 - d * d, 0.55);
      h = Math.max(h, p.h * dome);
    }
  }
  // Serras da zona rural
  if (x < -1900 && z > -2800 && z < 1650) {
    const edge = sstep(-1900, -2300, x) * sstep(-2800, -2550, z) * sstep(1650, 1400, z);
    h = Math.max(h, edge * Math.max(0, fbm(x / 520, z / 520) - 0.28) * 330);
  }
  // Morros ao fundo (borda do mapa)
  const border = Math.max(Math.abs(x), Math.abs(z));
  if (border > 3700 && !isWater(x, z)) h = Math.max(h, sstep(3700, 4050, border) * (90 + fbm(x / 300, z / 300) * 200));
  return h;
}

export const graph = buildGraph();

// Índice espacial dos segmentos de via (para distâncias)
const CELL = 128; const segIndex = new Map();
for (const e of graph.edges) {
  for (let m = 0; m < e.pts.length - 1; m++) {
    const a = e.pts[m], b = e.pts[m + 1];
    const x0 = Math.floor((Math.min(a[0], b[0]) - 20) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + 20) / CELL);
    const z0 = Math.floor((Math.min(a[1], b[1]) - 20) / CELL), z1 = Math.floor((Math.max(a[1], b[1]) + 20) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = i * 100000 + j; if (!segIndex.has(k)) segIndex.set(k, []); segIndex.get(k).push([a, b, e]); }
  }
}
export function nearestRoad(x, z, maxR = 256, skipTunnel = false) {
  let best = { d: Infinity, e: null, t: 0, seg: null };
  const r = Math.ceil(maxR / CELL); const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
    const L = segIndex.get(i * 100000 + j); if (!L) continue;
    for (const s of L) {
      if (skipTunnel && s[2].tunnel) continue;
      const q = distPointSeg([x, z], s[0], s[1]);
      if (q.d < best.d) best = { d: q.d, e: s[2], t: q.t, seg: s };
    }
  }
  return best;
}

export function terrainHeight(x, z) {
  if (isWater(x, z)) return -4;
  const m = mountainHeight(x, z);
  if (m <= 0.01) return 0;
  if (z >= TUNNEL.z0 && z <= TUNNEL.z1 && Math.abs(x - TUNNEL.x) < 300) return m;
  const d = nearestRoad(x, z, 256, true).d;
  return m * sstep(28, 150, d);
}

// Pontos nomeados (terminais) para as linhas
export function nearestNode(x, z) {
  let best = null, bd = Infinity;
  for (const n of graph.nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  return best;
}

export const LINES = [
  { id: '474', name: 'Jacaré ⇄ Copacabana', desc: 'Zona Norte → Túnel Rebouças → Zona Sul', color: '#b3121b', way: [[-960, -2490], [400, -2160], [400, 1900], [1600, 2340]] },
  { id: '133', name: 'Central ⇄ Leblon', desc: 'Centro → Lapa → Aterro do Flamengo → Ipanema', color: '#1d5fb3', way: [[1760, -2040], [1640, -1560], [2400, 0], [100, 2120]] },
  { id: 'LA1', name: 'Barra ⇄ Méier', desc: 'Orla da Barra → Linha Amarela → Zona Norte', color: '#d6a300', way: [[-2200, 2340], [-1400, 1800], [-1400, -1940], [-850, -2050]] },
  { id: '870', name: 'Vila Santa Rita ⇄ Campo Grande', desc: 'Zona Rural — estradas de terra e paralelepípedo', color: '#2f8a3a', way: [[-2780, -280], [-2700, -800], [-3600, -2600]] },
  { id: '872', name: 'Vila Santa Rita ⇄ Guaratiba', desc: 'Zona Rural → Serra → Barra', color: '#7a4a1d', way: [[-2900, -160], [-3750, -100], [-3700, 1600], [-2200, 1800]] },
  { id: '100', name: 'Central ⇄ Campo Grande', desc: 'Centro → Av. Brasil (corredor BRT) → Zona Oeste', color: '#6a2db3', way: [[2000, -2280], [1400, -3000], [-3600, -2600]] },
  { id: 'LIVRE', name: 'Modo Livre', desc: 'Dirija à vontade por todo o mapa (sem horário)', color: '#45556b', way: [[-960, -2380]] },
];

// Menor caminho (Dijkstra) entre nós; retorna lista de {edge, dir}
export function shortestPath(fromId, toId) {
  const N = graph.nodes.length; const dist = new Float64Array(N).fill(Infinity); const prev = new Array(N).fill(null);
  dist[fromId] = 0; const open = [[0, fromId]];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, u] = open.splice(bi, 1)[0]; if (d > dist[u]) continue; if (u === toId) break;
    for (const eid of graph.nodes[u].edges) {
      const e = graph.edges[eid]; const v = e.a === u ? e.b : e.a; const nd = d + e.len;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = { eid, from: u }; open.push([nd, v]); }
    }
  }
  const path = []; let c = toId;
  while (c !== fromId && prev[c]) { const p = prev[c]; path.unshift({ edge: graph.edges[p.eid], dir: graph.edges[p.eid].a === p.from ? 1 : -1 }); c = p.from; }
  return path;
}

export function totalRoadKm() { return graph.edges.reduce((s, e) => s + e.len, 0) / 1000; }
