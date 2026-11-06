"""Синтетические «фото с телефона» для проверки распознавания:
поворот, наклон, неточное кадрирование, чужой фон, свет, шум, размытие, JPEG."""
import glob
import os
import random

import cv2
import numpy as np

random.seed(7)
np.random.seed(7)
SRC = "public/catalog/img"
OUT = "build/test"
VARIANTS = int(os.environ.get("VARIANTS", 10))
os.makedirs(OUT, exist_ok=True)
S = 256


def background():
    kind = random.choice(["wood", "fabric", "gradient", "desk"])
    if kind == "wood":
        base = np.array([random.randint(60, 120), random.randint(100, 150), random.randint(150, 200)], np.float32)
        y = np.arange(S * 2)[:, None]
        x = np.arange(S * 2)[None, :]
        stripes = np.sin((x + 8 * np.sin(y / 23.0)) / random.uniform(4, 9)) * 18
        img = base[None, None, :] + stripes[..., None]
    elif kind == "fabric":
        base = np.random.randint(40, 220, 3).astype(np.float32)
        img = base[None, None, :] + np.random.normal(0, 14, (S * 2, S * 2, 1))
    elif kind == "gradient":
        a = np.random.randint(0, 255, 3).astype(np.float32)
        b = np.random.randint(0, 255, 3).astype(np.float32)
        t = np.linspace(0, 1, S * 2)[:, None, None]
        img = np.broadcast_to(a * (1 - t) + b * t, (S * 2, S * 2, 3)).copy()
    else:
        img = np.full((S * 2, S * 2, 3), random.randint(170, 240), np.float32)
        for _ in range(4):
            c = tuple(int(v) for v in np.random.randint(0, 255, 3))
            p = tuple(int(v) for v in np.random.randint(0, S * 2, 2))
            cv2.circle(img, p, random.randint(10, 60), c, -1)
    return np.clip(img, 0, 255).astype(np.uint8)


def photo(rgba):
    bg = background()
    H = S * 2
    size = int(S * random.uniform(0.85, 1.05))  # насколько значок заполняет кадр
    badge = cv2.resize(rgba, (size, size), interpolation=cv2.INTER_AREA)
    M = cv2.getRotationMatrix2D((size / 2, size / 2), random.uniform(0, 360), 1.0)
    badge = cv2.warpAffine(badge, M, (size, size), borderValue=(0, 0, 0, 0))
    # перспективный наклон
    d = size * random.uniform(0, 0.08)
    src = np.float32([[0, 0], [size, 0], [size, size], [0, size]])
    dst = src + np.float32([[random.uniform(-d, d), random.uniform(-d, d)] for _ in range(4)])
    P = cv2.getPerspectiveTransform(src, dst)
    badge = cv2.warpPerspective(badge, P, (size, size), borderValue=(0, 0, 0, 0))
    ox = H // 2 - size // 2 + int(S * random.uniform(-0.07, 0.07))
    oy = H // 2 - size // 2 + int(S * random.uniform(-0.07, 0.07))
    # тень
    a = badge[:, :, 3:].astype(np.float32) / 255
    sh = cv2.GaussianBlur(a, (0, 0), 6)[..., None] if a.ndim == 3 else None
    region = bg[oy:oy + size, ox:ox + size].astype(np.float32)
    region *= 1 - 0.35 * np.roll(np.roll(sh, 6, 0), 6, 1)
    region = region * (1 - a) + badge[:, :, :3].astype(np.float32) * a
    bg[oy:oy + size, ox:ox + size] = np.clip(region, 0, 255).astype(np.uint8)
    img = bg[H // 2 - S // 2:H // 2 + S // 2, H // 2 - S // 2:H // 2 + S // 2].astype(np.float32)
    # свет: баланс белого, яркость, контраст, блик
    img *= np.array([random.uniform(0.85, 1.15), 1.0, random.uniform(0.85, 1.15)])[None, None, :]
    img = (img - 128) * random.uniform(0.8, 1.15) + 128 + random.uniform(-30, 25)
    gx, gy = np.meshgrid(np.linspace(-1, 1, S), np.linspace(-1, 1, S))
    img += (random.uniform(0, 35) * np.exp(-((gx - random.uniform(-.5, .5)) ** 2 + (gy - random.uniform(-.5, .5)) ** 2) / 0.1))[..., None]
    img = cv2.GaussianBlur(np.clip(img, 0, 255).astype(np.uint8), (0, 0), random.uniform(0.3, 1.6))
    img = np.clip(img + np.random.normal(0, random.uniform(2, 8), img.shape), 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, random.randint(55, 85)])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR)


for p in sorted(glob.glob(os.path.join(SRC, "*.webp"))):
    bid = os.path.splitext(os.path.basename(p))[0]
    rgba = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    for k in range(VARIANTS):
        cv2.imwrite(os.path.join(OUT, f"{bid}__{k}.png"), photo(rgba))
print("ok")
