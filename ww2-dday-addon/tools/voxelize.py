"""Convert the WW2 weapon OBJ (from the uploaded zip) into lists of colored boxes
usable as Bedrock geometry cubes. Output: weapons.json with, per weapon,
a list of {"o":[x,y,z],"s":[w,h,d],"c":[r,g,b]} in pixel units (1px = 1/16 block).
"""
import json, sys, math
import numpy as np
from PIL import Image

obj_path, tex_path, out_path, preview_dir = sys.argv[1:5]
PX_PER_M = 32 / 1.8          # Minecraft humanoid: 32px tall ~ 1.8 m
VOX = 0.34                   # voxel size in px

tex = np.array(Image.open(tex_path).convert('RGB'))
TH, TW = tex.shape[:2]

verts, uvs, groups, cur = [], [], {}, None
for line in open(obj_path):
    p = line.split()
    if not p:
        continue
    if p[0] == 'g':
        cur = p[1]; groups.setdefault(cur, [])
    elif p[0] == 'v':
        verts.append([float(a) for a in p[1:4]])
    elif p[0] == 'vt':
        uvs.append([float(a) for a in p[1:3]])
    elif p[0] == 'f':
        idx = [tuple(int(a) - 1 for a in t.split('/')[:2]) for t in p[1:]]
        for k in range(1, len(idx) - 1):
            groups[cur].append((idx[0], idx[k], idx[k + 1]))
verts = np.array(verts); uvs = np.array(uvs)

def sample_color(uv):
    u, v = uv
    x = int(min(TW - 1, max(0, math.floor(u * TW))))
    y = int(min(TH - 1, max(0, math.floor((1 - v) * TH))))
    return tuple(int(c) for c in tex[y, x])

result = {}
for name, tris in groups.items():
    ids = sorted({i for t in tris for i, _ in t})
    pts = verts[ids]
    mn = pts.min(0)
    vox = {}
    for t in tris:
        P = np.array([verts[i] for i, _ in t]) - mn
        P = P * PX_PER_M / VOX
        col = sample_color(uvs[t[0][1]])
        e1, e2 = P[1] - P[0], P[2] - P[0]
        n = int(max(np.linalg.norm(e1), np.linalg.norm(e2)) * 2) + 2
        for a in range(n + 1):
            for b in range(n + 1 - a):
                q = P[0] + e1 * (a / n) + e2 * (b / n)
                key = tuple(int(math.floor(c)) for c in q)
                vox[key] = col
    # fill interior along Z (weapons are thin plates: fill between min/max z per (x,y))
    cols = {}
    for (x, y, z), c in vox.items():
        cols.setdefault((x, y), []).append((z, c))
    for (x, y), lst in cols.items():
        zs = [z for z, _ in lst]
        c = lst[0][1]
        for z in range(min(zs), max(zs) + 1):
            vox.setdefault((x, y, z), c)
    # greedy merge boxes of same color
    remaining = dict(vox)
    boxes = []
    for key in sorted(remaining.keys()):
        if key not in remaining:
            continue
        c = remaining[key]
        x0, y0, z0 = key
        x1 = x0
        while (x1 + 1, y0, z0) in remaining and remaining[(x1 + 1, y0, z0)] == c:
            x1 += 1
        y1 = y0
        def row_ok(y):
            return all(remaining.get((x, y, z0)) == c for x in range(x0, x1 + 1))
        while row_ok(y1 + 1):
            y1 += 1
        z1 = z0
        def slab_ok(z):
            return all(remaining.get((x, y, z)) == c for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))
        while slab_ok(z1 + 1):
            z1 += 1
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    del remaining[(x, y, z)]
        boxes.append({'o': [x0 * VOX, y0 * VOX, z0 * VOX],
                      's': [(x1 - x0 + 1) * VOX, (y1 - y0 + 1) * VOX, (z1 - z0 + 1) * VOX],
                      'c': list(c)})
    ext = (pts.max(0) - mn) * PX_PER_M
    result[name] = {'boxes': boxes, 'size': [round(float(a), 2) for a in ext]}
    # side preview (x,y)
    W = int(ext[0] / VOX) + 2; H = int(ext[1] / VOX) + 2
    img = Image.new('RGB', (W, H), (255, 255, 255))
    for (x, y, z), c in sorted(vox.items(), key=lambda kv: kv[0][2]):
        if 0 <= x < W and 0 <= y < H:
            img.putpixel((x, H - 1 - y), c)
    img.resize((W * 6, H * 6), Image.NEAREST).save(f'{preview_dir}/{name}.png')
    print(name, 'voxels', len(vox), 'boxes', len(boxes), 'size px', result[name]['size'])

json.dump(result, open(out_path, 'w'))
