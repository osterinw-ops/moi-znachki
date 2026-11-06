"""Конвейер подготовки каталога значков (запускается у вас на ПК или в GitHub Actions).

Вход:  catalog_src/meta.json  — [{id, name, series, year, ...}]
       catalog_src/<id>.png|jpg — фото/скан значка (желательно на однотонном фоне
                                  или PNG с прозрачностью)
Выход: public/catalog/catalog.json   — метаданные, палитры, SVG-контуры
       public/catalog/img/<id>.webp  — цветное изображение без фона (для «есть»)
       build/ref/<id>.png            — эталоны для расчёта эмбеддингов (tools/embed.ts)

Шаги на каждый значок:
  1. Детекция: отделяем значок от фона (альфа-канал или расстояние до цвета фона).
  2. Выравнивание: центрируем по описанной окружности, приводим к 512×512.
  3. Палитра: k-means в пространстве Lab → основные цвета и их доли.
  4. Векторизация: границы цветовых областей → контуры → упрощение
     (Дуглас–Пекер) → сглаженные SVG-пути (квадратичные кривые).
"""
import datetime
import json
import os
import sys

import cv2
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else "catalog_src"
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/catalog"
REF = "build/ref"
SIZE = 512

os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
os.makedirs(REF, exist_ok=True)


def load(path_base):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = path_base + ext
        if os.path.exists(p):
            img = cv2.imread(p, cv2.IMREAD_UNCHANGED)
            if img.ndim == 2:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            return img
    raise FileNotFoundError(path_base)


def foreground_mask(img):
    """1. Детекция значка на фото. Если фон «грязный» и значок не выделился —
    берём центральный круг (пользователи обычно снимают значок по центру)."""
    try:
        mask, big = _foreground_mask(img)
        share = cv2.contourArea(big) / (img.shape[0] * img.shape[1])
        if 0.04 < share < 0.92:
            return mask, big
    except ValueError:
        pass
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    cv2.circle(mask, (w // 2, h // 2), int(min(h, w) * 0.45), 255, cv2.FILLED)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return mask, cnts[0]


def _foreground_mask(img):
    if img.shape[2] == 4 and img[:, :, 3].min() < 250:
        mask = (img[:, :, 3] > 128).astype(np.uint8) * 255
    else:
        bgr = img[:, :, :3]
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        h, w = lab.shape[:2]
        b = max(4, min(h, w) // 40)
        border = np.concatenate([lab[:b].reshape(-1, 3), lab[-b:].reshape(-1, 3),
                                 lab[:, :b].reshape(-1, 3), lab[:, -b:].reshape(-1, 3)])
        bg = np.median(border, axis=0)
        spread = np.percentile(np.linalg.norm(border - bg, axis=1), 95)
        dist = np.linalg.norm(lab - bg, axis=2)
        # тень: тот же оттенок, что у фона, но темнее — считаем фоном
        dab = np.linalg.norm(lab[:, :, 1:] - bg[1:], axis=2)
        shadow = (dab < 10) & (lab[:, :, 0] < bg[0]) & (lab[:, :, 0] > bg[0] * 0.6)
        mask = ((dist > max(18.0, spread * 2.5)) & ~shadow).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        raise ValueError("значок не найден")
    # светлые детали рисунка могут «разрезать» значок на куски — собираем все
    # крупные куски, склеиваем узкие разрывы и заливаем внутренние дыры
    top = max(cv2.contourArea(c) for c in cnts)
    union = np.zeros_like(mask)
    cv2.drawContours(union, [c for c in cnts if cv2.contourArea(c) > top * 0.01], -1, 255, cv2.FILLED)
    union = cv2.morphologyEx(union, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    cnts, _ = cv2.findContours(union, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    big = max(cnts, key=cv2.contourArea)
    filled = np.zeros_like(mask)
    cv2.drawContours(filled, [big], -1, 255, cv2.FILLED)
    return filled, big


def align(img, mask, contour):
    """2. Выравнивание: квадрат вокруг описанной окружности → SIZE×SIZE."""
    (cx, cy), r = cv2.minEnclosingCircle(contour)
    r *= 1.04
    M = np.float32([[SIZE / (2 * r), 0, SIZE / 2 - cx * SIZE / (2 * r)],
                    [0, SIZE / (2 * r), SIZE / 2 - cy * SIZE / (2 * r)]])
    bgr = cv2.warpAffine(img[:, :, :3], M, (SIZE, SIZE), flags=cv2.INTER_AREA, borderValue=(255, 255, 255))
    m = cv2.warpAffine(mask, M, (SIZE, SIZE), flags=cv2.INTER_LINEAR)
    m = cv2.GaussianBlur(m, (3, 3), 0)
    return bgr, m


def palette(bgr, mask, k=6):
    """3. Основные цвета значка."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    px = lab[mask > 128].astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, labels, centers = cv2.kmeans(px, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.ravel(), minlength=k) / len(labels)
    order = np.argsort(-counts)
    out = []
    for i in order:
        if counts[i] < 0.02:
            continue
        c = cv2.cvtColor(np.uint8([[centers[i]]]), cv2.COLOR_LAB2BGR)[0, 0]
        out.append({"hex": "#%02x%02x%02x" % (c[2], c[1], c[0]), "share": round(float(counts[i]), 3)})
    # карта меток для векторизации
    full = np.full(mask.shape, -1, np.int32)
    full[mask > 128] = labels.ravel()
    return out, full, k


def smooth_path(pts):
    """Замкнутый контур → сглаженный SVG-путь через середины отрезков."""
    pts = pts.reshape(-1, 2).astype(float)
    n = len(pts)
    if n < 3:
        return ""
    mids = (pts + np.roll(pts, -1, axis=0)) / 2
    d = [f"M{mids[-1][0]:.0f} {mids[-1][1]:.0f}"]
    for i in range(n):
        d.append(f"Q{pts[i][0]:.0f} {pts[i][1]:.0f} {mids[i][0]:.0f} {mids[i][1]:.0f}")
    return "".join(d) + "Z"


def vectorize(labels, k, mask):
    """4. SVG-контур: внешний силуэт + границы цветовых областей."""
    min_area = SIZE * SIZE * 0.003
    paths = []
    outer, _ = cv2.findContours((mask > 128).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    outer_d = ""
    if outer:
        big = max(outer, key=cv2.contourArea)
        outer_d = smooth_path(cv2.approxPolyDP(big, 1.5, True))
    lab_map = labels.copy()
    for lbl in range(k):
        region = (lab_map == lbl).astype(np.uint8) * 255
        region = cv2.medianBlur(region, 9)
        cnts, _ = cv2.findContours(region, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        for c in cnts:
            if cv2.contourArea(c) < min_area:
                continue
            d = smooth_path(cv2.approxPolyDP(c, 2.0, True))
            if d:
                paths.append(d)
    inner = "".join(f'<path d="{d}"/>' for d in paths)
    return (
        f'<path d="{outer_d}" stroke-width="10"/>'
        f'<g stroke-width="4">{inner}</g>'
    )


def main():
    with open(os.path.join(SRC, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    series = []
    badges = []
    for item in meta:
        bid = item["id"]
        img = load(os.path.join(SRC, bid))
        mask, contour = foreground_mask(img)
        bgr, m = align(img, mask, contour)
        pal, labels, k = palette(bgr, m)
        contour_svg = vectorize(labels, k, m)

        rgba = np.dstack([bgr, m])
        cv2.imwrite(os.path.join(OUT, "img", f"{bid}.webp"), cv2.resize(rgba, (320, 320), interpolation=cv2.INTER_AREA),
                    [cv2.IMWRITE_WEBP_QUALITY, 85])
        # эталон для эмбеддингов: значок на сером фоне, 256 px
        ref = bgr.astype(np.float32) * (m[..., None] / 255.0) + 128 * (1 - m[..., None] / 255.0)
        cv2.imwrite(os.path.join(REF, f"{bid}.png"), cv2.resize(ref.astype(np.uint8), (256, 256), interpolation=cv2.INTER_AREA))

        if item.get("series") and item["series"] not in series:
            series.append(item["series"])
        badges.append({**item, "img": f"img/{bid}.webp", "palette": pal, "contour": contour_svg})
        print(f"  {bid}: палитра {len(pal)} цв., контур {len(contour_svg) // 1024} КБ")

    catalog = {
        "version": datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S"),
        "contourViewBox": f"0 0 {SIZE} {SIZE}",
        "series": series,
        "badges": badges,
    }
    with open(os.path.join(OUT, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Готово: {len(badges)} значков → {OUT}/catalog.json")


if __name__ == "__main__":
    main()
