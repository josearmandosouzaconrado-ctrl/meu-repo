// Geração das malhas das ruas usando as texturas do pacote "Ruas by LW3D".
import * as THREE from 'three';
import { graph, ROAD_TYPES, TUNNEL, zoneAt } from './map.js';
import { loadRoadTex, dirtRoadTexture, calcadaoTexture, loadTileTex } from './textures.js';

const TILE_ASPECT = { rua_amarela: 545 / 724, rua_branca: 545 / 724, rua_paralelepipedo: 545 / 724, rua_corredor: 498 / 724, rua_faixa: 545 / 724, terra: 1.1 };
const CHUNK = 512;

class Batch {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.n = 0; }
  quad(a, b, c, d, ua, ub, uc, ud) { // a,b,c,d: [x,y,z] em ordem (esq0, dir0, dir1, esq1)
    const i = this.n; this.pos.push(...a, ...b, ...c, ...d); this.uv.push(...ua, ...ub, ...uc, ...ud);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3); this.n += 4;
  }
  vert(p, uv) { this.pos.push(...p); this.uv.push(...uv); return this.n++; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const nrm = new Float32Array(this.pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(this.idx); g.computeBoundingSphere(); return g;
  }
}

export function buildRoads(scene) {
  const mats = {};
  const mk = (tex, extra = {}) => new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, ...extra });
  for (const n of ['rua_amarela', 'rua_branca', 'rua_paralelepipedo', 'rua_corredor', 'rua_faixa']) mats[n] = mk(loadRoadTex(n));
  mats.terra = mk(dirtRoadTexture());
  const asphaltTex = loadRoadTex('rua_branca');
  mats.disc = mk(asphaltTex, { polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); mats.disc.color.setScalar(1.35);
  const dirtDiscTex = dirtRoadTexture(); mats.discTerra = mk(dirtDiscTex, { polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mats.calcadao = mk(calcadaoTexture());
  mats.calcadao.map.repeat.set(1, 1);
  const batches = new Map(); // `${mat}|${chunk}` -> Batch
  const getB = (mat, x, z) => { const k = `${mat}|${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; if (!batches.has(k)) batches.set(k, { mat, b: new Batch() }); return batches.get(k).b; };

  const Y = 0.03;
  for (const e of graph.edges) {
    const T = ROAD_TYPES[e.type]; const W = T.width; const tileLen = W * TILE_ASPECT[T.tex];
    const na = graph.nodes[e.a], nb = graph.nodes[e.b];
    const s0 = na.trim, s1 = e.len - nb.trim; if (s1 - s0 < 0.5) continue;
    const city = e.type !== 'terra' && e.type !== 'corredor' && e.type !== 'paralelepipedo' && !e.tunnel && ['centro', 'zs', 'zn', 'barra'].includes(zoneAt((na.x + nb.x) / 2, (na.z + nb.z) / 2));
    // pontos da polilinha dentro de [s0, s1]
    const samples = [];
    const pushS = (s) => { samples.push(s); };
    pushS(s0); for (let i = 1; i < e.pts.length - 1; i++) if (e.cum[i] > s0 + 0.2 && e.cum[i] < s1 - 0.2) pushS(e.cum[i]); pushS(s1);
    // divide em pedaços com faixa de pedestre perto dos cruzamentos
    const cwA = city && graph.nodes[e.a].edges.length >= 3 ? Math.min(tileLen, (s1 - s0) / 2.2) : 0;
    const cwB = city && graph.nodes[e.b].edges.length >= 3 ? Math.min(tileLen, (s1 - s0) / 2.2) : 0;
    const cuts = [s0]; if (cwA) cuts.push(s0 + cwA); if (cwB) cuts.push(s1 - cwB); cuts.push(s1);
    const frame = (s) => {
      // posição e miter na distância s
      let i = 1; while (i < e.cum.length - 1 && e.cum[i] < s - 1e-6) i++;
      const p0 = e.pts[i - 1], p1 = e.pts[i]; const seg = e.cum[i] - e.cum[i - 1]; const t = (s - e.cum[i - 1]) / seg;
      let dx = (p1[0] - p0[0]) / seg, dz = (p1[1] - p0[1]) / seg;
      let mx = -dz, mz = dx, scale = 1;
      // se s é um vértice interno, usa miter
      const vi = e.cum.findIndex((c, k) => k > 0 && k < e.cum.length - 1 && Math.abs(c - s) < 1e-4);
      if (vi > 0) {
        const q0 = e.pts[vi - 1], q1 = e.pts[vi], q2 = e.pts[vi + 1];
        const l1 = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), l2 = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]);
        const d1 = [(q1[0] - q0[0]) / l1, (q1[1] - q0[1]) / l1], d2 = [(q2[0] - q1[0]) / l2, (q2[1] - q1[1]) / l2];
        const tx = d1[0] + d2[0], tz = d1[1] + d2[1], tl = Math.hypot(tx, tz) || 1;
        dx = tx / tl; dz = tz / tl; mx = -dz; mz = dx;
        scale = 1 / Math.max(0.5, (-d1[1]) * mx + d1[0] * mz);
      }
      return { x: p0[0] + (p1[0] - p0[0]) * t, z: p0[1] + (p1[1] - p0[1]) * t, rx: mx * scale, rz: mz * scale };
    };
    for (let c = 0; c < cuts.length - 1; c++) {
      const a = cuts[c], b = cuts[c + 1]; if (b - a < 0.05) continue;
      const isA = cwA && c === 0, isB = cwB && c === cuts.length - 2;
      const matName = isA || isB ? 'rua_faixa' : T.tex;
      const ss = [a, ...samples.filter(s => s > a + 0.05 && s < b - 0.05), b];
      const mid = frame((a + b) / 2); const B = getB(matName, mid.x, mid.z);
      for (let k = 0; k < ss.length - 1; k++) {
        const f0 = frame(ss[k]), f1 = frame(ss[k + 1]);
        let v0, v1;
        if (isA) { v0 = 1 - (ss[k] - a) / tileLen; v1 = 1 - (ss[k + 1] - a) / tileLen; }
        else if (isB) { v0 = 1 - (b - ss[k]) / tileLen; v1 = 1 - (b - ss[k + 1]) / tileLen; }
        else { v0 = ss[k] / tileLen; v1 = ss[k + 1] / tileLen; }
        const h = W / 2;
        // u=0 lado esquerdo (oposto de r), u=1 lado direito
        let u0 = 0, u1 = 1; if (isB) { u0 = 1; u1 = 0; }
        B.quad([f0.x - f0.rx * h, Y, f0.z - f0.rz * h], [f0.x + f0.rx * h, Y, f0.z + f0.rz * h],
          [f1.x + f1.rx * h, Y, f1.z + f1.rz * h], [f1.x - f1.rx * h, Y, f1.z - f1.rz * h],
          [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      }
    }
    // Calçadão de Copacabana na orla (lado da praia)
    if (e.type === 'orla') {
      const f0 = frame(s0); const side = f0.rz > 0 ? 1 : -1; // lado com z maior (praia)
      for (let k = 0; k < samples.length - 1; k++) {
        const fa = frame(samples[k]), fb = frame(samples[k + 1]);
        const o1 = W / 2 * side, o2 = (W / 2 + 9) * side;
        const B = getB('calcadao', fa.x, fa.z);
        const va = samples[k] / 9, vb = samples[k + 1] / 9;
        B.quad([fa.x + fa.rx * o1, Y, fa.z + fa.rz * o1], [fa.x + fa.rx * o2, Y, fa.z + fa.rz * o2], [fb.x + fb.rx * o2, Y, fb.z + fb.rz * o2], [fb.x + fb.rx * o1, Y, fb.z + fb.rz * o1],
          [0, va], [1, va], [1, vb], [0, vb]);
      }
    }
  }
  // Discos dos cruzamentos
  for (const n of graph.nodes) {
    if (!n.disc) continue;
    const B = getB(n.dirt ? 'discTerra' : 'disc', n.x, n.z); const R = n.disc; const segs = 24; const Yd = Y + 0.01;
    const uvOf = (x, z) => n.dirt ? [0.5 + (x - n.x) / R * 0.12, (z - n.z) / R * 0.3] : [0.37 + (x - n.x) / R * 0.07, (z - n.z) / R * 0.5];
    const c = B.vert([n.x, Yd, n.z], uvOf(n.x, n.z)); const first = B.n;
    for (let i = 0; i <= segs; i++) { const a = i / segs * Math.PI * 2; const x = n.x + Math.cos(a) * R, z = n.z + Math.sin(a) * R; B.vert([x, Yd, z], uvOf(x, z)); }
    for (let i = 0; i < segs; i++) B.idx.push(c, first + i + 1, first + i);
  }
  const group = new THREE.Group(); group.name = 'ruas';
  for (const { mat, b } of batches.values()) {
    const m = new THREE.Mesh(b.geometry(), mats[mat]); m.matrixAutoUpdate = false; m.renderOrder = mat.startsWith('disc') ? 2 : 1; group.add(m);
  }
  scene.add(group);
  buildTunnel(scene);
  return { group, mats };
}

function buildTunnel(scene) {
  const g = new THREE.Group();
  const len = TUNNEL.z1 - TUNNEL.z0, W = 20, H = 8, cz = (TUNNEL.z0 + TUNNEL.z1) / 2;
  const tile = loadTileTex('calcada'); tile.repeat.set(len / 6, 2);
  const wallMat = new THREE.MeshLambertMaterial({ map: tile, color: 0xd8d2c0, side: THREE.BackSide });
  const tube = new THREE.Mesh(new THREE.BoxGeometry(W, H, len, 1, 1, 1), Array(6).fill(wallMat));
  // mantém só paredes laterais (+x/-x) e teto (+y)
  tube.geometry.groups = tube.geometry.groups.filter(gr => gr.materialIndex !== 3 && gr.materialIndex !== 4 && gr.materialIndex !== 5);
  tube.position.set(TUNNEL.x, H / 2, cz); g.add(tube);
  // luzes do túnel
  const lampGeo = new THREE.BoxGeometry(0.6, 0.15, 3);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const n = Math.floor(len / 18); const lamps = new THREE.InstancedMesh(lampGeo, lampMat, n * 2); const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) for (let s = 0; s < 2; s++) { m.makeTranslation(TUNNEL.x + (s ? 4 : -4), H - 0.1, TUNNEL.z0 + 9 + i * 18); lamps.setMatrixAt(i * 2 + s, m); }
  g.add(lamps);
  // portais
  const portalMat = new THREE.MeshLambertMaterial({ color: 0x8e8a80 });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5b6b45 });
  for (const [z, dir] of [[TUNNEL.z0, -1], [TUNNEL.z1, 1]]) {
    const pw = 90, ph = 46;
    const L = new THREE.Mesh(new THREE.BoxGeometry((pw - W) / 2, ph, 3), portalMat); L.position.set(TUNNEL.x - W / 2 - (pw - W) / 4, ph / 2 - 2, z + dir * 1.5); g.add(L);
    const R = L.clone(); R.position.x = TUNNEL.x + W / 2 + (pw - W) / 4; g.add(R);
    const T = new THREE.Mesh(new THREE.BoxGeometry(W, ph - H, 3), portalMat); T.position.set(TUNNEL.x, H + (ph - H) / 2 - 2, z + dir * 1.5); g.add(T);
    const top = new THREE.Mesh(new THREE.BoxGeometry(pw + 30, 30, 60), rockMat); top.position.set(TUNNEL.x, ph + 10, z - dir * 28); g.add(top);
    // placa
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#0b5a2a'; x.fillRect(0, 0, 512, 64); x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText('TÚNEL REBOUÇAS', 256, 46);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshBasicMaterial({ map: t }));
    sign.position.set(TUNNEL.x, H + 2.5, z + dir * 3.1); if (dir < 0) sign.rotation.y = Math.PI; g.add(sign);
  }
  scene.add(g);
}
