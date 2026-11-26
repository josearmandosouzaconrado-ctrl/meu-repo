"""Renderizador simples (software) dos modelos .geo.json para conferência visual.
Uso: python3 tools/preview.py <saida_dir>"""
import json, math, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, 'build', 'WW2_DDay_RP')


def rot_matrix(rx, ry, rz):
    # Bedrock: rotação X negativa levanta -Y para -Z (braço para frente)
    ax, ay, az = math.radians(-rx), math.radians(-ry), math.radians(rz)
    def mx(a): return [[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]]
    def my(a): return [[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]]
    def mz(a): return [[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]]
    def mm(a, b): return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mm(mz(az), mm(my(ay), mx(ax)))


def apply(m, p, pivot):
    v = [p[i] - pivot[i] for i in range(3)]
    return [sum(m[i][k] * v[k] for k in range(3)) + pivot[i] for i in range(3)]


def face_color(tex, cube, face, tw, th):
    uv = cube.get('uv')
    if isinstance(uv, dict):
        f = uv[face]
        x, y = f['uv'][0] + f['uv_size'][0] / 2, f['uv'][1] + f['uv_size'][1] / 2
    else:
        u, v = uv
        w, h, d = cube['size']
        regions = {'up': (u + d, v, w, d), 'down': (u + d + w, v, w, d), 'east': (u, v + d, d, h),
                   'north': (u + d, v + d, w, h), 'west': (u + d + w, v + d, d, h), 'south': (u + 2 * d + w, v + d, w, h)}
        rx, ry, rw, rh = regions[face]
        x, y = rx + rw / 2, ry + rh / 2
    sx, sy = tex.size[0] / tw, tex.size[1] / th
    return tex.getpixel((min(tex.size[0] - 1, int(x * sx)), min(tex.size[1] - 1, int(y * sy))))[:3]


def render(geo_path, tex_path, out, pose=None, scale=6, yaw=35, pitch=25, hide=()):
    g = json.load(open(geo_path))['minecraft:geometry'][0]
    tw, th = g['description']['texture_width'], g['description']['texture_height']
    tex = Image.open(tex_path).convert('RGBA')
    bones = {b['name']: b for b in g['bones']}
    pose = pose or {}

    def bone_chain(name):
        chain = []
        while name:
            chain.append(bones[name]); name = bones[name].get('parent')
        return chain

    polys = []
    view = rot_matrix(-pitch, yaw, 0)
    for b in g['bones']:
        if b['name'] in hide or any(c['name'] in hide for c in bone_chain(b['name'])):
            continue
        for c in b.get('cubes', []):
            o, s = c['origin'], c['size']
            corners = {}
            for i in (0, 1):
                for j in (0, 1):
                    for k in (0, 1):
                        p = [o[0] + s[0] * i, o[1] + s[1] * j, o[2] + s[2] * k]
                        if 'rotation' in c:
                            p = apply(rot_matrix(*c['rotation']), p, c['pivot'])
                        for bb in bone_chain(b['name']):
                            r = list(bb.get('rotation', [0, 0, 0]))
                            if bb['name'] in pose:
                                r = [r[n] + pose[bb['name']][n] for n in range(3)]
                            if any(r):
                                p = apply(rot_matrix(*r), p, bb['pivot'])
                        corners[(i, j, k)] = p
            faces = {'north': [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], 'south': [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
                     'west': [(1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)], 'east': [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],
                     'up': [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], 'down': [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]}
            shade = {'up': 1.0, 'north': 0.85, 'south': 0.7, 'east': 0.78, 'west': 0.9, 'down': 0.55}
            for f, idx in faces.items():
                col = face_color(tex, c, f, tw, th)
                pts = [apply(view, corners[i], [0, 0, 0]) for i in idx]
                depth = sum(p[2] for p in pts) / 4
                polys.append((depth, [(p[0], -p[1]) for p in pts], tuple(int(v * shade[f]) for v in col)))
    xs = [x for _, pts, _ in polys for x, _ in pts]
    ys = [y for _, pts, _ in polys for _, y in pts]
    W, H = int((max(xs) - min(xs)) * scale) + 20, int((max(ys) - min(ys)) * scale) + 20
    img = Image.new('RGB', (W, H), (150, 175, 205))
    d = ImageDraw.Draw(img)
    for _, pts, col in sorted(polys, key=lambda t: t[0]):
        d.polygon([((x - min(xs)) * scale + 10, (y - min(ys)) * scale + 10) for x, y in pts], fill=col, outline=tuple(max(0, v - 30) for v in col))
    img.save(out)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    m = os.path.join(RP, 'models', 'entity')
    t = os.path.join(RP, 'textures', 'entity', 'ww2')
    render(f'{m}/c47.geo.json', f'{t}/palette.png', f'{out}/c47.png', scale=1.6, yaw=210, pitch=25)
    render(f'{m}/flak38.geo.json', f'{t}/palette.png', f'{out}/flak.png', pose={'barrel': [-35, 0, 0]}, scale=5, yaw=210)
    render(f'{m}/parachute.geo.json', f'{t}/palette.png', f'{out}/parachute.png', scale=3, yaw=200, pitch=10)
    aim = {'rightArm': [-90, -6, 0], 'leftArm': [-88, 32, 0]}
    hide_us = ('gun_thompson', 'gun_bar', 'musette')
    render(f'{m}/us_soldier.geo.json', f'{t}/us_0.png', f'{out}/us_aim.png', pose=aim, scale=10, yaw=150, hide=hide_us)
    render(f'{m}/us_soldier.geo.json', f'{t}/us_1.png', f'{out}/us_front.png', pose={'rightArm': [-38, -12, 0], 'leftArm': [-48, 36, 0]}, scale=10, yaw=200, pitch=10, hide=('gun_garand', 'gun_bar', 'pack_main'))
    render(f'{m}/de_soldier.geo.json', f'{t}/de_0.png', f'{out}/de_aim.png', pose=aim, scale=10, yaw=200, pitch=10, hide=('gun_kar98',))
