"""Забирает значки, которые пользователи загрузили в альбом сообщества ВКонтакте,
и добавляет их в catalog_src/ (запускается GitHub Actions по расписанию).

Подпись к фото: «Название / Серия / Год», например «Тула / Гербы городов / 1978».
Серия и год необязательны. Фото без подписи пропускаются.
Если фото удалить из альбома, значок пропадёт из каталога при следующем обновлении.

Переменные окружения:
  VK_SERVICE_TOKEN  сервисный ключ доступа приложения (секрет репозитория)
  VK_GROUP_ID       ID сообщества (по умолчанию 243034935)
  VK_ALBUM_ID       ID альбома
Выход: код 0 — каталог изменился, код 3 — изменений нет.
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

SRC = "catalog_src"
API = "https://api.vk.com/method/"
V = "5.199"
PREFIX = "vk-"

token = os.environ["VK_SERVICE_TOKEN"]
group = os.environ.get("VK_GROUP_ID", "243034935")
album = os.environ["VK_ALBUM_ID"]


def call(method, **params):
    params.update(access_token=token, v=V)
    url = API + method + "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.load(r)
        if "error" in data:
            if data["error"].get("error_code") == 6:  # слишком много запросов
                time.sleep(1)
                continue
            raise RuntimeError(f"VK API {method}: {data['error'].get('error_msg')}")
        return data["response"]
    raise RuntimeError("VK API: превышен лимит запросов")


def parse_caption(text):
    text = (text or "").strip()
    if not text:
        return None
    parts = [p.strip() for p in re.split(r"[/|\n]", text) if p.strip()]
    name = parts[0][:60]
    series = parts[1][:40] if len(parts) > 1 and not re.fullmatch(r"\d{4}", parts[1]) else None
    year = None
    for p in parts[1:]:
        m = re.fullmatch(r"(1[7-9]\d\d|20\d\d)( ?г\.?)?", p)
        if m:
            year = int(m.group(1))
    return {"name": name, "series": series, "year": year}


def biggest(sizes):
    return max(sizes, key=lambda s: s.get("width", 0) * s.get("height", 0))["url"]


def main():
    photos, offset = [], 0
    while True:
        r = call("photos.get", owner_id=f"-{group}", album_id=album, count=1000, offset=offset, photo_sizes=1)
        photos += r["items"]
        offset += len(r["items"])
        if offset >= r["count"] or not r["items"]:
            break

    meta_path = os.path.join(SRC, "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else []
    own = [m for m in meta if not m["id"].startswith(PREFIX)]  # значки из альбомов владельца
    before = {m["id"]: m for m in meta if m["id"].startswith(PREFIX)}

    fresh = []
    for ph in photos:
        info = parse_caption(ph.get("text"))
        if not info:
            print(f"  пропуск {ph['id']}: нет подписи")
            continue
        bid = f"{PREFIX}{ph['id']}"
        path = os.path.join(SRC, f"{bid}.jpg")
        if not os.path.exists(path):
            urllib.request.urlretrieve(biggest(ph["sizes"]), path)
            print(f"  новый: {info['name']}")
        entry = {"id": bid, **{k: v for k, v in info.items() if v}, "source": "vk"}
        fresh.append(entry)

    # удалённые из альбома — убираем
    alive = {e["id"] for e in fresh}
    for bid in before:
        if bid not in alive:
            for ext in (".jpg", ".png"):
                p = os.path.join(SRC, bid + ext)
                if os.path.exists(p):
                    os.remove(p)
            print(f"  удалён: {before[bid].get('name')}")

    new_meta = own + fresh
    digest = lambda m: hashlib.sha1(json.dumps(m, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if digest(new_meta) == digest(meta):
        print("Альбом не изменился")
        sys.exit(3)
    json.dump(new_meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"Каталог: {len(own)} своих + {len(fresh)} от пользователей")


if __name__ == "__main__":
    main()
