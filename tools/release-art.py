#!/usr/bin/env python3
"""Иконки, фавикон и сниппет для ВК и ОК из готовых фото блюд (img/photo, Higgsfield) + название кодом (Pillow).
Запуск из корня репозитория:  python3 -I tools/release-art.py
Кладёт в release/vk/: icons/icon-576|278|150|75.png, favicon-32.png, snippet-1120x630.png.
Иконка — без текста (требование площадки); название — только на сниппете."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PH = os.path.join(ROOT, "img", "photo", "full")
OUT = os.path.join(ROOT, "release", "vk")
os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)

RED, GREEN, GOLD, CREAM = (158, 43, 37), (46, 94, 69), (217, 164, 65), (255, 246, 228)
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT_S = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def photo(name):
    return Image.open(os.path.join(PH, name + ".webp")).convert("RGB")


def crop_to(im, w, h, cx=0.5, cy=0.5):
    """Вырезать область w:h нужной пропорции вокруг центра (cx, cy) и подогнать размер."""
    iw, ih = im.size
    k = max(w / iw, h / ih)
    nw, nh = int(iw * k + 0.5), int(ih * k + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    x = min(max(int(nw * cx - w / 2), 0), nw - w)
    y = min(max(int(nh * cy - h / 2), 0), nh - h)
    return im.crop((x, y, x + w, y + h))


def font(path, size):
    return ImageFont.truetype(path, size)


# ---------- иконка: оливье в хрустальной салатнице, без текста ----------
def icon_master():
    n = 1152  # рисуем вдвое крупнее и сжимаем: ровнее края
    base = crop_to(photo("olivier"), n, n, 0.5, 0.5)
    # мягкая тёплая рамка-виньетка, чтобы иконка не расплывалась на фоне ленты ВК
    v = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(v)
    d.rectangle((0, 0, n, n), fill=70)
    d.ellipse((-n * 0.15, -n * 0.15, n * 1.15, n * 1.15), fill=0)
    v = v.filter(ImageFilter.GaussianBlur(90))
    dark = Image.new("RGB", (n, n), (70, 18, 16))
    base = Image.composite(dark, base, v)
    return base


def save_icons():
    m = icon_master()
    for s in (576, 278, 150, 75):
        m.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, "icons", "icon-%d.png" % s), optimize=True)


# ---------- фавикон 32×32: красный фон, зелёная ёлка, золотая звезда ----------
def save_favicon():
    k = 16  # рисуем в 512 и сжимаем
    n = 32 * k
    im = Image.new("RGB", (n, n), RED)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, n - 1, n - 1), radius=7 * k, fill=RED)

    def tier(top, bot, half):
        d.polygon([(16 * k, top * k), ((16 - half) * k, bot * k), ((16 + half) * k, bot * k)], fill=(86, 160, 118))

    tier(5, 14, 6)
    tier(10, 20, 8)
    tier(15, 26, 10)
    d.rectangle((14 * k, 26 * k, 18 * k, 29.5 * k), fill=(122, 74, 42))
    # звезда
    cx, cy, R, r = 16 * k, 4.2 * k, 3.2 * k, 1.35 * k
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    d.polygon(pts, fill=GOLD)
    im.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, "favicon-32.png"), optimize=True)


# ---------- сниппет 1120×630: слева название, справа два фото ----------
def text_shadow(d, xy, txt, f, fill, off=3):
    x, y = xy
    d.text((x + off, y + off), txt, font=f, fill=(60, 12, 10))
    d.text((x, y), txt, font=f, fill=fill)


def save_snippet():
    W, H, PW = 1120, 630, 600
    im = Image.new("RGB", (W, H), RED)
    # фото справа: два кадра друг над другом
    r1 = crop_to(photo("olivier"), W - PW, H // 2, 0.5, 0.45)
    r2 = crop_to(photo("buche"), W - PW, H - H // 2, 0.5, 0.5)
    im.paste(r1, (PW, 0))
    im.paste(r2, (PW, H // 2))
    d = ImageDraw.Draw(im)
    d.rectangle((PW, H // 2 - 3, W, H // 2 + 3), fill=CREAM)
    # красная плашка слева, плавно переходящая в фото
    panel = Image.new("RGB", (PW + 80, H), RED)
    # лёгкий градиент для глубины
    g = Image.new("L", (1, H))
    for y in range(H):
        g.putpixel((0, y), int(70 * y / H))
    g = g.resize((PW + 80, H))
    panel = Image.composite(Image.new("RGB", (PW + 80, H), (96, 22, 20)), panel, g)
    mask = Image.new("L", (PW + 80, H), 255)
    md = ImageDraw.Draw(mask)
    for i in range(80):
        md.line([(PW + i, 0), (PW + i, H)], fill=int(255 * (1 - i / 80)))
    im.paste(panel, (0, 0), mask)
    d = ImageDraw.Draw(im)
    # узор-гирлянда сверху слева
    for i, x in enumerate(range(40, PW - 10, 56)):
        d.ellipse((x, 28, x + 16, 44), fill=GOLD if i % 2 == 0 else (86, 160, 118))
    d.line([(36, 24), (PW - 20, 24)], fill=CREAM, width=2)
    fh = font(FONT_B, 74)
    text_shadow(d, (46, 120), "Новогодний", fh, CREAM)
    text_shadow(d, (46, 206), "стол", fh, (255, 214, 130))
    fs = font(FONT_S, 40)
    d.text((50, 346), "Рецепты по шагам", font=fs, fill=CREAM)
    fm = font(FONT_R, 27)
    d.text((50, 410), "40 рецептов  ·  фото каждого шага", font=fm, fill=(255, 232, 200))
    d.text((50, 452), "меню и список покупок", font=fm, fill=(255, 232, 200))
    # кнопка-плашка
    d.rounded_rectangle((46, 520, 46 + 420, 520 + 66), radius=33, fill=GOLD)
    fb = font(FONT_S, 31)
    tw = d.textlength("Выбрать рецепт", font=fb)
    d.text((46 + (420 - tw) / 2, 520 + 14), "Выбрать рецепт", font=fb, fill=(70, 20, 16))
    im.save(os.path.join(OUT, "snippet-1120x630.png"), optimize=True)


if __name__ == "__main__":
    save_icons()
    save_favicon()
    save_snippet()
    print("готово:", OUT)
