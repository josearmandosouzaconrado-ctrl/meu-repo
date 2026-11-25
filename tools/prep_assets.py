"""Gera assets do jogo a partir dos pacotes originais.
Uso: python3 -I tools/prep_assets.py <pasta_ruas_png> <bus.glb> <saida public/assets>"""
import sys, os, shutil
from PIL import Image
src, glb, out = sys.argv[1:4]
os.makedirs(out + "/ruas", exist_ok=True)
names = {"rua_completa.png": "rua_amarela", "rua_completa2.png": "rua_branca", "rua_completa3.png": "rua_paralelepipedo",
         "rua_completa_corredor.png": "rua_corredor", "rua_completa_faixa.png": "rua_faixa"}
for f, n in names.items():
    im = Image.open(os.path.join(src, f)).convert("RGB")
    im.resize((512, 512), Image.LANCZOS).save(f"{out}/ruas/{n}.jpg", quality=86)
# calcada (lado esquerdo da textura) como ladrilho para o chao das quadras
im = Image.open(os.path.join(src, "rua_completa.png")).convert("RGB")
w, h = im.size
crop = im.crop((4, 0, int(w * 0.215), h))
crop.resize((256, 512), Image.LANCZOS).save(f"{out}/ruas/calcada.jpg", quality=86)
shutil.copy(glb, out + "/onibus_torino.glb")
print("ok")
