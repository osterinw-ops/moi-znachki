"""Нарезка фото страницы альбома на отдельные значки для каталога.

1) Сетка координат, чтобы разметить значки:
       python3 tools/cut_page.py grid page.jpg            → page.grid.jpg
2) Опишите значки в JSON (box — левый верхний и правый нижний угол в пикселях):
       [{"id": "moskva", "name": "Москва", "series": "Гербы городов", "year": 1970,
         "box": [160, 755, 335, 965]}, ...]
3) Нарезка с вырезанием фона (GrabCut) и добавлением в каталог:
       python3 tools/cut_page.py cut page.jpg page.json catalog_src
   Значки попадают в catalog_src/<id>.png (с прозрачностью), описания — в
   catalog_src/meta.json (существующие записи с тем же id обновляются).
   Дальше: npm run catalog
"""
import json
import os
import sys

import cv2
import numpy as np


def grid(path):
    im = cv2.imread(path)
    h, w = im.shape[:2]
    step = 100
    for x in range(0, w, step):
        cv2.line(im, (x, 0), (x, h), (0, 255, 255), 2)
        cv2.putText(im, str(x), (x + 3, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
    for y in range(0, h, step):
        cv2.line(im, (0, y), (w, y), (0, 255, 255), 2)
        cv2.putText(im, str(y), (3, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
    out = os.path.splitext(path)[0] + ".grid.jpg"
    cv2.imwrite(out, im)
    print(out)


def cut(page, spec, out_dir):
    im = cv2.imread(page)
    items = json.load(open(spec, encoding="utf-8"))
    os.makedirs(out_dir, exist_ok=True)
    meta_path = os.path.join(out_dir, "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else []
    by_id = {m["id"]: m for m in meta}
    for it in items:
        x0, y0, x1, y1 = it["box"]
        pad = int(0.12 * max(x1 - x0, y1 - y0))
        X0, Y0 = max(0, x0 - pad), max(0, y0 - pad)
        X1, Y1 = min(im.shape[1], x1 + pad), min(im.shape[0], y1 + pad)
        crop = im[Y0:Y1, X0:X1].copy()
        mask = np.zeros(crop.shape[:2], np.uint8)
        bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
        cv2.grabCut(crop, mask, (x0 - X0, y0 - Y0, x1 - x0, y1 - y0), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
        fg = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
        n, lbl, st, _ = cv2.connectedComponentsWithStats(fg)
        if n > 1:
            fg = np.where(lbl == 1 + np.argmax(st[1:, 4]), 255, 0).astype(np.uint8)
        cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        fg[:] = 0
        cv2.drawContours(fg, cnts, -1, 255, cv2.FILLED)
        cv2.imwrite(os.path.join(out_dir, f"{it['id']}.png"), np.dstack([crop, fg]))
        entry = {k: v for k, v in it.items() if k != "box"}
        by_id[it["id"]] = {**by_id.get(it["id"], {}), **entry}
        print(f"  {it['id']}")
    json.dump(list(by_id.values()), open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"Готово: {len(items)} значков → {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "grid":
        grid(sys.argv[2])
    elif len(sys.argv) >= 5 and sys.argv[1] == "cut":
        cut(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
