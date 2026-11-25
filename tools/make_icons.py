"""Gera icone e splash do app Android a partir de uma imagem do onibus (PNG com transparencia).
Uso: python3 -I tools/make_icons.py <onibus.png> <android/app/src/main/res>"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
bus_png, res = sys.argv[1:3]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
bus = Image.open(bus_png).convert("RGBA"); bus = bus.crop(bus.getbbox())

def bg(w, h):
    im = Image.new("RGBA", (w, h)); d = ImageDraw.Draw(im)
    for y in range(h):  # degrade ceu do Rio
        t = y / h; d.line([(0, y), (w, y)], fill=(int(22 + 60 * t), int(64 + 110 * t), int(107 + 120 * t), 255))
    # morro estilizado (Pao de Acucar)
    d.ellipse([w * 0.55, h * 0.38, w * 1.05, h * 1.1], fill=(46, 92, 60, 255))
    d.ellipse([w * 0.30, h * 0.52, w * 0.70, h * 1.2], fill=(58, 112, 70, 255))
    d.rectangle([0, h * 0.78, w, h], fill=(60, 60, 64, 255))
    d.rectangle([0, h * 0.86, w, h * 0.88], fill=(255, 210, 63, 255))
    return im

def icon(size, pad=0.08, text=True):
    im = bg(size, size); b = bus.copy(); bw = int(size * (1 - 2 * pad)); bh = int(b.height * bw / b.width)
    b = b.resize((bw, bh), Image.LANCZOS); im.alpha_composite(b, (int(size * pad), int(size * 0.88 - bh)))
    if text:
        d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, int(size * 0.2))
        d.text((size / 2, size * 0.2), "RIO", font=f, anchor="mm", fill=(255, 210, 63, 255), stroke_width=max(1, size // 60), stroke_fill=(0, 0, 0, 255))
    return im

sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for k, s in sizes.items():
    d = os.path.join(res, f"mipmap-{k}")
    ic = icon(s * 4).resize((s, s), Image.LANCZOS)
    ic.convert("RGB").save(os.path.join(d, "ic_launcher.png"))
    m = Image.new("L", (s, s), 0); ImageDraw.Draw(m).ellipse([0, 0, s - 1, s - 1], fill=255)
    r = Image.new("RGBA", (s, s)); r.paste(ic, (0, 0), m); r.save(os.path.join(d, "ic_launcher_round.png"))
    fg = int(s * 2.25); f = icon(fg * 2, pad=0.2).resize((fg, fg), Image.LANCZOS); f.save(os.path.join(d, "ic_launcher_foreground.png"))

def splash(w, h):
    im = bg(w, h); b = bus.copy(); bh = int(h * 0.42); bw = int(b.width * bh / b.height); b = b.resize((bw, bh), Image.LANCZOS)
    im.alpha_composite(b, ((w - bw) // 2, int(h * 0.86) - bh))
    d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, int(h * 0.13))
    d.text((w / 2, h * 0.2), "ÔNIBUS RIO 3D", font=f, anchor="mm", fill=(255, 255, 255, 255), stroke_width=max(2, h // 120), stroke_fill=(0, 0, 0, 255))
    return im.convert("RGB")

for folder in os.listdir(res):
    p = os.path.join(res, folder, "splash.png")
    if folder.startswith("drawable") and os.path.exists(p):
        w, h = Image.open(p).size; splash(w, h).save(p)
print("ok")
