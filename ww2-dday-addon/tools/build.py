#!/usr/bin/env python3
"""Gera o addon "WW2 D-Day: Paraquedistas" (Behavior Pack + Resource Pack)
e empacota em dist/*.mcaddon.

Uso:  python3 tools/build.py
"""
import json, math, os, shutil, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import art, sfx, plane_layout as PL  # noqa: E402

BUILD = os.path.join(ROOT, 'build')
BP = os.path.join(BUILD, 'WW2_DDay_BP')
RP = os.path.join(BUILD, 'WW2_DDay_RP')
DIST = os.path.join(ROOT, 'dist')
SRC_SCRIPTS = os.path.join(ROOT, 'src', 'scripts')

VERSION = [1, 0, 0]
MIN_ENGINE = [1, 21, 50]
UUID = {
    'bp': '44278eba-7129-4d96-98df-7fbe8b2428b1', 'bp_data': '7f77d8de-abd4-4a6e-ae8f-8f07911ef220',
    'bp_script': '4bb219a0-8781-4bd9-966c-5e9c9c4ad0ff',
    'rp': '169eb72a-051b-4538-ad4e-02c9538644af', 'rp_res': 'f3ab55b7-46a6-45a9-9263-0d18fc907d22',
}
SERVER_VERSION = '1.16.0'
SERVER_UI_VERSION = '1.3.0'


def wjson(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)


def r(v):
    if isinstance(v, (list, tuple)):
        return [r(a) for a in v]
    return round(float(v), 4)


# =============================================================================
# Palette (shared colour atlas on the right half of every 128x64 texture)
# =============================================================================
class Palette:
    def __init__(self):
        self.colors, self.index = [], {}

    def uv(self, rgb):
        rgb = tuple(int(c) for c in rgb)
        if rgb not in self.index:
            self.index[rgb] = len(self.colors)
            self.colors.append(rgb)
            assert len(self.colors) <= 256, 'palette overflow'
        i = self.index[rgb]
        return [64 + (i % 16) * 4 + 1, (i // 16) * 4 + 1]


PAL = Palette()
FACES = ('north', 'south', 'east', 'west', 'up', 'down')


def pcube(origin, size, rgb, rotation=None, pivot=None):
    u, v = PAL.uv(rgb)
    c = {'origin': r(origin), 'size': r(size),
         'uv': {f: {'uv': [u, v], 'uv_size': [2, 2]} for f in FACES}}
    if rotation:
        c['rotation'] = r(rotation)
        c['pivot'] = r(pivot)
    return c


def geometry(identifier, bones, tw=128, th=64, vbw=2, vbh=3, vbo=(0, 1, 0)):
    return {'format_version': '1.16.0', 'minecraft:geometry': [{
        'description': {'identifier': identifier, 'texture_width': tw, 'texture_height': th,
                        'visible_bounds_width': vbw, 'visible_bounds_height': vbh,
                        'visible_bounds_offset': list(vbo)},
        'bones': bones}]}


# =============================================================================
# Weapons (from the uploaded OBJ, voxelised by tools/voxelize.py)
# =============================================================================
VOX = json.load(open(os.path.join(ROOT, 'assets', 'weapons_voxels.json')))

KAR98 = {'size': [20.0, 2.6, 1.0], 'boxes': [
    {'o': [0, 0, 0], 's': [5, 2.6, 1], 'c': [112, 72, 40]},
    {'o': [5, 0.8, 0], 's': [4, 1.5, 1], 'c': [104, 66, 36]},
    {'o': [9, 1.1, 0], 's': [9, 1.1, 1], 'c': [112, 72, 40]},
    {'o': [9, 1.9, 0.25], 's': [11, 0.5, 0.5], 'c': [38, 38, 40]},
    {'o': [7, 1.8, 0.1], 's': [4, 0.8, 0.8], 'c': [44, 44, 46]},
    {'o': [9.6, 1.5, 0.9], 's': [0.5, 0.5, 0.9], 'c': [44, 44, 46]},
    {'o': [7.5, 0.4, 0.3], 's': [1.5, 0.4, 0.4], 'c': [44, 44, 46]},
    {'o': [15, 1.0, -0.05], 's': [0.5, 1.6, 1.1], 'c': [60, 60, 62]},
]}

# name -> (voxel data, muzzle is +x, grip fraction from butt, barrel height fraction)
WEAPONS = {
    'garand':   (VOX['m1garand'], True, 0.36, 0.75),
    'thompson': (VOX['thompson'], True, 0.40, 0.70),
    'bar':      (VOX['bar'], True, 0.36, 0.70),
    'mp44':     (VOX['mp44'], False, 0.45, 0.72),
    'kar98':    (KAR98, True, 0.36, 0.75),
}


def weapon_cubes(name):
    """Weapon held in the right hand. Arm rest pose: hanging down; the gun
    runs along the arm (-Y = muzzle) and its top faces -Z, so that when the
    arm is raised forward (rotation X = -90) the gun points forward, upright."""
    data, plus_x, grip, barrel = WEAPONS[name]
    L, H, T = data['size']
    hand_y, xc = 13.0, -6.0
    hb = barrel * H
    cubes = []
    for b in data['boxes']:
        (ox, oy, oz), (sx, sy, sz) = b['o'], b['s']
        L0, L1 = (ox, ox + sx) if plus_x else (L - ox - sx, L - ox)
        y0 = hand_y + grip * L - L1
        z0 = -2.0 - (oy + sy - hb)
        x0 = xc - T / 2 + oz
        cubes.append(pcube([x0, y0, z0], [sz, sx, sy], b['c']))
    return cubes


# =============================================================================
# Arma na mão do jogador (attachable 3D) — 1ª pessoa no quadril e mirando (agachado)
# =============================================================================
SKIN = (198, 150, 112)
SLEEVE = (141, 130, 96)
SLEEVE_D = (118, 108, 78)
SIGHT = (28, 28, 28)
FP_POSES = {   # depth, right, up (unidades do modelo), convergência
    'hip': dict(depth=17, a=8, b=-7.2, converge=80),
    'ads': dict(depth=14.5, a=0, b=-4.2),
}


def held_cubes(name):
    data, plus_x, grip, barrel = WEAPONS[name]
    L, H, T = data['size']
    hb = barrel * H
    cubes = []
    for b in data['boxes']:
        (ox, oy, oz), (sx, sy, sz) = b['o'], b['s']
        L0, L1 = (ox, ox + sx) if plus_x else (L - ox - sx, L - ox)
        z0 = grip * L - L1
        y0 = 26.0 + oy - hb
        x0 = -T / 2 + oz
        cubes.append(pcube([x0, y0, z0], [sz, sy, sx], b['c']))
    top = 26.0 + H - hb
    muzzle_z = -(1 - grip) * L
    cubes.append(pcube([-0.2, top, muzzle_z + 0.4], [0.4, 0.9, 0.4], SIGHT))              # massa de mira
    cubes.append(pcube([-0.6, top, 1.2], [0.4, 0.8, 0.4], SIGHT))                         # alça de mira
    cubes.append(pcube([0.2, top, 1.2], [0.4, 0.8, 0.4], SIGHT))
    return cubes, muzzle_z


def fp_arm_cubes(muzzle_z):
    zl = muzzle_z * 0.55
    return [
        pcube([-1.3, 22.3, -1.2], [2.6, 2.4, 2.6], SKIN),                                    # mão direita (empunhadura)
        pcube([-1.9, 21.2, 0.6], [3.8, 3.8, 13], SLEEVE, [-32, 0, 0], [0, 23, 1.0]),          # antebraço direito
        pcube([-2.0, 21.1, 1.0], [4.0, 4.0, 2.0], SLEEVE_D, [-32, 0, 0], [0, 23, 1.0]),       # punho da manga
        pcube([-1.4, 23.0, zl - 1.3], [2.8, 1.9, 2.6], SKIN),                                # mão esquerda (guarda-mão)
        pcube([-1.9, 19.6, zl - 1.1], [3.8, 3.8, 14], SLEEVE, [-52, -28, 0], [0, 23.4, zl]),  # antebraço esquerdo
    ]


def held_geometry(name):
    cubes, muzzle_z = held_cubes(name)
    bones = [{'name': 'gun', 'binding': 'q.item_slot_to_bone_name(c.item_slot)', 'pivot': [0, 24, 0], 'cubes': cubes},
             {'name': 'fp_arms', 'parent': 'gun', 'pivot': [0, 24, 0], 'cubes': fp_arm_cubes(muzzle_z)}]
    return geometry('geometry.ww2.held_' + name, bones, vbw=3, vbh=3, vbo=(0, 1, 0))


def held_animations():
    import fpview
    A = {}
    hip_rot, hip_pos = fpview.solve(**FP_POSES['hip'])
    ads_rot, ads_pos = fpview.solve(**FP_POSES['ads'])
    bob = 'math.sin(q.life_time * 90) * 0.15 * (q.is_moving ? 3 : 1)'
    A['animation.ww2.held.fp_hip'] = {'loop': True, 'bones': {'gun': {
        'rotation': hip_rot, 'position': [hip_pos[0], f'{hip_pos[1]} + {bob}', hip_pos[2]]}}}
    A['animation.ww2.held.fp_ads'] = {'loop': True, 'bones': {'gun': {
        'rotation': ads_rot, 'position': [ads_pos[0], f'{ads_pos[1]} + {bob} * 0.3', ads_pos[2]]}}}
    A['animation.ww2.held.tp'] = {'loop': True, 'bones': {
        'gun': {'rotation': ['q.is_sneaking ? -12 : 6', 0, 0], 'position': [0, 0, 0]},
        'fp_arms': {'scale': 0}}}
    ctrl = {'format_version': '1.10.0', 'animation_controllers': {'controller.animation.ww2.held_fp': {
        'initial_state': 'hip',
        'states': {
            'hip': {'animations': ['fp_hip'], 'transitions': [{'ads': 'q.is_sneaking'}], 'blend_transition': 0.12},
            'ads': {'animations': ['fp_ads'], 'transitions': [{'hip': '!q.is_sneaking'}], 'blend_transition': 0.12}}}}}
    return {'format_version': '1.8.0', 'animations': A}, ctrl


def write_attachables():
    items = {'m1_garand': 'garand', 'thompson': 'thompson', 'bar': 'bar', 'mp44': 'mp44', 'kar98': 'kar98'}
    for ident, gun in items.items():
        wjson(os.path.join(RP, 'models', 'entity', 'held', f'held_{gun}.geo.json'), held_geometry(gun))
        wjson(os.path.join(RP, 'attachables', f'{ident}.json'), {'format_version': '1.10.0', 'minecraft:attachable': {
            'description': {
                'identifier': 'ww2:' + ident,
                'materials': {'default': 'entity_alphatest', 'enchanted': 'entity_alphatest_glint'},
                'textures': {'default': 'textures/entity/ww2/palette', 'enchanted': 'textures/misc/enchanted_item_glint'},
                'geometry': {'default': 'geometry.ww2.held_' + gun},
                'animations': {'fp_hip': 'animation.ww2.held.fp_hip', 'fp_ads': 'animation.ww2.held.fp_ads',
                               'tp': 'animation.ww2.held.tp', 'fp': 'controller.animation.ww2.held_fp'},
                'scripts': {'animate': [{'fp': 'c.is_first_person'}, {'tp': '!c.is_first_person'}]},
                'render_controllers': ['controller.render.item_default']}}})
    anims, ctrl = held_animations()
    wjson(os.path.join(RP, 'animations', 'ww2_held.animation.json'), anims)
    wjson(os.path.join(RP, 'animation_controllers', 'ww2_held.animation_controllers.json'), ctrl)


# =============================================================================
# Soldier geometry
# =============================================================================
C = {
    'helmet_us': (72, 79, 42), 'helmet_us_d': (58, 64, 34), 'net': (52, 56, 33), 'strap': (110, 100, 70),
    'pack': (112, 106, 74), 'reserve': (96, 92, 64), 'web': (152, 142, 104), 'musette': (124, 117, 84),
    'canteen': (70, 74, 50), 'helmet_de': (80, 86, 78), 'helmet_de_d': (66, 72, 64),
    'de_leather': (34, 30, 26), 'de_bread': (124, 114, 84), 'de_can': (86, 92, 80), 'de_tool': (48, 46, 40),
}


def soldier_geometry(faction):
    us = faction == 'us'
    bones = [
        {'name': 'root', 'pivot': [0, 0, 0]},
        {'name': 'waist', 'parent': 'root', 'pivot': [0, 12, 0]},
        {'name': 'body', 'parent': 'waist', 'pivot': [0, 24, 0],
         'cubes': [{'origin': [-4, 12, -2], 'size': [8, 12, 4], 'uv': [16, 16]}]},
        {'name': 'head', 'parent': 'body', 'pivot': [0, 24, 0],
         'cubes': [{'origin': [-4, 24, -4], 'size': [8, 8, 8], 'uv': [0, 0]}]},
        {'name': 'rightArm', 'parent': 'body', 'pivot': [-5, 22, 0],
         'cubes': [{'origin': [-8, 12, -2], 'size': [4, 12, 4], 'uv': [40, 16]}]},
        {'name': 'leftArm', 'parent': 'body', 'pivot': [5, 22, 0],
         'cubes': [{'origin': [4, 12, -2], 'size': [4, 12, 4], 'uv': [32, 48]}]},
        {'name': 'rightLeg', 'parent': 'waist', 'pivot': [-1.9, 12, 0],
         'cubes': [{'origin': [-3.9, 0, -2], 'size': [4, 12, 4], 'uv': [0, 16]}]},
        {'name': 'leftLeg', 'parent': 'waist', 'pivot': [1.9, 12, 0],
         'cubes': [{'origin': [-0.1, 0, -2], 'size': [4, 12, 4], 'uv': [16, 48]}]},
    ]
    if us:
        helmet = [pcube([-4.5, 28, -4.5], [9, 4.5, 9], C['helmet_us']),
                  pcube([-4, 32.5, -4], [8, 0.8, 8], C['helmet_us']),
                  pcube([-5, 28, -5], [10, 0.6, 10], C['helmet_us_d']),
                  pcube([-4.65, 30.2, -4.65], [9.3, 0.5, 9.3], C['net']),
                  pcube([-0.3, 28.3, -4.7], [0.6, 4.7, 9.4], C['net']),
                  pcube([-4.6, 25, -1], [0.4, 3.2, 0.6], C['strap']),
                  pcube([4.2, 25, -1], [0.4, 3.2, 0.6], C['strap'])]
        gear = [pcube([-4.25, 12, -2.25], [8.5, 1.2, 4.5], C['web']),
                pcube([-3, 13, -2.35], [1, 11, 0.3], C['web']), pcube([2, 13, -2.35], [1, 11, 0.3], C['web']),
                pcube([-3.6, 11.0, -2.9], [2.2, 1.8, 0.8], C['web']), pcube([1.4, 11.0, -2.9], [2.2, 1.8, 0.8], C['web']),
                pcube([3.6, 10.2, 0.2], [1.5, 2.8, 1.8], C['canteen'])]
        pack_main = [pcube([-3.5, 13.5, 2], [7, 9, 3.4], C['pack']), pcube([-3.7, 17, 1.9], [7.4, 0.6, 3.6], C['web'])]
        pack_res = [pcube([-3, 14, -3.9], [6, 4, 1.9], C['reserve']), pcube([-3.1, 15.6, -4.0], [6.2, 0.5, 2.1], C['web'])]
        musette = [pcube([-3.2, 13, 2], [6.4, 5, 2.4], C['musette']), pcube([-3.3, 17.2, 1.9], [6.6, 0.8, 2.6], C['web'])]
        bones += [
            {'name': 'helmet', 'parent': 'head', 'pivot': [0, 24, 0], 'cubes': helmet},
            {'name': 'gear', 'parent': 'body', 'pivot': [0, 24, 0], 'cubes': gear},
            {'name': 'pack_main', 'parent': 'body', 'pivot': [0, 24, 0], 'cubes': pack_main},
            {'name': 'pack_reserve', 'parent': 'body', 'pivot': [0, 24, 0], 'cubes': pack_res},
            {'name': 'musette', 'parent': 'body', 'pivot': [0, 24, 0], 'cubes': musette},
        ]
        guns = ['garand', 'thompson', 'bar']
    else:
        helmet = [pcube([-4.5, 28.5, -4.5], [9, 4, 9], C['helmet_de']),
                  pcube([-4, 32.5, -4], [8, 0.8, 8], C['helmet_de']),
                  pcube([-4.75, 28.2, -5.0], [9.5, 0.6, 1.6], C['helmet_de_d']),
                  pcube([-5.2, 26.6, -2.5], [10.4, 2.2, 7.4], C['helmet_de_d']),
                  pcube([-4.8, 26.0, 3.4], [9.6, 2.6, 1.6], C['helmet_de_d'])]
        gear = [pcube([-4.25, 12, -2.25], [8.5, 1.2, 4.5], C['de_leather']),
                pcube([-3, 13, -2.35], [1, 11, 0.3], C['de_leather']), pcube([2, 13, -2.35], [1, 11, 0.3], C['de_leather']),
                pcube([-3.7, 11.3, -2.95], [2.3, 1.7, 0.9], C['de_leather']), pcube([1.4, 11.3, -2.95], [2.3, 1.7, 0.9], C['de_leather']),
                pcube([-4.8, 9.6, -1.2], [1.2, 3.2, 3.2], C['de_bread']),
                pcube([0.6, 9.4, 2.15], [2.4, 6.2, 2.4], C['de_can']),
                pcube([-2.8, 9.8, 2.15], [1.5, 4.2, 0.8], C['de_tool'])]
        bones += [
            {'name': 'helmet', 'parent': 'head', 'pivot': [0, 24, 0], 'cubes': helmet},
            {'name': 'gear', 'parent': 'body', 'pivot': [0, 24, 0], 'cubes': gear},
        ]
        guns = ['kar98', 'mp44']
    for g in guns:
        bones.append({'name': 'gun_' + g, 'parent': 'rightArm', 'pivot': [-5, 22, 0], 'cubes': weapon_cubes(g)})
    ident = 'geometry.ww2.' + ('us_soldier' if us else 'de_soldier')
    return geometry(ident, bones, vbw=2.5, vbh=3, vbo=(0, 1.2, 0))


# =============================================================================
# C-47 entity model (from the same block layout as the walkable plane)
# =============================================================================
def greedy_boxes(grid):
    remaining = dict(grid)
    out = []
    for key in sorted(remaining):
        if key not in remaining:
            continue
        k = remaining[key]
        x0, y0, z0 = key
        x1 = x0
        while remaining.get((x1 + 1, y0, z0)) == k:
            x1 += 1
        y1 = y0
        while all(remaining.get((x, y1 + 1, z0)) == k for x in range(x0, x1 + 1)):
            y1 += 1
        z1 = z0
        while all(remaining.get((x, y, z1 + 1)) == k for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)):
            z1 += 1
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    del remaining[(x, y, z)]
        out.append(((x0, y0, z0), (x1, y1, z1), k))
    return out


def plane_to_model(px, py, pz):
    cx, cy, cz = PL.META['center']
    return (-(pz - cz) * 16, (py - cy) * 16, -(px - cx) * 16)


def prop_cubes(center):
    mx, my, mz = center
    cubes = [pcube([mx - 3, my - 3, mz - 4], [6, 6, 5], (55, 55, 55))]
    for ang in (0, 120, 240):
        cubes.append(pcube([mx - 2, my, mz - 0.5], [4, 40, 1], (28, 28, 28), [0, 0, ang], [mx, my, mz]))
        cubes.append(pcube([mx - 2.1, my + 34, mz - 0.6], [4.2, 6, 1.2], (215, 185, 40), [0, 0, ang], [mx, my, mz]))
    return cubes


def c47_geometry():
    grid = PL.model_grid()
    cubes = []
    for (x0, y0, z0), (x1, y1, z1), k in greedy_boxes(grid):
        a = plane_to_model(x0, y0, z1 + 1)
        b = plane_to_model(x1 + 1, y1 + 1, z0)
        o = [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])]
        s = [abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])]
        cubes.append(pcube(o, s, PL.BLOCKS[k][2]))
    bones = [{'name': 'root', 'pivot': [0, 0, 0]},
             {'name': 'body', 'parent': 'root', 'pivot': [0, 0, 0], 'cubes': cubes}]
    for name, p in zip(('prop_r', 'prop_l'), PL.META['props']):
        m = plane_to_model(*p)
        bones.append({'name': name, 'parent': 'root', 'pivot': r(m), 'cubes': prop_cubes(m)})
    print('  c47 cubes:', len(cubes))
    return geometry('geometry.ww2.c47', bones, vbw=44, vbh=20, vbo=(0, 0, 0))


def propeller_geometry():
    bones = [{'name': 'prop', 'pivot': [0, 0, 0], 'cubes': prop_cubes((0, 0, 0))}]
    return geometry('geometry.ww2.propeller', bones, vbw=6, vbh=6, vbo=(0, 0, 0))


# =============================================================================
# Flak 38, parachute, bullets, marker
# =============================================================================
def flak_geometry():
    g, d, b, s = (92, 97, 88), (52, 54, 50), (30, 30, 30), (100, 104, 94)
    base = [pcube([-24, 0, -3], [48, 3, 6], d), pcube([-3, 0, -24], [6, 3, 48], d),
            pcube([-27, 0, -4], [4, 1, 8], b), pcube([23, 0, -4], [4, 1, 8], b),
            pcube([-4, 0, -27], [8, 1, 4], b), pcube([-4, 0, 23], [8, 1, 4], b),
            pcube([-4, 3, -4], [8, 6, 8], g), pcube([-8, 9, -8], [16, 2, 16], g)]
    upper = [pcube([-12, 11, -12], [10, 13, 1], s), pcube([2, 11, -12], [10, 13, 1], s),
             pcube([-2, 11, -12], [4, 4, 1], s),
             pcube([-13, 11, -12], [1, 11, 6], s), pcube([12, 11, -12], [1, 11, 6], s),
             pcube([-2, 12, 5], [4, 1, 4], d), pcube([-2, 13, 8.5], [4, 5, 1], d),
             pcube([-7, 11, 2], [3, 6, 3], g), pcube([4, 11, 2], [3, 6, 3], g)]
    barrel = [pcube([-3, 14, -6], [6, 6, 14], d), pcube([-1, 16, -44], [2, 2, 38], b),
              pcube([-1.5, 15.5, -48], [3, 3, 4], b), pcube([3, 15, -3], [2, 7, 5], (62, 64, 58)),
              pcube([-1, 20, -8], [2, 3, 1], b), pcube([-1.5, 15.5, -20], [3, 3, 2], d)]
    bones = [{'name': 'root', 'pivot': [0, 0, 0], 'cubes': base},
             {'name': 'turret', 'parent': 'root', 'pivot': [0, 0, 0], 'cubes': upper},
             {'name': 'barrel', 'parent': 'turret', 'pivot': [0, 17, 0], 'cubes': barrel}]
    return geometry('geometry.ww2.flak38', bones, vbw=7, vbh=4, vbo=(0, 1.5, 0))


def parachute_geometry():
    canopy = []
    layers = [(72, 46, 3), (75, 42, 3), (78, 36, 3), (81, 27, 3), (84, 16, 2.5)]
    cols = [(122, 120, 86), (104, 102, 72)]
    for i, (y, rad, th) in enumerate(layers):
        half = rad * 0.92
        for ang in (0, 22.5, 45, 67.5):
            rot = [0, ang, 0] if ang else None
            canopy.append(pcube([-half, y, -half], [2 * half, th, 2 * half], cols[i % 2], rot, [0, y, 0]))
    canopy.append(pcube([-3, 86.5, -3], [6, 1, 6], (90, 88, 60)))
    line_col = (210, 208, 196)
    rim_r, rim_y, top_y = 43.0, 72.0, 26.0

    def lines():
        out = []
        dx = rim_r - 3
        length = math.hypot(dx, rim_y - top_y)
        ang = math.degrees(math.atan2(dx, rim_y - top_y))
        for sx in (1, -1):
            p = [3 * sx, top_y, 0]
            out.append(pcube([p[0] - 0.15, top_y, -0.15], [0.3, length, 0.3], line_col, [0, 0, -ang * sx], p))
        length2 = math.hypot(rim_r, rim_y - top_y)
        ang2 = math.degrees(math.atan2(rim_r, rim_y - top_y))
        for sz in (1, -1):
            p = [0, top_y, 0]
            out.append(pcube([-0.15, top_y, -0.15], [0.3, length2, 0.3], line_col, [ang2 * sz, 0, 0], p))
        return out

    risers = [pcube([-3.3, 22, -0.4], [0.6, 4.5, 0.8], (90, 84, 56)), pcube([2.7, 22, -0.4], [0.6, 4.5, 0.8], (90, 84, 56))]
    bones = [{'name': 'root', 'pivot': [0, 0, 0]},
             {'name': 'risers', 'parent': 'root', 'pivot': [0, 0, 0], 'cubes': risers},
             {'name': 'canopy', 'parent': 'root', 'pivot': [0, 72, 0], 'cubes': canopy},
             {'name': 'lines_a', 'parent': 'canopy', 'pivot': [0, 26, 0], 'cubes': lines()},
             {'name': 'lines_b', 'parent': 'canopy', 'pivot': [0, 26, 0], 'rotation': [0, 45, 0], 'cubes': lines()}]
    return geometry('geometry.ww2.parachute', bones, vbw=7, vbh=7, vbo=(0, 3, 0))


def bullet_geometry():
    return geometry('geometry.ww2.bullet', [{'name': 'root', 'pivot': [0, 0, 0],
                    'cubes': [pcube([-0.5, -0.5, -0.5], [1, 1, 1], (255, 214, 120))]}], vbw=1, vbh=1)


def marker_geometry():
    return geometry('geometry.ww2.marker', [{'name': 'root', 'pivot': [0, 0, 0]}], vbw=1, vbh=1)


# =============================================================================
# Behavior pack entities
# =============================================================================
def entity(identifier, components, groups=None, events=None, properties=None, spawnable=False):
    desc = {'identifier': identifier, 'is_spawnable': spawnable, 'is_summonable': True}
    if properties:
        desc['properties'] = properties
    e = {'description': desc, 'components': components}
    if groups:
        e['component_groups'] = groups
    if events:
        e['events'] = events
    return {'format_version': '1.21.0', 'minecraft:entity': e}


def fam(subject, value):
    return {'test': 'is_family', 'subject': subject, 'value': value}


def no_damage_from(families):
    return {'on_damage': {'filters': {'any_of': [fam(s, f) for f in families for s in ('other', 'damager')]}},
            'deals_damage': False}


US_SQUADS = 8
DE_GROUPS = 8


def soldier_entity(side):
    us = side == 'us'
    ident = 'ww2:us_paratrooper' if us else 'ww2:german_soldier'
    enemy_filter = {'any_of': [fam('other', 'german'), fam('other', 'monster')]} if us else \
        {'any_of': [fam('other', 'us_army'), fam('other', 'player'), fam('other', 'villager')]}
    mode_names = ['combat', 'hold'] + (['guard', 'retreat'] if not us else []) + \
        [f'move_{k}' for k in range(US_SQUADS if us else DE_GROUPS)]
    marker_prefix = 'rally_s' if us else 'rally_g'

    def targeting(radius, must_see=True):
        return {'priority': 2, 'must_see': must_see, 'must_see_forget_duration': 4.0, 'reselect_targets': True,
                'within_radius': radius, 'scan_interval': 8,
                'entity_types': [{'filters': enemy_filter, 'max_dist': radius}]}

    def ranged(speed):
        return {'priority': 3, 'attack_interval_min': 0.9 if us else 1.1, 'attack_interval_max': 2.2 if us else 2.6,
                'attack_radius': 26.0, 'burst_shots': 3, 'burst_interval': 0.16, 'speed_multiplier': speed,
                'swing': False}

    groups = {
        'ww2:plane': {'minecraft:movement': {'value': 0.0},
                      'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False}},
        'ww2:air': {'minecraft:movement': {'value': 0.0},
                    'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False}},
        'ww2:ground': {
            'minecraft:movement': {'value': 0.31 if us else 0.28},
            'minecraft:navigation.walk': {'can_path_over_water': True, 'avoid_water': True, 'avoid_damage_blocks': True,
                                          'can_open_doors': True, 'can_pass_doors': True, 'can_walk': True,
                                          'can_sink': False},
            'minecraft:movement.basic': {}, 'minecraft:jump.static': {}, 'minecraft:can_climb': {},
            'minecraft:pushable': {'is_pushable': True, 'is_pushable_by_piston': True},
            'minecraft:behavior.float': {'priority': 0},
            'minecraft:behavior.look_at_player': {'priority': 8, 'look_distance': 8, 'probability': 0.02},
            'minecraft:behavior.random_look_around': {'priority': 9},
        },
        'ww2:m_combat': {'minecraft:behavior.nearest_attackable_target': targeting(30),
                         'minecraft:behavior.ranged_attack': ranged(1.0)},
        'ww2:m_hold': {'minecraft:behavior.nearest_attackable_target': targeting(24),
                       'minecraft:behavior.ranged_attack': ranged(0.0)},
    }
    if not us:
        groups['ww2:m_guard'] = {
            'minecraft:behavior.nearest_attackable_target': targeting(28),
            'minecraft:behavior.ranged_attack': ranged(0.9),
            'minecraft:behavior.move_towards_home_restriction': {'priority': 5, 'speed_multiplier': 0.8},
            'minecraft:behavior.random_stroll': {'priority': 7, 'speed_multiplier': 0.6, 'interval': 160, 'xz_dist': 5},
        }
        groups['ww2:m_retreat'] = {
            'minecraft:behavior.avoid_mob_type': {'priority': 1, 'remove_target': True, 'entity_types': [
                {'filters': {'any_of': [fam('other', 'us_army'), fam('other', 'player')]},
                 'max_dist': 22, 'walk_speed_multiplier': 1.2, 'sprint_speed_multiplier': 1.45}]},
            'minecraft:behavior.random_stroll': {'priority': 6, 'speed_multiplier': 1.1, 'interval': 20, 'xz_dist': 10},
        }
    for k in range(US_SQUADS if us else DE_GROUPS):
        groups[f'ww2:m_move_{k}'] = {
            'minecraft:attack': {'damage': 0},
            'minecraft:behavior.nearest_attackable_target': {
                'priority': 2, 'must_see': False, 'reselect_targets': True, 'within_radius': 96, 'scan_interval': 5,
                'entity_types': [{'filters': {'all_of': [fam('other', 'ww2_marker'),
                                                         {'test': 'has_tag', 'subject': 'other', 'value': f'{marker_prefix}{k}'}]},
                                  'max_dist': 96}]},
            'minecraft:behavior.melee_attack': {'priority': 3, 'speed_multiplier': 1.2, 'track_target': True,
                                                'require_complete_path': False, 'reach_multiplier': 1.2},
        }
    weapons = ['garand', 'thompson', 'bar'] if us else ['kar98', 'mp44']
    bullet_kind = {'garand': 'rifle', 'thompson': 'smg', 'bar': 'mg', 'kar98': 'rifle', 'mp44': 'smg'}
    for w in weapons:
        groups['ww2:w_' + w] = {'minecraft:shooter': {'def': f'ww2:bullet_{side}_{bullet_kind[w]}'}}

    all_modes = ['ww2:m_' + m for m in mode_names]
    all_weapons = ['ww2:w_' + w for w in weapons]
    events = {}
    default_mode = 'ww2:m_hold' if us else 'ww2:m_guard'
    events['minecraft:entity_spawned'] = {
        'add': {'component_groups': ['ww2:ground', default_mode, all_weapons[0]]},
        'set_property': {'ww2:skin': 'math.random_integer(0, 2)'}}
    for m in mode_names:
        g = 'ww2:m_' + m
        events['ww2:mode_' + m] = {'remove': {'component_groups': [x for x in all_modes if x != g]},
                                   'add': {'component_groups': [g]},
                                   'set_property': {'ww2:aim': m == 'combat'}}
    for i, w in enumerate(weapons):
        g = 'ww2:w_' + w
        events['ww2:weapon_' + w] = {'remove': {'component_groups': [x for x in all_weapons if x != g]},
                                     'add': {'component_groups': [g]},
                                     'set_property': {'ww2:weapon': i}}
    if us:
        events['ww2:weapon_none'] = {'remove': {'component_groups': all_weapons}, 'set_property': {'ww2:weapon': 3}}
        events['ww2:to_plane'] = {'remove': {'component_groups': ['ww2:ground', 'ww2:air'] + all_modes},
                                  'add': {'component_groups': ['ww2:plane']}, 'set_property': {'ww2:state': 0, 'ww2:aim': False}}
        events['ww2:to_air'] = {'remove': {'component_groups': ['ww2:ground', 'ww2:plane'] + all_modes},
                                'add': {'component_groups': ['ww2:air']}, 'set_property': {'ww2:aim': False}}
        events['ww2:to_ground'] = {'remove': {'component_groups': ['ww2:plane', 'ww2:air'] + all_modes},
                                   'add': {'component_groups': ['ww2:ground', 'ww2:m_hold']},
                                   'set_property': {'ww2:state': 5, 'ww2:aim': False}}

    props = {'ww2:skin': {'type': 'int', 'range': [0, 2], 'default': 0, 'client_sync': True},
             'ww2:weapon': {'type': 'int', 'range': [0, 3], 'default': 0, 'client_sync': True},
             'ww2:aim': {'type': 'bool', 'default': False, 'client_sync': True}}
    if us:
        props['ww2:state'] = {'type': 'int', 'range': [0, 5], 'default': 5, 'client_sync': True}

    sensor = [{'on_damage': {'filters': fam('other', 'ww2_plane')}, 'deals_damage': False}]
    if us:
        sensor = [{'cause': 'fall', 'deals_damage': False},
                  no_damage_from(['us_army', 'player', 'us_bullet'])] + sensor
    else:
        sensor = [no_damage_from(['german', 'de_bullet'])] + sensor

    comps = {
        'minecraft:type_family': {'family': ['ww2', 'us_army', 'paratrooper', 'mob'] if us else ['ww2', 'german', 'monster', 'mob']},
        'minecraft:health': {'value': 30 if us else 20, 'max': 30 if us else 20},
        'minecraft:collision_box': {'width': 0.6, 'height': 1.9},
        'minecraft:physics': {},
        'minecraft:persistent': {},
        'minecraft:nameable': {'always_show': False, 'allow_name_tag_renaming': True},
        'minecraft:follow_range': {'value': 64, 'max': 96},
        'minecraft:damage_sensor': {'triggers': sensor},
        'minecraft:breathable': {'total_supply': 15, 'suffocate_time': 0},
        'minecraft:jump.static': {},
        'minecraft:conditional_bandwidth_optimization': {},
        'minecraft:knockback_resistance': {'value': 0.2},
    }
    if not us:
        comps['minecraft:home'] = {'restriction_radius': 12}
        comps['minecraft:loot'] = {'table': 'loot_tables/entities/ww2_german.json'}
        comps['minecraft:experience_reward'] = {'on_death': '5'}
    return entity(ident, comps, groups, events, props, spawnable=True)


def projectile_entity(ident, families, damage, power, uncertainty, target_filter=None, timer=3.0, gravity=0.004):
    hit = {'remove_on_hit': {}}
    if damage:
        imp = {'damage': damage, 'knockback': False, 'semi_random_diff_damage': False, 'destroy_on_hit': True}
        if target_filter:
            imp['filter'] = target_filter
        hit['impact_damage'] = imp
    comps = {
        'minecraft:collision_box': {'width': 0.15, 'height': 0.15},
        'minecraft:projectile': {'on_hit': hit, 'power': power, 'gravity': gravity, 'inertia': 1.0,
                                 'liquid_inertia': 0.5, 'uncertainty_base': uncertainty, 'uncertainty_multiplier': 0.5,
                                 'anchor': 1, 'offset': [0, -0.15, 0], 'reflect_on_hurt': False},
        'minecraft:physics': {},
        'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False},
        'minecraft:type_family': {'family': ['ww2_bullet'] + families},
        'minecraft:timer': {'time': timer, 'looping': False, 'time_down_event': {'event': 'ww2:expire'}},
        'minecraft:conditional_bandwidth_optimization': {'default_values': {
            'max_optimized_distance': 80.0, 'max_dropped_ticks': 5, 'use_motion_prediction_hints': True}},
    }
    groups = {'ww2:expire': {'minecraft:instant_despawn': {}}}
    events = {'ww2:expire': {'add': {'component_groups': ['ww2:expire']}}}
    return entity(ident, comps, groups, events)


def static_entity(ident, families, extra=None, props=None, health=1000, gravity=False, collision=(0.1, 0.1),
                  persistent=True):
    comps = {
        'minecraft:type_family': {'family': families},
        'minecraft:health': {'value': health, 'max': health},
        'minecraft:damage_sensor': {'triggers': {'cause': 'all', 'deals_damage': False}},
        'minecraft:collision_box': {'width': collision[0], 'height': collision[1]},
        'minecraft:physics': {'has_gravity': gravity, 'has_collision': gravity},
        'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False},
        'minecraft:knockback_resistance': {'value': 1.0},
        'minecraft:fire_immune': True,
        'minecraft:breathable': {'breathes_water': True, 'breathes_air': True, 'total_supply': 15, 'suffocate_time': 0},
    }
    if persistent:
        comps['minecraft:persistent'] = {}
    if extra:
        comps.update(extra)
    return entity(ident, comps, properties=props)


def write_bp_entities():
    d = os.path.join(BP, 'entities')
    wjson(os.path.join(d, 'us_paratrooper.json'), soldier_entity('us'))
    wjson(os.path.join(d, 'german_soldier.json'), soldier_entity('de'))
    # bullets: (id, families, damage, power, uncertainty, filter)
    bullets = [
        ('ww2:bullet_us_rifle', ['us_bullet'], 6, 4.5, 6, 'ww2:german_soldier'),
        ('ww2:bullet_us_smg', ['us_bullet'], 4, 4.0, 9, 'ww2:german_soldier'),
        ('ww2:bullet_us_mg', ['us_bullet'], 5, 4.5, 8, 'ww2:german_soldier'),
        ('ww2:bullet_de_rifle', ['de_bullet'], 5, 4.5, 7, None),
        ('ww2:bullet_de_smg', ['de_bullet'], 3, 4.0, 10, None),
        ('ww2:bullet_p_rifle', ['us_bullet', 'player_bullet'], 10, 5.0, 0, None),
        ('ww2:bullet_p_smg', ['us_bullet', 'player_bullet'], 6, 5.0, 0, None),
        ('ww2:bullet_p_mg', ['us_bullet', 'player_bullet'], 8, 5.0, 0, None),
    ]
    for ident, fams, dmg, pw, unc, flt in bullets:
        wjson(os.path.join(d, 'bullets', ident.split(':')[1] + '.json'),
              projectile_entity(ident, fams, dmg, pw, unc, flt))
    wjson(os.path.join(d, 'bullets', 'flak_shell.json'),
          projectile_entity('ww2:flak_shell', ['de_bullet', 'flak_shell'], 0, 3.5, 0, None, timer=8.0, gravity=0.0))
    wjson(os.path.join(d, 'flak38.json'), static_entity(
        'ww2:flak38', ['ww2', 'flak', 'inanimate'], gravity=True, collision=(2.4, 1.6), health=200,
        props={'ww2:pitch': {'type': 'float', 'range': [-10.0, 90.0], 'default': 20.0, 'client_sync': True},
               'ww2:destroyed': {'type': 'bool', 'default': False, 'client_sync': True}},
        extra={'minecraft:nameable': {'always_show': False}}))
    wjson(os.path.join(d, 'c47.json'), static_entity('ww2:c47', ['ww2', 'ww2_plane', 'inanimate'], collision=(1, 1),
                                                       persistent=False))
    wjson(os.path.join(d, 'propeller.json'), static_entity('ww2:propeller', ['ww2', 'ww2_plane', 'inanimate'],
                                                             persistent=False))
    wjson(os.path.join(d, 'marker.json'), static_entity('ww2:marker', ['ww2_marker', 'inanimate']))
    wjson(os.path.join(d, 'parachute.json'), static_entity(
        'ww2:parachute', ['ww2', 'ww2_chute', 'inanimate'], collision=(0.6, 0.5), persistent=False,
        extra={'minecraft:rideable': {'seat_count': 1, 'family_types': ['player', 'us_army', 'paratrooper', 'mob'],
                                      'interact_text': '', 'pull_in_entities': False, 'crouching_skip_interact': True,
                                      'seats': {'position': [0, 0.0, 0], 'lock_rider_rotation': 0}}}))


def write_bp_items():
    d = os.path.join(BP, 'items')

    def item(ident, name, icon, stack=1, extra=None):
        comps = {'minecraft:icon': {'textures': {'default': icon}}, 'minecraft:display_name': {'value': name}, 'minecraft:max_stack_size': stack}
        if extra:
            comps.update(extra)
        return {'format_version': '1.21.10', 'minecraft:item': {
            'description': {'identifier': ident, 'menu_category': {'category': 'equipment'}}, 'components': comps}}
    gun = {'minecraft:hand_equipped': True,
           'minecraft:use_modifiers': {'use_duration': 3600, 'movement_modifier': 0.7}}
    guns = [('m1_garand', 'Fuzil M1 Garand'), ('thompson', 'Submetralhadora Thompson M1A1'),
            ('bar', 'Fuzil Automático Browning (BAR)'), ('mp44', 'Sturmgewehr 44 (MP44)'), ('kar98', 'Karabiner 98k')]
    for ident, name in guns:
        wjson(os.path.join(d, ident + '.json'), item('ww2:' + ident, name, 'ww2_' + ident, 1, gun))
    wjson(os.path.join(d, 'radio.json'), item('ww2:radio', 'Rádio SCR-536 (Comando do Pelotão)', 'ww2_radio'))
    wjson(os.path.join(d, 'explosive.json'), item('ww2:explosive', 'Carga Explosiva (Composição C)', 'ww2_explosive', 16))
    wjson(os.path.join(d, 'medkit.json'), item('ww2:medkit', 'Kit Médico', 'ww2_medkit', 16))


HOSTILE = ['zombie', 'zombie_villager', 'zombie_villager_v2', 'husk', 'drowned', 'skeleton', 'stray', 'bogged',
           'creeper', 'spider', 'cave_spider', 'enderman', 'witch', 'slime', 'phantom', 'pillager', 'vindicator',
           'evocation_illager', 'ravager', 'guardian', 'elder_guardian', 'silverfish', 'endermite', 'magma_cube',
           'ghast', 'blaze', 'wither_skeleton', 'piglin', 'piglin_brute', 'hoglin', 'zoglin', 'zombie_pigman',
           'shulker', 'breeze', 'creaking']


def write_bp_misc():
    # sem monstros naturais: regras de spawn vazias substituem as do jogo
    for m in HOSTILE:
        wjson(os.path.join(BP, 'spawn_rules', m + '.json'), {'format_version': '1.8.0', 'minecraft:spawn_rules': {
            'description': {'identifier': 'minecraft:' + m, 'population_control': 'monster'}, 'conditions': []}})
    wjson(os.path.join(BP, 'loot_tables', 'entities', 'ww2_german.json'), {'pools': [
        {'rolls': 1, 'entries': [{'type': 'item', 'name': 'ww2:mp44', 'weight': 1},
                                 {'type': 'item', 'name': 'ww2:kar98', 'weight': 1},
                                 {'type': 'empty', 'weight': 8}]},
        {'rolls': 1, 'entries': [{'type': 'item', 'name': 'ww2:medkit', 'weight': 1},
                                 {'type': 'item', 'name': 'ww2:explosive', 'weight': 1},
                                 {'type': 'empty', 'weight': 5}]}]})


# =============================================================================
# Resource pack: client entities, animations, render controllers, particles
# =============================================================================
def client_entity(ident, textures, geo, anims=None, animate=None, rcs=None, material='entity_alphatest',
                  egg=None, particles=None):
    desc = {'identifier': ident, 'materials': {'default': material}, 'textures': textures,
            'geometry': {'default': geo}, 'render_controllers': rcs or ['controller.render.ww2.default']}
    if anims:
        desc['animations'] = anims
    if animate:
        desc['scripts'] = {'animate': animate}
    if egg:
        desc['spawn_egg'] = egg
    if particles:
        desc['particle_effects'] = particles
    return {'format_version': '1.10.0', 'minecraft:client_entity': {'description': desc}}


def soldier_animations():
    st = "q.property('ww2:state')"
    walk_amp = 'math.min(45, 80 * q.modified_move_speed)'
    A = {
        'animation.ww2.soldier.look': {'loop': True, 'bones': {
            'head': {'rotation': ['q.target_x_rotation', 'q.target_y_rotation', 0]}}},
        'animation.ww2.soldier.sit': {'loop': True, 'bones': {
            'root': {'position': [0, -10, 0]},
            'rightLeg': {'rotation': [-85, 10, 0]}, 'leftLeg': {'rotation': [-85, -10, 0]},
            'rightArm': {'rotation': [-28, -12, 0]}, 'leftArm': {'rotation': [-28, 12, 0]},
            'head': {'rotation': ['math.sin(q.life_time * 40 + q.property(\'ww2:skin\') * 50) * 4', 0, 0]}}},
        'animation.ww2.soldier.hook': {'loop': True, 'bones': {
            'leftArm': {'rotation': [-168, 0, 0]}, 'rightArm': {'rotation': [-12, 0, 0]}}},
        'animation.ww2.soldier.aisle': {'loop': True, 'bones': {
            'leftArm': {'rotation': [-168, 0, 0]},
            'rightArm': {'rotation': ['-12 - math.cos(q.life_time * 540) * 18', 0, 0]},
            'rightLeg': {'rotation': ['math.cos(q.life_time * 540) * 32', 0, 0]},
            'leftLeg': {'rotation': ['-math.cos(q.life_time * 540) * 32', 0, 0]}}},
        'animation.ww2.soldier.freefall': {'loop': True, 'bones': {
            'root': {'rotation': ['-15 + math.sin(q.life_time * 160) * 12', 0, 'math.sin(q.life_time * 110) * 8']},
            'rightArm': {'rotation': [-58, -38, 0]}, 'leftArm': {'rotation': [-58, 38, 0]},
            'rightLeg': {'rotation': [10, 0, 0]}, 'leftLeg': {'rotation': [10, 0, 0]}}},
        'animation.ww2.soldier.chute': {'loop': True, 'bones': {
            'root': {'rotation': ['math.sin(q.life_time * 70) * 3', 0, 'math.cos(q.life_time * 55) * 4']},
            'rightArm': {'rotation': [-168, 0, 0]}, 'leftArm': {'rotation': [-168, 0, 0]},
            'rightLeg': {'rotation': ['-12 + math.sin(q.life_time * 90) * 6', 0, 0]},
            'leftLeg': {'rotation': ['-12 + math.sin(q.life_time * 90) * 6', 0, 0]}}},
        'animation.ww2.soldier.walk': {'loop': True, 'bones': {
            'rightLeg': {'rotation': [f'math.cos(q.modified_distance_moved * 38.17) * {walk_amp}', 0, 0]},
            'leftLeg': {'rotation': [f'-math.cos(q.modified_distance_moved * 38.17) * {walk_amp}', 0, 0]}}},
        'animation.ww2.soldier.aim': {'loop': True, 'bones': {
            'rightArm': {'rotation': ['-90 + q.target_x_rotation', '-6 + q.target_y_rotation', 0]},
            'leftArm': {'rotation': ['-88 + q.target_x_rotation', '32 + q.target_y_rotation', 0]}}},
        'animation.ww2.soldier.ready': {'loop': True, 'bones': {
            'rightArm': {'rotation': [f'-52 + math.cos(q.modified_distance_moved * 38.17) * 6', -12, 0]},
            'leftArm': {'rotation': [-60, 36, 0]}}},
    }
    del st
    return {'format_version': '1.8.0', 'animations': A}


def misc_animations():
    return {'format_version': '1.8.0', 'animations': {
        'animation.ww2.c47.props': {'loop': True, 'bones': {
            'prop_l': {'rotation': [0, 0, 'q.life_time * 1600']},
            'prop_r': {'rotation': [0, 0, 'q.life_time * -1600']}}},
        'animation.ww2.propeller.spin': {'loop': True, 'bones': {'prop': {'rotation': [0, 0, 'q.life_time * 1600']}}},
        'animation.ww2.flak.aim': {'loop': True, 'bones': {
            'barrel': {'rotation': ["q.property('ww2:destroyed') ? 14 : -q.property('ww2:pitch')",
                                    "q.property('ww2:destroyed') ? 22 : 0", 0]},
            'turret': {'rotation': [0, 0, "q.property('ww2:destroyed') ? 6 : 0"]}}},
        'animation.ww2.parachute.deploy': {'loop': True, 'bones': {
            'canopy': {'scale': ['math.min(1, 0.12 + q.life_time * 1.6)', 'math.min(1, 0.3 + q.life_time * 1.4)',
                                 'math.min(1, 0.12 + q.life_time * 1.6)']},
            'root': {'rotation': ['math.sin(q.life_time * 70) * 3', 0, 'math.cos(q.life_time * 55) * 4']}}},
        'animation.ww2.trail': {'loop': False, 'animation_length': 0.05,
                                'particle_effects': {'0.0': {'effect': 'trail'}}},
    }}


def render_controllers():
    rc = {
        'controller.render.ww2.default': {
            'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}],
            'textures': ['Texture.default']},
        'controller.render.ww2.us_soldier': {
            'arrays': {'textures': {'Array.skins': ['Texture.s0', 'Texture.s1', 'Texture.s2']}},
            'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}],
            'textures': ["Array.skins[q.property('ww2:skin')]"],
            'part_visibility': [
                {'*': True},
                {'gun_garand': "q.property('ww2:state') == 5 && q.property('ww2:weapon') == 0"},
                {'gun_thompson': "q.property('ww2:state') == 5 && q.property('ww2:weapon') == 1"},
                {'gun_bar': "q.property('ww2:state') == 5 && q.property('ww2:weapon') == 2"},
                {'pack_main': "q.property('ww2:state') < 4"},
                {'pack_reserve': "q.property('ww2:state') < 5"},
                {'musette': "q.property('ww2:state') == 5"}]},
        'controller.render.ww2.de_soldier': {
            'arrays': {'textures': {'Array.skins': ['Texture.s0', 'Texture.s1', 'Texture.s2']}},
            'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}],
            'textures': ["Array.skins[q.property('ww2:skin')]"],
            'part_visibility': [
                {'*': True},
                {'gun_kar98': "q.property('ww2:weapon') == 0"},
                {'gun_mp44': "q.property('ww2:weapon') == 1"}]},
        'controller.render.ww2.flak': {
            'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}],
            'textures': ['Texture.default'],
            'overlay_color': {'r': 0.05, 'g': 0.05, 'b': 0.05, 'a': "q.property('ww2:destroyed') ? 0.6 : 0.0"}},
    }
    return {'format_version': '1.8.0', 'render_controllers': rc}


def write_rp_entities():
    d = os.path.join(RP, 'entity')
    us_anims = {k: 'animation.ww2.soldier.' + k for k in
                ('look', 'sit', 'hook', 'aisle', 'freefall', 'chute', 'walk', 'aim', 'ready')}
    st = "q.property('ww2:state')"
    wjson(os.path.join(d, 'us_paratrooper.entity.json'), client_entity(
        'ww2:us_paratrooper', {f's{i}': f'textures/entity/ww2/us_{i}' for i in range(3)},
        'geometry.ww2.us_soldier', us_anims,
        ['look', {'sit': f'{st} == 0'}, {'hook': f'{st} == 1'}, {'aisle': f'{st} == 2'},
         {'freefall': f'{st} == 3'}, {'chute': f'{st} == 4'}, {'walk': f'{st} == 5'},
         {'aim': f"{st} == 5 && q.property('ww2:aim')"}, {'ready': f"{st} == 5 && !q.property('ww2:aim')"}],
        ['controller.render.ww2.us_soldier'], egg={'base_color': '#8c8462', 'overlay_color': '#4b5320'}))
    de_anims = {k: 'animation.ww2.soldier.' + k for k in ('look', 'walk', 'aim', 'ready')}
    wjson(os.path.join(d, 'german_soldier.entity.json'), client_entity(
        'ww2:german_soldier', {f's{i}': f'textures/entity/ww2/de_{i}' for i in range(3)},
        'geometry.ww2.de_soldier', de_anims,
        ['look', 'walk', {'aim': "q.property('ww2:aim')"}, {'ready': "!q.property('ww2:aim')"}],
        ['controller.render.ww2.de_soldier'], egg={'base_color': '#606554', 'overlay_color': '#1e1c1a'}))
    pal = {'default': 'textures/entity/ww2/palette'}
    wjson(os.path.join(d, 'c47.entity.json'), client_entity(
        'ww2:c47', pal, 'geometry.ww2.c47', {'props': 'animation.ww2.c47.props'}, ['props']))
    wjson(os.path.join(d, 'propeller.entity.json'), client_entity(
        'ww2:propeller', pal, 'geometry.ww2.propeller', {'spin': 'animation.ww2.propeller.spin'}, ['spin']))
    wjson(os.path.join(d, 'flak38.entity.json'), client_entity(
        'ww2:flak38', pal, 'geometry.ww2.flak38', {'aim': 'animation.ww2.flak.aim'}, ['aim'],
        ['controller.render.ww2.flak'], egg={'base_color': '#5c6158', 'overlay_color': '#1e1e1e'}))
    wjson(os.path.join(d, 'parachute.entity.json'), client_entity(
        'ww2:parachute', pal, 'geometry.ww2.parachute', {'deploy': 'animation.ww2.parachute.deploy'}, ['deploy']))
    wjson(os.path.join(d, 'marker.entity.json'), client_entity('ww2:marker', pal, 'geometry.ww2.marker'))
    for b in ('us_rifle', 'us_smg', 'us_mg', 'de_rifle', 'de_smg', 'p_rifle', 'p_smg', 'p_mg'):
        wjson(os.path.join(d, 'bullets', f'bullet_{b}.entity.json'), client_entity(
            f'ww2:bullet_{b}', pal, 'geometry.ww2.bullet', {'trail': 'animation.ww2.trail'}, ['trail'],
            particles={'trail': 'ww2:tracer_trail'}))
    wjson(os.path.join(d, 'bullets', 'flak_shell.entity.json'), client_entity(
        'ww2:flak_shell', pal, 'geometry.ww2.bullet', {'trail': 'animation.ww2.trail'}, ['trail'],
        particles={'trail': 'ww2:flak_trail'}))


def particle(ident, comps, material='particles_blend'):
    return {'format_version': '1.10.0', 'particle_effect': {
        'description': {'identifier': ident, 'basic_render_parameters': {
            'material': material, 'texture': 'textures/particle/ww2_particles'}},
        'components': comps}}


def billboard(size, uv, uvs=16, facing='rotate_xyz'):
    return {'size': size, 'facing_camera_mode': facing,
            'uv': {'texture_width': 64, 'texture_height': 64, 'uv': uv, 'uv_size': [uvs, uvs]}}


def write_particles():
    d = os.path.join(RP, 'particles')
    P = {}
    P['tracer_trail'] = particle('ww2:tracer_trail', {
        'minecraft:emitter_rate_steady': {'spawn_rate': 160, 'max_particles': 60},
        'minecraft:emitter_lifetime_looping': {'active_time': 10},
        'minecraft:emitter_shape_point': {},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 0.09},
        'minecraft:particle_appearance_billboard': billboard([0.09, 0.09], [48, 0]),
        'minecraft:particle_appearance_tinting': {'color': [1.0, 0.85, 0.45, 1.0]}}, 'particles_add')
    P['flak_trail'] = particle('ww2:flak_trail', {
        'minecraft:emitter_rate_steady': {'spawn_rate': 90, 'max_particles': 60},
        'minecraft:emitter_lifetime_looping': {'active_time': 10},
        'minecraft:emitter_shape_point': {},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 0.22},
        'minecraft:particle_appearance_billboard': billboard(['0.28 - variable.particle_age', '0.28 - variable.particle_age'], [48, 0]),
        'minecraft:particle_appearance_tinting': {'color': [1.0, 0.45, 0.15, 1.0]}}, 'particles_add')
    P['muzzle_flash'] = particle('ww2:muzzle_flash', {
        'minecraft:emitter_rate_instant': {'num_particles': 2},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_point': {},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 0.07},
        'minecraft:particle_appearance_billboard': billboard([0.35, 0.35], [32, 0]),
        'minecraft:particle_appearance_tinting': {'color': [1.0, 0.8, 0.4, 1.0]}}, 'particles_add')
    P['flak_flash'] = particle('ww2:flak_flash', {
        'minecraft:emitter_rate_instant': {'num_particles': 3},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_sphere': {'radius': 0.6, 'direction': 'outwards'},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 0.18},
        'minecraft:particle_appearance_billboard': billboard(['3 + variable.particle_age * 8', '3 + variable.particle_age * 8'], [32, 0]),
        'minecraft:particle_appearance_tinting': {'color': [1.0, 0.65, 0.25, 1.0]}}, 'particles_add')
    P['flak_smoke'] = particle('ww2:flak_smoke', {
        'minecraft:emitter_rate_instant': {'num_particles': 9},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_sphere': {'radius': 1.0, 'direction': 'outwards'},
        'minecraft:particle_lifetime_expression': {'max_lifetime': '4 + variable.particle_random_1 * 3'},
        'minecraft:particle_initial_speed': 1.6,
        'minecraft:particle_motion_dynamic': {'linear_drag_coefficient': 1.8, 'linear_acceleration': [0, 0.1, 0]},
        'minecraft:particle_appearance_billboard': billboard(['1.6 + variable.particle_age * 0.5', '1.6 + variable.particle_age * 0.5'], [0, 0]),
        'minecraft:particle_appearance_tinting': {'color': [0.07, 0.07, 0.07, '0.9 - variable.particle_age / variable.particle_lifetime * 0.9']}})
    P['dust'] = particle('ww2:dust', {
        'minecraft:emitter_rate_instant': {'num_particles': 4},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_sphere': {'radius': 0.1, 'direction': 'outwards'},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 0.6},
        'minecraft:particle_initial_speed': 2.0,
        'minecraft:particle_motion_dynamic': {'linear_drag_coefficient': 3, 'linear_acceleration': [0, -3, 0]},
        'minecraft:particle_appearance_billboard': billboard([0.18, 0.18], [0, 0]),
        'minecraft:particle_appearance_tinting': {'color': [0.45, 0.38, 0.28, 0.9]}})
    P['cloud'] = particle('ww2:cloud', {
        'minecraft:emitter_rate_instant': {'num_particles': 1},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_point': {'direction': [-1, 0, 0]},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 7},
        'minecraft:particle_initial_speed': 13,
        'minecraft:particle_motion_dynamic': {},
        'minecraft:particle_appearance_billboard': billboard(['9 + variable.particle_random_1 * 7', '6 + variable.particle_random_2 * 4'], [0, 16], 32),
        'minecraft:particle_appearance_tinting': {'color': [0.85, 0.86, 0.9, 'math.min(1, variable.particle_age) * 0.55 * math.min(1, (7 - variable.particle_age))']}})
    P['wind'] = particle('ww2:wind', {
        'minecraft:emitter_rate_instant': {'num_particles': 2},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_box': {'half_dimensions': [1, 1.2, 0.6], 'direction': [-1, 0, 0]},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 0.35},
        'minecraft:particle_initial_speed': 38,
        'minecraft:particle_motion_dynamic': {},
        'minecraft:particle_appearance_billboard': billboard([1.4, 0.04], [16, 0], facing='lookat_y'),
        'minecraft:particle_appearance_tinting': {'color': [1, 1, 1, 0.35]}})
    P['engine_smoke'] = particle('ww2:engine_smoke', {
        'minecraft:emitter_rate_instant': {'num_particles': 2},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_sphere': {'radius': 0.4, 'direction': 'outwards'},
        'minecraft:particle_lifetime_expression': {'max_lifetime': 3},
        'minecraft:particle_initial_speed': 0.5,
        'minecraft:particle_motion_dynamic': {'linear_acceleration': [-2, 0.3, 0]},
        'minecraft:particle_appearance_billboard': billboard(['1 + variable.particle_age', '1 + variable.particle_age'], [0, 0]),
        'minecraft:particle_appearance_tinting': {'color': [0.15, 0.15, 0.15, '0.8 - variable.particle_age / 4']}})
    P['explosion'] = particle('ww2:explosion', {
        'minecraft:emitter_rate_instant': {'num_particles': 26},
        'minecraft:emitter_lifetime_once': {'active_time': 0.05},
        'minecraft:emitter_shape_sphere': {'radius': 1.0, 'direction': 'outwards'},
        'minecraft:particle_lifetime_expression': {'max_lifetime': '1 + variable.particle_random_1 * 2.5'},
        'minecraft:particle_initial_speed': 7,
        'minecraft:particle_motion_dynamic': {'linear_drag_coefficient': 2.5, 'linear_acceleration': [0, 1.2, 0]},
        'minecraft:particle_appearance_billboard': billboard(['1.5 + variable.particle_age * 1.5', '1.5 + variable.particle_age * 1.5'], [0, 0]),
        'minecraft:particle_appearance_tinting': {'color': {'gradient': {
            '0.0': '#FFFFD27A', '0.15': '#FFFF7A1E', '0.4': '#FF3A3532', '1.0': '#00222222'},
            'interpolant': 'variable.particle_age / variable.particle_lifetime'}}})
    for name, p in P.items():
        wjson(os.path.join(d, name + '.json'), p)


def write_lang():
    names = {
        'entity.ww2:us_paratrooper.name': ('Paraquedista dos EUA', 'US Paratrooper'),
        'entity.ww2:german_soldier.name': ('Soldado Alemão', 'German Soldier'),
        'entity.ww2:flak38.name': ('Canhão Antiaéreo Flak 38', 'Flak 38 AA Gun'),
        'entity.ww2:c47.name': ('C-47 Skytrain', 'C-47 Skytrain'),
        'entity.ww2:parachute.name': ('Paraquedas T-5', 'T-5 Parachute'),
        'entity.ww2:propeller.name': ('Hélice', 'Propeller'),
        'entity.ww2:marker.name': ('Ponto de Reunião', 'Rally Point'),
        'item.spawn_egg.entity.ww2:us_paratrooper.name': ('Gerar Paraquedista dos EUA', 'Spawn US Paratrooper'),
        'item.spawn_egg.entity.ww2:german_soldier.name': ('Gerar Soldado Alemão', 'Spawn German Soldier'),
        'item.spawn_egg.entity.ww2:flak38.name': ('Gerar Flak 38', 'Spawn Flak 38'),
    }
    for b in ('us_rifle', 'us_smg', 'us_mg', 'de_rifle', 'de_smg', 'p_rifle', 'p_smg', 'p_mg'):
        names[f'entity.ww2:bullet_{b}.name'] = ('Projétil', 'Bullet')
    names['entity.ww2:flak_shell.name'] = ('Granada de 20mm', '20mm Shell')
    pack = ('WW2 D-Day: Paraquedistas', 'WW2 D-Day: Paratroopers')
    for lang, i in (('pt_BR', 0), ('en_US', 1), ('pt_PT', 0)):
        lines = [f'{k}={v[i]}' for k, v in names.items()]
        with open(os.path.join(RP, 'texts', f'{lang}.lang'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines + [f'pack.name={pack[i]}', 'pack.description=Normandia, 6 de junho de 1944']) + '\n')
    for d in (RP, BP):
        wjson(os.path.join(d, 'texts', 'languages.json'), ['pt_BR', 'en_US', 'pt_PT'])
    with open(os.path.join(BP, 'texts', 'pt_BR.lang'), 'w', encoding='utf-8') as f:
        f.write(f'pack.name={pack[0]}\npack.description=Comportamentos e IA\n')
    with open(os.path.join(BP, 'texts', 'en_US.lang'), 'w', encoding='utf-8') as f:
        f.write(f'pack.name={pack[1]}\npack.description=Behaviors and AI\n')
    with open(os.path.join(BP, 'texts', 'pt_PT.lang'), 'w', encoding='utf-8') as f:
        f.write(f'pack.name={pack[0]}\npack.description=Comportamentos e IA\n')


def manifests():
    bp = {'format_version': 2, 'header': {
        'name': 'WW2 D-Day: Paraquedistas (Comportamento)',
        'description': 'Salto na Normandia: C-47, IA de divisão, Flak e infantaria alemã. Requer o Resource Pack.',
        'uuid': UUID['bp'], 'version': VERSION, 'min_engine_version': MIN_ENGINE},
        'modules': [{'type': 'data', 'uuid': UUID['bp_data'], 'version': VERSION},
                    {'type': 'script', 'language': 'javascript', 'uuid': UUID['bp_script'],
                     'entry': 'scripts/main.js', 'version': VERSION}],
        'dependencies': [{'uuid': UUID['rp'], 'version': VERSION},
                         {'module_name': '@minecraft/server', 'version': SERVER_VERSION},
                         {'module_name': '@minecraft/server-ui', 'version': SERVER_UI_VERSION}],
        'metadata': {'authors': ['WW2 D-Day Addon'], 'product_type': 'addon'}}
    rp = {'format_version': 2, 'header': {
        'name': 'WW2 D-Day: Paraquedistas (Recursos)',
        'description': 'Modelos, texturas, sons e partículas do addon WW2 D-Day.',
        'uuid': UUID['rp'], 'version': VERSION, 'min_engine_version': MIN_ENGINE},
        'modules': [{'type': 'resources', 'uuid': UUID['rp_res'], 'version': VERSION}],
        'dependencies': [{'uuid': UUID['bp'], 'version': VERSION}],
        'metadata': {'authors': ['WW2 D-Day Addon'], 'product_type': 'addon'}}
    wjson(os.path.join(BP, 'manifest.json'), bp)
    wjson(os.path.join(RP, 'manifest.json'), rp)


# =============================================================================
def main():
    if os.path.isdir(BUILD):
        shutil.rmtree(BUILD)
    os.makedirs(BP); os.makedirs(RP)
    print('Modelos...')
    models = os.path.join(RP, 'models', 'entity')
    wjson(os.path.join(models, 'us_soldier.geo.json'), soldier_geometry('us'))
    wjson(os.path.join(models, 'de_soldier.geo.json'), soldier_geometry('de'))
    wjson(os.path.join(models, 'c47.geo.json'), c47_geometry())
    wjson(os.path.join(models, 'propeller.geo.json'), propeller_geometry())
    wjson(os.path.join(models, 'flak38.geo.json'), flak_geometry())
    wjson(os.path.join(models, 'parachute.geo.json'), parachute_geometry())
    wjson(os.path.join(models, 'bullet.geo.json'), bullet_geometry())
    wjson(os.path.join(models, 'marker.geo.json'), marker_geometry())
    write_attachables()
    print('  cores na paleta:', len(PAL.colors))

    print('Texturas...')
    tex = os.path.join(RP, 'textures', 'entity', 'ww2')
    os.makedirs(tex, exist_ok=True)
    for i in range(3):
        art.paint_palette(art.us_skin(i), PAL).save(os.path.join(tex, f'us_{i}.png'))
        art.paint_palette(art.de_skin(i), PAL).save(os.path.join(tex, f'de_{i}.png'))
    from PIL import Image
    art.paint_palette(Image.new('RGBA', (128, 64), (0, 0, 0, 0)), PAL).save(os.path.join(tex, 'palette.png'))
    items_dir = os.path.join(RP, 'textures', 'items', 'ww2')
    os.makedirs(items_dir, exist_ok=True)
    item_tex = {}
    for ident, w in (('m1_garand', 'garand'), ('thompson', 'thompson'), ('bar', 'bar'), ('mp44', 'mp44'), ('kar98', 'kar98')):
        data, plus_x, _, _ = WEAPONS[w]
        art.weapon_icon(data['boxes'], data['size'], plus_x).save(os.path.join(items_dir, ident + '.png'))
        item_tex['ww2_' + ident] = {'textures': 'textures/items/ww2/' + ident}
    for k in ('radio', 'explosive', 'medkit'):
        art.simple_icon(k).save(os.path.join(items_dir, k + '.png'))
        item_tex['ww2_' + k] = {'textures': 'textures/items/ww2/' + k}
    wjson(os.path.join(RP, 'textures', 'item_texture.json'),
          {'resource_pack_name': 'ww2_dday', 'texture_name': 'atlas.items', 'texture_data': item_tex})
    os.makedirs(os.path.join(RP, 'textures', 'particle'), exist_ok=True)
    art.particle_atlas().save(os.path.join(RP, 'textures', 'particle', 'ww2_particles.png'))
    icon = art.pack_icon()
    icon.save(os.path.join(RP, 'pack_icon.png')); icon.save(os.path.join(BP, 'pack_icon.png'))

    print('Entidades, itens, animações, partículas...')
    write_bp_entities(); write_bp_items(); write_bp_misc()
    write_rp_entities()
    wjson(os.path.join(RP, 'animations', 'ww2_soldier.animation.json'), soldier_animations())
    wjson(os.path.join(RP, 'animations', 'ww2_misc.animation.json'), misc_animations())
    wjson(os.path.join(RP, 'render_controllers', 'ww2.render_controllers.json'), render_controllers())
    write_particles()
    os.makedirs(os.path.join(RP, 'texts'), exist_ok=True); os.makedirs(os.path.join(BP, 'texts'), exist_ok=True)
    write_lang()

    print('Sons...')
    wjson(os.path.join(RP, 'sounds', 'sound_definitions.json'),
          {'format_version': '1.14.0', 'sound_definitions': sfx.build(RP)})

    print('Scripts...')
    sdir = os.path.join(BP, 'scripts')
    shutil.copytree(SRC_SCRIPTS, sdir)
    with open(os.path.join(sdir, 'plane_layout.js'), 'w', encoding='utf-8') as f:
        f.write(PL.as_js())
    manifests()

    print('Empacotando...')
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, 'WW2_DDay_Paraquedistas.mcaddon')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for base in (BP, RP):
            for dirpath, _, files in os.walk(base):
                for fn in sorted(files):
                    full = os.path.join(dirpath, fn)
                    z.write(full, os.path.relpath(full, BUILD))
    print('OK ->', out, f'({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
