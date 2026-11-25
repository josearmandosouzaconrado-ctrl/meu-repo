// Trânsito: carros com IA seguindo a malha viária (mão direita) e semáforos.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { graph, ROAD_TYPES, edgePoint, edgeDirAt } from './map.js';
import { groundY, obbOverlap } from './scenery.js';
import { rng } from './textures.js';

const CAR_COLORS = ['#f2c200', '#f2c200', '#ffffff', '#c0c4c8', '#1c1c1c', '#b3121b', '#1d4f91', '#8a9aa6', '#f2c200', '#2f6b3a', '#ffffff', '#5a5f66'];

function carGeometry() {
  const col = (g, hex) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const c = new THREE.Color(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const parts = [
    col(new THREE.BoxGeometry(1.8, 0.7, 4.3).translate(0, 0.65, 0), '#ffffff'),
    col(new THREE.BoxGeometry(1.6, 0.55, 2.2).translate(0, 1.27, -0.2), '#ffffff'),
    col(new THREE.BoxGeometry(1.62, 0.45, 2.0).translate(0, 1.27, -0.2), '#203040'),
    col(new THREE.BoxGeometry(1.4, 0.4, 0.05).translate(0, 1.27, 0.92), '#203040'),
  ];
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) parts.push(col(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z), '#151515'));
  parts.push(col(new THREE.BoxGeometry(1.5, 0.15, 0.05).translate(0, 0.75, 2.16), '#ffe9a0'));
  parts.push(col(new THREE.BoxGeometry(1.5, 0.15, 0.05).translate(0, 0.75, -2.16), '#d01010'));
  return mergeGeometries(parts);
}

export class Traffic {
  constructor(scene, maxCars = 40) {
    this.max = maxCars; this.cars = []; this.r = rng(2024);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(carGeometry(), mat, 90); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 90; i++) this.mesh.setColorAt(i, new THREE.Color(CAR_COLORS[i % CAR_COLORS.length]));
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0);
    this.buildLights(scene);
    this.time = 0;
  }

  // ---------- Semáforos ----------
  buildLights(scene) {
    this.lightNodes = graph.nodes.filter(n => n.light);
    const poles = [], heads = []; this.lamps = [];
    for (const n of this.lightNodes) {
      const ax = edgeDirAt(graph.edges[n.edges[0]], n.id);
      n.offset = (n.id * 7.3) % 24; n.approach = {};
      for (const eid of n.edges) {
        const e = graph.edges[eid]; const d = edgeDirAt(e, n.id); const T = ROAD_TYPES[e.type];
        n.approach[eid] = Math.abs(d[0] * ax[0] + d[1] * ax[1]) > 0.7 ? 0 : 1;
        // poste à direita de quem chega
        const rin = [d[1], -d[0]];
        const x = n.x + d[0] * (n.trim + 1.5) + rin[0] * (T.width / 2 - 0.8), z = n.z + d[1] * (n.trim + 1.5) + rin[1] * (T.width / 2 - 0.8);
        const ang = Math.atan2(d[0], d[1]);
        poles.push({ x, z, ang }); heads.push({ x, z, ang });
        for (let k = 0; k < 3; k++) this.lamps.push({ node: n, eid, k, x, z, ang });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 4.5, 5).translate(0, 2.25, 0);
    const headGeo = new THREE.BoxGeometry(0.45, 1.3, 0.35).translate(0, 4.2, 0);
    const lampGeo = new THREE.BoxGeometry(0.3, 0.3, 0.08);
    const pm = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x33373b }), poles.length);
    const hm = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }), heads.length);
    this.lampMesh = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.lamps.length);
    const m = this.m4, q = this.q, s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    poles.forEach((o, i) => { q.setFromAxisAngle(this.up, o.ang); m.compose(p.set(o.x, 0, o.z), q, s); pm.setMatrixAt(i, m); hm.setMatrixAt(i, m); });
    this.lamps.forEach((l, i) => {
      q.setFromAxisAngle(this.up, l.ang); const off = new THREE.Vector3(0, 4.6 - l.k * 0.4, 0.2).applyQuaternion(q);
      m.compose(p.set(l.x, 0, l.z).add(off), q, s); this.lampMesh.setMatrixAt(i, m); this.lampMesh.setColorAt(i, new THREE.Color(0x222222));
    });
    for (const im of [pm, hm, this.lampMesh]) { im.computeBoundingSphere(); scene.add(im); }
    this.lastPhase = '';
  }
  // estado: 0 verde, 1 amarelo, 2 vermelho para a aproximação
  lightState(n, eid) {
    if (!n.light) return 0;
    const t = (this.time + n.offset) % 24; const g = n.approach[eid];
    const phase = t < 10 ? [0, 2] : t < 12 ? [1, 2] : t < 22 ? [2, 0] : [2, 1];
    return phase[g];
  }
  updateLightColors() {
    const key = Math.floor(this.time * 2);
    if (key === this.lastPhase) return; this.lastPhase = key;
    const C = [new THREE.Color(0x30ff60), new THREE.Color(0xffb000), new THREE.Color(0xff2020)], off = new THREE.Color(0x202020);
    this.lamps.forEach((l, i) => {
      const st = this.lightState(l.node, l.eid); const lampFor = [2, 1, 0][st]; // k=0 topo (vermelho)
      this.lampMesh.setColorAt(i, l.k === lampFor ? C[st] : off);
    });
    this.lampMesh.instanceColor.needsUpdate = true;
  }

  // ---------- Carros ----------
  spawnNear(px, pz) {
    for (let tries = 0; tries < 12; tries++) {
      const e = graph.edges[Math.floor(this.r() * graph.edges.length)];
      const s = this.r() * e.len; const p = edgePoint(e, s); const d = Math.hypot(p.x - px, p.z - pz);
      if (d < 120 || d > 380) continue;
      const dir = this.r() < 0.5 ? 1 : -1; const car = { e, dir, s: dir > 0 ? s : e.len - s, speed: 6, x: p.x, z: p.z, h: 0, idx: 0 };
      this.position(car);
      if (this.cars.some(c => Math.hypot(c.x - car.x, c.z - car.z) < 15)) continue;
      car.maxSpeed = ROAD_TYPES[e.type].speed / 3.6 * (0.75 + this.r() * 0.3);
      this.cars.push(car); return;
    }
  }
  position(car) {
    const e = car.e; const T = ROAD_TYPES[e.type];
    const sa = car.dir > 0 ? car.s : e.len - car.s; const p = edgePoint(e, sa);
    const dx = p.dx * car.dir, dz = p.dz * car.dir;
    car.tx = p.x - dz * T.lane; car.tz = p.z + dx * T.lane; car.th = Math.atan2(dx, dz);
  }
  endNode(car) { return graph.nodes[car.dir > 0 ? car.e.b : car.e.a]; }

  update(dt, bus) {
    this.time += dt; this.updateLightColors();
    // remove distantes e cria novos
    this.cars = this.cars.filter(c => Math.hypot(c.x - bus.x, c.z - bus.z) < 460);
    if (this.cars.length < this.max) this.spawnNear(bus.x, bus.z);
    const bf = bus.forward;
    for (const car of this.cars) {
      const e = car.e; const node = this.endNode(car); const T = ROAD_TYPES[e.type];
      let target = car.maxSpeed;
      const remain = e.len - car.s;
      // semáforo
      if (node.light) {
        const st = this.lightState(node, e.id); const stopAt = remain - node.trim - 3;
        if (st > 0 && stopAt > -0.5 && stopAt < 45 && !(st === 1 && stopAt < 6)) target = Math.min(target, Math.max(0, stopAt * 0.5));
      } else if (node.edges.length >= 3) target = Math.min(target, 6 + Math.max(0, remain - node.trim) * 0.4);
      // veículo à frente (inclui o ônibus)
      const hf = [Math.sin(car.h), Math.cos(car.h)];
      const check = (ox, oz, len) => {
        const dx = ox - car.x, dz = oz - car.z; const along = dx * hf[0] + dz * hf[1]; const lat = Math.abs(-dx * hf[1] + dz * hf[0]);
        if (along > 0 && along < 30 && lat < 2.4) target = Math.min(target, Math.max(0, (along - 5 - len) * 0.6));
      };
      for (const o of this.cars) if (o !== car && Math.abs(o.x - car.x) < 32 && Math.abs(o.z - car.z) < 32) check(o.x, o.z, 2.2);
      if (Math.abs(bus.x - car.x) < 40 && Math.abs(bus.z - car.z) < 40) {
        for (const k of [-5, 0, 5]) check(bus.x + bf[0] * k, bus.z + bf[1] * k, 1);
      }
      const acc = target > car.speed ? 2.5 : -7;
      car.speed = Math.max(0, car.speed + Math.max(-7 * dt, Math.min(2.5 * dt, target - car.speed)) * (acc > 0 ? 1 : 1));
      car.s += car.speed * dt;
      if (car.s >= e.len) {
        // escolhe a próxima via
        const opts = node.edges.filter(id => id !== e.id); const nid = opts.length ? opts[Math.floor(this.r() * opts.length)] : e.id;
        const ne = graph.edges[nid]; car.s = car.s - e.len; car.e = ne; car.dir = ne.a === node.id ? 1 : -1;
        if (ne === e) car.dir = -car.dir;
        car.maxSpeed = ROAD_TYPES[ne.type].speed / 3.6 * (0.75 + this.r() * 0.3);
      }
      this.position(car);
      // suaviza curvas nos cruzamentos
      const k = Math.min(1, dt * 6);
      car.x += (car.tx - car.x) * k; car.z += (car.tz - car.z) * k;
      let dh = car.th - car.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; car.h += dh * k;
    }
    // instâncias
    this.mesh.count = this.cars.length; const s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    this.cars.forEach((c, i) => { this.q.setFromAxisAngle(this.up, c.h); this.m4.compose(p.set(c.x, groundY(c.x, c.z), c.z), this.q, s); this.mesh.setMatrixAt(i, this.m4); });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  collidesBus(busObb) {
    for (const c of this.cars) {
      if (Math.abs(c.x - busObb.x) > 10 || Math.abs(c.z - busObb.z) > 10) continue;
      const o = { x: c.x, z: c.z, hw: 0.9, hd: 2.15, c: Math.cos(c.h), s: -Math.sin(c.h) };
      if (obbOverlap(busObb, o)) return { car: c };
    }
    return null;
  }

  clear() { this.cars = []; this.mesh.count = 0; }
}
