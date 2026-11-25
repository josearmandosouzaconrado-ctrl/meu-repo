// Texturas procedurais (canvas) + texturas dos pacotes de ruas.
import * as THREE from 'three';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function noise(ctx, w, h, amount, r) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}

// Fachadas: [cor parede, cor janela, andares por tile, janelas por tile, estilo]
export const FACADES = [
  { name: 'torre_vidro', wall: '#5b6e7d', win: '#9fc3d9', lit: '#ffe9a8', floors: 4, cols: 4, style: 'glass' },
  { name: 'predio_branco', wall: '#f4f1ea', win: '#2e3a44', lit: '#ffd98a', floors: 4, cols: 3, style: 'normal' },
  { name: 'predio_bege', wall: '#cdb79a', win: '#33302c', lit: '#ffd27a', floors: 4, cols: 3, style: 'balcony' },
  { name: 'casa_colorida', wall: '#f2efe8', win: '#3a2f25', lit: '#ffcf70', floors: 2, cols: 2, style: 'house' },
  { name: 'favela_tijolo', wall: '#a9603e', win: '#2a1d15', lit: '#ffbf60', floors: 2, cols: 2, style: 'brick' },
  { name: 'artdeco', wall: '#d9d2c0', win: '#3d4b55', lit: '#ffe0a0', floors: 4, cols: 3, style: 'deco' },
];

function facadeCanvas(f, lit, seed) {
  const W = 256, H = 256; const c = canvas(W, H); const x = c.getContext('2d'); const r = rng(seed);
  x.fillStyle = lit ? '#000' : f.wall; x.fillRect(0, 0, W, H);
  if (!lit) {
    if (f.style === 'brick') {
      for (let yy = 0; yy < H; yy += 8) for (let xx = (yy / 8) % 2 ? -8 : 0; xx < W; xx += 16) {
        x.fillStyle = `hsl(${15 + r() * 10},${40 + r() * 20}%,${30 + r() * 14}%)`; x.fillRect(xx + 1, yy + 1, 14, 6);
      }
    }
    noise(x, W, H, 18, r);
  }
  const fh = H / f.floors, cw = W / f.cols;
  for (let fl = 0; fl < f.floors; fl++) {
    if (!lit && f.style !== 'glass' && f.style !== 'brick') { x.fillStyle = '#0002'; x.fillRect(0, fl * fh + fh - 4, W, 4); }
    for (let cl = 0; cl < f.cols; cl++) {
      const on = r() < 0.45;
      let wx = cl * cw + cw * 0.18, wy = fl * fh + fh * 0.2, ww = cw * 0.64, wh = fh * 0.55;
      if (f.style === 'glass') { wx = cl * cw + 2; wy = fl * fh + 3; ww = cw - 4; wh = fh - 8; }
      if (f.style === 'house' || f.style === 'brick') { ww = cw * 0.5; wx = cl * cw + cw * 0.25; wh = fh * 0.45; }
      if (lit) { x.fillStyle = on ? f.lit : '#000'; x.fillRect(wx, wy, ww, wh); continue; }
      if (f.style === 'glass') {
        const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh); g.addColorStop(0, '#a8cde3'); g.addColorStop(1, '#4f7590');
        x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
      } else {
        x.fillStyle = f.win; x.fillRect(wx, wy, ww, wh);
        x.fillStyle = '#ffffff22'; x.fillRect(wx, wy, ww * 0.4, wh);
        x.strokeStyle = '#fff8'; x.lineWidth = 2; x.strokeRect(wx, wy, ww, wh);
        if (f.style === 'balcony') { x.fillStyle = '#8a8478'; x.fillRect(wx - 4, wy + wh, ww + 8, 6); }
        if (f.style === 'deco') { x.fillStyle = '#b9b19d'; x.fillRect(cl * cw, fl * fh, 4, fh); }
        if (f.style === 'house' && fl === 0 && cl === 0) { x.fillStyle = '#5a3a22'; x.fillRect(cl * cw + cw * 0.3, fl * fh + fh * 0.35, cw * 0.4, fh * 0.65); }
      }
    }
  }
  return c;
}

export function facadeTextures() {
  return FACADES.map((f, i) => ({ map: toTex(facadeCanvas(f, false, 11 + i * 7)), emissive: toTex(facadeCanvas(f, true, 11 + i * 7)) }));
}

export function roofTexture() {
  const c = canvas(64, 64); const x = c.getContext('2d'); x.fillStyle = '#7d7a74'; x.fillRect(0, 0, 64, 64); noise(x, 64, 64, 30, rng(5)); return toTex(c);
}

export function dirtRoadTexture() {
  const W = 256, H = 256; const c = canvas(W, H); const x = c.getContext('2d'); const r = rng(77);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#6f8a3c'); g.addColorStop(0.1, '#8a7650'); g.addColorStop(0.5, '#a98a5c'); g.addColorStop(0.9, '#8a7650'); g.addColorStop(1, '#6f8a3c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // trilhas de pneu
  for (const cx of [0.3, 0.7]) { x.fillStyle = '#8c7049'; x.fillRect(W * cx - 14, 0, 28, H); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${60 + r() * 80},${50 + r() * 60},${30 + r() * 40},${r() * 0.6})`; x.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3); }
  noise(x, W, H, 22, r);
  return toTex(c);
}

export function groundTexture(kind) {
  const W = 256; const c = canvas(W, W); const x = c.getContext('2d'); const r = rng(kind.length * 31);
  const base = { grass: '#5d8a3a', sand: '#e8d6a5', field: '#9bae4a', forest: '#3f6a2c' }[kind] || '#777';
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 1600; i++) {
    const v = r();
    x.fillStyle = kind === 'sand' ? `rgba(${180 + v * 60},${160 + v * 50},${110 + v * 40},.5)` : `rgba(${40 + v * 60},${80 + v * 70},${20 + v * 30},.45)`;
    x.fillRect(r() * W, r() * W, 2 + r() * 4, 2 + r() * 4);
  }
  if (kind === 'field') { x.strokeStyle = '#6f8a32'; x.lineWidth = 6; for (let i = 0; i < W; i += 21) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); } }
  noise(x, W, W, 20, r);
  return toTex(c);
}

// Calçadão de Copacabana (ondas preto e branco)
export function calcadaoTexture() {
  const W = 256, H = 256; const c = canvas(W, H); const x = c.getContext('2d');
  x.fillStyle = '#efece4'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1d1d1d';
  for (let band = -1; band < 5; band += 2) {
    x.beginPath();
    for (let i = 0; i <= W; i += 4) { const y = (band * 64) + Math.sin(i / W * Math.PI * 2) * 22; i === 0 ? x.moveTo(i, y) : x.lineTo(i, y); }
    for (let i = W; i >= 0; i -= 4) { const y = ((band + 1) * 64) + Math.sin(i / W * Math.PI * 2) * 22; x.lineTo(i, y); }
    x.closePath(); x.fill();
  }
  noise(x, W, H, 26, rng(3));
  return toTex(c);
}

export function waterTexture() {
  const W = 256; const c = canvas(W, W); const x = c.getContext('2d'); const r = rng(9);
  x.fillStyle = '#1f6f8f'; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; x.lineWidth = 1 + r() * 2; const px = r() * W, py = r() * W; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 8, py - 3, px + 16 + r() * 10, py); x.stroke(); }
  return toTex(c);
}

export function skyTexture() {
  const c = canvas(4, 256); const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#3a7bd5'); g.addColorStop(0.55, '#9cc9f0'); g.addColorStop(1, '#e8f2fa');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = toTex(c, false); return t;
}

// Letreiro de LED (itinerário) desenhado sobre a textura original
export function ledSign(baseImg, uvRect, text, color = '#ffb52e') {
  const W = 768, H = 256; const c = canvas(W, H); const x = c.getContext('2d');
  if (baseImg) x.drawImage(baseImg, 0, 0, W, H); else { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
  const rx = uvRect.minU * W, ry = uvRect.minV * H, rw = (uvRect.maxU - uvRect.minU) * W, rh = (uvRect.maxV - uvRect.minV) * H;
  x.fillStyle = '#050505'; x.fillRect(rx, ry, rw, rh);
  let fs = rh * 0.78; x.font = `900 ${fs}px monospace`;
  while (x.measureText(text).width > rw * 0.95 && fs > 8) { fs -= 2; x.font = `900 ${fs}px monospace`; }
  x.fillStyle = color; x.textBaseline = 'middle'; x.textAlign = 'center';
  x.shadowColor = color; x.shadowBlur = 8;
  x.fillText(text, rx + rw / 2, ry + rh / 2 + 2);
  // efeito de pontos do LED
  x.shadowBlur = 0; x.fillStyle = '#0007';
  for (let yy = ry; yy < ry + rh; yy += 4) x.fillRect(rx, yy, rw, 1);
  for (let xx = rx; xx < rx + rw; xx += 4) x.fillRect(xx, ry, 1, rh);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}

// Pintura do ônibus: troca o vermelho da textura original por outra cor
export function recolorLivery(img, hex) {
  const c = canvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  if (!hex) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; }
  const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
  const tc = new THREE.Color(hex); const tr = tc.r * 255, tg = tc.g * 255, tb = tc.b * 255;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    if (r > 70 && r > g * 1.8 && r > b * 1.8) {
      const k = r / 140; p[i] = Math.min(255, tr * k); p[i + 1] = Math.min(255, tg * k); p[i + 2] = Math.min(255, tb * k);
    }
  }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4; return t;
}

const loader = new THREE.TextureLoader();
export function loadRoadTex(name) {
  const t = loader.load(`./assets/ruas/${name}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
export function loadTileTex(name) {
  const t = loader.load(`./assets/ruas/${name}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
