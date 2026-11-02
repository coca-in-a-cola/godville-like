#!/usr/bin/env python3
"""Palette mapping, downscaling and slicing for pixel-art assets (pure standard library).

Commands:
  pixelize.py map   IN.png OUT.png [--size WxH]   downscale (box filter) and snap to the 32-colour palette
  pixelize.py slice IN.png OUTDIR  FWxFH          cut a sprite sheet into numbered frame PNGs
  pixelize.py check FILE.png...                   fail if any pixel is off-palette or semi-transparent

Pixels are either fully transparent (alpha 0) or opaque palette colours. Pillow/NumPy are not required.
"""
import os
import struct
import sys
import zlib

# DB32 (DawnBringer 32). Keep in sync with apps/web/src/palette.ts (a unit test checks the PNGs against that copy).
PALETTE_32 = [
    (0x00, 0x00, 0x00), (0x22, 0x20, 0x34), (0x45, 0x28, 0x3C), (0x66, 0x39, 0x31),
    (0x8F, 0x56, 0x3B), (0xDF, 0x71, 0x26), (0xD9, 0xA0, 0x66), (0xEE, 0xC3, 0x9A),
    (0xFB, 0xF2, 0x36), (0x99, 0xE5, 0x50), (0x6A, 0xBE, 0x30), (0x37, 0x94, 0x6E),
    (0x4B, 0x69, 0x2F), (0x52, 0x4B, 0x24), (0x32, 0x3C, 0x39), (0x3F, 0x3F, 0x74),
    (0x30, 0x60, 0x82), (0x5B, 0x6E, 0xE1), (0x63, 0x9B, 0xFF), (0x5F, 0xCD, 0xE4),
    (0xCB, 0xDB, 0xFC), (0xFF, 0xFF, 0xFF), (0x9B, 0xAB, 0xB8), (0x84, 0x7E, 0x87),
    (0x69, 0x6A, 0x6A), (0x59, 0x56, 0x52), (0x76, 0x42, 0x8A), (0xAC, 0x32, 0x32),
    (0xD9, 0x57, 0x63), (0xD7, 0x7B, 0xBA), (0x8F, 0x97, 0x4A), (0x8A, 0x6F, 0x30),
]
PALETTE_SET = frozenset(PALETTE_32)
ALPHA_CUTOFF = 128


def nearest_palette(r, g, b):
    """Closest palette colour by perceptually weighted squared RGB distance."""
    return min(PALETTE_32, key=lambda p: 0.30 * (r - p[0]) ** 2 + 0.59 * (g - p[1]) ** 2 + 0.11 * (b - p[2]) ** 2)


# ---------------------------------------------------------------- PNG I/O

def write_png(path, width, height, rgba):
    """Write an 8-bit RGBA PNG. `rgba` is a bytes-like of width*height*4."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    blob = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(blob)


def read_png(path):
    """Read a non-interlaced 8-bit PNG (grey, grey+alpha, RGB, RGBA or indexed) as (width, height, rgba)."""
    with open(path, 'rb') as fh:
        data = fh.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'{path}: not a PNG')
    pos, idat, plte, trns, header = 8, bytearray(), None, None, None
    while pos < len(data):
        length, tag = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if tag == b'IHDR':
            header = struct.unpack('>IIBBBBB', body)
        elif tag == b'PLTE':
            plte = body
        elif tag == b'tRNS':
            trns = body
        elif tag == b'IDAT':
            idat += body
    width, height, depth, ctype, _, _, interlace = header
    if depth != 8 or interlace != 0 or ctype not in (0, 2, 3, 4, 6):
        raise ValueError(f'{path}: unsupported PNG (need non-interlaced 8-bit)')
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(bytes(idat))
    stride, rows, prev = width * channels, [], bytearray(width * channels)
    for y in range(height):
        kind = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if kind == 1:
                line[i] = (line[i] + a) & 255
            elif kind == 2:
                line[i] = (line[i] + b) & 255
            elif kind == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif kind == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    out = bytearray()
    for line in rows:
        for x in range(width):
            px = line[x * channels:(x + 1) * channels]
            if ctype == 6:
                out += px
            elif ctype == 2:
                out += px + b'\xff'
            elif ctype == 0:
                out += bytes((px[0], px[0], px[0], 255))
            elif ctype == 4:
                out += bytes((px[0], px[0], px[0], px[1]))
            else:
                i = px[0]
                out += plte[i * 3:i * 3 + 3] + bytes((trns[i] if trns and i < len(trns) else 255,))
    return width, height, out


# ---------------------------------------------------------------- operations

def downscale(width, height, rgba, new_w, new_h):
    """Box-filter resample (alpha-weighted so transparent pixels do not bleed colour)."""
    out = bytearray()
    for ty in range(new_h):
        y0, y1 = ty * height // new_h, max(ty * height // new_h + 1, (ty + 1) * height // new_h)
        for tx in range(new_w):
            x0, x1 = tx * width // new_w, max(tx * width // new_w + 1, (tx + 1) * width // new_w)
            r = g = b = a = n = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    i = (y * width + x) * 4
                    w = rgba[i + 3]
                    r += rgba[i] * w; g += rgba[i + 1] * w; b += rgba[i + 2] * w; a += w; n += 1
            if a == 0:
                out += b'\x00\x00\x00\x00'
            else:
                out += bytes((r // a, g // a, b // a, a // n))
    return out


def map_to_palette(rgba):
    """Snap every pixel to the palette; alpha becomes 0 or 255."""
    out, cache = bytearray(len(rgba)), {}
    for i in range(0, len(rgba), 4):
        if rgba[i + 3] < ALPHA_CUTOFF:
            continue
        key = (rgba[i], rgba[i + 1], rgba[i + 2])
        if key not in cache:
            cache[key] = key if key in PALETTE_SET else nearest_palette(*key)
        out[i:i + 3] = bytes(cache[key])
        out[i + 3] = 255
    return out


def slice_frames(width, height, rgba, fw, fh):
    """Cut a sheet into frames, left-to-right then top-to-bottom."""
    if width % fw or height % fh:
        raise ValueError(f'{width}x{height} is not a multiple of {fw}x{fh}')
    frames = []
    for fy in range(0, height, fh):
        for fx in range(0, width, fw):
            frame = bytearray()
            for y in range(fy, fy + fh):
                frame += rgba[(y * width + fx) * 4:(y * width + fx + fw) * 4]
            frames.append(frame)
    return frames


def off_palette_pixels(rgba):
    """Return (index, rgba) of pixels that are semi-transparent or not an exact palette colour."""
    bad = []
    for i in range(0, len(rgba), 4):
        a = rgba[i + 3]
        if a == 0:
            continue
        if a != 255 or (rgba[i], rgba[i + 1], rgba[i + 2]) not in PALETTE_SET:
            bad.append((i // 4, tuple(rgba[i:i + 4])))
    return bad


# ---------------------------------------------------------------- CLI

def _size(text):
    w, h = text.lower().split('x')
    return int(w), int(h)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, args = argv[1], argv[2:]
    if cmd == 'map' and len(args) in (2, 4):
        w, h, px = read_png(args[0])
        if len(args) == 4 and args[2] == '--size':
            nw, nh = _size(args[3])
            px, w, h = downscale(w, h, px, nw, nh), nw, nh
        write_png(args[1], w, h, map_to_palette(px))
        return 0
    if cmd == 'slice' and len(args) == 3:
        w, h, px = read_png(args[0])
        fw, fh = _size(args[2])
        stem = os.path.splitext(os.path.basename(args[0]))[0]
        for n, frame in enumerate(slice_frames(w, h, px, fw, fh)):
            write_png(os.path.join(args[1], f'{stem}_{n}.png'), fw, fh, frame)
        return 0
    if cmd == 'check' and args:
        failed = 0
        for path in args:
            w, h, px = read_png(path)
            bad = off_palette_pixels(px)
            if bad:
                failed += 1
                print(f'{path}: {len(bad)} off-palette pixel(s), first at x={bad[0][0] % w} y={bad[0][0] // w}: {bad[0][1]}')
        return 1 if failed else 0
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
