// Sons sintetizados (Web Audio): motor diesel, buzina, portas pneumáticas, moedas, batida.
export class Sound {
  constructor() { this.enabled = true; this.ctx = null; }
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx; this.master = c.createGain(); this.master.gain.value = 0.6; this.master.connect(c.destination);
    // motor: dente-de-serra + quadrada filtradas
    this.eng = c.createGain(); this.eng.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.o1.connect(lp); this.o2.connect(g2); g2.connect(lp); lp.connect(this.eng); this.eng.connect(this.master);
    this.o1.start(); this.o2.start(); this.lp = lp;
    // ruído (pneus/vento)
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const n = c.createBufferSource(); n.buffer = buf; n.loop = true; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700;
    this.road = c.createGain(); this.road.gain.value = 0; n.connect(nf); nf.connect(this.road); this.road.connect(this.master); n.start();
  }
  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }
  engine(rpm01, load, speed) {
    if (!this.ctx) return; const t = this.ctx.currentTime; const on = this.enabled ? 1 : 0;
    const f = 28 + rpm01 * 70;
    this.o1.frequency.setTargetAtTime(f, t, 0.08); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.lp.frequency.setTargetAtTime(250 + rpm01 * 500 + load * 300, t, 0.1);
    this.eng.gain.setTargetAtTime(on * (0.12 + load * 0.12 + rpm01 * 0.06), t, 0.1);
    this.road.gain.setTargetAtTime(on * Math.min(0.08, speed / 300), t, 0.2);
  }
  tone(freqs, dur, type = 'square', vol = 0.15) {
    if (!this.ctx || !this.enabled) return; const c = this.ctx, t = c.currentTime; const g = c.createGain(); g.gain.value = vol; g.connect(this.master);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    for (const f of freqs) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur); }
  }
  noise(dur, freq, vol = 0.3) {
    if (!this.ctx || !this.enabled) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  }
  play(name) {
    switch (name) {
      case 'horn': this.tone([311, 392], 0.6, 'sawtooth', 0.12); break;
      case 'door': this.noise(0.7, 2500, 0.35); break;
      case 'coin': this.tone([1318, 1760], 0.15, 'triangle', 0.12); break;
      case 'step': this.tone([180], 0.06, 'sine', 0.1); break;
      case 'crash': this.noise(0.5, 300, 0.8); this.tone([70], 0.4, 'sine', 0.5); break;
      case 'bell': this.tone([1046, 1318], 0.5, 'sine', 0.15); break;
      case 'fine': this.tone([440, 330], 0.4, 'square', 0.08); break;
    }
  }
}
