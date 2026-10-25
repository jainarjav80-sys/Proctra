#!/usr/bin/env python3
"""Draws a synthetic, front-facing face and writes tests/fixtures/face.y4m for Chromium's
--use-file-for-fake-video-capture, so the onboarding one-face gate can pass in automated E2E.

Usage: python3 -I scripts/make-face-video.py
"""
import pathlib

from PIL import Image, ImageDraw, ImageFilter

W, H, FRAMES = 640, 480, 12
OUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "face.y4m"


def face(dx: int) -> Image.Image:
    img = Image.new("RGB", (W, H), (120, 132, 150))
    d = ImageDraw.Draw(img)
    cx, cy = W // 2 + dx, H // 2 + 10
    d.rectangle([cx - 150, cy + 120, cx + 150, H], fill=(40, 60, 110))  # shoulders / shirt
    d.rectangle([cx - 38, cy + 80, cx + 38, cy + 150], fill=(200, 150, 120))  # neck
    d.ellipse([cx - 110, cy - 150, cx + 110, cy + 135], fill=(222, 172, 140))  # face
    d.chord([cx - 118, cy - 175, cx + 118, cy - 20], 180, 360, fill=(45, 30, 25))  # hair
    for ex in (-45, 45):
        d.ellipse([cx + ex - 26, cy - 42, cx + ex + 26, cy - 14], fill=(250, 250, 250))  # sclera
        d.ellipse([cx + ex - 11, cy - 39, cx + ex + 11, cy - 17], fill=(70, 45, 30))  # iris
        d.ellipse([cx + ex - 5, cy - 33, cx + ex + 5, cy - 23], fill=(10, 10, 10))  # pupil
        d.line([cx + ex - 30, cy - 62, cx + ex + 28, cy - 66], fill=(50, 32, 25), width=7)  # brow
    d.polygon([(cx, cy - 12), (cx - 16, cy + 38), (cx + 16, cy + 38)], fill=(200, 145, 115))  # nose
    d.ellipse([cx - 20, cy + 30, cx - 4, cy + 42], fill=(150, 95, 80))
    d.ellipse([cx + 4, cy + 30, cx + 20, cy + 42], fill=(150, 95, 80))
    d.chord([cx - 42, cy + 55, cx + 42, cy + 95], 0, 180, fill=(170, 70, 70))  # lips
    d.line([cx - 40, cy + 70, cx + 40, cy + 70], fill=(120, 40, 40), width=3)
    for ex in (-112, 112):
        d.ellipse([cx + ex - 12, cy - 25, cx + ex + 12, cy + 25], fill=(210, 160, 130))  # ears
    return img.filter(ImageFilter.GaussianBlur(1.2))


def to_yuv420(img: Image.Image) -> bytes:
    ycc = img.convert("YCbCr")
    y, cb, cr = ycc.split()
    half = (W // 2, H // 2)
    return y.tobytes() + cb.resize(half).tobytes() + cr.resize(half).tobytes()


with OUT.open("wb") as f:
    f.write(f"YUV4MPEG2 W{W} H{H} F15:1 Ip A1:1 C420jpeg\n".encode())
    for i in range(FRAMES):
        f.write(b"FRAME\n" + to_yuv420(face(dx=(i % 6) - 3)))
face(0).save(OUT.with_suffix(".png"))
print(f"wrote {OUT} ({FRAMES} frames) and preview {OUT.with_suffix('.png')}")
