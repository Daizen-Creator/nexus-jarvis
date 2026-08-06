#!/usr/bin/env python3
"""Servidor estático opcional para o build do NEXUS.

O projeto não tem backend — isto é apenas uma alternativa a `npm run preview`
para servir a pasta `dist/` (por exemplo, em uma máquina sem Node disponível).

Uso:
    python scripts/serve.py [porta]

O padrão é a porta 4173. Serve em http://localhost:<porta>, que é uma origem
segura, então o reconhecimento de voz do Chrome/Edge continua funcionando.
"""

from __future__ import annotations

import http.server
import os
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
DEFAULT_PORT = 4173


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    """Serve `dist/` e cai no index.html para rotas desconhecidas."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(DIST), **kwargs)  # type: ignore[arg-type]

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):  # type: ignore[no-untyped-def]
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not self.path.startswith("/assets"):
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write("[nexus] %s\n" % (format % args))


def main() -> int:
    if not DIST.is_dir():
        print("dist/ não encontrado. Rode `npm run build` antes.", file=sys.stderr)
        return 1

    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Porta inválida: {sys.argv[1]}", file=sys.stderr)
            return 1

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), SpaHandler) as httpd:
        print(f"NEXUS servindo dist/ em http://localhost:{port}")
        print("Ctrl+C para encerrar.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nEncerrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
