#!/usr/bin/env python3
"""Baixa o modelo de reconhecimento de voz pt-BR do Vosk.

O modelo é distribuído pela Alpha Cephei sob licença Apache 2.0 e roda 100%
offline depois de baixado. Nada de áudio sai da máquina.

Uso:
    python python/download_model.py            # small (~31 MB, recomendado)
    python python/download_model.py --large    # ~1,5 GB, muito mais preciso
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS_DIR = HERE / "models"

MODELS = {
    "small": (
        "vosk-model-small-pt-0.3",
        "https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip",
        "~31 MB",
    ),
    "large": (
        "vosk-model-pt-fb-v0.1.1-20220516_2113",
        "https://alphacephei.com/vosk/models/vosk-model-pt-fb-v0.1.1-20220516_2113.zip",
        "~1,5 GB",
    ),
}


def progress(done: int, total: int) -> None:
    if total <= 0:
        sys.stdout.write(f"\r  baixado: {done / 1_048_576:.1f} MB")
    else:
        pct = done * 100 / total
        bar = "█" * int(pct / 2.5) + "·" * (40 - int(pct / 2.5))
        sys.stdout.write(f"\r  [{bar}] {pct:5.1f}%  {done / 1_048_576:.1f} MB")
    sys.stdout.flush()
    # Linha extra para o Electron conseguir ler o progresso.
    if total > 0:
        print(f"\nPROGRESS {done * 100 / total:.1f}", file=sys.stderr, flush=True)


def download(url: str, target: Path) -> None:
    with urllib.request.urlopen(url) as response:  # noqa: S310 - URL fixa e confiável
        total = int(response.headers.get("Content-Length", 0))
        done = 0
        chunk_size = 1 << 18
        with target.open("wb") as handle:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                handle.write(chunk)
                done += len(chunk)
                progress(done, total)
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Baixa o modelo Vosk pt-BR")
    parser.add_argument("--large", action="store_true", help="Modelo grande (~1,5 GB)")
    parser.add_argument("--force", action="store_true", help="Rebaixa mesmo se já existir")
    args = parser.parse_args()

    key = "large" if args.large else "small"
    name, url, size = MODELS[key]
    destination = MODELS_DIR / name

    if destination.is_dir() and not args.force:
        print(f"Modelo já instalado em {destination}")
        print("Use --force para baixar de novo.")
        return 0

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Baixando {name} ({size})")
    print(f"  de {url}")

    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "model.zip"
        try:
            download(url, archive)
        except Exception as exc:  # noqa: BLE001
            print(f"\nFalha no download: {exc}", file=sys.stderr)
            return 1

        print("Extraindo...")
        try:
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(MODELS_DIR)
        except Exception as exc:  # noqa: BLE001
            print(f"Falha ao extrair: {exc}", file=sys.stderr)
            return 1

    if not destination.is_dir():
        # Alguns pacotes extraem com nome ligeiramente diferente.
        candidates = [p for p in MODELS_DIR.iterdir() if p.is_dir() and p.name.startswith("vosk-model")]
        if not candidates:
            print("Extraído, mas a pasta do modelo não foi encontrada.", file=sys.stderr)
            return 1
        newest = max(candidates, key=lambda p: p.stat().st_mtime)
        if newest != destination:
            shutil.move(str(newest), str(destination))

    print(f"Pronto: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
