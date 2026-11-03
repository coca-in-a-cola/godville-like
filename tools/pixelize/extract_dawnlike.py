#!/usr/bin/env python3
"""
Extract canonical 16-bit RPG assets from DawnLike base pack:
1. 6 Hero Archetypes (Knight, Mage, Rogue, Ranger, Dwarf, Cleric) with 2-frame walking/idle.
2. 6 Matching 48x48 Portraits (3x nearest-neighbor upscale of each hero bust).
3. 5 Monster Families (Spider, Golem, Wraith, Leech, Brute) with 2-frame animation.
4. Clean, high-contrast parallax backgrounds and terrain road.
5. 4 Town Buildings / Landmarks.
All output assets are saved into assets/ and apps/web/public/assets/.
"""

import os
from PIL import Image

REPO = "/tmp/dawnlike-repo"
ASSETS_DIR = "/home/tyler/workspaces/godville/assets"
PUBLIC_DIR = "/home/tyler/workspaces/godville/apps/web/public/assets"

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

def save_asset(img: Image.Image, filename: str):
    p1 = os.path.join(ASSETS_DIR, filename)
    p2 = os.path.join(PUBLIC_DIR, filename)
    img.save(p1)
    img.save(p2)
    print(f"Saved {filename} -> {img.size}")

def get_tile(sheet_path: str, col: int, row: int) -> Image.Image:
    im = Image.open(sheet_path).convert("RGBA")
    return im.crop((col * 16, row * 16, (col + 1) * 16, (row + 1) * 16))

def build_2frame_strip(tile0: Image.Image, tile1: Image.Image, target_size=(64, 32)) -> Image.Image:
    """Upscales 16x16 2-frame tiles by 2x nearest neighbor into a 64x32 sprite strip."""
    out = Image.new("RGBA", target_size, (0, 0, 0, 0))
    t0_scaled = tile0.resize((32, 32), Image.Resampling.NEAREST)
    t1_scaled = tile1.resize((32, 32), Image.Resampling.NEAREST)
    out.paste(t0_scaled, (0, 0))
    out.paste(t1_scaled, (32, 0))
    return out

def build_4frame_walk(tile0: Image.Image, tile1: Image.Image) -> Image.Image:
    """Creates a 4-frame walk cycle [0, 1, 0, 1] scaled 2x to 128x32."""
    out = Image.new("RGBA", (128, 32), (0, 0, 0, 0))
    t0 = tile0.resize((32, 32), Image.Resampling.NEAREST)
    t1 = tile1.resize((32, 32), Image.Resampling.NEAREST)
    out.paste(t0, (0, 0))
    out.paste(t1, (32, 0))
    out.paste(t0, (64, 0))
    out.paste(t1, (96, 0))
    return out

def build_portrait(tile: Image.Image) -> Image.Image:
    """Nearest-neighbor 3x upscale (16x16 -> 48x48) ensuring identical scale, angle, and framing."""
    return tile.resize((48, 48), Image.Resampling.NEAREST)

def main():
    p0 = os.path.join(REPO, "Characters/Player0.png")
    p1 = os.path.join(REPO, "Characters/Player1.png")

    # 1. Six Hero Archetypes
    # Coordinates in Player0 / Player1:
    # 1: Paladin / Knight: Row 0, Col 5
    # 2: Mage / Wizard: Row 0, Col 1
    # 3: Rogue / Thief: Row 0, Col 3
    # 4: Elf Ranger / Archer: Row 1, Col 4
    # 5: Dwarf Warrior: Row 3, Col 0
    # 6: Cleric / Priest: Row 0, Col 2
    heroes = [
        ("knight", 5, 0),
        ("mage", 1, 0),
        ("rogue", 3, 0),
        ("ranger", 4, 1),
        ("dwarf", 0, 3),
        ("cleric", 2, 0),
    ]

    for idx, (name, col, row) in enumerate(heroes, start=1):
        tile0 = get_tile(p0, col, row)
        tile1 = get_tile(p1, col, row)

        # 48x48 unified portrait
        portrait = build_portrait(tile0)
        save_asset(portrait, f"portrait_{idx}.png")

        # Hero walk strip for default player
        if idx == 1:
            walk = build_4frame_walk(tile0, tile1)
            save_asset(walk, "hero_walk.png")
            # Attack strip
            attack = build_2frame_strip(tile1, tile0)
            save_asset(attack, "hero_attack.png")
            # Hit single frame
            hit = tile1.resize((32, 32), Image.Resampling.NEAREST)
            save_asset(hit, "hero_hit.png")
            # Defeated frame (rotated / lying down)
            death = hit.rotate(90, expand=False)
            save_asset(death, "hero_death.png")

    # 2. Five Monster Families
    # Spider: Pest0/1 Row 1, Col 1 (giant brown spider)
    # Golem: Elemental0/1 Row 0, Col 3 (stone/earth golem)
    # Wraith: Undead0/1 Row 1, Col 1 (floating hooded wraith)
    # Leech: Slime0/1 Row 1, Col 0 (swamp leech crawler)
    # Brute: Humanoid0/1 Row 2, Col 3 (horned minotaur brute)
    monsters = [
        ("spider", "Characters/Pest0.png", "Characters/Pest1.png", 1, 1),
        ("golem", "Characters/Elemental0.png", "Characters/Elemental1.png", 3, 0),
        ("wraith", "Characters/Undead0.png", "Characters/Undead1.png", 1, 1),
        ("leech", "Characters/Slime0.png", "Characters/Slime1.png", 0, 1),
        ("brute", "Characters/Humanoid0.png", "Characters/Humanoid1.png", 3, 2),
    ]

    for m_family, f0, f1, col, row in monsters:
        t0 = get_tile(os.path.join(REPO, f0), col, row)
        t1 = get_tile(os.path.join(REPO, f1), col, row)
        strip = build_2frame_strip(t0, t1)
        save_asset(strip, f"monster_{m_family}_idle.png")
        save_asset(strip, f"monster_{m_family}_attack.png")

    # 3. High-Contrast Parallax Backgrounds & Road
    # Background 0: Sky (clean pale pastel gradient, 320x96)
    sky = Image.new("RGBA", (320, 96), (200, 218, 244, 255))
    # Soft distant horizon gradient
    for y in range(96):
        r = int(200 - y * 0.3)
        g = int(218 - y * 0.4)
        b = int(244 - y * 0.3)
        for x in range(320):
            sky.putpixel((x, y), (max(0, r), max(0, g), max(0, b), 255))
    save_asset(sky, "bg_sky.png")

    # Background 1: Distant Mountains (soft desaturated hills from Hill0)
    hills = Image.new("RGBA", (320, 96), (0, 0, 0, 0))
    hill_tile = get_tile(os.path.join(REPO, "Objects/Hill0.png"), 0, 0).resize((32, 32), Image.Resampling.NEAREST)
    for x in range(0, 320, 32):
        hills.paste(hill_tile, (x, 42), hill_tile)
    save_asset(hills, "bg_hills.png")

    # Background 2: Pine Forest & Ruins (Tree0 tiles scaled 2x to 32x32)
    forest = Image.new("RGBA", (320, 96), (0, 0, 0, 0))
    tree_tile = get_tile(os.path.join(REPO, "Objects/Tree0.png"), 0, 0).resize((32, 32), Image.Resampling.NEAREST)
    for x in range(0, 320, 24):
        forest.paste(tree_tile, (x, 46), tree_tile)
    save_asset(forest, "bg_forest.png")

    # Background 3: Road & Foreground (Ground0 / Floor road tiles, high contrast ground)
    road = Image.new("RGBA", (320, 96), (0, 0, 0, 0))
    road_tile = get_tile(os.path.join(REPO, "Objects/Floor.png"), 1, 0).resize((16, 16), Image.Resampling.NEAREST)
    for y in range(74, 96, 16):
        for x in range(0, 320, 16):
            road.paste(road_tile, (x, y))
    save_asset(road, "bg_road.png")

    # 4. Town Buildings (Tavern, Shop, Temple, Inn)
    # Using 3x nearest-neighbor combinations from Objects/Decor0 & Wall to make distinct 48x48 buildings
    decor0 = os.path.join(REPO, "Objects/Decor0.png")
    wall0 = os.path.join(REPO, "Objects/Wall.png")
    door0 = os.path.join(REPO, "Objects/Door0.png")

    def make_building(roof_col, wall_col, icon_col, label):
        b = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        # 3x3 tiles of 16x16
        w_tile = get_tile(wall0, wall_col, 0)
        d_tile = get_tile(door0, 0, 0)
        # Roof (top row)
        r_tile = get_tile(wall0, roof_col, 1)
        for c in range(3):
            b.paste(r_tile, (c * 16, 0), r_tile)
            b.paste(w_tile, (c * 16, 16), w_tile)
            if c == 1:
                b.paste(d_tile, (c * 16, 32), d_tile)
            else:
                b.paste(w_tile, (c * 16, 32), w_tile)
        return b

    save_asset(make_building(1, 0, 0, "tavern"), "building_tavern.png")
    save_asset(make_building(2, 1, 1, "shop"), "building_shop.png")
    save_asset(make_building(4, 2, 2, "temple"), "building_temple.png")
    save_asset(make_building(3, 0, 3, "inn"), "building_inn.png")

    print("All DawnLike assets successfully extracted and unified!")

if __name__ == "__main__":
    main()
