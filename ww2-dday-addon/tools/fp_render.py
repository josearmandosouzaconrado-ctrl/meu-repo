"""Renderiza a visão em 1ª pessoa das armas (quadril e mira) para conferência."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import fpview as F

RP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'build', 'WW2_DDay_RP')
FACES = {'north': [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], 'south': [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
         'east': [(1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)], 'west': [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],
         'up': [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], 'down': [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]}
SH = {'up': 1.0, 'north': 0.8, 'south': 0.75, 'east': 0.85, 'west': 0.7, 'down': 0.5}


def render(gun, pose, out, W=640, H=360):
    geo = json.load(open(f'{RP}/models/entity/held/held_{gun}.geo.json'))['minecraft:geometry'][0]
    tex = Image.open(f'{RP}/textures/entity/ww2/palette.png').convert('RGB')
    anim = json.load(open(f'{RP}/animations/ww2_held.animation.json'))['animations'][f'animation.ww2.held.fp_{pose}']['bones']['gun']
    rot = anim['rotation']; pos = [float(str(v).split(' ')[0]) for v in anim['position']]
    polys = []
    for bone in geo['bones']:
        for c in bone.get('cubes', []):
            o, s = np.array(c['origin']), np.array(c['size'])
            u, v = c['uv']['north']['uv']
            col = tex.getpixel((int(u), int(v)))
            for face, idx in FACES.items():
                pts = []
                for corner in idx:
                    p = o + s * np.array(corner)
                    if 'rotation' in c:
                        bb = F.bone_to_bb(p, c['pivot'], c['rotation'], [0, 0, 0]); p = np.array([-bb[0], bb[1], bb[2]])
                    q = F.first_person(F.bone_to_bb(p, [0, 24, 0], rot, pos))
                    x, y, z = F.project(q, W, H)
                    pts.append((x, y, z))
                if min(p[2] for p in pts) <= 0.5:
                    continue
                polys.append((sum(p[2] for p in pts) / 4, [(p[0], p[1]) for p in pts], tuple(int(k * SH[face]) for k in col)))
    img = Image.new('RGB', (W, H), (122, 160, 200))
    d = ImageDraw.Draw(img)
    d.rectangle([0, H * 0.55, W, H], fill=(96, 128, 64))
    for _, pts, col in sorted(polys, key=lambda t: -t[0]):
        d.polygon(pts, fill=col, outline=tuple(max(0, k - 25) for k in col))
    d.line([W / 2 - 8, H / 2, W / 2 + 8, H / 2], fill=(255, 255, 255)); d.line([W / 2, H / 2 - 8, W / 2, H / 2 + 8], fill=(255, 255, 255))
    img.save(out)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    tiles = []
    for gun in ('thompson', 'garand', 'bar', 'mp44'):
        for pose in ('hip', 'ads'):
            fn = f'{out}/fp_{gun}_{pose}.png'
            render(gun, pose, fn)
            tiles.append(Image.open(fn).resize((320, 180)))
    sheet = Image.new('RGB', (640, 180 * 4), 'white')
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % 2) * 320, (i // 2) * 180))
    sheet.save(f'{out}/fp_sheet.png')
