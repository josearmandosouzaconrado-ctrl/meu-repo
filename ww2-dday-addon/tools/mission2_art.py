"""Missão 2: modelo do M4 Sherman (voxel de meio bloco), canhão Pak 40, quadro do mapa e a
textura do mapa de briefing. A planta do mapa bate com o que o script gera no mundo."""
import math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ---- layout da missão (blocos, relativo à base: x = leste/ao longo da estrada, z = sul) -------
LAYOUT = {
    'road': {'x0': -90, 'x1': 115, 'half': 2},
    'forest': {'x0': 18, 'x1': 104, 'zmax': 26},
    'tanks_start': [-38, -50, -62, -74],
    'ambush_x': 10,
    'paks': [{'x': 48, 'z': 7, 'name': 'Leste'}, {'x': 80, 'z': -8, 'name': 'Encruzilhada'}],
    'mg': {'x': 26, 'z': -6},
    'groups': [{'x': 38, 'z': -13}, {'x': 62, 'z': 13}, {'x': 92, 'z': 4}],
    'hedges': [-9, 10],          # linhas de cerca viva (bocage) no campo aberto
    'objective_x': 108,
}

OD = (84, 92, 52)
OD_D = (66, 72, 42)
TRACK = (42, 40, 38)
WHEEL = (58, 58, 54)
WHITE = (226, 226, 220)
STAR = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##']


def tank_cells():
    """células de 8 px: x = frente, y = cima, z = direita"""
    c = {}
    for z in (-4, -3, 3, 4):
        for x in range(-9, 9):
            for y in range(0, 3):
                if (x in (-9, 8)) and y in (0, 2):
                    continue
                c[(x, y, z)] = 'track'
    for x in range(-8, 8):
        for z in range(-2, 3):
            for y in (1, 2):
                c[(x, y, z)] = 'od_d'
    for x in range(-8, 7):
        for z in range(-4, 5):
            for y in (3, 4):
                c[(x, y, z)] = 'od'
    for z in range(-4, 5):
        c[(7, 3, z)] = 'od'
    for z in (-2, 0, 2):
        c[(7, 3, z)] = 'track'          # elos de esteira extras no glacis
    for x in range(-8, -5):
        for z in range(-2, 3):
            c[(x, 4, z)] = 'od_d'        # grelha do motor
    return c


def turret_cells():
    c = {}
    for x in range(-3, 3):
        for z in range(-3, 4):
            for y in (5, 6):
                if x in (-3, 2) and abs(z) == 3:
                    continue
                c[(x, y, z)] = 'od'
    for x in range(-2, 2):
        for z in range(-2, 3):
            c[(x, 7, z)] = 'od'
    for z in (-1, 0, 1):
        for y in (5, 6):
            c[(-4, y, z)] = 'od_d'
    for x in (-1, 0):
        for z in (1, 2):
            c[(x, 8, z)] = 'od_d'
    return c


def greedy(cells):
    rem = dict(cells)
    out = []
    for k in sorted(rem):
        if k not in rem:
            continue
        v = rem[k]
        x0, y0, z0 = k
        x1 = x0
        while rem.get((x1 + 1, y0, z0)) == v:
            x1 += 1
        y1 = y0
        while all(rem.get((x, y1 + 1, z0)) == v for x in range(x0, x1 + 1)):
            y1 += 1
        z1 = z0
        while all(rem.get((x, y, z1 + 1)) == v for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)):
            z1 += 1
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    del rem[(x, y, z)]
        out.append(((x0, y0, z0), (x1, y1, z1), v))
    return out


def cell_box(a, b, u=8.0):
    """células (x frente, z direita) -> origem/tamanho no modelo Bedrock (-Z = frente, -X = direita)"""
    (x0, y0, z0), (x1, y1, z1) = a, b
    mx0, mx1 = -(z1 + 1) * u, -z0 * u
    mz0, mz1 = -(x1 + 1) * u, -x0 * u
    return [mx0, y0 * u, mz0], [mx1 - mx0, (y1 + 1 - y0) * u, mz1 - mz0]


def star_cubes(pcube, center, normal, px=1.4):
    """estrela branca dos Aliados na lateral (normal = 'x+'/'x-') ou no topo ('y')"""
    cubes = []
    cx, cy, cz = center
    for r, row in enumerate(STAR):
        for col, ch in enumerate(row):
            if ch != '#':
                continue
            a = (col - 3) * px
            b = (3 - r) * px
            if normal in ('x+', 'x-'):
                off = 0.15 if normal == 'x+' else -0.45
                cubes.append(pcube([cx + off, cy + b, cz + a], [0.3, px, px], WHITE))
            else:
                cubes.append(pcube([cx + a, cy + 0.1, cz + b], [px, 0.3, px], WHITE))
    return cubes


def tank_geometry(pcube, geometry):
    colors = {'od': OD, 'od_d': OD_D, 'track': TRACK}
    hull = [pcube(*cell_box(a, b), colors[v]) for a, b, v in greedy(tank_cells())]
    # rodas de apoio nas laterais das esteiras
    for side in (1, -1):
        for i in range(6):
            zc = -(-7 + i * 2.6) * 8 - 6
            hull.append(pcube([32 if side > 0 else -43, 1, zc], [3, 12, 12], WHEEL))
    hull += star_cubes(pcube, [32, 26, 10], 'x+') + star_cubes(pcube, [-40, 26, 10], 'x-')
    hull += star_cubes(pcube, [-6, 40, 40], 'y')
    turret = [pcube(*cell_box(a, b), colors[v]) for a, b, v in greedy(turret_cells())]
    turret += star_cubes(pcube, [24, 47, 0], 'x+') + star_cubes(pcube, [-32, 47, 0], 'x-')
    # metralhadora .50 na cúpula
    turret += [pcube([-17, 75, -10], [1.6, 1.6, 14], TRACK), pcube([-18.5, 72, 0], [4, 4, 4], TRACK)]
    barrel = [pcube([-11, 41, -30], [14, 12, 4], OD_D),            # mantelete
              pcube([-6, 45, -78], [4, 4, 50], OD_D),
              pcube([-6.5, 44.5, -80], [5, 5, 3], TRACK)]
    bones = [{'name': 'root', 'pivot': [0, 0, 0]},
             {'name': 'hull', 'parent': 'root', 'pivot': [0, 0, 0], 'cubes': hull},
             {'name': 'turret', 'parent': 'hull', 'pivot': [-4, 40, 0], 'cubes': turret},
             {'name': 'barrel', 'parent': 'turret', 'pivot': [-4, 47, -26], 'cubes': barrel}]
    return geometry('geometry.ww2.sherman', bones, vbw=12, vbh=6, vbo=(0, 2, 0))


def pak_geometry(pcube, geometry):
    g, d, t = (146, 134, 90), (112, 102, 66), (34, 34, 32)
    base = [pcube([-15, 0, -6], [3, 11, 11], t), pcube([12, 0, -6], [3, 11, 11], t),
            pcube([-12, 4, -2], [24, 3, 4], d),
            pcube([-9, 0, 4], [3, 3, 30], d, [0, 18, 0], [-7, 1, 4]),
            pcube([6, 0, 4], [3, 3, 30], d, [0, -18, 0], [7, 1, 4])]
    upper = [pcube([-13, 6, -9], [11, 15, 1], g, [12, 0, 0], [0, 6, -9]),
             pcube([2, 6, -9], [11, 15, 1], g, [12, 0, 0], [0, 6, -9]),
             pcube([-2, 6, -9], [4, 5, 1], g, [12, 0, 0], [0, 6, -9]),
             pcube([-4, 6, -4], [8, 6, 10], d)]
    barrel = [pcube([-3, 10, -6], [6, 6, 14], d), pcube([-1.3, 11.7, -60], [2.6, 2.6, 56], g),
              pcube([-2.5, 10.5, -64], [5, 5, 4], t), pcube([-2, 9, -16], [4, 2.5, 14], d)]
    bones = [{'name': 'root', 'pivot': [0, 0, 0], 'cubes': base},
             {'name': 'turret', 'parent': 'root', 'pivot': [0, 0, 0], 'cubes': upper},
             {'name': 'barrel', 'parent': 'turret', 'pivot': [0, 13, 0], 'cubes': barrel}]
    return geometry('geometry.ww2.pak40', bones, vbw=6, vbh=3, vbo=(0, 1, 0))


def board_geometry(geometry):
    face = {'uv': [0, 0], 'uv_size': [512, 256]}
    tiny = {'uv': [0, 0], 'uv_size': [1, 1]}
    cube = {'origin': [-128, 0, 0], 'size': [256, 128, 1],
            'uv': {'north': face, 'south': tiny, 'east': tiny, 'west': tiny, 'up': tiny, 'down': tiny}}
    frame = []
    return geometry('geometry.ww2.map_board', [{'name': 'root', 'pivot': [0, 0, 0], 'cubes': [cube] + frame}],
                    tw=512, th=256, vbw=18, vbh=10, vbo=(0, 4, 0))


# ---------------------------------------------------------------------------
FONT_PATHS = ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def font(size):
    for f in FONT_PATHS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def briefing_map():
    W, H = 1024, 512
    rnd = random.Random(1944)
    img = Image.new('RGB', (W, H), (224, 212, 174))
    px = img.load()
    for x in range(W):
        for y in range(H):
            n = rnd.randint(-7, 7)
            r, g, b = px[x, y]
            px[x, y] = (r + n, g + n, b + n)
    d = ImageDraw.Draw(img, 'RGBA')
    L = LAYOUT
    # escala: x de -100..120 -> 40..980 ; z de -45..45 -> 60..470
    X = lambda x: 40 + (x + 100) / 220 * 940
    Z = lambda z: 265 + z / 45 * 205
    for gx in range(0, W, 64):
        d.line([gx, 0, gx, H], fill=(120, 110, 80, 60))
    for gy in range(0, H, 64):
        d.line([0, gy, W, gy], fill=(120, 110, 80, 60))
    # campos com cercas vivas (bocage)
    for i in range(14):
        x0 = rnd.uniform(-100, 0); w = rnd.uniform(18, 34)
        z0 = rnd.uniform(-45, 30); hh = rnd.uniform(10, 18)
        d.rectangle([X(x0), Z(z0), X(x0 + w), Z(z0 + hh)], fill=(186, 196, 128, 120), outline=(70, 100, 50, 200), width=3)
    for hz in L['hedges']:
        d.line([X(-90), Z(hz), X(L['forest']['x0']), Z(hz)], fill=(60, 95, 45, 230), width=5)
    # bosque
    f = L['forest']
    d.rectangle([X(f['x0']), Z(-f['zmax']), X(f['x1']), Z(f['zmax'])], fill=(70, 110, 60, 150))
    for _ in range(420):
        x = rnd.uniform(f['x0'], f['x1']); z = rnd.uniform(-f['zmax'], f['zmax'])
        if abs(z) < 4:
            continue
        r = rnd.uniform(5, 10)
        d.ellipse([X(x) - r, Z(z) - r, X(x) + r, Z(z) + r], fill=(48, 88, 44, 200), outline=(30, 60, 30, 220))
    # estrada de terra
    d.line([X(L['road']['x0']), Z(0), X(L['road']['x1']), Z(0)], fill=(150, 104, 58, 255), width=12)
    d.line([X(L['road']['x0']), Z(0), X(L['road']['x1']), Z(0)], fill=(178, 132, 80, 255), width=6)
    d.line([X(108), Z(-45), X(108), Z(45)], fill=(150, 104, 58, 255), width=10)
    # coluna blindada (azul) + seta de ataque
    for tx in L['tanks_start']:
        cx, cy = X(tx), Z(0)
        d.rectangle([cx - 12, cy - 8, cx + 12, cy + 8], outline=(30, 60, 170, 255), width=3, fill=(120, 150, 230, 160))
        d.ellipse([cx - 8, cy - 4, cx + 8, cy + 4], outline=(30, 60, 170, 255), width=2)
    d.line([X(-30), Z(0) - 26, X(96), Z(0) - 26], fill=(30, 60, 170, 230), width=6)
    d.polygon([(X(100), Z(0) - 26), (X(92), Z(0) - 38), (X(92), Z(0) - 14)], fill=(30, 60, 170, 230))
    # posições alemãs (vermelho)
    for p in L['paks']:
        cx, cy = X(p['x']), Z(p['z'])
        d.rectangle([cx - 14, cy - 10, cx + 14, cy + 10], outline=(190, 20, 20, 255), width=3, fill=(240, 160, 150, 170))
        d.line([cx - 14, cy + 10, cx, cy - 10], fill=(190, 20, 20, 255), width=3)
        d.line([cx, cy - 10, cx + 14, cy + 10], fill=(190, 20, 20, 255), width=3)
        d.text((cx - 26, cy + 14), 'PAK 40', fill=(170, 10, 10), font=font(20))
    m = L['mg']
    cx, cy = X(m['x']), Z(m['z'])
    d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], outline=(190, 20, 20, 255), width=3)
    d.text((cx - 12, cy - 36), 'MG', fill=(170, 10, 10), font=font(20))
    for g in L['groups']:
        cx, cy = X(g['x']), Z(g['z'])
        d.rectangle([cx - 10, cy - 7, cx + 10, cy + 7], outline=(190, 20, 20, 255), width=2)
        d.line([cx - 10, cy - 7, cx + 10, cy + 7], fill=(190, 20, 20, 255), width=2)
        d.line([cx - 10, cy + 7, cx + 10, cy - 7], fill=(190, 20, 20, 255), width=2)
    # objetivo
    ox = X(L['objective_x'])
    d.ellipse([ox - 30, Z(0) - 30, ox + 30, Z(0) + 30], outline=(200, 30, 30, 255), width=4)
    d.text((ox - 120, Z(0) + 40), 'OBJETIVO:', fill=(170, 10, 10), font=font(22))
    d.text((ox - 120, Z(0) + 64), 'ENCRUZILHADA', fill=(170, 10, 10), font=font(22))
    # textos
    d.text((X(f['x0']) + 30, Z(-f['zmax']) - 34), 'BOSQUE DE HAUTOT', fill=(30, 55, 25), font=font(30))
    d.text((X(-88), Z(0) + 14), 'ESTRADA DE TERRA', fill=(100, 60, 25), font=font(20))
    d.text((X(-70), Z(0) - 60), 'COLUNA BLINDADA  (M4 SHERMAN)', fill=(25, 50, 150), font=font(20))
    d.text((24, 14), 'OPERAÇÃO BOSQUE - 7 DE JUNHO DE 1944', fill=(40, 30, 20), font=font(30))
    d.text((24, 56), 'Destruir os canhões antitanque e abrir a estrada', fill=(60, 45, 30), font=font(22))
    # rosa dos ventos
    cx, cy = W - 70, 80
    d.polygon([(cx, cy - 40), (cx - 12, cy), (cx + 12, cy)], fill=(40, 30, 20))
    d.polygon([(cx, cy + 40), (cx - 12, cy), (cx + 12, cy)], outline=(40, 30, 20))
    d.text((cx - 8, cy - 72), 'N', fill=(40, 30, 20), font=font(26))
    # carimbo
    d.rectangle([W - 250, H - 76, W - 40, H - 30], outline=(190, 30, 30, 200), width=4)
    d.text((W - 232, H - 72), 'SECRETO', fill=(190, 30, 30), font=font(32))
    # escala
    sx = X(-90)
    d.line([sx, H - 40, X(-40), H - 40], fill=(40, 30, 20), width=4)
    d.text((sx, H - 34), '50 m', fill=(40, 30, 20), font=font(18))
    img = img.filter(ImageFilter.SMOOTH)
    # bordas escurecidas (papel velho)
    vign = Image.new('L', (W, H), 0)
    ImageDraw.Draw(vign).rectangle([12, 12, W - 12, H - 12], fill=255)
    vign = vign.filter(ImageFilter.GaussianBlur(18))
    dark = Image.new('RGB', (W, H), (120, 100, 70))
    img = Image.composite(img, dark, vign)
    return img.resize((512, 256), Image.LANCZOS)


# ---------------------------------------------------------------------------
# P-51D Mustang (células de 8 px; x = frente, z = direita)
# ---------------------------------------------------------------------------
SILVER, SILVER_D = (186, 190, 195), (150, 155, 160)
GLASS = (150, 190, 210)
P51_OD = (70, 80, 45)
RED, YELLOW = (180, 30, 30), (220, 190, 40)
BLACK = (24, 24, 24)


def p51_cells():
    c = {}

    def sec(x, w, y0, y1, col='silver'):
        for z in range(-w, w + 1):
            for y in range(y0, y1 + 1):
                if w > 0 and abs(z) == w and y in (y0, y1):
                    continue
                c[(x, y, z)] = col
    for x in range(-16, 16):
        if x >= 12:
            sec(x, 1, 2, 4)
        elif x >= -4:
            sec(x, 2, 1, 5)
        elif x >= -10:
            sec(x, 1, 2, 5)
        else:
            sec(x, 1 if x > -14 else 0, 3, 5)
    for x in range(-10, -5):                     # faixas de invasão na fuselagem traseira
        for (xx, y, z), v in list(c.items()):
            if xx == x:
                c[(xx, y, z)] = 'white' if x % 2 == 0 else 'black'
    for x in range(7, 15):                       # painel antirreflexo verde-oliva
        for z in (-1, 0, 1):
            top = max(y for (xx, y, zz) in c if xx == x and zz == z)
            c[(x, top, z)] = 'od'
    for x in (13, 14, 15):                       # faixa amarela no nariz
        for (xx, y, z), v in list(c.items()):
            if xx == x:
                c[(xx, y, z)] = 'yellow'
    for x in range(2, 7):                        # canopy em bolha
        for z in (-1, 0, 1):
            c[(x, 6, z)] = 'glass'
            if x in (3, 4, 5) and z == 0:
                c[(x, 7, z)] = 'glass'
    for x in range(-4, 3):                       # entrada de ar ventral
        for z in (-1, 0, 1):
            c[(x, 0, z)] = 'silver_d'
    # asas (asa baixa, 1 célula de espessura)
    for az in range(3, 20):
        x0 = -2 + (az - 3) // 5
        x1 = 6 - (az - 3) // 3
        for z in (az, -az):
            for x in range(x0, x1 + 1):
                col = 'silver'
                if 9 <= az <= 13:
                    col = 'white' if az % 2 == 1 else 'black'
                c[(x, 1, z)] = col
    for x in range(-16, -12):                    # estabilizador horizontal
        for z in range(-6, 7):
            if abs(z) > 1 or (x, 3, z) not in c:
                c[(x, 3, z)] = 'silver'
    for x, top in {-16: 9, -15: 9, -14: 8, -13: 7, -12: 6}.items():   # deriva
        for y in range(5, top + 1):
            c[(x, y, 0)] = 'silver'
    return c


def p51_geometry(pcube, geometry):
    colors = {'silver': SILVER, 'silver_d': SILVER_D, 'white': WHITE, 'black': BLACK, 'od': P51_OD,
              'glass': GLASS, 'yellow': YELLOW}
    body = [pcube(*cell_box(a, b), colors[v]) for a, b, v in greedy(p51_cells())]
    # estrelas nas asas (lado de cima)
    for zc in (-16, 16):
        mx = -(zc + 0.5) * 8
        body += star_cubes(pcube, [mx, 16, -12], 'y')
    # hélice de 4 pás com spinner vermelho
    pz = -16 * 8 - 1
    prop = [pcube([-4, 20, pz - 6], [8, 8, 7], RED)]
    for ang in (0, 90):
        prop.append(pcube([-2, -8, pz - 1], [4, 72, 1.2], BLACK, [0, 0, ang], [0, 24, pz]))
    bones = [{'name': 'root', 'pivot': [0, 0, 0]},
             {'name': 'body', 'parent': 'root', 'pivot': [0, 24, 0], 'cubes': body},
             {'name': 'prop', 'parent': 'root', 'pivot': [0, 24, pz], 'cubes': prop}]
    return geometry('geometry.ww2.p51', bones, vbw=22, vbh=10, vbo=(0, 1, 0))
