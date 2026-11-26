"""Procedural sound effects (numpy synthesis -> wav -> ogg via ffmpeg)."""
import os, subprocess, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(1944)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, cutoff, passes=2):
    # fast approximate low-pass via moving average passes
    n = max(1, int(SR / (cutoff * 2.0)))
    k = np.ones(n) / n
    for _ in range(passes):
        x = np.convolve(x, k, mode='same')
    return x


def hp_fast(x, cutoff):
    return x - lp_fast(x, cutoff, 1)


def env_exp(t, tau):
    return np.exp(-t / tau)


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def gunshot(dur, crack_tau, body_tau, body_cut, thump_hz, echo=0.0, bright=1.0):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    crack = hp_fast(n, 1800) * env_exp(t, crack_tau) * bright
    body = lp_fast(n, body_cut) * env_exp(t, body_tau) * 3.0
    thump = np.sin(2 * np.pi * thump_hz * t * (1 - 0.4 * t)) * env_exp(t, 0.05) * 0.8
    x = crack + body + thump
    if echo:
        d = int(SR * 0.11)
        e = np.zeros_like(x); e[d:] = lp_fast(x[:-d], 900) * echo
        x = x + e
    att = np.minimum(1, t / 0.0015)
    return norm(x * att)


def ping():
    t = t_axis(0.9)
    x = sum(a * np.sin(2 * np.pi * f * t) for f, a in ((2380, 1.0), (3170, 0.6), (4790, 0.35), (6020, 0.2)))
    x = x * env_exp(t, 0.22)
    x[:200] *= np.linspace(0, 1, 200)
    return norm(x, 0.7)


def clicks(times, dur=0.6):
    t = t_axis(dur)
    x = np.zeros_like(t)
    for tt, f in times:
        i = int(tt * SR)
        seg = t_axis(0.05)
        c = np.sin(2 * np.pi * f * seg) * env_exp(seg, 0.008) + hp_fast(rng.standard_normal(len(seg)), 2000) * env_exp(seg, 0.004)
        x[i:i + len(seg)] += c[:len(x) - i]
    return norm(x, 0.8)


def boom(dur, tau, cut, crack=0.4):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    x = lp_fast(n, cut, 3) * env_exp(t, tau) * 6 + hp_fast(n, 1500) * env_exp(t, 0.02) * crack
    x += np.sin(2 * np.pi * 42 * t) * env_exp(t, tau * 0.6) * 0.8
    att = np.minimum(1, t / 0.004)
    return norm(x * att)


def engine(dur=5.0):
    t = t_axis(dur)
    base = 58.0
    x = np.zeros_like(t)
    for h, a in ((1, 1.0), (2, 0.55), (3, 0.35), (4, 0.22), (6, 0.12), (8, 0.06)):
        x += a * np.sin(2 * np.pi * base * h * t + h * 0.7)
    # second engine slightly detuned -> beating
    for h, a in ((1, 0.8), (2, 0.45), (3, 0.3)):
        x += a * np.sin(2 * np.pi * (base * 1.013) * h * t)
    # propeller blade pass modulation
    x *= 0.75 + 0.25 * np.sin(2 * np.pi * 21.0 * t)
    x += lp_fast(rng.standard_normal(len(t)), 500) * 2.5
    fade = np.minimum(1, np.minimum(t / 0.5, (dur - t) / 0.5))
    return norm(x * fade, 0.8)


def wind(dur=5.0):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    x = lp_fast(n, 1200) * 2 + hp_fast(lp_fast(n, 4000), 600) * 0.6
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.6 * t) * np.sin(2 * np.pi * 0.23 * t + 1)
    fade = np.minimum(1, np.minimum(t / 0.5, (dur - t) / 0.5))
    return norm(x * fade, 0.7)


def chute_open():
    t = t_axis(1.4)
    n = rng.standard_normal(len(t))
    whoosh = lp_fast(n, 900) * np.exp(-((t - 0.35) ** 2) / 0.03) * 3
    snap = hp_fast(n, 300) * np.exp(-((t - 0.55) ** 2) / 0.0008) * 1.4
    flap = lp_fast(n, 400) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) * np.exp(-np.maximum(0, t - 0.6) / 0.25) * (t > 0.55) * 2
    return norm(whoosh + snap + flap)


def buzzer(f=180, dur=0.9):
    t = t_axis(dur)
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.3
    x = lp_fast(x, 2500, 1)
    fade = np.minimum(1, np.minimum(t / 0.01, (dur - t) / 0.03))
    return norm(x * fade, 0.6)


def radio():
    t = t_axis(0.7)
    n = rng.standard_normal(len(t))
    st = hp_fast(lp_fast(n, 3000), 800) * (t < 0.45)
    beep = np.sin(2 * np.pi * 1200 * t) * ((t > 0.5) & (t < 0.65)) * 0.6
    return norm(st * 0.7 + beep, 0.6)


def beep():
    t = t_axis(0.15)
    return norm(np.sin(2 * np.pi * 1850 * t) * np.minimum(1, (0.15 - t) / 0.02), 0.6)


def clank():
    t = t_axis(0.5)
    x = sum(a * np.sin(2 * np.pi * f * t) for f, a in ((820, 1), (1290, 0.7), (2210, 0.4)))
    x = x * env_exp(t, 0.06) + hp_fast(rng.standard_normal(len(t)), 2500) * env_exp(t, 0.01)
    return norm(x, 0.7)


def whiz():
    t = t_axis(0.35)
    f = 2600 - 1800 * t / 0.35
    ph = np.cumsum(2 * np.pi * f / SR)
    x = np.sin(ph) * np.exp(-((t - 0.17) ** 2) / 0.004) + hp_fast(rng.standard_normal(len(t)), 3000) * 0.2 * np.exp(-((t - 0.17) ** 2) / 0.004)
    return norm(x, 0.5)


def tank_engine(dur=4.0):
    t = t_axis(dur)
    base = 34.0
    x = sum(a * np.sin(2 * np.pi * base * h * t + h) for h, a in ((1, 1.0), (2, 0.7), (3, 0.4), (5, 0.2)))
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 7.0 * t)
    x += lp_fast(rng.standard_normal(len(t)), 300) * 3
    # tilintar das esteiras
    for k in np.arange(0.05, dur, 0.21):
        i = int(k * SR); seg = t_axis(0.04)
        c = np.sin(2 * np.pi * 900 * seg) * env_exp(seg, 0.006) * 0.35
        x[i:i + len(seg)] += c[:len(x) - i]
    fade = np.minimum(1, np.minimum(t / 0.4, (dur - t) / 0.4))
    return norm(x * fade, 0.8)


def p51_pass(dur=5.0):
    # ronco do motor Merlin V12 passando (efeito Doppler simples)
    t = t_axis(dur)
    tc = dur * 0.45
    f0 = 118 * (1 + 0.18 * np.tanh(-(t - tc) * 2.2))
    ph = np.cumsum(2 * np.pi * f0 / SR)
    x = sum(a * np.sin(h * ph) for h, a in ((1, 1.0), (2, 0.7), (3, 0.5), (4, 0.3), (6, 0.2), (8, 0.1)))
    x += hp_fast(lp_fast(rng.standard_normal(len(t)), 2500), 200) * 3
    amp = 1 / (1 + ((t - tc) * 1.6) ** 2)
    return norm(x * amp * np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 0.3), 0.9)


def write_ogg(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wav = path[:-4] + '.wav'
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(data.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', path], check=True)
    os.remove(wav)


SOUNDS = {
    # name: (generator, category, max_distance, volume)
    'garand':     (lambda: gunshot(0.7, 0.012, 0.09, 700, 90, 0.35), 'hostile', 96, 1.0),
    'thompson':   (lambda: gunshot(0.35, 0.008, 0.05, 600, 70, 0.15, 0.7), 'hostile', 80, 0.9),
    'bar':        (lambda: gunshot(0.45, 0.01, 0.07, 650, 80, 0.25), 'hostile', 96, 1.0),
    'mp44':       (lambda: gunshot(0.35, 0.009, 0.055, 750, 85, 0.15, 0.8), 'hostile', 80, 0.9),
    'kar98':      (lambda: gunshot(0.9, 0.014, 0.11, 650, 95, 0.45, 1.1), 'hostile', 110, 1.0),
    'garand_ping': (ping, 'player', 24, 0.8),
    'reload':     (lambda: clicks([(0.05, 1500), (0.32, 900), (0.45, 1300)]), 'player', 12, 0.8),
    'flak_shot':  (lambda: gunshot(0.6, 0.01, 0.12, 350, 55, 0.3), 'hostile', 160, 1.0),
    'flak_burst': (lambda: boom(1.8, 0.35, 260, 0.5), 'hostile', 200, 1.0),
    'explosion':  (lambda: boom(2.5, 0.5, 180, 0.8), 'hostile', 160, 1.0),
    'engine':     (engine, 'neutral', 48, 1.0),
    'tank_gun':   (lambda: boom(2.2, 0.3, 420, 1.6), 'hostile', 220, 1.0),
    'tank_engine': (tank_engine, 'neutral', 40, 1.0),
    'p51': (p51_pass, 'neutral', 160, 1.0),
    'wind':       (wind, 'neutral', 24, 1.0),
    'chute_open': (chute_open, 'neutral', 32, 1.0),
    'buzzer':     (buzzer, 'neutral', 24, 1.0),
    'radio':      (radio, 'player', 16, 0.8),
    'beep':       (beep, 'hostile', 24, 1.0),
    'clank':      (clank, 'neutral', 16, 0.8),
    'whiz':       (whiz, 'hostile', 12, 0.7),
}


def build(rp_dir):
    defs = {}
    for name, (gen, cat, maxd, vol) in SOUNDS.items():
        write_ogg(os.path.join(rp_dir, 'sounds', 'ww2', name + '.ogg'), gen())
        defs['ww2.' + name] = {
            'category': cat, 'min_distance': 2.0, 'max_distance': float(maxd),
            'sounds': [{'name': 'sounds/ww2/' + name, 'volume': vol, 'load_on_low_memory': True}],
        }
    return defs
