#!/usr/bin/env python3
"""
Generates 6 detailed 48x48 fantasy pixel art portraits with transparent background,
strict 32-color palette adherence, and crisp fantasy character archetypes:
1. Knight / Paladin
2. Wizard / Mage
3. Rogue / Assassin
4. Elf Ranger
5. Dwarf Warrior
6. Sun Cleric
"""

import os
from pixelize import write_png, nearest_palette, PALETTE_32

# Palette shortcuts
P_TRANS = (0, 0, 0, 0)
P_BLACK = (0x00, 0x00, 0x00, 255)
P_DARK_PURPLE = (0x22, 0x20, 0x34, 255)
P_DARK_BROWN = (0x45, 0x28, 0x3c, 255)
P_BROWN = (0x66, 0x39, 0x31, 255)
P_MED_BROWN = (0x8f, 0x56, 0x3b, 255)
P_ORANGE = (0xdf, 0x71, 0x26, 255)
P_BEIGE = (0xd9, 0xa0, 0x66, 255)
P_PEACH = (0xee, 0xc3, 0x9a, 255)
P_YELLOW = (0xfb, 0xf2, 0x36, 255)
P_LIME = (0x99, 0xe5, 0x50, 255)
P_GREEN = (0x6a, 0xbe, 0x30, 255)
P_FOREST = (0x37, 0x94, 0x6e, 255)
P_DEEP_GREEN = (0x4b, 0x69, 0x2f, 255)
P_NAVY = (0x3f, 0x3f, 0x74, 255)
P_BLUE = (0x30, 0x60, 0x82, 255)
P_BRIGHT_BLUE = (0x5b, 0x6e, 0xe1, 255)
P_SKY_BLUE = (0x63, 0x9b, 0xff, 255)
P_CYAN = (0x5f, 0xcd, 0xe4, 255)
P_WHITE = (0xff, 0xff, 0xff, 255)
P_LIGHT_GRAY = (0x9b, 0xab, 0xb8, 255)
P_GRAY = (0x84, 0x7e, 0x87, 255)
P_DARK_GRAY = (0x69, 0x6a, 0x6a, 255)
P_CHARCOAL = (0x59, 0x56, 0x52, 255)
P_PURPLE = (0x76, 0x42, 0x8a, 255)
P_RED = (0xac, 0x32, 0x32, 255)
P_CORAL = (0xd9, 0x57, 0x63, 255)
P_GOLD = (0x8a, 0x6f, 0x30, 255)

W, H = 48, 48

class PixelGrid:
    def __init__(self, w=48, h=48):
        self.w = w
        self.h = h
        self.pixels = [P_TRANS] * (w * h)

    def set(self, x, y, color):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.pixels[y * self.w + x] = color

    def rect(self, x, y, w, h, color):
        for cy in range(y, y + h):
            for cx in range(x, x + w):
                self.set(cx, cy, color)

    def circle(self, cx, cy, r, color):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx)**2 + (y - cy)**2 <= r**2:
                    self.set(x, y, color)

    def save(self, filepath):
        rgba = bytearray()
        for c in self.pixels:
            if c[3] == 0:
                rgba.extend([0, 0, 0, 0])
            else:
                pr, pg, pb = nearest_palette(c[0], c[1], c[2])
                rgba.extend([pr, pg, pb, c[3]])
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        write_png(filepath, self.w, self.h, rgba)

def make_knight():
    g = PixelGrid()
    # Steel helmet base
    g.circle(24, 20, 14, P_DARK_GRAY)
    g.circle(24, 19, 13, P_GRAY)
    g.circle(24, 18, 12, P_LIGHT_GRAY)
    # Gold crest
    g.rect(22, 4, 4, 10, P_GOLD)
    g.rect(23, 3, 2, 8, P_YELLOW)
    # Red plume
    g.circle(24, 3, 4, P_RED)
    g.rect(25, 2, 8, 4, P_CORAL)
    g.rect(30, 4, 6, 4, P_RED)
    # Visor slit
    g.rect(14, 20, 20, 4, P_BLACK)
    g.rect(17, 21, 5, 2, P_CYAN)
    g.rect(26, 21, 5, 2, P_CYAN)
    # Visor grill
    g.rect(18, 25, 12, 6, P_CHARCOAL)
    for x in range(19, 30, 2):
        g.rect(x, 26, 1, 4, P_BLACK)
    # Pauldrons & Gorget
    g.rect(12, 33, 24, 6, P_GRAY)
    g.rect(14, 34, 20, 3, P_LIGHT_GRAY)
    g.circle(10, 40, 8, P_GRAY)
    g.circle(38, 40, 8, P_GRAY)
    g.circle(10, 39, 6, P_LIGHT_GRAY)
    g.circle(38, 39, 6, P_LIGHT_GRAY)
    # Gold trims
    g.rect(8, 38, 32, 2, P_GOLD)
    # Blue mantle / cape
    g.rect(14, 40, 20, 8, P_BLUE)
    g.rect(18, 41, 12, 7, P_BRIGHT_BLUE)
    return g

def make_wizard():
    g = PixelGrid()
    # Pointed hat cone
    for y in range(4, 22):
        w = int((y - 4) * 0.9) + 2
        g.rect(24 - w // 2, y, w, 1, P_PURPLE)
    g.rect(23, 2, 3, 3, P_NAVY)
    # Hat brim
    g.ellipse = lambda cx, cy, rx, ry, col: [g.set(x, y, col) for y in range(cy-ry, cy+ry+1) for x in range(cx-rx, cx+rx+1) if ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1]
    g.ellipse(24, 21, 16, 4, P_DARK_PURPLE)
    # Gold buckle
    g.rect(22, 19, 4, 3, P_GOLD)
    g.rect(23, 20, 2, 1, P_YELLOW)
    # Face
    g.rect(18, 23, 12, 10, P_PEACH)
    # Glowing eyes
    g.rect(19, 26, 3, 2, P_CYAN)
    g.rect(26, 26, 3, 2, P_CYAN)
    g.set(20, 26, P_WHITE)
    g.set(27, 26, P_WHITE)
    # Long beard
    g.rect(17, 31, 14, 15, P_LIGHT_GRAY)
    g.rect(19, 33, 10, 14, P_WHITE)
    g.rect(21, 40, 6, 7, P_WHITE)
    # Robes
    g.rect(10, 36, 8, 12, P_PURPLE)
    g.rect(30, 36, 8, 12, P_PURPLE)
    g.rect(12, 38, 4, 10, P_NAVY)
    g.rect(32, 38, 4, 10, P_NAVY)
    return g

def make_rogue():
    g = PixelGrid()
    # Dark cowl / hood
    g.circle(24, 18, 13, P_DARK_PURPLE)
    g.circle(24, 17, 12, P_CHARCOAL)
    # Hood peak
    g.rect(23, 5, 2, 3, P_CHARCOAL)
    # Face shadow & mask
    g.rect(17, 19, 14, 12, P_DARK_PURPLE)
    g.rect(18, 21, 12, 4, P_PEACH) # Eye slit
    # Piercing green eyes
    g.rect(19, 22, 3, 2, P_LIME)
    g.rect(26, 22, 3, 2, P_LIME)
    g.set(20, 22, P_WHITE)
    g.set(27, 22, P_WHITE)
    # Dark cloth mask over lower face
    g.rect(16, 25, 16, 8, P_DARK_GRAY)
    g.rect(18, 26, 12, 6, P_BLACK)
    # Leather collar & pauldrons
    g.rect(12, 33, 24, 6, P_DARK_BROWN)
    g.rect(14, 35, 20, 4, P_MED_BROWN)
    # Green gem clasp
    g.circle(24, 36, 3, P_GREEN)
    g.set(24, 35, P_WHITE)
    # Shoulders
    g.rect(8, 38, 10, 10, P_CHARCOAL)
    g.rect(30, 38, 10, 10, P_CHARCOAL)
    return g

def make_elf_ranger():
    g = PixelGrid()
    # Green hood
    g.circle(24, 17, 13, P_FOREST)
    g.circle(24, 16, 12, P_GREEN)
    # Golden hair framing face
    g.rect(15, 18, 4, 14, P_YELLOW)
    g.rect(29, 18, 4, 14, P_YELLOW)
    # Pointed ears
    g.rect(12, 20, 4, 3, P_PEACH)
    g.set(11, 19, P_PEACH)
    g.rect(32, 20, 4, 3, P_PEACH)
    g.set(36, 19, P_PEACH)
    # Face
    g.rect(17, 19, 14, 12, P_PEACH)
    g.rect(19, 23, 3, 2, P_BLUE)
    g.rect(26, 23, 3, 2, P_BLUE)
    g.set(20, 23, P_WHITE)
    g.set(27, 23, P_WHITE)
    # Gentle smile
    g.rect(22, 28, 4, 1, P_BROWN)
    # Tunic & leaf clasp
    g.rect(14, 33, 20, 15, P_DEEP_GREEN)
    g.rect(16, 35, 16, 13, P_FOREST)
    # Silver leaf clasp
    g.rect(22, 34, 4, 4, P_LIGHT_GRAY)
    g.set(23, 33, P_WHITE)
    g.set(24, 33, P_WHITE)
    # Quiver strap
    for i in range(12):
        g.set(15 + i, 36 + i // 2, P_BROWN)
    return g

def make_dwarf():
    g = PixelGrid()
    # Iron horned helm
    g.circle(24, 16, 12, P_DARK_GRAY)
    g.circle(24, 15, 11, P_GRAY)
    # Horns
    g.rect(11, 11, 4, 4, P_BEIGE)
    g.rect(9, 7, 3, 5, P_PEACH)
    g.set(8, 6, P_WHITE)
    g.rect(33, 11, 4, 4, P_BEIGE)
    g.rect(36, 7, 3, 5, P_PEACH)
    g.set(39, 6, P_WHITE)
    # Brow & nose
    g.rect(18, 17, 12, 4, P_BEIGE)
    g.rect(22, 20, 4, 4, P_MED_BROWN)
    # Fierce eyes
    g.rect(19, 19, 2, 2, P_BLACK)
    g.rect(27, 19, 2, 2, P_BLACK)
    # Giant braided orange beard
    g.rect(14, 23, 20, 22, P_ORANGE)
    g.rect(16, 25, 16, 22, P_ORANGE)
    g.rect(18, 30, 12, 18, P_BROWN)
    # Metal beard rings
    g.rect(18, 35, 4, 2, P_GOLD)
    g.rect(26, 35, 4, 2, P_GOLD)
    # Heavy armor
    g.rect(8, 38, 8, 10, P_DARK_GRAY)
    g.rect(32, 38, 8, 10, P_DARK_GRAY)
    return g

def make_cleric():
    g = PixelGrid()
    # Golden halo circlet
    g.circle(24, 20, 15, P_GOLD)
    g.circle(24, 20, 13, P_TRANS)
    # White cowl / hood
    g.circle(24, 20, 12, P_WHITE)
    g.circle(24, 19, 11, P_LIGHT_GRAY)
    # Face
    g.rect(18, 20, 12, 11, P_PEACH)
    # Serene eyes
    g.rect(19, 23, 3, 2, P_SKY_BLUE)
    g.rect(26, 23, 3, 2, P_SKY_BLUE)
    g.set(20, 23, P_WHITE)
    g.set(27, 23, P_WHITE)
    # Vestments
    g.rect(14, 32, 20, 16, P_WHITE)
    g.rect(16, 34, 16, 14, P_LIGHT_GRAY)
    # Golden sun cross symbol
    g.rect(23, 35, 2, 8, P_YELLOW)
    g.rect(20, 38, 8, 2, P_YELLOW)
    g.set(23, 38, P_GOLD)
    return g

if __name__ == '__main__':
    base_dir = '/home/tyler/workspaces/godville/assets'
    pub_dir = '/home/tyler/workspaces/godville/apps/web/public/assets'
    makers = [
        ('portrait_1.png', make_knight),
        ('portrait_2.png', make_wizard),
        ('portrait_3.png', make_rogue),
        ('portrait_4.png', make_elf_ranger),
        ('portrait_5.png', make_dwarf),
        ('portrait_6.png', make_cleric),
    ]
    for name, maker in makers:
        grid = maker()
        p1 = os.path.join(base_dir, name)
        p2 = os.path.join(pub_dir, name)
        grid.save(p1)
        grid.save(p2)
        print(f"Generated {name} -> {p1}")
