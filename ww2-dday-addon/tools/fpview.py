"""Projeta um attachable (geometria com binding) na visão de 1ª/3ª pessoa usando os
mesmos referenciais calibrados do Blockbench (attachable_preview.js)."""
import math
import numpy as np

def rzyx(x, y, z):
    x, y, z = map(math.radians, (x, y, z))
    X = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    Y = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    Z = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return Z @ Y @ X   # three.js order 'ZYX'

def bone_to_bb(p_bed, pivot_bed, rot_bed, pos_bed):
    """ponto em coords Bedrock -> coords internas do Blockbench após a animação do osso"""
    p = np.array([-p_bed[0], p_bed[1], p_bed[2]], float)
    pv = np.array([-pivot_bed[0], pivot_bed[1], pivot_bed[2]], float)
    R = rzyx(-rot_bed[0], -rot_bed[1], rot_bed[2])
    return R @ (p - pv) + pv + np.array([-pos_bed[0], pos_bed[1], pos_bed[2]], float)

FP_R = rzyx(-95, 45, 115)
FP_T = np.array([-20, 21, 0.0])
CAM = np.array([0, 19, -40.0]); TARGET = np.array([0, 16, 0.0])

def first_person(p_bb):
    return FP_T + FP_R @ p_bb

def project(q, W=160, H=90, focal=18):
    f, right, u = cam_basis()
    v = q - CAM
    z = v @ f
    fy = focal / 12.0          # sensor 24 mm de altura
    x = (v @ right) / z * fy * (H / 2) + W / 2
    y = -(v @ u) / z * fy * (H / 2) + H / 2
    return x, y, z

def third_person(p_bb):
    a = math.radians(15)
    Rx = rzyx(15, 0, 0)
    base = np.array([5, 22, 0.0]) + Rx @ np.array([1, -31, 1.0])
    return base + Rx @ p_bb

if __name__ == '__main__':
    def show(name, rot, pos, pts):
        print(name)
        for label, p in pts:
            q = first_person(bone_to_bb(p, [0, 24, 0], rot, pos))
            x, y, z = project(q)
            print(f'   {label:8s} screen=({x:6.1f},{y:6.1f}) depth={z:5.1f}')
    tri = [('butt', [0, -3, 0]), ('grip', [0, 24, 0]), ('prongs', [0, 28, 0])]
    show('trident idle (esperado: canto inferior direito, pontas p/ cima)', [152, -9, 25], [-7, -3, -2], tri)
    show('trident raise (esperado: apontando p/ frente, pontas mais longe)', [30, -20, -65], [-4.5, -3, -8.5], tri)


# ---------------------------------------------------------------------------
# Solver: rotação/posição (formato Bedrock) para que a arma fique na tela onde queremos
# ---------------------------------------------------------------------------
def cam_basis():
    f = TARGET - CAM; f = f / np.linalg.norm(f)
    up = np.array([0, 1.0, 0])
    right = np.cross(f, up); right = -right / np.linalg.norm(right)   # tela direita = -X
    right = -right if right[0] > 0 else right
    u = np.cross(right, f); u = u / np.linalg.norm(u)
    if u[1] < 0: u = -u
    return f, right, u

def euler_zyx(R):
    # R = Rz Ry Rx  -> (x, y, z) em graus
    y = math.asin(-max(-1, min(1, R[2, 0])))
    x = math.atan2(R[2, 1], R[2, 2])
    z = math.atan2(R[1, 0], R[0, 0])
    return [math.degrees(x), math.degrees(y), math.degrees(z)]

def solve(depth, a, b, converge=None, roll=0.0, pivot=(0, 24, 0)):
    """grip na posição (a: direita, b: cima) a `depth` da câmera; cano para frente
    (convergindo para o centro a `converge` blocos, se dado). Retorna (rot_bed, pos_bed)."""
    f, right, u = cam_basis()
    G = CAM + f * depth + right * a + u * b
    fwd = f if converge is None else (CAM + f * converge) - G
    fwd = fwd / np.linalg.norm(fwd)
    up = u - fwd * (u @ fwd); up = up / np.linalg.norm(up)
    if roll:
        c, s = math.cos(math.radians(roll)), math.sin(math.radians(roll))
        side = np.cross(up, -fwd)
        up = up * c + side * s
    ex = np.cross(up, -fwd)
    M = np.column_stack([ex, up, -fwd])      # mapeia eixos locais BB -> mundo
    Rbb = FP_R.T @ M
    rx, ry, rz = euler_zyx(Rbb)
    pv = np.array([-pivot[0], pivot[1], pivot[2]], float)
    T = FP_R.T @ (G - FP_T) - pv
    return [round(-rx, 2), round(-ry, 2), round(rz, 2)], [round(-T[0], 2), round(T[1], 2), round(T[2], 2)]
