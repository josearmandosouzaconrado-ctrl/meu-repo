// Ônibus do jogador: Marcopolo Torino VW 17-230 (modelo do pacote), física arcade e visual.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ledSign, recolorLivery } from './textures.js';
import { groundY, queryColliders, obbOverlap } from './scenery.js';

export const LIVERIES = [
  { id: 'original', name: 'Original', color: null, price: 0, sw: '#b3121b' },
  { id: 'azul', name: 'Azul Rio', color: '#1d5fb3', price: 1500, sw: '#1d5fb3' },
  { id: 'verde', name: 'Verde Rural', color: '#2f8a3a', price: 2500, sw: '#2f8a3a' },
  { id: 'amarelo', name: 'Amarelo BRT', color: '#e0a800', price: 4000, sw: '#e0a800' },
  { id: 'laranja', name: 'Laranja', color: '#e46a12', price: 6000, sw: '#e46a12' },
  { id: 'roxo', name: 'Roxo', color: '#6a2db3', price: 9000, sw: '#6a2db3' },
  { id: 'preto', name: 'Executivo', color: '#2a2a2a', price: 15000, sw: '#2a2a2a' },
];

function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }

export class Bus {
  constructor() {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.x = 0; this.z = 0; this.h = 0; this.v = 0; this.steer = 0; this.gear = 1; this.doors = false; this.lights = false;
    this.pitch = 0; this.roll = 0; this.y = 0;
    this.hw = 1.3; this.hd = 6.2; this.wheelbase = 6.3;
    this.crashCooldown = 0; this.onCrash = null;
  }

  async load(onProgress) {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load('./assets/onibus_torino.glb', res, (e) => onProgress?.(e.total ? e.loaded / e.total : 0), rej));
    const model = gltf.scene; model.rotation.y = Math.PI; // frente do modelo para +z
    this.mats = {};
    model.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const m = o.material; this.mats[m.name] = m; m.side = THREE.FrontSide;
      if (m.name === 'fkn_tori_volks_vd__trans_') { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
      if (m.name === 'fkn_itinerario_x2') this.signMesh = o;
      // converte para Lambert (mais leve no celular), mantendo texturas
      const lm = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, side: THREE.DoubleSide });
      lm.name = m.name; o.material = lm; this.mats[m.name] = lm;
    });
    this.body.add(model);
    // texturas extras do pacote (pintura, letreiro, faróis acesos)
    const [paint, sign, lpOn, lp2On] = await Promise.all(['pintura.jpg', 'letreiro.png', 'farois_on.jpg', 'farois2_on.jpg'].map(f => loadImage('./assets/onibus/' + f)));
    this.paintImg = paint; this.signImg = sign;
    const tl = (img) => { const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
    this.lpOff = this.mats.fkn_tori_lp?.map; this.lpOn = tl(lpOn);
    this.lp2Off = this.mats.fkn_tori_lp2?.map; this.lp2On = tl(lp2On);
    // retângulo UV do letreiro
    if (this.signMesh) {
      const uv = this.signMesh.geometry.attributes.uv; let minU = 1, minV = 1, maxU = 0, maxV = 0;
      for (let i = 0; i < uv.count; i++) { minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i)); minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i)); }
      this.signRect = { minU: Math.max(0, minU), maxU: Math.min(1, maxU), minV: Math.max(0, minV), maxV: Math.min(1, maxV) };
    }
    // farol (luz real) e sombra falsa
    this.headlight = new THREE.SpotLight(0xfff1d0, 0, 90, 0.55, 0.5, 1.2);
    this.headlight.position.set(0, 1.2, 6.3); this.headlight.target.position.set(0, 0, 30);
    this.body.add(this.headlight, this.headlight.target);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 13), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; this.root.add(sh);
    // pontos de câmera
    this.driverCam = new THREE.Object3D(); this.driverCam.position.set(0.55, 2.35, 5.3); this.body.add(this.driverCam);
  }

  setLivery(liv) { const t = recolorLivery(this.paintImg, liv?.color); const m = this.mats.fkn_tori_volks; if (m) { m.map?.dispose(); m.map = t; m.needsUpdate = true; } }
  setSign(text, color) {
    const m = this.mats.fkn_itinerario_x2; if (!m || !this.signRect) return;
    m.map = ledSign(this.signImg, this.signRect, text, color); m.needsUpdate = true;
  }
  setLights(on) {
    this.lights = on; this.headlight.intensity = on ? 60 : 0;
    if (this.mats.fkn_tori_lp && this.lpOff) { this.mats.fkn_tori_lp.map = on ? this.lpOn : this.lpOff; this.mats.fkn_tori_lp.needsUpdate = true; }
    if (this.mats.fkn_tori_lp2 && this.lp2Off) { this.mats.fkn_tori_lp2.map = on ? this.lp2On : this.lp2Off; this.mats.fkn_tori_lp2.needsUpdate = true; }
  }

  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.v = 0; this.steer = 0; this.sync(0); }

  obb(x = this.x, z = this.z, h = this.h) { return { x, z, hw: this.hw, hd: this.hd, c: Math.cos(h), s: -Math.sin(h) }; }

  update(dt, input, traffic) {
    const maxV = 24, maxR = 5.5;
    const fwd = this.gear;
    // motor e freio
    let a = 0;
    if (input.throttle > 0 && !this.doors) {
      const vs = this.v * fwd; const lim = fwd > 0 ? maxV : maxR;
      a += fwd * input.throttle * 2.6 * Math.max(0, 1 - Math.max(0, vs) / lim);
    }
    if (input.brake > 0) a -= Math.sign(this.v) * input.brake * 7.5;
    a -= Math.sign(this.v) * (0.25 + 0.0018 * this.v * this.v);
    if (this.doors) a -= Math.sign(this.v) * 3;
    const nv = this.v + a * dt;
    this.v = (Math.sign(nv) !== Math.sign(this.v) && this.v !== 0 && Math.abs(nv) < 0.6) ? 0 : nv;
    if (Math.abs(this.v) < 0.05 && input.throttle === 0) this.v = 0;
    // direção
    const target = input.steer; const rate = 2.2;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    const maxAng = 0.62 / (1 + Math.abs(this.v) / 14);
    const ang = this.steer * maxAng;
    const yaw = this.v / this.wheelbase * Math.tan(ang);
    const nh = this.h - yaw * dt;
    const nx = this.x + Math.sin(nh) * this.v * dt, nz = this.z + Math.cos(nh) * this.v * dt;
    // colisões com cenário
    const hit = this.collides(nx, nz, nh) || traffic?.collidesBus(this.obb(nx, nz, nh));
    if (hit) {
      if (Math.abs(this.v) > 2.5 && this.crashCooldown <= 0) { this.onCrash?.(Math.abs(this.v), hit); this.crashCooldown = 1.5; }
      this.v = -this.v * 0.15;
      if (hit.car) hit.car.speed = 0;
    } else { this.x = nx; this.z = nz; this.h = nh; }
    this.crashCooldown -= dt;
    this.latAcc = this.v * yaw;
    this.sync(dt);
  }

  collides(x, z, h) {
    const me = this.obb(x, z, h);
    for (const c of queryColliders(x, z, 8)) {
      if (c.r) {
        const dx = c.x - x, dz = c.z - z; const lx = dx * me.c + dz * me.s, lz = -dx * me.s + dz * me.c;
        if (Math.abs(lx) < me.hw + c.r && Math.abs(lz) < me.hd + c.r) return c;
      } else if (obbOverlap(me, c)) return c;
    }
    return null;
  }

  sync(dt) {
    const f = [Math.sin(this.h), Math.cos(this.h)];
    const yF = groundY(this.x + f[0] * 4.5, this.z + f[1] * 4.5), yB = groundY(this.x - f[0] * 4.5, this.z - f[1] * 4.5);
    const ty = Math.max(0, (yF + yB) / 2);
    this.y = dt ? this.y + (ty - this.y) * Math.min(1, dt * 10) : ty;
    const tp = Math.atan2(yB - yF, 9);
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 6 || 1);
    const tr = Math.max(-0.05, Math.min(0.05, (this.latAcc || 0) * 0.008));
    this.roll += (tr - this.roll) * Math.min(1, dt * 4 || 1);
    this.root.position.set(this.x, this.y + 0.02, this.z);
    this.root.rotation.set(0, this.h, 0);
    this.body.rotation.set(this.pitch, 0, this.roll);
  }

  get kmh() { return Math.abs(this.v) * 3.6; }
  get forward() { return [Math.sin(this.h), Math.cos(this.h)]; }
}
