"""Generate spike assets: marker image (AR target), soundtrack WAV, and a fake-camera
y4m video that shows the marker (used to feed Chromium's fake video capture in tests)."""
import math
import random
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
ASSETS.mkdir(exist_ok=True)

# ---------- 1. marker image ----------
# AR image targets need high contrast and rich, non-repetitive texture.
W, H = 640, 896  # 5:7 card ratio
rng = random.Random(42)
img = Image.new("RGB", (W, H), "#f5f0e8")
d = ImageDraw.Draw(img)

palette = ["#1f4e5f", "#c0392b", "#27ae60", "#8e44ad", "#e67e22", "#2c3e50", "#d4ac0d"]
# scattered high-contrast shapes, deliberately asymmetric
for _ in range(90):
    x, y = rng.randint(0, W), rng.randint(0, H)
    r = rng.randint(8, 55)
    color = rng.choice(palette)
    kind = rng.random()
    if kind < 0.4:
        d.ellipse([x - r, y - r, x + r, y + r], outline=color, width=rng.randint(2, 6))
    elif kind < 0.7:
        d.rectangle([x, y, x + r * 1.6, y + r], fill=color if rng.random() < 0.4 else None,
                    outline=color, width=3)
    else:
        pts = [(x + r * math.cos(a), y + r * math.sin(a))
               for a in [rng.uniform(0, 6.28) for _ in range(3)]]
        d.polygon(pts, outline=color, fill=color if rng.random() < 0.3 else None)
# connecting lines add unique texture
for _ in range(35):
    d.line([rng.randint(0, W), rng.randint(0, H), rng.randint(0, W), rng.randint(0, H)],
           fill=rng.choice(palette), width=rng.randint(1, 3))
# frame + label band
d.rectangle([8, 8, W - 8, H - 8], outline="#1f4e5f", width=8)
d.rectangle([0, H - 120, W, H], fill="#1f4e5f")
d.text((30, H - 95), "PEACE & TECHNOLOGY", fill="#f5f0e8")
d.text((30, H - 60), "AR CARD #001 — SPIKE", fill="#d4ac0d")
img.save(ASSETS / "marker.png")
print("marker.png", img.size)

# ---------- 2. soundtrack (8s gentle melody, 22050Hz 16-bit mono WAV) ----------
SR = 22050
notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 261.63]  # C-E-G-C'-G-E-D-C
samples = []
for freq in notes:
    dur = 1.0
    n = int(SR * dur)
    for i in range(n):
        t = i / SR
        env = min(t / 0.05, 1.0) * math.exp(-2.2 * t)  # pluck envelope
        v = 0.5 * env * (math.sin(2 * math.pi * freq * t)
                         + 0.35 * math.sin(2 * math.pi * freq * 2 * t))
        samples.append(int(max(-1, min(1, v)) * 32767))
with wave.open(str(ASSETS / "soundtrack.wav"), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(struct.pack("<%dh" % len(samples), *samples))
print("soundtrack.wav", len(samples) / SR, "sec")

# ---------- 3. fake camera video (y4m, marker slowly moving on grey bg) ----------
VW, VH, FPS, SECONDS = 640, 480, 15, 30
scale = 0.42
mw, mh = int(W * scale), int(H * scale)
marker_small = img.resize((mw, mh), Image.LANCZOS)

def rgb_to_yuv420(frame):
    rgb = frame.tobytes()
    ys, us, vs = bytearray(VW * VH), bytearray(VW * VH // 4), bytearray(VW * VH // 4)
    for j in range(VH):
        for i in range(VW):
            idx = (j * VW + i) * 3
            r, g, b = rgb[idx], rgb[idx + 1], rgb[idx + 2]
            ys[j * VW + i] = max(0, min(255, int(0.299 * r + 0.587 * g + 0.114 * b)))
            if j % 2 == 0 and i % 2 == 0:
                ci = (j // 2) * (VW // 2) + (i // 2)
                us[ci] = max(0, min(255, int(-0.169 * r - 0.331 * g + 0.5 * b + 128)))
                vs[ci] = max(0, min(255, int(0.5 * r - 0.419 * g - 0.081 * b + 128)))
    return bytes(ys) + bytes(us) + bytes(vs)

frames = []
n_unique = 8  # unique jitter positions, cycled — keeps generation fast
for k in range(n_unique):
    frame = Image.new("RGB", (VW, VH), "#9a9a9a")
    dx = int(3 * math.sin(2 * math.pi * k / n_unique))
    dy = int(2 * math.cos(2 * math.pi * k / n_unique))
    frame.paste(marker_small, ((VW - mw) // 2 + dx, (VH - mh) // 2 + dy))
    frames.append(rgb_to_yuv420(frame))

with open(ASSETS / "fake_camera.y4m", "wb") as f:
    f.write(b"YUV4MPEG2 W%d H%d F%d:1 Ip A1:1 C420\n" % (VW, VH, FPS))
    for i in range(FPS * SECONDS):
        f.write(b"FRAME\n")
        f.write(frames[i % n_unique])
print("fake_camera.y4m", FPS * SECONDS, "frames")
