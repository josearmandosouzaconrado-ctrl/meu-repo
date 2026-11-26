"""Procedural textures: soldier skins, palette atlas, item icons, particles, pack icon."""
import random
from PIL import Image, ImageDraw, ImageFilter


def jitter(c, amt, rnd):
    return tuple(max(0, min(255, v + rnd.randint(-amt, amt))) for v in c)


def fill(img, x, y, w, h, c, noise=6, seed=0):
    rnd = random.Random(seed * 7919 + x * 31 + y * 17)
    for i in range(x, x + w):
        for j in range(y, y + h):
            img.putpixel((i, j), jitter(c, noise, rnd) + (255,))


def px(img, x, y, c):
    img.putpixel((x, y), tuple(c) + (255,))


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


# --- standard 64x64 humanoid layout helpers ---------------------------------
def box_faces(u, v, w, h, d):
    """Return dict face -> (x, y, w, h) for Bedrock box UV."""
    return {
        'top': (u + d, v, w, d), 'bottom': (u + d + w, v, w, d),
        'right': (u, v + d, d, h), 'front': (u + d, v + d, w, h),
        'left': (u + d + w, v + d, d, h), 'back': (u + d + w + d, v + d, w, h),
    }


def paint_box(img, u, v, w, h, d, c, noise=6, seed=0):
    for f, (x, y, ww, hh) in box_faces(u, v, w, h, d).items():
        fill(img, x, y, ww, hh, c if f != 'bottom' else shade(c, 0.8), noise, seed)


def band(img, u, v, w, h, d, rows, c, noise=5, seed=0):
    """Paint rows (relative to the side strip, 0..h-1) on all four sides."""
    for f in ('right', 'front', 'left', 'back'):
        x, y, ww, hh = box_faces(u, v, w, h, d)[f]
        for r in rows:
            fill(img, x, y + r, ww, 1, c, noise, seed + r)


SKIN_TONES_US = [(224, 182, 146), (198, 150, 112), (176, 128, 92)]
SKIN_TONES_DE = [(228, 188, 152), (212, 168, 132), (232, 196, 164)]
EYES = [(60, 90, 140), (90, 70, 40), (70, 110, 70)]
BROWS = [(70, 50, 30), (40, 30, 20), (150, 120, 70)]


def paint_face(img, skin, eye, brow, us, variant):
    head = box_faces(0, 0, 8, 8, 8)
    for f, (x, y, w, h) in head.items():
        fill(img, x, y, w, h, skin, 4, 1)
    # hair on top / back (mostly hidden by helmet)
    fill(img, 8, 0, 8, 8, brow, 6, 2)
    x0, y0 = 8, 8
    for i in range(8):
        px(img, x0 + i, y0, brow)               # fringe
    px(img, x0 + 1, y0 + 3, brow); px(img, x0 + 2, y0 + 3, brow)
    px(img, x0 + 5, y0 + 3, brow); px(img, x0 + 6, y0 + 3, brow)
    px(img, x0 + 1, y0 + 4, (240, 240, 240)); px(img, x0 + 2, y0 + 4, eye)
    px(img, x0 + 5, y0 + 4, eye); px(img, x0 + 6, y0 + 4, (240, 240, 240))
    px(img, x0 + 3, y0 + 5, shade(skin, 0.85)); px(img, x0 + 4, y0 + 5, shade(skin, 0.85))
    px(img, x0 + 3, y0 + 6, shade(skin, 0.6)); px(img, x0 + 4, y0 + 6, shade(skin, 0.6))
    if us:
        paint = (38, 34, 30)
        # cork face paint (camouflage stripes) - varies per variant
        pts = [[(0, 5), (1, 6), (6, 5), (7, 6), (2, 1), (3, 2)],
               [(0, 4), (0, 6), (7, 4), (7, 6), (4, 1), (5, 1)],
               [(1, 5), (2, 6), (5, 6), (6, 5), (3, 1)]][variant % 3]
        for (a, b) in pts:
            px(img, x0 + a, y0 + b, paint)
    else:
        px(img, x0 + 2, y0 + 7, shade(skin, 0.75)); px(img, x0 + 5, y0 + 7, shade(skin, 0.75))


def us_skin(variant):
    img = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    skin = SKIN_TONES_US[variant]
    paint_face(img, skin, EYES[variant], BROWS[variant], True, variant)
    suit = (141, 130, 96)
    trou = (133, 123, 90)
    boots = (96, 62, 36)
    # body (jump jacket)
    paint_box(img, 16, 16, 8, 12, 4, suit, 7, 3)
    fx, fy = 20, 20
    fill(img, fx + 1, fy + 2, 2, 3, shade(suit, 0.82), 4, 4)        # slanted chest pockets
    fill(img, fx + 5, fy + 2, 2, 3, shade(suit, 0.82), 4, 5)
    fill(img, fx + 1, fy + 8, 2, 3, shade(suit, 0.85), 4, 6)
    fill(img, fx + 5, fy + 8, 2, 3, shade(suit, 0.85), 4, 7)
    for j in range(12):
        px(img, fx + 4, fy + j, shade(suit, 0.75))                    # zipper
    fill(img, fx + 2, fy, 4, 1, shade(suit, 0.7), 3, 8)               # collar
    # arms
    for (u, v) in ((40, 16), (32, 48)):
        paint_box(img, u, v, 4, 12, 4, suit, 7, 9)
        band(img, u, v, 4, 12, 4, [10, 11], skin, 3, 10)                # hands
        f = box_faces(u, v, 4, 12, 4)
        fill(img, *f['bottom'], skin, 3, 11)
    # US flag on right shoulder (outer side of right arm)
    x, y = box_faces(40, 16, 4, 12, 4)['right'][:2]
    for i in range(4):
        for j in range(3):
            px(img, x + i, y + 1 + j, (178, 34, 52) if j % 2 == 0 else (240, 240, 240))
    px(img, x, y + 1, (60, 59, 110)); px(img, x + 1, y + 1, (60, 59, 110))
    # Screaming eagle patch (outer side of left arm)
    x, y = box_faces(32, 48, 4, 12, 4)['left'][:2]
    fill(img, x, y + 1, 4, 3, (20, 20, 20), 0, 12)
    px(img, x + 1, y + 2, (240, 240, 240)); px(img, x + 2, y + 2, (240, 240, 240))
    px(img, x + 2, y + 1, (230, 200, 40))
    # legs
    for (u, v) in ((0, 16), (16, 48)):
        paint_box(img, u, v, 4, 12, 4, trou, 7, 13)
        band(img, u, v, 4, 12, 4, [8], shade(trou, 1.1), 3, 14)         # bloused trousers
        band(img, u, v, 4, 12, 4, [9, 10, 11], boots, 5, 15)
        f = box_faces(u, v, 4, 12, 4)
        fill(img, *f['bottom'], shade(boots, 0.7), 3, 16)
        x, y = f['right'][:2]
        fill(img, x + 1, y + 2, 2, 3, shade(trou, 0.8), 3, 17)           # cargo pocket
        x, y = f['left'][:2]
        fill(img, x + 1, y + 2, 2, 3, shade(trou, 0.8), 3, 18)
    return img


def de_skin(variant):
    img = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    skin = SKIN_TONES_DE[variant]
    paint_face(img, skin, EYES[(variant + 1) % 3], BROWS[(variant + 2) % 3], False, variant)
    tunic = (96, 101, 84)
    trou = (88, 92, 78)
    boots = (30, 28, 26)
    collar = (52, 64, 50)
    paint_box(img, 16, 16, 8, 12, 4, tunic, 6, 21)
    fx, fy = 20, 20
    fill(img, fx + 1, fy, 6, 1, collar, 3, 22)
    for j in (2, 4, 6, 8, 10):
        px(img, fx + 4, fy + j, (150, 150, 140))                          # buttons
    for j in range(12):
        if j % 2:
            px(img, fx + 4, fy + j, shade(tunic, 0.8))
    fill(img, fx + 1, fy + 2, 2, 2, shade(tunic, 0.85), 3, 23)            # breast pockets
    fill(img, fx + 5, fy + 2, 2, 2, shade(tunic, 0.85), 3, 24)
    fill(img, fx + 1, fy + 8, 2, 3, shade(tunic, 0.85), 3, 25)
    fill(img, fx + 5, fy + 8, 2, 3, shade(tunic, 0.85), 3, 26)
    px(img, fx + 1, fy + 1, (185, 185, 175)); px(img, fx + 2, fy + 1, (185, 185, 175))   # breast eagle
    for (u, v) in ((40, 16), (32, 48)):
        paint_box(img, u, v, 4, 12, 4, tunic, 6, 27)
        band(img, u, v, 4, 12, 4, [9], shade(tunic, 0.8), 3, 28)            # cuffs
        band(img, u, v, 4, 12, 4, [10, 11], skin, 3, 29)
        f = box_faces(u, v, 4, 12, 4)
        fill(img, *f['bottom'], skin, 3, 30)
    for (u, v) in ((0, 16), (16, 48)):
        paint_box(img, u, v, 4, 12, 4, trou, 6, 31)
        band(img, u, v, 4, 12, 4, [6, 7, 8, 9, 10, 11], boots, 4, 32)        # jackboots
        band(img, u, v, 4, 12, 4, [6], (45, 42, 38), 3, 33)
        f = box_faces(u, v, 4, 12, 4)
        fill(img, *f['bottom'], (20, 20, 20), 2, 34)
    return img


def paint_palette(img, palette):
    for i, c in enumerate(palette.colors):
        x = 64 + (i % 16) * 4
        y = (i // 16) * 4
        for a in range(4):
            for b in range(4):
                img.putpixel((x + a, y + b), tuple(c) + (255,))
    return img


def weapon_icon(boxes, size, muzzle_plus_x, out_size=32):
    """Side view of the voxel weapon, rotated 45 deg (muzzle up-right)."""
    scale = 3
    W = int(size[0] * scale) + 4
    H = int(size[1] * scale) + 4
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for b in sorted(boxes, key=lambda b: b['o'][2]):
        x0 = b['o'][0] * scale; x1 = (b['o'][0] + b['s'][0]) * scale
        y0 = b['o'][1] * scale; y1 = (b['o'][1] + b['s'][1]) * scale
        if not muzzle_plus_x:
            x0, x1 = size[0] * scale - x1, size[0] * scale - x0
        c = tuple(b['c'])
        c = tuple(min(255, int(v * 1.25 + 12)) for v in c)
        d.rectangle([x0 + 2, H - 2 - y1, x1 + 2 - 1, H - 2 - y0 - 1], fill=c + (255,))
    img = img.rotate(32, resample=Image.BICUBIC, expand=True)
    bbox = img.getbbox()
    img = img.crop(bbox)
    s = (out_size - 2) / max(img.size)
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (out_size, out_size), (0, 0, 0, 0))
    out.paste(img, ((out_size - img.width) // 2, (out_size - img.height) // 2))
    # crisp alpha + dark outline
    px_ = out.load()
    for x in range(out_size):
        for y in range(out_size):
            r, g, b, a = px_[x, y]
            px_[x, y] = (r, g, b, 255 if a > 100 else 0)
    outline = out.copy()
    po = outline.load()
    for x in range(out_size):
        for y in range(out_size):
            if px_[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < out_size and 0 <= yy < out_size and px_[xx, yy][3] == 255:
                        po[x, y] = (15, 15, 15, 255)
                        break
    return outline


def simple_icon(kind):
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if kind == 'radio':      # SCR-536 handie-talkie
        d.rectangle([5, 4, 10, 14], fill=(74, 80, 44, 255), outline=(30, 32, 20, 255))
        d.line([9, 4, 12, 0], fill=(40, 40, 40, 255))
        d.rectangle([6, 6, 9, 7], fill=(30, 30, 30, 255))
        d.rectangle([6, 10, 9, 12], fill=(55, 60, 35, 255))
        d.point((7, 8), fill=(200, 40, 40, 255))
    elif kind == 'explosive':  # composition C block with det cord
        d.rectangle([2, 6, 13, 13], fill=(200, 190, 150, 255), outline=(60, 50, 30, 255))
        d.rectangle([2, 8, 13, 9], fill=(80, 85, 50, 255))
        d.line([8, 6, 11, 1], fill=(220, 60, 30, 255))
        d.point((11, 1), fill=(255, 200, 60, 255))
    elif kind == 'medkit':
        d.rectangle([2, 4, 13, 13], fill=(118, 112, 78, 255), outline=(50, 48, 30, 255))
        d.rectangle([3, 5, 12, 12], fill=(235, 235, 230, 255))
        d.rectangle([7, 6, 8, 11], fill=(190, 30, 30, 255))
        d.rectangle([5, 8, 10, 9], fill=(190, 30, 30, 255))
    return img


def particle_atlas():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    # 0: soft puff (0,0)-(16,16)
    puff = Image.new('L', (16, 16), 0)
    dp = ImageDraw.Draw(puff)
    dp.ellipse([2, 2, 13, 13], fill=255)
    puff = puff.filter(ImageFilter.GaussianBlur(2.2))
    img.paste(Image.new('RGBA', (16, 16), (255, 255, 255, 255)), (0, 0), puff)
    # 1: streak (16,0)
    st = Image.new('L', (16, 16), 0)
    ds = ImageDraw.Draw(st)
    ds.rectangle([0, 7, 15, 8], fill=255)
    st = st.filter(ImageFilter.GaussianBlur(0.8))
    img.paste(Image.new('RGBA', (16, 16), (255, 255, 255, 255)), (16, 0), st)
    # 2: flash star (32,0)
    fl = Image.new('L', (16, 16), 0)
    df = ImageDraw.Draw(fl)
    df.ellipse([4, 4, 11, 11], fill=255)
    df.line([0, 8, 15, 8], fill=200); df.line([8, 0, 8, 15], fill=200)
    df.line([2, 2, 13, 13], fill=140); df.line([2, 13, 13, 2], fill=140)
    fl = fl.filter(ImageFilter.GaussianBlur(1.0))
    img.paste(Image.new('RGBA', (16, 16), (255, 255, 255, 255)), (32, 0), fl)
    # 3: dot (48,0)
    dt = Image.new('L', (16, 16), 0)
    ImageDraw.Draw(dt).ellipse([5, 5, 10, 10], fill=255)
    dt = dt.filter(ImageFilter.GaussianBlur(1.2))
    img.paste(Image.new('RGBA', (16, 16), (255, 255, 255, 255)), (48, 0), dt)
    # 4: big cloud puff (0,16)-(32,48)
    cl = Image.new('L', (32, 32), 0)
    dc = ImageDraw.Draw(cl)
    for (x, y, r) in ((16, 17, 9), (9, 18, 6), (23, 19, 6), (13, 12, 6), (20, 13, 5)):
        dc.ellipse([x - r, y - r, x + r, y + r], fill=230)
    cl = cl.filter(ImageFilter.GaussianBlur(2.5))
    img.paste(Image.new('RGBA', (32, 32), (255, 255, 255, 255)), (0, 16), cl)
    return img


def pack_icon(palette_colors=None):
    S = 256
    img = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / S
        c = (int(20 + 120 * t), int(30 + 90 * t), int(60 + 60 * t), 255)
        d.line([0, y, S, y], fill=c)
    # flak bursts
    rnd = random.Random(4)
    for _ in range(9):
        x, y, r = rnd.randint(10, 246), rnd.randint(10, 150), rnd.randint(6, 14)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(25, 25, 25, 220))
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 170, 60, 255))
    # tracers
    for _ in range(6):
        x = rnd.randint(0, 256)
        d.line([x, 256, x + rnd.randint(-60, 60), rnd.randint(60, 160)], fill=(255, 140, 40, 200), width=2)
    # C-47 silhouette
    ol = (40, 46, 24, 255)
    d.polygon([(30, 70), (200, 62), (226, 70), (200, 80), (40, 82)], fill=ol)
    d.polygon([(110, 72), (150, 72), (176, 30), (160, 30)], fill=ol)
    d.polygon([(110, 76), (150, 76), (186, 122), (170, 122)], fill=ol)
    d.polygon([(30, 70), (44, 44), (54, 44), (52, 70)], fill=ol)
    for k, x in enumerate((60, 70, 80, 90)):
        d.rectangle([x, 66, x + 5, 82], fill=(240, 240, 240, 255) if k % 2 == 0 else (20, 20, 20, 255))
    # parachutes
    for (x, y, r) in ((60, 150, 26), (130, 175, 22), (200, 150, 24), (95, 215, 18), (175, 220, 16)):
        d.pieslice([x - r, y - r, x + r, y + r], 180, 360, fill=(150, 145, 110, 255))
        for dx in (-r, -r // 2, 0, r // 2, r):
            d.line([x + dx, y, x, y + r + 8], fill=(220, 220, 210, 255))
        d.rectangle([x - 3, y + r + 6, x + 3, y + r + 16], fill=(60, 64, 35, 255))
    return img
