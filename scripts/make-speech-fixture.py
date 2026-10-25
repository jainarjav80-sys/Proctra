#!/usr/bin/env python3
"""Synthesises tests/fixtures/answer-kafka.wav with the system libespeak-ng (no audio playback).

Usage: python3 -I scripts/make-speech-fixture.py ["custom sentence" [out.wav]]
"""
import ctypes
import pathlib
import sys
import wave

TEXT = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "We store processed event IDs in Postgres in the same transaction as the ledger update, "
    "so a redelivered Kafka message becomes a no-op."
)
FIXTURES = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures"
OUT = FIXTURES / (sys.argv[2] if len(sys.argv) > 2 else "answer-kafka.wav")

lib = ctypes.CDLL("libespeak-ng.so.1")
AUDIO_OUTPUT_SYNCHRONOUS = 2
espeakCHARS_AUTO = 0
samples: list[bytes] = []

SynthCallback = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)


@SynthCallback
def on_audio(wav, n, _events):
    if n > 0 and wav:
        samples.append(ctypes.string_at(wav, n * 2))
    return 0


rate = lib.espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 500, None, 0)
if rate <= 0:
    raise SystemExit("espeak_Initialize failed")
lib.espeak_SetSynthCallback(on_audio)
lib.espeak_SetVoiceByName(b"en-us")
lib.espeak_SetParameter(1, 150, 0)  # espeakRATE: words per minute
data = TEXT.encode("utf-8")
lib.espeak_Synth(data, len(data) + 1, 0, 0, 0, espeakCHARS_AUTO, None, None)
lib.espeak_Synchronize()

with wave.open(str(OUT), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(b"".join(samples))
print(f"wrote {OUT} ({sum(len(s) for s in samples) / 2 / rate:.1f}s at {rate} Hz)")
