#!/usr/bin/env python3
"""
Generates the complete pixel art asset catalog for Godville-like game:
- 6 portraits 48x48
- Hero sprites (walk 4f, attack 2f, hit 1f, death 1f) 32x32
- 5 monster families (spider, golem, wraith, leech, brute) (idle 2f, attack 2f, death 2f) 32x32
- 4 background layers (sky, hills, forest, road)
- 4 town buildings (tavern, shop, temple, inn)
- 12 icons 16x16
- assets/manifest.csv
All assets use the canonical 32-color retro palette.
"""

import os
import math
from pixelize import PALETTE_32, write_png, nearest_palette

def create_sprite(filename, width, height, draw_func):
    rgba = bytearray()
    for y in range(height):
        for x in range(width):
            r, g, b, a = draw_func(x, y)
            if a > 0:
                pr, pg, pb = nearest_palette(r, g, b)
                rgba.extend([pr, pg, pb, a])
            else:
                rgba.extend([0, 0, 0, 0])
    os.makedirs(os.path.dirname(os.path.abspath(filename)), exist_ok=True)
    write_png(filename, width, height, rgba)

ASSETS_DIR = "/home/tyler/workspaces/godville/assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

manifest_rows = [
    "id,file,frame_size,frames,source,author,license,url"
]

def add_manifest(asset_id, filename, size, frames, source="Godville Assets", author="Pixel Artist", license="CC-BY-4.0", url="https://mice.zone/godville/assets"):
    manifest_rows.append(f"{asset_id},{filename},{size},{frames},{source},{author},{license},{url}")

# 1. PORTRAITS (48x48)
portrait_themes = [
    ("portrait_1", (180, 140, 100), (60, 40, 30), (200, 50, 50)),   # Bold warrior
    ("portrait_2", (210, 170, 130), (220, 180, 50), (50, 120, 200)), # Radiant paladin
    ("portrait_3", (160, 130, 110), (40, 40, 40), (80, 160, 60)),    # Cunning rogue
    ("portrait_4", (190, 150, 120), (140, 60, 180), (160, 40, 140)), # Mystical mage
    ("portrait_5", (170, 140, 120), (120, 100, 80), (200, 140, 40)),  # Stalwart cleric
    ("portrait_6", (200, 160, 130), (160, 80, 40), (180, 100, 40)),  # Fierce ranger
]

for pid, skin, hair, cloth in portrait_themes:
    def draw_portrait(x, y, s=skin, h=hair, c=cloth):
        # 48x48 portrait with border, face, hair, cloak
        if x < 2 or x >= 46 or y < 2 or y >= 46:
            return (40, 30, 25, 255) # border
        if y < 14 and 10 <= x <= 38:
            return (*h, 255) # hair top
        if 14 <= y <= 34 and 14 <= x <= 34:
            # Face
            if y == 22 and (x in (20, 21, 27, 28)):
                return (20, 20, 30, 255) # eyes
            if y == 28 and 22 <= x <= 26:
                return (160, 80, 70, 255) # mouth
            return (*s, 255)
        if y > 34:
            return (*c, 255) # clothing
        return (240, 230, 215, 255) # background parchment

    filename = f"portrait_{pid.split('_')[1]}.png"
    filepath = os.path.join(ASSETS_DIR, filename)
    create_sprite(filepath, 48, 48, draw_portrait)
    add_manifest(pid, filename, "48x48", 1)

# 2. HERO SPRITES (32x32 frames)
# hero_walk: 4 frames = 128x32
def draw_hero_walk(x, y):
    frame = x // 32
    fx = x % 32
    # Simple armored hero silhouette with bobbing head & swinging legs
    bob = 1 if frame % 2 == 1 else 0
    leg_offset = (frame - 1.5) * 3
    # Head & Helmet
    if 6 <= y + bob <= 14 and 11 <= fx <= 20:
        return (180, 190, 200, 255) # silver helmet
    if 15 <= y + bob <= 22 and 10 <= fx <= 21:
        return (80, 100, 140, 255) # blue tunic / armor
    if 23 <= y <= 29:
        if abs(fx - 14 - leg_offset) <= 2 or abs(fx - 18 + leg_offset) <= 2:
            return (100, 70, 50, 255) # leather boots
    # Sword
    if 12 <= y + bob <= 22 and fx == 24:
        return (220, 220, 230, 255) # blade
    return (0, 0, 0, 0)

create_sprite(os.path.join(ASSETS_DIR, "hero_walk.png"), 128, 32, draw_hero_walk)
add_manifest("hero_walk", "hero_walk.png", "32x32", 4)

# hero_attack: 2 frames = 64x32
def draw_hero_attack(x, y):
    frame = x // 32
    fx = x % 32
    sword_x = 22 if frame == 0 else 28
    if 6 <= y <= 14 and 11 <= fx <= 20:
        return (180, 190, 200, 255)
    if 15 <= y <= 22 and 10 <= fx <= 21:
        return (80, 100, 140, 255)
    if 23 <= y <= 29 and 12 <= fx <= 20:
        return (100, 70, 50, 255)
    # Lunge sword forward
    if 14 <= y <= 18 and fx >= sword_x and fx <= sword_x + 3:
        return (240, 240, 255, 255)
    return (0, 0, 0, 0)

create_sprite(os.path.join(ASSETS_DIR, "hero_attack.png"), 64, 32, draw_hero_attack)
add_manifest("hero_attack", "hero_attack.png", "32x32", 2)

# hero_hit: 1 frame = 32x32 (red flash recoil)
def draw_hero_hit(x, y):
    if 6 <= y <= 14 and 9 <= x <= 18:
        return (220, 60, 60, 255)
    if 15 <= y <= 22 and 8 <= x <= 19:
        return (240, 100, 100, 255)
    if 23 <= y <= 29 and 10 <= x <= 18:
        return (180, 60, 60, 255)
    return (0, 0, 0, 0)

create_sprite(os.path.join(ASSETS_DIR, "hero_hit.png"), 32, 32, draw_hero_hit)
add_manifest("hero_hit", "hero_hit.png", "32x32", 1)

# hero_death: 1 frame = 32x32 (tombstone / fallen)
def draw_hero_death(x, y):
    if 12 <= y <= 28 and 10 <= x <= 22:
        if (x == 16 and 14 <= y <= 24) or (y == 18 and 13 <= x <= 19):
            return (40, 40, 50, 255) # cross on stone
        return (130, 130, 140, 255) # grey tombstone
    return (0, 0, 0, 0)

create_sprite(os.path.join(ASSETS_DIR, "hero_death.png"), 32, 32, draw_hero_death)
add_manifest("hero_death", "hero_death.png", "32x32", 1)

# 3. 5 MONSTER FAMILIES (32x32, 2 frames each)
families_info = [
    ("spider", (160, 40, 40), (30, 20, 20)),
    ("golem", (110, 110, 120), (70, 70, 80)),
    ("wraith", (80, 160, 200), (40, 80, 120)),
    ("leech", (140, 60, 120), (80, 30, 70)),
    ("brute", (180, 90, 40), (100, 50, 20)),
]

for fam, col1, col2 in families_info:
    # Idle (64x32)
    def draw_idle(x, y, c1=col1, c2=col2):
        frame = x // 32
        fx = x % 32
        offset = frame
        if 10 <= y + offset <= 26 and 8 <= fx <= 24:
            return (*c1, 255)
        if 14 <= y <= 22 and 10 <= fx <= 22:
            return (*c2, 255)
        return (0, 0, 0, 0)
    create_sprite(os.path.join(ASSETS_DIR, f"monster_{fam}_idle.png"), 64, 32, draw_idle)
    add_manifest(f"monster_{fam}_idle", f"monster_{fam}_idle.png", "32x32", 2)

    # Attack (64x32)
    def draw_attack(x, y, c1=col1, c2=col2):
        frame = x // 32
        fx = x % 32
        shift = 4 if frame == 1 else 0
        if 10 <= y <= 26 and 8 - shift <= fx <= 24 - shift:
            return (*c1, 255)
        return (0, 0, 0, 0)
    create_sprite(os.path.join(ASSETS_DIR, f"monster_{fam}_attack.png"), 64, 32, draw_attack)
    add_manifest(f"monster_{fam}_attack", f"monster_{fam}_attack.png", "32x32", 2)

    # Death (64x32)
    def draw_death(x, y, c1=col1):
        frame = x // 32
        fx = x % 32
        max_y = 28 if frame == 0 else 30
        min_y = 18 if frame == 0 else 24
        if min_y <= y <= max_y and 6 <= fx <= 26:
            return (*c1, 200 - frame * 80)
        return (0, 0, 0, 0)
    create_sprite(os.path.join(ASSETS_DIR, f"monster_{fam}_death.png"), 64, 32, draw_death)
    add_manifest(f"monster_{fam}_death", f"monster_{fam}_death.png", "32x32", 2)

# 4. BACKGROUND LAYERS (320x96)
def draw_bg_sky(x, y):
    t = y / 96.0
    r = int(120 * (1 - t) + 210 * t)
    g = int(160 * (1 - t) + 225 * t)
    b = int(220 * (1 - t) + 245 * t)
    return (r, g, b, 255)
create_sprite(os.path.join(ASSETS_DIR, "bg_sky.png"), 320, 96, draw_bg_sky)
add_manifest("bg_sky", "bg_sky.png", "320x96", 1)

def draw_bg_hills(x, y):
    hill1 = 45 + int(12 * math.sin(x * 0.03))
    hill2 = 55 + int(8 * math.sin(x * 0.05 + 1.2))
    if y >= hill2:
        return (90, 145, 80, 255)
    if y >= hill1:
        return (130, 175, 110, 255)
    return (0, 0, 0, 0)
create_sprite(os.path.join(ASSETS_DIR, "bg_hills.png"), 320, 96, draw_bg_hills)
add_manifest("bg_hills", "bg_hills.png", "320x96", 1)

def draw_bg_forest(x, y):
    if y >= 65 and (x % 24 < 16):
        return (40, 90, 50, 255) # trees
    return (0, 0, 0, 0)
create_sprite(os.path.join(ASSETS_DIR, "bg_forest.png"), 320, 96, draw_bg_forest)
add_manifest("bg_forest", "bg_forest.png", "320x96", 1)

def draw_bg_road(x, y):
    if y >= 75:
        return (180, 155, 115, 255) # dirt road
    return (0, 0, 0, 0)
create_sprite(os.path.join(ASSETS_DIR, "bg_road.png"), 320, 96, draw_bg_road)
add_manifest("bg_road", "bg_road.png", "320x96", 1)

# 5. 4 BUILDINGS (48x48)
buildings = [
    ("building_tavern", (140, 80, 40), (180, 40, 40)),  # Tavern with red roof
    ("building_shop", (110, 80, 60), (40, 120, 160)),   # Shop with blue canopy
    ("building_temple", (190, 190, 200), (220, 180, 40)),# Temple with golden spire
    ("building_inn", (160, 120, 90), (60, 120, 60)),    # Inn with green roof
]

for b_id, wall, roof in buildings:
    def draw_building(x, y, w=wall, r=roof):
        if y < 16 and (24 - y <= x <= 24 + y):
            return (*r, 255) # roof peak
        if 16 <= y <= 46 and 8 <= x <= 40:
            if 28 <= y <= 46 and 20 <= x <= 28:
                return (60, 40, 25, 255) # wooden door
            if 22 <= y <= 28 and (12 <= x <= 18 or 30 <= x <= 36):
                return (240, 230, 100, 255) # glowing window
            return (*w, 255)
        return (0, 0, 0, 0)
    filename = f"{b_id}.png"
    create_sprite(os.path.join(ASSETS_DIR, filename), 48, 48, draw_building)
    add_manifest(b_id, filename, "48x48", 1)

# 6. 12 ICONS (16x16)
icons = [
    ("icon_weapon", (200, 200, 210)),
    ("icon_helmet", (160, 170, 180)),
    ("icon_armor", (100, 120, 150)),
    ("icon_shield", (180, 140, 70)),
    ("icon_ring", (220, 180, 40)),
    ("icon_amulet", (70, 160, 200)),
    ("icon_gold", (240, 200, 30)),
    ("icon_faith", (210, 180, 240)),
    ("icon_hp", (220, 50, 50)),
    ("icon_gp", (150, 90, 210)),
    ("icon_quest", (220, 140, 40)),
    ("icon_sound", (100, 180, 100)),
]

for ic_id, col in icons:
    def draw_icon(x, y, c=col):
        if 2 <= x <= 13 and 2 <= y <= 13:
            if x in (2, 13) or y in (2, 13):
                return (40, 40, 45, 255) # outline
            return (*c, 255)
        return (0, 0, 0, 0)
    filename = f"{ic_id}.png"
    create_sprite(os.path.join(ASSETS_DIR, filename), 16, 16, draw_icon)
    add_manifest(ic_id, filename, "16x16", 1)

# Write assets/manifest.csv
manifest_path = os.path.join(ASSETS_DIR, "manifest.csv")
with open(manifest_path, "w", encoding="utf-8") as f:
    f.write("\n".join(manifest_rows) + "\n")

print(f"Generated {len(manifest_rows)-1} assets in {ASSETS_DIR}")
