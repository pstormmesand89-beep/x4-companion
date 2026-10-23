"""Generate the app icons (hexagon station on a dark background) without dependencies."""

import math
import os
import struct
import sys
import zlib

BG = (11, 18, 32)
RING = (79, 179, 255)
CORE = (42, 127, 209)


def hex_dist(x, y):
    # distance measure for a flat-topped hexagon centred on the origin
    x, y = abs(x), abs(y)
    return max(x * math.sqrt(3) / 2 + y / 2, y)


def pixel(u, v):
    d = hex_dist(u, v)
    if 0.52 < d < 0.62:
        return RING
    if d < 0.30:
        return CORE
    if abs(v) < 0.04 and 0.30 <= d <= 0.52:  # docking arms
        return RING
    return BG


def png(size, path):
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            u = (i + 0.5) / size * 2 - 1
            v = (j + 0.5) / size * 2 - 1
            row += bytes(pixel(u / 0.8, v / 0.8))  # keep inside the maskable safe zone
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", raw))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for s in (192, 512):
        png(s, os.path.join(out, f"icon-{s}.png"))
