#!/usr/bin/env python3
"""Daemon de reconhecimento de voz do NEXUS.

Captura o microfone continuamente e transcreve com o Vosk — offline, sem chave
de API e sem enviar áudio para lugar nenhum. Emite uma linha JSON por evento no
stdout; o processo principal do Electron lê e decide o que fazer.

Protocolo de saída (uma linha JSON por evento):
    {"type": "state",   "status": "listening", "message": "...", "device": "..."}
    {"type": "partial", "text": "abrir you"}
    {"type": "final",   "text": "abrir youtube", "confidence": 0.93}

Uso:
    python nexus_voice.py --model CAMINHO [--device N] [--samplerate 16000]
    python nexus_voice.py --list-devices
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = HERE / "models"
SAMPLE_RATE = 16000
BLOCK_SIZE = 8000


def emit(payload: dict[str, Any]) -> None:
    """Escreve um evento JSON no stdout, sempre com flush."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def emit_state(status: str, message: str, device: str | None = None) -> None:
    payload: dict[str, Any] = {"type": "state", "status": status, "message": message}
    if device:
        payload["device"] = device
    emit(payload)


def is_vosk_model(path: Path) -> bool:
    """Reconhece os dois layouts do Vosk.

    O modelo pequeno vem achatado (`final.mdl` e `mfcc.conf` na raiz); o grande
    vem em subpastas (`am/final.mdl`, `conf/mfcc.conf`). Aceitar só um dos dois
    faz o daemon jurar que não há modelo instalado.
    """
    if not path.is_dir():
        return False
    markers = (
        path / "final.mdl",
        path / "am" / "final.mdl",
        path / "am-onnx",
        path / "mfcc.conf",
        path / "conf" / "mfcc.conf",
    )
    return any(m.exists() for m in markers)


def find_model(explicit: str | None) -> Path | None:
    """Resolve o modelo: o caminho passado, ou o primeiro dentro de models/."""
    if explicit:
        p = Path(explicit)
        return p if is_vosk_model(p) else None

    if not DEFAULT_MODEL_DIR.is_dir():
        return None
    found = [child for child in sorted(DEFAULT_MODEL_DIR.iterdir()) if is_vosk_model(child)]
    if not found:
        return None
    # Prefere o modelo grande (mais preciso) quando os dois estão instalados:
    # os "small" trazem "small" no nome; qualquer outro é o modelo completo.
    for child in found:
        if "small" not in child.name.lower():
            return child
    return found[0]


def list_devices() -> int:
    try:
        import sounddevice as sd
    except Exception as exc:  # noqa: BLE001
        emit({"type": "devices", "devices": [], "error": str(exc)})
        return 1

    hostapis = sd.query_hostapis()
    devices = []
    for index, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] <= 0:
            continue
        api_index = dev["hostapi"]
        api_name = hostapis[api_index]["name"] if api_index < len(hostapis) else "?"
        devices.append(
            {
                "index": index,
                "name": dev["name"],
                "channels": dev["max_input_channels"],
                "hostApi": api_name,
            }
        )
    emit({"type": "devices", "devices": devices})
    return 0


def average_confidence(result: dict[str, Any]) -> float:
    words = result.get("result") or []
    if not words:
        # Sem detalhamento por palavra: assume confiança neutra.
        return 1.0 if result.get("text") else 0.0
    total = sum(float(w.get("conf", 0.0)) for w in words)
    return total / len(words)


def input_candidates(sd) -> list[int | None]:  # noqa: ANN001
    """Ordena os dispositivos de entrada do melhor para o pior candidato.

    Prioriza um microfone de verdade (nome com "microfone"/"mic"), evitando os
    mapeadores genéricos do Windows, e prefere MME > DirectSound > WASAPI por
    compatibilidade de captura no Windows. A lista é tentada em ordem até um
    dispositivo abrir de fato — assim um mic de headset sem padrão do sistema
    é encontrado sozinho.
    """
    hostapis = sd.query_hostapis()
    # MME é o mais tolerante para captura simples 16k mono no Windows.
    api_rank = {"MME": 0, "Windows DirectSound": 1, "Windows WASAPI": 2, "Windows WDM-KS": 3}

    scored: list[tuple[float, int]] = []
    for index, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] <= 0:
            continue
        name = str(dev["name"]).lower()
        if "mapper" in name or "primár" in name or "primary" in name:
            continue
        api_name = hostapis[dev["hostapi"]]["name"] if dev["hostapi"] < len(hostapis) else ""
        score = float(api_rank.get(api_name, 5))
        if "mic" not in name and "microfone" not in name:
            score += 10
        scored.append((score, index))

    scored.sort(key=lambda t: t[0])
    candidates: list[int | None] = [index for _score, index in scored]

    # Tenta também o padrão do sistema, caso exista e seja válido.
    try:
        default_in = sd.default.device[0]
    except Exception:  # noqa: BLE001
        default_in = -1
    if isinstance(default_in, int) and default_in >= 0:
        candidates.insert(0, None)

    return candidates or [None]


def run(model_path: Path, device: int | None, samplerate: int) -> int:
    try:
        import sounddevice as sd
        from vosk import KaldiRecognizer, Model, SetLogLevel
    except Exception as exc:  # noqa: BLE001
        emit_state("error", f"Dependência ausente: {exc}. Rode: pip install vosk sounddevice")
        return 1

    SetLogLevel(-1)

    # Sem microfone não há o que fazer — avisa e sai com um estado explícito.
    try:
        inputs = [d for d in sd.query_devices() if d["max_input_channels"] > 0]
    except Exception as exc:  # noqa: BLE001
        emit_state("error", f"Falha ao consultar dispositivos de áudio: {exc}")
        return 1

    if not inputs:
        emit_state(
            "no-microphone",
            "Nenhum microfone encontrado. Conecte um dispositivo de entrada e reinicie a escuta.",
        )
        return 2

    try:
        model = Model(str(model_path))
    except Exception as exc:  # noqa: BLE001
        emit_state("error", f"Falha ao carregar o modelo Vosk: {exc}")
        return 1

    recognizer = KaldiRecognizer(model, samplerate)
    recognizer.SetWords(True)

    audio_queue: queue.Queue[bytes] = queue.Queue()

    def callback(indata, _frames, _time, status) -> None:  # noqa: ANN001
        if status:
            print(f"[nexus_voice] {status}", file=sys.stderr)
        audio_queue.put(bytes(indata))

    # Se um dispositivo foi escolhido na configuração, respeita-o. Senão, tenta
    # a lista de candidatos em ordem — o primeiro que abrir de fato é usado.
    candidates: list[int | None] = [device] if device is not None else input_candidates(sd)

    stream = None
    used: int | None = None
    last_error = ""
    for candidate in candidates:
        try:
            stream = sd.RawInputStream(
                samplerate=samplerate,
                blocksize=BLOCK_SIZE,
                device=candidate,
                dtype="int16",
                channels=1,
                callback=callback,
            )
            stream.start()
            used = candidate
            break
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if stream is not None:
                try:
                    stream.close()
                except Exception:  # noqa: BLE001
                    pass
                stream = None
            continue

    if stream is None:
        emit_state(
            "no-microphone",
            f"Não consegui abrir nenhum microfone. Verifique se o headset está ativo. ({last_error})",
        )
        return 2

    try:
        device_name = sd.query_devices(used if used is not None else None, "input")["name"]
    except Exception:  # noqa: BLE001
        device_name = "padrão do sistema"

    last_partial = ""

    try:
        emit_state("listening", "Escutando.", device_name)
        while True:
            data = audio_queue.get()
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                text = (result.get("text") or "").strip()
                if text:
                    emit(
                        {
                            "type": "final",
                            "text": text,
                            "confidence": round(average_confidence(result), 3),
                        }
                    )
                last_partial = ""
            else:
                partial = (json.loads(recognizer.PartialResult()).get("partial") or "").strip()
                if partial and partial != last_partial:
                    last_partial = partial
                    emit({"type": "partial", "text": partial})
    except KeyboardInterrupt:
        emit_state("stopped", "Escuta encerrada.")
        return 0
    except Exception as exc:  # noqa: BLE001
        emit_state("error", f"Erro na captura de áudio: {exc}")
        return 1
    finally:
        try:
            stream.stop()
            stream.close()
        except Exception:  # noqa: BLE001
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Daemon de voz do NEXUS (Vosk)")
    parser.add_argument("--model", default=None, help="Caminho da pasta do modelo Vosk")
    parser.add_argument("--device", type=int, default=None, help="Índice do dispositivo de entrada")
    parser.add_argument("--samplerate", type=int, default=SAMPLE_RATE)
    parser.add_argument("--list-devices", action="store_true")
    args = parser.parse_args()

    # O stdout precisa ser UTF-8: os comandos vêm com acento.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    if args.list_devices:
        return list_devices()

    model_path = find_model(args.model or os.environ.get("NEXUS_VOSK_MODEL"))
    if model_path is None:
        emit_state(
            "no-model",
            "Modelo Vosk não encontrado. Rode: python python/download_model.py",
        )
        return 3

    return run(model_path, args.device, args.samplerate)


if __name__ == "__main__":
    raise SystemExit(main())
