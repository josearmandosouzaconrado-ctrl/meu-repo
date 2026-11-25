// Cenário: relevo, água, praias, prédios, árvores, pontos turísticos e fazendas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  WORLD, graph, ROAD_TYPES, TUNNEL, PEAKS, LAGOA, zoneAt, isWater, isBeach, mountainHeight, terrainHeight,
  nearestRoad, edgePoint, fbm,
} from './map.js';
import { FACADES, facadeTextures, groundTexture, waterTexture, rng } from './textures.js';

const N = 256, CELL = (WORLD * 2) / N;
let heights = null;

// ---------- Colisões ----------
const HC = 64; const colHash = new Map();
export const colliders = [];
function addCollider(c) {
  colliders.push(c);
  const r = c.r || Math.hypot(c.hw, c.hd);
  for (let i = Math.floor((c.x - r) / HC); i <= Math.floor((c.x + r) / HC); i++)
    for (let j = Math.floor((c.z - r) / HC); j <= Math.floor((c.z + r) / HC); j++) {
      const k = i * 10000 + j; if (!colHash.has(k)) colHash.set(k, []); colHash.get(k).push(c);
    }
}
export function queryColliders(x, z, r) {
  const out = new Set();
  for (let i = Math.floor((x - r) / HC); i <= Math.floor((x + r) / HC); i++)
    for (let j = Math.floor((z - r) / HC); j <= Math.floor((z + r) / HC); j++) { const L = colHash.get(i * 10000 + j); if (L) L.forEach(c => out.add(c)); }
  return out;
}
// teste OBB x OBB (SAT 2D)
export function obbOverlap(a, b) {
  const axes = [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = a.hw * Math.abs(a.c * ax + a.s * az) + a.hd * Math.abs(-a.s * ax + a.c * az);
    const rb = b.hw * Math.abs(b.c * ax + b.s * az) + b.hd * Math.abs(-b.s * ax + b.c * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}

// ---------- Altura do chão (mesma triangulação da malha) ----------
export function groundY(x, z) {
  if (Math.abs(x - TUNNEL.x) < 14 && z > TUNNEL.z0 - 40 && z < TUNNEL.z1 + 40) return 0;
  if (!heights) return 0;
  const gx = (x + WORLD) / CELL, gz = (z + WORLD) / CELL;
  const i = Math.max(0, Math.min(N - 1, Math.floor(gx))), j = Math.max(0, Math.min(N - 1, Math.floor(gz)));
  const fx = gx - i, fz = gz - j; const W = N + 1;
  const ha = heights[j * W + i], hb = heights[j * W + i + 1], hc = heights[(j + 1) * W + i], hd = heights[(j + 1) * W + i + 1];
  if (fx + fz < 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
  return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
}

function detailTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const r = rng(42);
  x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { const v = 150 + r() * 105; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildTerrain(scene, progress) {
  const W = N + 1; heights = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) heights[j * W + i] = terrainHeight(-WORLD + i * CELL, -WORLD + j * CELL);
  const col = new Float32Array(W * W * 3);
  const C = {
    concrete: [0.5, 0.49, 0.46], grass: [0.42, 0.58, 0.27], dryGrass: [0.58, 0.6, 0.33], forest: [0.2, 0.36, 0.15],
    rock: [0.52, 0.5, 0.47], sand: [0.9, 0.84, 0.64], seabed: [0.35, 0.45, 0.4], suburb: [0.5, 0.58, 0.38],
  };
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = -WORLD + i * CELL, z = -WORLD + j * CELL, h = heights[j * W + i];
    const hx = heights[j * W + Math.min(W - 1, i + 1)] - heights[j * W + Math.max(0, i - 1)];
    const hz = heights[Math.min(W - 1, j + 1) * W + i] - heights[Math.max(0, j - 1) * W + i];
    const slope = Math.hypot(hx, hz) / (2 * CELL);
    let c;
    if (isWater(x, z)) c = C.seabed;
    else if (isBeach(x, z)) c = C.sand;
    else if (h > 6) c = slope > 0.9 ? C.rock : C.forest;
    else {
      const zn = zoneAt(x, z);
      if (zn === 'centro' || zn === 'zs') c = C.concrete;
      else if (zn === 'zn' || zn === 'industrial' || zn === 'suburb') c = C.suburb;
      else if (zn === 'rural') c = fbm(x / 160, z / 160) > 0.55 ? C.dryGrass : C.grass;
      else c = C.grass;
    }
    const v = 0.92 + fbm(x / 40, z / 40) * 0.16;
    col.set([c[0] * v, c[1] * v, c[2] * v], (j * W + i) * 3);
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() });
  const CH = 32; const group = new THREE.Group(); group.name = 'terreno';
  for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
    const pos = [], colors = [], uvs = [], idx = []; const map = new Map();
    const vid = (i, j) => {
      const k = j * W + i; if (map.has(k)) return map.get(k);
      const x = -WORLD + i * CELL, z = -WORLD + j * CELL;
      pos.push(x, heights[k] - 0.05, z); colors.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); uvs.push(x / 24, z / 24);
      map.set(k, pos.length / 3 - 1); return map.get(k);
    };
    for (let j = cj * CH; j < (cj + 1) * CH; j++) for (let i = ci * CH; i < (ci + 1) * CH; i++) {
      const x0 = -WORLD + i * CELL, z0 = -WORLD + j * CELL;
      // buraco do túnel
      if (x0 < TUNNEL.x && x0 + CELL > TUNNEL.x && z0 >= TUNNEL.z0 - CELL - 0.1 && z0 + CELL <= TUNNEL.z1 + CELL + 0.1) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; group.add(m);
  }
  // chão na frente dos portais do túnel
  const fillMat = new THREE.MeshLambertMaterial({ color: 0x6b7a4a });
  for (const z of [TUNNEL.z0 - CELL / 2, TUNNEL.z1 + CELL / 2]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), fillMat); q.rotation.x = -Math.PI / 2;
    const i = Math.floor((TUNNEL.x + WORLD) / CELL); q.position.set(-WORLD + i * CELL + CELL / 2, -0.04, z); group.add(q);
  }
  scene.add(group);
  return group;
}

// ---------- Construtor de malhas mescladas ----------
class Builder {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  quad(a, b, c, d, nrm, uv, col) {
    const s = this.v; for (const q of [a, b, c, d]) { this.p.push(...q); this.n.push(...nrm); this.c.push(...col); }
    this.u.push(...uv); this.i.push(s, s + 1, s + 2, s, s + 2, s + 3); this.v += 4;
  }
  tri(a, b, c, nrm, uv, col) {
    const s = this.v; for (const q of [a, b, c]) { this.p.push(...q); this.n.push(...nrm); this.c.push(...col); }
    this.u.push(...uv); this.i.push(s, s + 1, s + 2); this.v += 3;
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere(); return g;
  }
}

// Caixa orientada (prédio). c,s = cos/sin do ângulo; frente ao longo de (c,s)
function addBox(B, o, H, f, tint, y0 = 0) {
  const { x, z, hw, hd, c, s } = o;
  const ax = [c * hw, s * hw], az = [-s * hd, c * hd];
  const P = (sx, sz, y) => [x + ax[0] * sx + az[0] * sz, y, z + ax[1] * sx + az[1] * sz];
  const tileW = f.cols * 4, tileH = f.floors * 3.3;
  const faces = [
    [P(-1, 1, 0), P(1, 1, 0), [-s, c], hw * 2], [P(1, 1, 0), P(1, -1, 0), [c, s], hd * 2],
    [P(1, -1, 0), P(-1, -1, 0), [s, -c], hw * 2], [P(-1, -1, 0), P(-1, 1, 0), [-c, -s], hd * 2],
  ];
  for (const [p0, p1, nn, w] of faces) {
    const u1 = Math.max(1, Math.round(w / tileW)), v1 = Math.max(1, Math.round(H / tileH * 2) / 2);
    B.quad([p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y0 + H, p1[2]], [p0[0], y0 + H, p0[2]], [nn[0], 0, nn[1]], [0, 0, u1, 0, u1, v1, 0, v1], tint);
  }
  const r = [tint[0] * 0.55, tint[1] * 0.55, tint[2] * 0.55];
  const t0 = P(-1, 1, 0), t1 = P(1, 1, 0), t2 = P(1, -1, 0), t3 = P(-1, -1, 0);
  B.quad([t0[0], y0 + H, t0[2]], [t1[0], y0 + H, t1[2]], [t2[0], y0 + H, t2[2]], [t3[0], y0 + H, t3[2]], [0, 1, 0], [0.01, 0.01, 0.02, 0.01, 0.02, 0.02, 0.01, 0.02], r);
}
function addGableRoof(B, o, H, col) {
  const { x, z, hw, hd, c, s } = o; const rh = Math.min(hw, hd) * 0.7; const ov = 0.5;
  const ax = [c * (hw + ov), s * (hw + ov)], az = [-s * (hd + ov), c * (hd + ov)];
  const P = (sx, sz, y) => [x + ax[0] * sx + az[0] * sz, y, z + ax[1] * sx + az[1] * sz];
  const A = P(-1, 1, H), Bp = P(1, 1, H), Cc = P(1, -1, H), D = P(-1, -1, H), E = P(-1, 0, H + rh), F = P(1, 0, H + rh);
  const n1 = [-s * 0.6, 0.8, c * 0.6], n2 = [s * 0.6, 0.8, -c * 0.6];
  B.quad(A, Bp, F, E, n1, [0, 0, 1, 0, 1, 1, 0, 1], col);
  B.quad(Cc, D, E, F, n2, [0, 0, 1, 0, 1, 1, 0, 1], col);
  const dk = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
  B.tri(Bp, Cc, F, [c, 0, s], [0, 0, 1, 0, 0.5, 1], dk);
  B.tri(D, A, E, [-c, 0, -s], [0, 0, 1, 0, 0.5, 1], dk);
}

const STYLES = {
  centro: { lot: [16, 30], depth: [18, 30], h: [22, 110], fac: [0, 1, 5, 2, 0], setback: 1.0, gap: [0, 3], skip: 0.05 },
  zs: { lot: [14, 22], depth: [16, 24], h: [18, 48], fac: [1, 2, 5, 1], setback: 1.0, gap: [0, 2], skip: 0.05 },
  barra: { lot: [28, 44], depth: [24, 34], h: [30, 95], fac: [0, 1, 0], setback: 16, gap: [20, 60], skip: 0.2 },
  zn: { lot: [8, 14], depth: [10, 15], h: [3.5, 13], fac: [3, 3, 4, 2, 1, 3], setback: 1.0, gap: [0, 2], skip: 0.06, roof: 0.7 },
  suburb: { lot: [9, 16], depth: [10, 16], h: [3.5, 9], fac: [3, 3, 4, 1], setback: 2, gap: [2, 14], skip: 0.25, roof: 0.8 },
  industrial: { lot: [30, 60], depth: [25, 40], h: [8, 14], fac: [1], setback: 6, gap: [6, 30], skip: 0.25, gray: true },
  vila: { lot: [9, 13], depth: [9, 12], h: [3.5, 7], fac: [3], setback: 1.0, gap: [0, 3], skip: 0.1, roof: 1 },
  rural: { lot: [10, 14], depth: [9, 12], h: [3.5, 5], fac: [3], setback: 10, gap: [80, 260], skip: 0.6, roof: 1 },
};
const PASTEL = ['#f4a259', '#5bc0be', '#f25f5c', '#ffe066', '#9bc53d', '#c3a5e6', '#ffffff', '#7fb7e6', '#f7d6bf', '#e3b04b', '#a3d9a5', '#f28ab2'];
const hexRGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// Áreas reservadas (pontos turísticos)
const EXCL = [
  { x: 150, z: -1880, r: 140 }, // Maracanã
  { x: 1640, z: -1515, r: 150 }, // Arcos da Lapa
  { x: -2840, z: -340, r: 40 }, // Igreja da vila
];
const inExcl = (x, z, pad = 0) => EXCL.some(e => Math.hypot(x - e.x, z - e.z) < e.r + pad);

function placeBuildings(quality) {
  const r = rng(1234); const R = (a) => a[0] + r() * (a[1] - a[0]);
  const chunks = new Map(); const roofChunks = new Map();
  const getB = (map, key) => { if (!map.has(key)) map.set(key, new Builder()); return map.get(key); };
  const placed = []; const pHash = new Map(); const PH = 48;
  const overlapsPlaced = (o) => {
    const rr = Math.hypot(o.hw, o.hd);
    for (let i = Math.floor((o.x - rr - 40) / PH); i <= Math.floor((o.x + rr + 40) / PH); i++)
      for (let j = Math.floor((o.z - rr - 40) / PH); j <= Math.floor((o.z + rr + 40) / PH); j++) {
        const L = pHash.get(i * 10000 + j); if (L) for (const q of L) if (obbOverlap(o, q)) return true;
      }
    return false;
  };
  const addPlaced = (o) => { placed.push(o); const k = Math.floor(o.x / PH) * 10000 + Math.floor(o.z / PH); if (!pHash.has(k)) pHash.set(k, []); pHash.get(k).push(o); };
  const density = [0.55, 0.8, 1][quality];
  let count = 0;
  for (const e of graph.edges) {
    if (e.tunnel) continue;
    const T = ROAD_TYPES[e.type]; const na = graph.nodes[e.a], nb = graph.nodes[e.b];
    for (const side of [1, -1]) {
      let s = na.trim + 4;
      while (s < e.len - nb.trim - 4) {
        const mid = edgePoint(e, s); const zone = zoneAt(mid.x, mid.z); const S = STYLES[zone];
        if (!S) { s += 30; continue; }
        const w = R(S.lot), d = R(S.depth); const sc = s + w / 2;
        if (sc + w / 2 > e.len - nb.trim - 2) break;
        const p = edgePoint(e, sc); const rx = -p.dz * side, rz = p.dx * side;
        const off = T.width / 2 + S.setback + d / 2;
        const o = { x: p.x + rx * off, z: p.z + rz * off, hw: w / 2, hd: d / 2, c: p.dx, s: p.dz };
        s += w + R(S.gap);
        if (r() < S.skip || r() > density) continue;
        if (e.type === 'orla' && rz > 0) continue; // lado da praia
        if (isWater(o.x, o.z) || isBeach(o.x, o.z) || o.z > 2330 && Math.abs(o.x) < 4000 && o.z + Math.max(w, d) > 2350 || inExcl(o.x, o.z, Math.max(w, d) / 2)) continue;
        // cantos e meios das faces
        let ok = true;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const px = o.x + p.dx * o.hw * sx - p.dz * o.hd * sz, pz = o.z + p.dz * o.hw * sx + p.dx * o.hd * sz;
          if (mountainHeight(px, pz) > 1.5 || isWater(px, pz) || isBeach(px, pz)) { ok = false; break; }
          const nr = nearestRoad(px, pz, 40); if (nr.e && nr.d < ROAD_TYPES[nr.e.type].width / 2 + 0.3) { ok = false; break; }
        }
        if (!ok || overlapsPlaced(o)) continue;
        const fi = S.fac[Math.floor(r() * S.fac.length)]; const f = FACADES[fi];
        let H = R(S.h); if (zone === 'centro' && r() < 0.5) H *= 0.6;
        if (fi === 3 || fi === 4) H = Math.min(H, 7 + r() * 3);
        let tint = [1, 1, 1];
        if (fi === 3) tint = hexRGB(PASTEL[Math.floor(r() * PASTEL.length)]);
        else if (S.gray) tint = [0.75, 0.76, 0.78];
        else { const v = 0.85 + r() * 0.15; tint = [v, v, v * (0.95 + r() * 0.05)]; }
        const key = `${fi}|${Math.floor(o.x / 600)},${Math.floor(o.z / 600)}`;
        addBox(getB(chunks, key), o, H, f, tint);
        if (S.roof && H < 9 && r() < S.roof) addGableRoof(getB(roofChunks, `${Math.floor(o.x / 600)},${Math.floor(o.z / 600)}`), o, H, hexRGB(r() < 0.8 ? '#b5532f' : '#8a8f96'));
        addPlaced(o); addCollider({ ...o, h: H }); count++;
      }
    }
  }
  return { chunks, roofChunks, count };
}

// ---------- Árvores e objetos instanciados ----------
function colorGeo(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function prep(g) { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
function makeTreeGeos() {
  const roundT = mergeGeometries([
    colorGeo(prep(new THREE.CylinderGeometry(0.22, 0.35, 3.4, 5).translate(0, 1.7, 0)), '#6b4a2f'),
    colorGeo(prep(new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.85, 1).translate(0, 4.8, 0)), '#3f7a2e'),
    colorGeo(prep(new THREE.IcosahedronGeometry(1.8, 0).translate(0.9, 5.9, 0.4)), '#4b8a34'),
  ]);
  const palmParts = [colorGeo(prep(new THREE.CylinderGeometry(0.16, 0.26, 9, 5).translate(0, 4.5, 0)), '#8a6a45')];
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.ConeGeometry(0.7, 4.2, 3).rotateZ(Math.PI / 2 + 0.5).translate(2.0, 8.6, 0).rotateY(i / 7 * Math.PI * 2);
    palmParts.push(colorGeo(prep(leaf), i % 2 ? '#3e8a2e' : '#4f9a3a'));
  }
  const palm = mergeGeometries(palmParts);
  const euca = mergeGeometries([
    colorGeo(prep(new THREE.CylinderGeometry(0.2, 0.32, 9, 5).translate(0, 4.5, 0)), '#cfc6b4'),
    colorGeo(prep(new THREE.IcosahedronGeometry(2.2, 0).scale(0.9, 1.8, 0.9).translate(0, 11, 0)), '#55784a'),
  ]);
  const banParts = [colorGeo(prep(new THREE.CylinderGeometry(0.15, 0.22, 2.2, 5).translate(0, 1.1, 0)), '#6f8a3a')];
  for (let i = 0; i < 5; i++) banParts.push(colorGeo(prep(new THREE.ConeGeometry(0.5, 3, 3).rotateZ(Math.PI / 2 + 0.25).translate(1.4, 2.6, 0).rotateY(i / 5 * Math.PI * 2)), '#5fa83a'));
  const banana = mergeGeometries(banParts);
  const cow = mergeGeometries([
    colorGeo(prep(new THREE.BoxGeometry(0.8, 0.8, 1.8).translate(0, 1.1, 0)), '#f3f0ea'),
    colorGeo(prep(new THREE.BoxGeometry(0.45, 0.5, 0.6).translate(0, 1.35, 1.1)), '#2b2b2b'),
    colorGeo(prep(new THREE.BoxGeometry(0.7, 0.7, 0.2).translate(0, 0.35, 0.6)), '#2b2b2b'),
    colorGeo(prep(new THREE.BoxGeometry(0.7, 0.7, 0.2).translate(0, 0.35, -0.6)), '#2b2b2b'),
  ]);
  const lamp = mergeGeometries([
    colorGeo(prep(new THREE.CylinderGeometry(0.09, 0.14, 8, 5).translate(0, 4, 0)), '#5b6168'),
    colorGeo(prep(new THREE.BoxGeometry(0.12, 0.12, 2.6).translate(0, 7.9, -1.2)), '#5b6168'),
  ]);
  const lampHead = prep(new THREE.BoxGeometry(0.5, 0.18, 0.9).translate(0, 7.8, -2.4));
  return { roundT, palm, euca, banana, cow, lamp, lampHead };
}

function instanced(group, geo, mat, list, chunk = 900, colorFn) {
  const by = new Map();
  for (const it of list) { const k = `${Math.floor(it[0] / chunk)},${Math.floor(it[2] / chunk)}`; if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const meshes = [];
  for (const L of by.values()) {
    const im = new THREE.InstancedMesh(geo, mat, L.length);
    L.forEach((it, i) => { q.setFromAxisAngle(up, it[3] || 0); sc.setScalar(it[4] || 1); ps.set(it[0], it[1], it[2]); m4.compose(ps, q, sc); im.setMatrixAt(i, m4); if (colorFn) im.setColorAt(i, colorFn(it)); });
    im.computeBoundingSphere(); im.matrixAutoUpdate = false; group.add(im); meshes.push(im);
  }
  return meshes;
}

function placeVegetation(group, quality, geos) {
  const r = rng(777); const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const round = [], palms = [], eucas = [], bananas = [], cows = [];
  const dens = [0.45, 0.75, 1][quality];
  const tint = new THREE.Color();
  // florestas nas montanhas e serras
  for (let x = -WORLD; x < WORLD; x += 30) for (let z = -WORLD; z < WORLD; z += 30) {
    const px = x + r() * 26, pz = z + r() * 26;
    const m = mountainHeight(px, pz); if (m < 8) continue;
    if (r() > 0.62 * dens) continue;
    const y = groundY(px, pz); if (y < 4) continue;
    if (Math.hypot(px - PEAKS.paoAcucar.x, pz - PEAKS.paoAcucar.z) < PEAKS.paoAcucar.r * 0.8) continue;
    if (Math.hypot(px - PEAKS.gavea.x, pz - PEAKS.gavea.z) < PEAKS.gavea.r * 0.7 && y > 200) continue;
    if (Math.hypot(px - PEAKS.morroFavela.x, pz - PEAKS.morroFavela.z) < PEAKS.morroFavela.r) continue;
    (r() < 0.12 && px < -1900 ? eucas : round).push([px, y - 0.5, pz, r() * 6.28, 1.5 + r() * 1.4]);
  }
  // árvores esparsas na zona rural, parques e subúrbios
  for (let x = -WORLD; x < WORLD; x += 34) for (let z = -WORLD; z < WORLD; z += 34) {
    const px = x + r() * 30, pz = z + r() * 30;
    if (isWater(px, pz) || isBeach(px, pz) || mountainHeight(px, pz) >= 8) continue;
    const zn = zoneAt(px, pz);
    const p = { rural: 0.22, aterro: 0.35, suburb: 0.1, barra: 0.06, tijuca: 0.4, vila: 0.08, zn: 0.02 }[zn] || 0;
    if (r() > p * dens) continue;
    const nr = nearestRoad(px, pz, 40); if (nr.e && nr.d < ROAD_TYPES[nr.e.type].width / 2 + 3) continue;
    if (queryColliders(px, pz, 4).size) continue; if (inExcl(px, pz, 10)) continue;
    const y = groundY(px, pz);
    if (zn === 'rural' && r() < 0.25) eucas.push([px, y, pz, r() * 6.28, 0.8 + r() * 0.6]);
    else round.push([px, y, pz, r() * 6.28, 0.8 + r() * 0.8]);
  }
  // árvores de calçada e palmeiras da orla
  for (const e of graph.edges) {
    if (e.tunnel) continue; const T = ROAD_TYPES[e.type]; const na = graph.nodes[e.a], nb = graph.nodes[e.b];
    const mid = edgePoint(e, e.len / 2); const zn = zoneAt(mid.x, mid.z);
    if (e.type === 'orla') {
      for (let s = na.trim + 6; s < e.len - nb.trim - 6; s += 24) {
        const p = edgePoint(e, s); let rx = -p.dz, rz = p.dx; if (rz < 0) { rx = -rx; rz = -rz; }
        const o = T.width / 2 + 10.5; const x = p.x + rx * o, z = p.z + rz * o;
        palms.push([x, 0, z, r() * 6.28, 0.9 + r() * 0.3]); addCollider({ x, z, r: 0.6 });
      }
    } else if ((zn === 'zs' || zn === 'barra' || zn === 'aterro') && e.type !== 'terra') {
      for (const side of [1, -1]) for (let s = na.trim + 8; s < e.len - nb.trim - 8; s += 20 + r() * 8) {
        if (r() > 0.7 * dens) continue;
        const p = edgePoint(e, s); const o = T.width / 2 - 1.6; const x = p.x - p.dz * side * o, z = p.z + p.dx * side * o;
        if (zn === 'barra' && r() < 0.5) palms.push([x, 0, z, r() * 6.28, 0.8]); else round.push([x, 0, z, r() * 6.28, 0.75 + r() * 0.3]);
        addCollider({ x, z, r: 0.5 });
      }
    } else if (e.type === 'terra' || zn === 'rural') {
      // bananeiras e cercas vivas nas estradas de terra
      for (const side of [1, -1]) for (let s = na.trim + 8; s < e.len - nb.trim - 8; s += 9) {
        if (fbm(s / 50 + e.id, side) < 0.55 || r() > 0.8 * dens) continue;
        const p = edgePoint(e, s); const o = T.width / 2 + 2 + r() * 6; const x = p.x - p.dz * side * o, z = p.z + p.dx * side * o;
        if (nearestRoad(x, z, 30).d < ROAD_TYPES[e.type].width / 2 + 1.5) continue;
        bananas.push([x, groundY(x, z), z, r() * 6.28, 0.9 + r() * 0.5]);
      }
    }
  }
  // gado nos pastos
  for (let k = 0; k < 220 * dens; k++) {
    const x = -3900 + r() * 2000, z = -2500 + r() * 3900;
    if (zoneAt(x, z) !== 'rural' || mountainHeight(x, z) > 3) continue;
    if (nearestRoad(x, z, 40).d < 25) continue;
    const cx = x, cz = z; for (let n = 0; n < 4; n++) cows.push([cx + r() * 20, groundY(cx, cz), cz + r() * 20, r() * 6.28, 1]);
  }
  instanced(group, geos.roundT, mat, round, 900, () => tint.setRGB(0.75 + r() * 0.3, 0.8 + r() * 0.25, 0.65 + r() * 0.25));
  instanced(group, geos.palm, mat, palms);
  instanced(group, geos.euca, mat, eucas);
  instanced(group, geos.banana, mat, bananas);
  instanced(group, geos.cow, mat, cows);
  return round.length + palms.length + eucas.length + bananas.length;
}

function placeStreetLights(group, geos) {
  const list = [];
  for (const e of graph.edges) {
    if (e.tunnel || e.type === 'terra') continue;
    const T = ROAD_TYPES[e.type]; const na = graph.nodes[e.a], nb = graph.nodes[e.b];
    const mid = edgePoint(e, e.len / 2); const zn = zoneAt(mid.x, mid.z); if (zn === 'rural') continue;
    let side = 1;
    for (let s = na.trim + 12; s < e.len - nb.trim - 6; s += 42) {
      const p = edgePoint(e, s); const o = T.width / 2 - 0.6; const rx = -p.dz * side, rz = p.dx * side;
      const x = p.x + rx * o, z = p.z + rz * o;
      // braço aponta para a pista (eixo -z local)
      const ang = Math.atan2(rx, rz);
      list.push([x, 0, z, ang, 1]); addCollider({ x, z, r: 0.3 });
      side = -side;
    }
  }
  const poleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const headMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a6 });
  instanced(group, geos.lamp, poleMat, list);
  instanced(group, geos.lampHead, headMat, list);
  return headMat;
}

// ---------- Pontos turísticos ----------
function landmarks(scene) {
  const g = new THREE.Group(); g.name = 'pontos-turisticos';
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f0ea });
  const stone = new THREE.MeshLambertMaterial({ color: 0xd8d6cc, emissive: 0x000000 });
  // Cristo Redentor
  const cx = PEAKS.corcovado.x, cz = PEAKS.corcovado.z, cy = groundY(cx, cz);
  const cristo = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 14), stone); ped.position.y = 6; cristo.add(ped);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.5, 44, 8), stone); body.position.y = 12 + 22; cristo.add(body);
  const arms = new THREE.Mesh(new THREE.BoxGeometry(60, 4.2, 4), stone); arms.position.y = 12 + 38; cristo.add(arms);
  const head = new THREE.Mesh(new THREE.SphereGeometry(3.3, 10, 8), stone); head.position.y = 12 + 46.5; cristo.add(head);
  cristo.position.set(cx, cy - 2, cz); cristo.rotation.y = -0.5; g.add(cristo);
  // Bondinho do Pão de Açúcar
  const cableMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  const P0 = new THREE.Vector3(2700, 4, 1840), P1 = new THREE.Vector3(PEAKS.urca.x, groundY(PEAKS.urca.x, PEAKS.urca.z) + 4, PEAKS.urca.z);
  const P2 = new THREE.Vector3(PEAKS.paoAcucar.x, groundY(PEAKS.paoAcucar.x, PEAKS.paoAcucar.z) + 4, PEAKS.paoAcucar.z);
  for (const off of [-1.5, 1.5]) {
    const geo = new THREE.BufferGeometry().setFromPoints([P0, P1, P2].map(p => p.clone().add(new THREE.Vector3(0, 0, off))));
    g.add(new THREE.Line(geo, cableMat));
  }
  const stMat = new THREE.MeshLambertMaterial({ color: 0x9a968c });
  for (const p of [P0, P1, P2]) { const st = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 12), stMat); st.position.copy(p).add(new THREE.Vector3(0, -2, 0)); g.add(st); }
  const cabMat = new THREE.MeshLambertMaterial({ color: 0xe9e4d4 });
  const cabins = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), cabMat); g.add(m); return m; });
  // Maracanã
  const mx = 150, mz = -1880;
  const stad = new THREE.Group();
  const wallC = document.createElement('canvas'); wallC.width = 256; wallC.height = 64; const wx = wallC.getContext('2d');
  wx.fillStyle = '#e9e7e0'; wx.fillRect(0, 0, 256, 64); wx.fillStyle = '#b9b6ad'; for (let i = 0; i < 256; i += 16) wx.fillRect(i, 0, 5, 64);
  wx.fillStyle = '#2b5f9e'; wx.fillRect(0, 50, 256, 6);
  const wt = new THREE.CanvasTexture(wallC); wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(24, 1); wt.colorSpace = THREE.SRGBColorSpace;
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(118, 118, 30, 48, 1, true), new THREE.MeshLambertMaterial({ map: wt, side: THREE.DoubleSide }));
  outer.scale.z = 0.86; outer.position.y = 15; stad.add(outer);
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(112, 62, 28, 48, 1, true), new THREE.MeshLambertMaterial({ color: 0x9aa7b8, side: THREE.BackSide }));
  stands.scale.z = 0.86; stands.position.y = 14; stad.add(stands);
  const roof = new THREE.Mesh(new THREE.RingGeometry(80, 120, 48), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  roof.rotation.x = -Math.PI / 2; roof.scale.y = 0.86; roof.position.y = 30.5; stad.add(roof);
  const fc = document.createElement('canvas'); fc.width = 256; fc.height = 170; const fx = fc.getContext('2d');
  for (let i = 0; i < 10; i++) { fx.fillStyle = i % 2 ? '#3f9a3a' : '#48a843'; fx.fillRect(i * 25.6, 0, 25.6, 170); }
  fx.strokeStyle = '#fff'; fx.lineWidth = 2; fx.strokeRect(6, 6, 244, 158); fx.beginPath(); fx.moveTo(128, 6); fx.lineTo(128, 164); fx.stroke(); fx.beginPath(); fx.arc(128, 85, 22, 0, 7); fx.stroke();
  fx.strokeRect(6, 45, 36, 80); fx.strokeRect(214, 45, 36, 80);
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
  const field = new THREE.Mesh(new THREE.PlaneGeometry(130, 86), new THREE.MeshLambertMaterial({ map: ft }));
  field.rotation.x = -Math.PI / 2; field.position.y = 0.1; stad.add(field);
  stad.position.set(mx, 0, mz); g.add(stad);
  addCollider({ x: mx, z: mz, r: 118 });
  // Arcos da Lapa
  const arcs = []; const ax0 = 1500, az = -1515, n = 21, span = 13;
  for (let tier = 0; tier < 2; tier++) {
    const y0 = tier * 18, ph = tier ? 12 : 16;
    for (let i = 0; i <= n; i++) arcs.push(new THREE.BoxGeometry(3, ph, 5).translate(ax0 + i * span, y0 + ph / 2, az));
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (k + 0.5) / 5; const rr = (span - 3) / 2;
        const bx = ax0 + i * span + span / 2 - Math.cos(a) * rr, by = y0 + ph + Math.sin(a) * rr * 0.6;
        arcs.push(new THREE.BoxGeometry(2.3, 2, 5).translate(bx, by, az));
      }
    }
    arcs.push(new THREE.BoxGeometry(n * span + 3, 2.5, 5.4).translate(ax0 + n * span / 2, y0 + ph + 4.6, az));
  }
  g.add(new THREE.Mesh(mergeGeometries(arcs), white));
  addCollider({ x: ax0 + n * span / 2, z: az, hw: n * span / 2 + 2, hd: 3, c: 1, s: 0 });
  // Igreja da vila
  const ig = new THREE.Group(); const igx = -2840, igz = -340;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 22), white); nave.position.y = 4.5; ig.add(nave);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 22, 5), white); tower.position.set(0, 11, 12); ig.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.8, 6, 4), new THREE.MeshLambertMaterial({ color: 0x3b6ea5 })); cap.position.set(0, 25, 12); cap.rotation.y = Math.PI / 4; ig.add(cap);
  const roofG = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 8, 4, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.9), new THREE.MeshLambertMaterial({ color: 0xb5532f })); roofG.position.y = 11; ig.add(roofG);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4, 0.3), new THREE.MeshLambertMaterial({ color: 0x5a3a22 })); door.position.set(0, 2, 14.6); ig.add(door);
  ig.position.set(igx, groundY(igx, igz), igz); g.add(ig);
  addCollider({ x: igx, z: igz, hw: 7, hd: 14, c: 1, s: 0 });
  // Ponte Rio-Niterói (ao fundo)
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0xb8b4a8 });
  const bp = [new THREE.BoxGeometry(1500, 2.5, 26).translate(2700 + 750, 28, -2700)];
  for (let x = 2720; x < 4200; x += 70) bp.push(new THREE.BoxGeometry(6, 30, 12).translate(x, 13, -2700));
  g.add(new THREE.Mesh(mergeGeometries(bp), bridgeMat));
  // Quiosques da praia
  const kq = []; const kr = []; for (let x = -3300; x < 2500; x += 180) { kq.push(new THREE.CylinderGeometry(2.6, 2.6, 3, 6).translate(x, 1.5, 2390)); kr.push(new THREE.ConeGeometry(4, 2, 6).translate(x, 4, 2390)); addCollider({ x, z: 2390, r: 3 }); }
  g.add(new THREE.Mesh(mergeGeometries(kq), new THREE.MeshLambertMaterial({ color: 0x2e8b57 })));
  g.add(new THREE.Mesh(mergeGeometries(kr), new THREE.MeshLambertMaterial({ color: 0xf4f1e8 })));
  // Barcos na baía
  const boats = []; const br = rng(5);
  for (let k = 0; k < 30; k++) { const x = 2800 + br() * 1200, z = -2300 + br() * 3600; if (!isWater(x, z) || isUrca(x, z)) continue; boats.push(new THREE.BoxGeometry(4, 1.4, 12).rotateY(br() * 3).translate(x, -0.3, z)); }
  if (boats.length) g.add(new THREE.Mesh(mergeGeometries(boats), white));
  scene.add(g);
  return { cristo, cabins, P0, P1, P2, stone };
}
function isUrca(x, z) { return ((x - 3000) / 480) ** 2 + ((z - 1960) / 300) ** 2 < 1; }

function favela(scene) {
  const r = rng(99); const B = new Builder(); const f = FACADES[4];
  for (let k = 0; k < 900; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * PEAKS.morroFavela.r * 0.95;
    const x = PEAKS.morroFavela.x + Math.cos(a) * d, z = PEAKS.morroFavela.z + Math.sin(a) * d;
    const y = groundY(x, z); if (y < 2) continue;
    const w = 4 + r() * 3, dd = 4 + r() * 3, h = 3 + r() * 5; const ang = (r() - 0.5) * 0.4;
    const tint = r() < 0.55 ? [1, 1, 1] : hexRGB(PASTEL[Math.floor(r() * PASTEL.length)]);
    addBox(B, { x, z, hw: w / 2, hd: dd / 2, c: Math.cos(ang), s: Math.sin(ang) }, h, f, tint, y - 2);
  }
  return B;
}

// ---------- Fazendas ----------
function farms(scene) {
  const r = rng(321); const fields = new Builder(); const fences = []; let made = 0;
  const texs = [groundTexture('field'), groundTexture('sand')];
  for (let k = 0; k < 400 && made < 30; k++) {
    const x = -3900 + r() * 2000, z = -2500 + r() * 3900; if (zoneAt(x, z) !== 'rural') continue;
    const w = 60 + r() * 120, d = 50 + r() * 100; let ok = true;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const px = x + sx * w / 2, pz = z + sz * d / 2;
      if (mountainHeight(px, pz) > 0.5 || nearestRoad(px, pz, 60).d < 22 || queryColliders(px, pz, 5).size) { ok = false; break; }
    }
    if (!ok) continue; made++;
    const hue = r(); const col = hue < 0.5 ? [0.75, 0.85, 0.45] : hue < 0.8 ? [0.95, 0.85, 0.45] : [0.6, 0.78, 0.4];
    fields.quad([x - w / 2, 0.06, z + d / 2], [x + w / 2, 0.06, z + d / 2], [x + w / 2, 0.06, z - d / 2], [x - w / 2, 0.06, z - d / 2], [0, 1, 0], [0, 0, w / 16, 0, w / 16, d / 16, 0, d / 16], col);
    for (let px = -w / 2; px <= w / 2; px += 4) for (const sz of [-1, 1]) fences.push(new THREE.BoxGeometry(0.15, 1.2, 0.15).translate(x + px, 0.6, z + sz * d / 2));
    fences.push(new THREE.BoxGeometry(w, 0.08, 0.08).translate(x, 1.0, z + d / 2), new THREE.BoxGeometry(w, 0.08, 0.08).translate(x, 1.0, z - d / 2));
    // casa da fazenda
    const hx = x + w / 2 + 12, hz = z; if (nearestRoad(hx, hz, 40).d > 18 && !queryColliders(hx, hz, 8).size) {
      const o = { x: hx, z: hz, hw: 5, hd: 4, c: 1, s: 0 }; const hb = new Builder(); addBox(hb, o, 3.6, FACADES[3], hexRGB('#ffffff')); addGableRoof(hb, o, 3.6, hexRGB('#b5532f'));
      fields._houses = fields._houses || []; fields._houses.push(hb); addCollider(o);
    }
  }
  const g = new THREE.Group();
  const fmat = new THREE.MeshLambertMaterial({ map: texs[0], vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 });
  g.add(new THREE.Mesh(fields.geo(), fmat));
  if (fences.length) g.add(new THREE.Mesh(mergeGeometries(fences), new THREE.MeshLambertMaterial({ color: 0x7a5a3a })));
  scene.add(g);
  return fields._houses || [];
}

export function buildScenery(scene, quality, progress) {
  const out = {};
  buildTerrain(scene);
  progress?.('Relevo pronto');
  // Água
  const wt = waterTexture(); wt.repeat.set(400, 400);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2.6, WORLD * 2.6), new THREE.MeshLambertMaterial({ map: wt, color: 0x9fd3e6 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.8; scene.add(water); out.waterTex = wt;
  // Areia da praia
  const st = groundTexture('sand'); st.repeat.set(1, 1);
  const sandG = new Builder(); const x0 = -3500, x1 = 2600, z0 = 2357, z1 = 2625;
  sandG.quad([x0, 0.02, z1], [x1, 0.02, z1], [x1, 0.02, z0], [x0, 0.02, z0], [0, 1, 0], [0, 0, (x1 - x0) / 12, 0, (x1 - x0) / 12, (z1 - z0) / 12, 0, (z1 - z0) / 12], [1, 1, 1]);
  scene.add(new THREE.Mesh(sandG.geo(), new THREE.MeshLambertMaterial({ map: st, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 })));
  // Pontos turísticos (antes dos prédios, por causa das áreas reservadas)
  out.land = landmarks(scene);
  // Prédios
  const tex = facadeTextures(); out.facadeMats = [];
  const { chunks, roofChunks, count } = placeBuildings(quality);
  const bg = new THREE.Group(); bg.name = 'predios';
  FACADES.forEach((f, i) => out.facadeMats.push(new THREE.MeshLambertMaterial({ map: tex[i].map, emissiveMap: tex[i].emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true })));
  for (const [k, B] of chunks) { const fi = +k.split('|')[0]; const m = new THREE.Mesh(B.geo(), out.facadeMats[fi]); m.matrixAutoUpdate = false; bg.add(m); }
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const B of roofChunks.values()) bg.add(new THREE.Mesh(B.geo(), roofMat));
  const fav = favela(scene); bg.add(new THREE.Mesh(fav.geo(), out.facadeMats[4]));
  for (const hb of farms(scene)) bg.add(new THREE.Mesh(hb.geo(), out.facadeMats[3]));
  scene.add(bg); out.buildingCount = count; out.bg = bg;
  progress?.(`${count} prédios`);
  // Vegetação e postes
  const veg = new THREE.Group(); veg.name = 'vegetacao'; const geos = makeTreeGeos();
  out.treeCount = placeVegetation(veg, quality, geos);
  out.lampHeadMat = placeStreetLights(veg, geos);
  scene.add(veg); out.veg = veg;
  for (const grp of [bg, veg]) for (const ch of grp.children) {
    const bs = ch.isInstancedMesh ? (ch.computeBoundingSphere(), ch.boundingSphere) : ch.geometry.boundingSphere;
    ch.userData.c = bs ? bs.center.clone() : new THREE.Vector3(); ch.userData.r = bs ? bs.radius : 0;
  }
  out.cullT = 0;
  return out;
}

export function updateScenery(sc, dt, t, night, camPos, dists) {
  sc.cullT -= dt;
  if (camPos && sc.cullT <= 0) {
    sc.cullT = 0.4;
    for (const [grp, D] of [[sc.bg, dists.build], [sc.veg, dists.tree]]) for (const ch of grp.children) {
      const c = ch.userData.c; ch.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) - ch.userData.r < D;
    }
  }
  sc.waterTex.offset.x = (t * 0.004) % 1; sc.waterTex.offset.y = (t * 0.0025) % 1;
  // bondinho
  const { cabins, P0, P1, P2 } = sc.land;
  const k = (t / 60) % 2; const f = k < 1 ? k : 2 - k;
  cabins[0].position.lerpVectors(P0, P1, f).y -= 3; cabins[1].position.lerpVectors(P1, P2, 1 - f).y -= 3;
  for (const m of sc.facadeMats) m.emissiveIntensity = night * 0.9;
  sc.lampHeadMat.color.setHex(night > 0.3 ? 0xffe1a0 : 0x9aa0a6);
  sc.land.stone.emissive.setScalar(night * 0.5);
}
