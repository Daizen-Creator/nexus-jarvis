#!/usr/bin/env python3
"""Autoteste do reconhecimento: transcreve arquivos WAV em vez do microfone.

Serve para validar modelo + reconhecedor em máquinas sem entrada de áudio, e
para medir a qualidade do reconhecimento com frases conhecidas.

Uso:
    python python/selftest.py arquivo1.wav arquivo2.wav ...

Os WAV precisam ser PCM 16 bits, mono. Qualquer taxa de amostragem serve.
"""

from __future__ import annotations

import json
import sys
import wave
from pathlib import Path

from nexus_voice import find_model


def transcribe(path: Path, model) -> tuple[str, float]:  # noqa: ANN001
    from vosk import KaldiRecognizer

    with wave.open(str(path), "rb") as wf:
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
            raise ValueError(f"{path.name}: precisa ser PCM 16 bits mono")

        recognizer = KaldiRecognizer(model, wf.getframerate())
        recognizer.SetWords(True)

        pieces: list[str] = []
        confidences: list[float] = []

        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                if result.get("text"):
                    pieces.append(result["text"])
                    for w in result.get("result", []):
                        confidences.append(float(w.get("conf", 0.0)))

        final = json.loads(recognizer.FinalResult())
        if final.get("text"):
            pieces.append(final["text"])
            for w in final.get("result", []):
                confidences.append(float(w.get("conf", 0.0)))

    text = " ".join(p for p in pieces if p).strip()
    conf = sum(confidences) / len(confidences) if confidences else 0.0
    return text, conf


def main() -> int:
    from vosk import Model, SetLogLevel

    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    SetLogLevel(-1)
    model_path = find_model(None)
    if model_path is None:
        print("Modelo não encontrado. Rode: python python/download_model.py", file=sys.stderr)
        return 1

    print(f"modelo: {model_path.name}\n")
    model = Model(str(model_path))

    failures = 0
    for arg in sys.argv[1:]:
        path = Path(arg)
        if not path.is_file():
            print(f"  {arg}: arquivo não encontrado")
            failures += 1
            continue
        try:
            text, conf = transcribe(path, model)
        except Exception as exc:  # noqa: BLE001
            print(f"  {path.name}: erro — {exc}")
            failures += 1
            continue
        print(f'  {path.stem:<28} -> "{text}"   (conf {conf:.2f})')

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
