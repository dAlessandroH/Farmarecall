#!/usr/bin/env python3
"""Actualiza la lista de archivos offline (ASSETS) de sw.js y, opcionalmente, la versión
(VERSION de sw.js y APP_VERSION de src/version.js, que se muestra en la app).

Uso:
    python3 scripts/update_precache.py            # solo la lista
    python3 scripts/update_precache.py 1.0.1      # lista + nueva versión (los dispositivos se actualizan)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"
VERSION_JS = ROOT / "src" / "version.js"


def app_files():
    files = ["index.html", "manifest.json"]
    files += sorted(str(p.relative_to(ROOT)) for p in (ROOT / "src").rglob("*") if p.suffix in {".js", ".css"})
    files += sorted(str(p.relative_to(ROOT)) for p in (ROOT / "icons").iterdir() if p.suffix in {".png", ".svg"})
    files += sorted(str(p.relative_to(ROOT)) for p in (ROOT / "ejemplos").glob("*.csv"))  # "Probar con el ejemplo" sin conexión
    return files


def main():
    source = SW.read_text(encoding="utf-8")
    assets = app_files()
    block = "const ASSETS = [\n" + ",\n".join(f"  {json.dumps(path)}" for path in assets) + "\n];"
    source, found = re.subn(r"const ASSETS = \[[\s\S]*?\];", lambda _: block, source, count=1)
    if not found:
        sys.exit("No se encontró const ASSETS en sw.js")
    if len(sys.argv) > 1:
        source = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{sys.argv[1]}';", source, count=1)
        version_js = VERSION_JS.read_text(encoding="utf-8")
        VERSION_JS.write_text(re.sub(r"APP_VERSION = '[^']*';", f"APP_VERSION = '{sys.argv[1]}';", version_js), encoding="utf-8")
    SW.write_text(source, encoding="utf-8")
    version = re.search(r"const VERSION = '([^']*)';", source).group(1)
    print(f"sw.js: {len(assets)} archivos, versión {version}")


if __name__ == "__main__":
    main()
