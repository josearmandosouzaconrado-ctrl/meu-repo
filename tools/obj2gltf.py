"""Converte o OBJ do Marcopolo Torino (sem .mtl) para glTF, mapeando materiais -> texturas.

Uso: python3 -I tools/obj2gltf.py <obj> <pasta_texturas> <saida.gltf>
"""
import json, os, struct, sys, shutil
import numpy as np

obj_path, tex_dir, out_path = sys.argv[1:4]
out_dir = os.path.dirname(os.path.abspath(out_path))
os.makedirs(out_dir, exist_ok=True)

# Materiais descartados (interior invisivel por fora / sombras falsas) para economizar no celular
SKIP = {"fkn_bancos", "fkn_cadeirante", "fkn_ferros_conj", "shadow", "matrix_l__trans_",
        "reflexion2", "reflexion3", "fkn_int2__spec_", "fkn_piso_tori_op2", "fkn_internos1",
        "fkn_couro_cl", "fkn_tori07_int1v2"}

TEX = {
    "fkn_tori_volks": "transtol.jpg",
    "fkn_tori_volks_vd__trans_": "FKN-tori-volks-vd.png",
    "fkn_tori_lp2__trans_": "fkn-tori-lp2.jpg",
    "fkn_grades_marc2": "fkn-grades-marc.tga.png",
    "fkn_itinerario_x2": "fkn-itinerario-x1.png",
    "17_230": "17-230.jpg",
    "volksbus17_230": "volksbus17-230.jpg",
    "volksbusx2": "volksbusx2.jpg",
    "vwe5": "VWE5.jpg",
    "vwe5n": "VWE5N.jpg",
    "vw_volante": "vw-volante.jpg",
    "vdi": "VDI.jpg",
    "hankookx512": "hankookx512.jpg",
    "preto": None, "branco": None,
}
COLORS = {"preto": [0.05, 0.05, 0.05, 1], "branco": [0.95, 0.95, 0.95, 1],
          "Matte__FFFFFFFF": [1, 1, 1, 1], "Matte__FFCCCCCC": [0.8, 0.8, 0.8, 1],
          "fkn_tori_volks_vd__trans_": [0.15, 0.2, 0.22, 0.55]}


def tex_for(m):
    if m in TEX:
        return TEX[m]
    cand = m.replace("_", "-") + ".jpg"
    if os.path.exists(os.path.join(tex_dir, cand)):
        return cand
    return None


V, VT, VN = [], [], []
groups = {}  # material -> list of (v,vt,vn) tuples triangulated
cur = None
with open(obj_path, "r", errors="ignore") as f:
    for line in f:
        if line.startswith("v "):
            V.append(line.split()[1:4])
        elif line.startswith("vt "):
            VT.append(line.split()[1:3])
        elif line.startswith("vn "):
            VN.append(line.split()[1:4])
        elif line.startswith("usemtl"):
            cur = line.split()[1]
        elif line.startswith("f "):
            if cur in SKIP:
                continue
            pts = []
            for p in line.split()[1:]:
                a = p.split("/")
                vi = int(a[0]); ti = int(a[1]) if len(a) > 1 and a[1] else 0
                ni = int(a[2]) if len(a) > 2 and a[2] else 0
                pts.append((vi, ti, ni))
            g = groups.setdefault(cur, [])
            for i in range(1, len(pts) - 1):
                g.extend((pts[0], pts[i], pts[i + 1]))

V = np.array(V, dtype=np.float32)
VT = np.array(VT, dtype=np.float32) if VT else np.zeros((1, 2), np.float32)
VN = np.array(VN, dtype=np.float32) if VN else np.zeros((1, 3), np.float32)

# Recentraliza: chao em y=0, centro em x/z = 0
mn, mx = V.min(0), V.max(0)
print("bbox", mn, mx)
center = (mn + mx) / 2
offset = np.array([-center[0], -mn[1], -center[2]], np.float32)

bin_parts, buffer_views, accessors, meshes_prims, materials, images, textures = [], [], [], [], [], [], []
img_index = {}
byte_len = 0


def add_view(data, target):
    global byte_len
    pad = (-len(data)) % 4
    bin_parts.append(data + b"\0" * pad)
    buffer_views.append({"buffer": 0, "byteOffset": byte_len, "byteLength": len(data), "target": target})
    byte_len += len(data) + pad
    return len(buffer_views) - 1


os.makedirs(os.path.join(out_dir, "tex"), exist_ok=True)
for mat, tris in groups.items():
    arr = np.array(tris, dtype=np.int64)
    uniq, inv = np.unique(arr, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    pos = V[uniq[:, 0] - 1] + offset
    uv = VT[np.clip(uniq[:, 1] - 1, 0, None)].copy()
    uv[:, 1] = 1.0 - uv[:, 1]
    has_n = (uniq[:, 2] > 0).all() and len(VN) > 1
    idx = inv.astype(np.uint32)
    pv = add_view(pos.astype(np.float32).tobytes(), 34962)
    accessors.append({"bufferView": pv, "componentType": 5126, "count": len(pos), "type": "VEC3",
                      "min": pos.min(0).tolist(), "max": pos.max(0).tolist()})
    attrs = {"POSITION": len(accessors) - 1}
    tv = add_view(uv.astype(np.float32).tobytes(), 34962)
    accessors.append({"bufferView": tv, "componentType": 5126, "count": len(uv), "type": "VEC2"})
    attrs["TEXCOORD_0"] = len(accessors) - 1
    if has_n:
        nv = VN[uniq[:, 2] - 1]
        nv = nv / np.maximum(np.linalg.norm(nv, axis=1, keepdims=True), 1e-8)
        nvw = add_view(nv.astype(np.float32).tobytes(), 34962)
        accessors.append({"bufferView": nvw, "componentType": 5126, "count": len(nv), "type": "VEC3"})
        attrs["NORMAL"] = len(accessors) - 1
    iv = add_view(idx.tobytes(), 34963)
    accessors.append({"bufferView": iv, "componentType": 5125, "count": len(idx), "type": "SCALAR"})

    m = {"name": mat, "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.6}, "doubleSided": True}
    t = tex_for(mat)
    if t and os.path.exists(os.path.join(tex_dir, t)):
        if t not in img_index:
            shutil.copy(os.path.join(tex_dir, t), os.path.join(out_dir, "tex", t))
            images.append({"uri": "tex/" + t})
            textures.append({"source": len(images) - 1})
            img_index[t] = len(textures) - 1
        m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": img_index[t]}
    if mat in COLORS:
        m["pbrMetallicRoughness"]["baseColorFactor"] = COLORS[mat]
    if "trans" in mat or mat == "fkn_grades_marc2":
        m["alphaMode"] = "BLEND" if mat == "fkn_tori_volks_vd__trans_" else "MASK"
    if mat == "fkn_tori_volks":
        m["pbrMetallicRoughness"]["roughnessFactor"] = 0.35
    materials.append(m)
    meshes_prims.append({"attributes": attrs, "indices": len(accessors) - 1, "material": len(materials) - 1})
    print(f"{mat:32s} tris={len(idx)//3:7d} verts={len(pos):7d} tex={t}")

binname = os.path.splitext(os.path.basename(out_path))[0] + ".bin"
with open(os.path.join(out_dir, binname), "wb") as f:
    for p in bin_parts:
        f.write(p)
gltf = {
    "asset": {"version": "2.0", "generator": "obj2gltf.py"},
    "scene": 0, "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "MarcopoloTorino"}],
    "meshes": [{"primitives": meshes_prims}],
    "materials": materials, "images": images, "textures": textures,
    "buffers": [{"uri": binname, "byteLength": byte_len}],
    "bufferViews": buffer_views, "accessors": accessors,
}
with open(out_path, "w") as f:
    json.dump(gltf, f)
print("ok", out_path)
