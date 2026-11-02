"""Tiny palette-index drawing surface. Every pixel is None (transparent) or an index into PALETTE_32,
so anything drawn here is on-palette by construction."""
from pixelize import PALETTE_32

# Palette indices by name (DB32).
(BLACK, PLUM, MAROON, BROWN, TAN, ORANGE, SKIN, PEACH, YELLOW, LIME, GRASS, FOREST, DGREEN, OLIVE, SLATE, NAVY,
 TEAL, BLUE, SKY, CYAN, ICE, WHITE, SILVER, GRAY, DGRAY, CHAR, PURPLE, RED, PINK, ORCHID, KHAKI, BRONZE) = range(32)


class Canvas:
    def __init__(self, w, h, fill=None):
        self.w, self.h = w, h
        self.p = [[fill] * w for _ in range(h)]

    def px(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def get(self, x, y):
        return self.p[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def line(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.px(x, y, c)

    def blit(self, other, ox=0, oy=0, flip=False):
        for y in range(other.h):
            for x in range(other.w):
                v = other.p[y][x]
                if v is not None:
                    self.px(ox + (other.w - 1 - x if flip else x), oy + y, v)

    def art(self, x, y, rows, legend):
        """Stamp ASCII art; '.' and ' ' are transparent, other chars are looked up in `legend`."""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch not in '. ':
                    self.px(x + dx, y + dy, legend[ch])

    def outline(self, c=PLUM, diagonal=False):
        marks = []
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] is not None:
                    continue
                near = ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (-1, 1), (1, -1), (-1, -1)) if diagonal else ())
                if any(self.get(x + dx, y + dy) is not None for dx, dy in near):
                    marks.append((x, y))
        for x, y in marks:
            self.p[y][x] = c
        return self

    def rgba(self):
        out = bytearray()
        for row in self.p:
            for v in row:
                out += bytes((*PALETTE_32[v], 255)) if v is not None else b'\x00\x00\x00\x00'
        return out


def hstack(frames):
    sheet = Canvas(sum(f.w for f in frames), frames[0].h)
    x = 0
    for f in frames:
        sheet.blit(f, x, 0)
        x += f.w
    return sheet
