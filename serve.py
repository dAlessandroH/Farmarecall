#!/usr/bin/env python3
"""Servidor local de FarmaRecall. Solo usa la biblioteca estándar de Python (incluida en macOS).

Uso:
    python3 serve.py          # puerto 8000
    python3 serve.py 8080     # otro puerto
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }

    def end_headers(self):
        # El navegador no guarda copias: siempre recibe la versión actual de cada archivo.
        # (El modo sin conexión no depende de esto: lo gestiona sw.js con su propia caché.)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def lan_ip():
    """IP de este Mac en la red local (para abrir la app desde el iPhone)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))  # no envía nada; solo elige la interfaz de red
            return s.getsockname()[0]
        except OSError:
            return None


def main():
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("", PORT), handler) as server:
        ip = lan_ip()
        print("\nFarmaRecall en marcha\n")
        print(f"  En este Mac:   http://localhost:{PORT}")
        if ip:
            print(f"  En tu iPhone:  http://{ip}:{PORT}   (misma red Wi-Fi)")
        print(f"  Pruebas:       http://localhost:{PORT}/tests/")
        print("\nPulsa Ctrl+C para detenerlo.\n")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")


if __name__ == "__main__":
    main()
