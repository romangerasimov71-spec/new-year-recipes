#!/usr/bin/env python3
"""Сборка архива для хостинга ВК: release/vk/build.zip (index.html — в корне архива).
Кладёт только то, что нужно приложению: index.html, css/, js/, img/photo/, playgama-bridge.js,
playgama-bridge-config.json. Без tools, docs, release, .claude, .git.
Запуск из корня репозитория:  python3 -I tools/build-zip.py
Можно собрать папку для vk-miniapps-deploy:  python3 -I tools/build-zip.py --dir build"""
import os
import sys
import zipfile
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["index.html", "playgama-bridge.js", "playgama-bridge-config.json"]
DIRS = ["css", "js", "img"]
FORBIDDEN_EXT = {".mp3", ".ogg", ".wav", ".mp4", ".webm", ".m4a"}  # хостинг ВК: аудио и видео нельзя


def collect():
    out = list(FILES)
    for d in DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                if n.startswith(".") or os.path.splitext(n)[1].lower() in FORBIDDEN_EXT:
                    continue
                out.append(os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, "/"))
    return sorted(out)


def main():
    files = collect()
    for f in files:
        assert os.path.isfile(os.path.join(ROOT, f)), f
    if "--dir" in sys.argv:
        dst = os.path.abspath(sys.argv[sys.argv.index("--dir") + 1])
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        for f in files:
            os.makedirs(os.path.dirname(os.path.join(dst, f)) or dst, exist_ok=True)
            shutil.copy2(os.path.join(ROOT, f), os.path.join(dst, f))
        print("папка:", dst, len(files), "файлов")
        return
    out = os.path.join(ROOT, "release", "vk", "build.zip")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            zi = zipfile.ZipInfo(f, date_time=(2026, 11, 13, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            with open(os.path.join(ROOT, f), "rb") as fh:
                z.writestr(zi, fh.read())
    mb = os.path.getsize(out) / 1048576
    print("%s: %d файлов, %.1f МБ" % (out, len(files), mb))
    assert mb < 300, "архив больше лимита ВК (300 МБ)"


if __name__ == "__main__":
    main()
