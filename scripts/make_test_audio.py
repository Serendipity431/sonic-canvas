#!/usr/bin/env python3
"""
Generates test-assets/test-beat.wav — a 24s synthetic 120 BPM track
(kick on every beat, snare on 2 & 4, hats on eighths, bass line, melody).
Used to test local file loading and beat detection. Safe to delete.
"""
import math
import os
import random
import struct
import wave

SR = 44100
DUR = 24
N = SR * DUR
random.seed(7)

FRAMES = []
prev_noise = 0.0
for i in range(N):
    t = i / SR
    bt = t * 2            # beats (120 BPM)
    ph = bt % 1
    beat_idx = int(bt) % 4

    # kick: pitch-swept sine, every beat
    kick = math.sin(2 * math.pi * (52 * t + 26 * math.exp(-ph * 11))) * 0.95 * math.exp(-ph * 8)

    # snare on beats 2 & 4
    snare_env = math.exp(-ph * 9) if beat_idx % 2 == 1 else 0.0
    noise = random.random() * 2 - 1
    hp = noise - prev_noise
    prev_noise = noise
    snare = hp * 0.55 * snare_env

    # hats on eighths
    e8 = (bt * 2) % 1
    hat = hp * 0.2 * math.exp(-e8 * 26)

    # bass line (one note per bar)
    bf = [55.0, 55.0, 65.41, 49.0][int(bt // 4) % 4]
    bass = math.sin(2 * math.pi * bf * t) * 0.42 * math.exp(-ph * 2.2) * (0.6 + 0.55 * math.exp(-ph * 8))

    # pentatonic melody on eighth notes
    mf = [440.0, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25][int(bt * 2) % 8]
    mel = (math.sin(2 * math.pi * mf * t) + 0.35 * math.sin(4 * math.pi * mf * t)) * 0.15 * math.exp(-e8 * 4)

    # soft pad
    pad = (math.sin(2 * math.pi * 110 * t) + math.sin(2 * math.pi * 164.81 * t)) * 0.045

    x = kick + bass + mel + hat + snare + pad
    x = math.tanh(x * 1.1) * 0.92
    FRAMES.append(struct.pack("<h", int(max(-1.0, min(1.0, x)) * 32767)))

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test-assets")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "test-beat.wav")
with wave.open(out_path, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b"".join(FRAMES))
print(f"wrote {out_path} ({os.path.getsize(out_path) / 1e6:.1f} MB)")
