#!/usr/bin/env python3
"""
Full AI Generation & Pixelization Pipeline:
1. Connects to Antigravity's gemini-3.1-flash-image.
2. Generates high-res raw fantasy pixel art concepts.
3. Downsamples to exact pixel dimensions (48x48 portraits/buildings, 320x96 bgs).
4. Cleans background to pure transparent alpha.
5. Snaps colors strictly to the 32-color palette.
6. Saves into assets/ and apps/web/public/assets/.
"""

import os
import io
import json
import base64
import urllib.request
import yaml
from PIL import Image
import numpy as np

# 32-color canonical palette (DB32 / Endesga 32 standard)
PALETTE_32 = [
    (0x00, 0x00, 0x00), # 0 Black
    (0x22, 0x20, 0x34), # 1 Very dark purple
    (0x45, 0x28, 0x3c), # 2 Dark reddish brown
    (0x66, 0x39, 0x31), # 3 Dark brown
    (0x8f, 0x56, 0x3b), # 4 Medium brown
    (0xdf, 0x71, 0x26), # 5 Rust orange
    (0xd9, 0xa0, 0x66), # 6 Warm beige / skin
    (0xee, 0xc3, 0x9a), # 7 Light peach
    (0xfb, 0xf2, 0x36), # 8 Bright yellow
    (0x99, 0xe5, 0x50), # 9 Lime green
    (0x6a, 0xbe, 0x30), # 10 Grass green
    (0x37, 0x94, 0x6e), # 11 Forest green
    (0x4b, 0x69, 0x2f), # 12 Deep green
    (0x52, 0x4b, 0x24), # 13 Olive dark
    (0x32, 0x3c, 0x39), # 14 Dark slate
    (0x3f, 0x3f, 0x74), # 15 Deep navy
    (0x30, 0x60, 0x82), # 16 Dark teal blue
    (0x5b, 0x6e, 0xe1), # 17 Bright blue
    (0x63, 0x9b, 0xff), # 18 Sky blue
    (0x5f, 0xcd, 0xe4), # 19 Cyan / aqua
    (0xcb, 0xdb, 0xfc), # 20 Pale ice blue
    (0xff, 0xff, 0xff), # 21 Pure white
    (0x9b, 0xab, 0xb8), # 22 Light silver gray
    (0x84, 0x7e, 0x87), # 23 Medium gray
    (0x69, 0x6a, 0x6a), # 24 Dark gray
    (0x59, 0x56, 0x52), # 25 Charcoal
    (0x76, 0x42, 0x8a), # 26 Dark purple
    (0xac, 0x32, 0x32), # 27 Crimson red
    (0xd9, 0x57, 0x63), # 28 Coral pink
    (0xd7, 0x7b, 0xba), # 29 Orchid purple
    (0x8f, 0x97, 0x4a), # 30 Khaki green
    (0x8a, 0x6f, 0x30), # 31 Bronze / gold
]

def quantize_to_palette(img: Image.Image, remove_bg=True) -> Image.Image:
    """Fast vectorized quantization: removes background and snaps colors to PALETTE_32."""
    img = img.convert('RGBA')
    arr = np.array(img, dtype=float)
    h, w, _ = arr.shape

    # Sample corners to find background color
    corners = np.array([
        arr[0, 0, :3],
        arr[0, w-1, :3],
        arr[h-1, 0, :3],
        arr[h-1, w-1, :3]
    ])
    bg_color = np.median(corners, axis=0)

    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]

    # Calculate distance to background color
    bg_dist = np.sqrt(np.sum((rgb - bg_color)**2, axis=2))
    is_near_white = (rgb[:, :, 0] > 235) & (rgb[:, :, 1] > 235) & (rgb[:, :, 2] > 235)

    # Edge mask: coordinates near borders
    yy, xx = np.mgrid[:h, :w]
    is_edge = (xx < 5) | (xx > w - 6) | (yy < 5) | (yy > h - 6)

    mask_transparent = (alpha < 32)
    if remove_bg:
        mask_transparent |= (bg_dist < 42.0) | (is_near_white & is_edge)

    # Vectorized palette matching
    pal_arr = np.array(PALETTE_32, dtype=float) # (32, 3)
    weights = np.array([0.3, 0.59, 0.11], dtype=float)

    # Reshape RGB to (N, 1, 3) and palette to (1, 32, 3)
    flat_rgb = rgb.reshape(-1, 1, 3)
    diff = flat_rgb - pal_arr.reshape(1, 32, 3) # (N, 32, 3)
    weighted_sq_dist = np.sum((diff ** 2) * weights, axis=2) # (N, 32)
    best_pal_indices = np.argmin(weighted_sq_dist, axis=1) # (N,)

    out_rgb = pal_arr[best_pal_indices].reshape(h, w, 3).astype(np.uint8)
    out_alpha = np.where(mask_transparent, 0, 255).astype(np.uint8)

    out_arr = np.dstack([out_rgb, out_alpha])
    return Image.fromarray(out_arr, 'RGBA')

def fetch_ai_image(prompt: str, base_url: str, api_key: str) -> Image.Image:
    req = urllib.request.Request(
        f'{base_url}/images/generations',
        data=json.dumps({
            'prompt': prompt,
            'model': 'gemini-3.1-flash-image',
            'n': 1,
            'size': '1024x1024'
        }).encode(),
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        b64 = res['data'][0]['b64_json']
        return Image.open(io.BytesIO(base64.b64decode(b64)))

def main():
    config = yaml.safe_load(open('/home/tyler/.hermes/profiles/tyler/config.yaml'))
    agy = [p for p in config.get('custom_providers', []) if p.get('name') == 'antigravity'][0]
    api_key = agy['api_key']
    base_url = agy['base_url']

    targets = [
        # 6 Fantasy Portraits 48x48
        ('portrait_1.png', (48, 48), True, 'A detailed fantasy medieval knight portrait, steel helmet with gold visor, blue glow, red plume, dramatic 16-bit retro pixel art, clean isolated sprite on plain solid white background'),
        ('portrait_2.png', (48, 48), True, 'A detailed fantasy archmage wizard portrait, pointed dark purple hat with gold buckle, long flowing white beard, glowing eyes, 16-bit retro pixel art, clean isolated sprite on plain solid white background'),
        ('portrait_3.png', (48, 48), True, 'A detailed fantasy shadow rogue assassin portrait, dark hood, cloth mask over face, glowing emerald green eyes, 16-bit retro pixel art, clean isolated sprite on plain solid white background'),
        ('portrait_4.png', (48, 48), True, 'A detailed fantasy elf ranger portrait, green archer hood, pointed elf ears, golden braided hair, 16-bit retro pixel art, clean isolated sprite on plain solid white background'),
        ('portrait_5.png', (48, 48), True, 'A detailed fantasy dwarf warrior portrait, horned iron helmet, giant braided orange beard with metal rings, fierce expression, 16-bit retro pixel art, clean isolated sprite on plain solid white background'),
        ('portrait_6.png', (48, 48), True, 'A detailed fantasy sun cleric priest portrait, golden sun halo circlet, white vestments, serene expression, 16-bit retro pixel art, clean isolated sprite on plain solid white background'),

        # 4 Town Buildings 48x48
        ('building_tavern.png', (48, 48), True, 'A medieval fantasy tavern building with timber framing, warm yellow lit windows, wooden sign, 16-bit retro pixel art, isolated sprite on plain solid white background'),
        ('building_shop.png', (48, 48), True, 'A medieval fantasy market shop stall with striped cloth canopy roof, crates, 16-bit retro pixel art, isolated sprite on plain solid white background'),
        ('building_temple.png', (48, 48), True, 'A fantasy stone cathedral temple building with stained glass arch and spire, 16-bit retro pixel art, isolated sprite on plain solid white background'),
        ('building_inn.png', (48, 48), True, 'A cozy medieval fantasy roadside inn lodge with stone chimney, 16-bit retro pixel art, isolated sprite on plain solid white background'),
    ]

    assets_dir = '/home/tyler/workspaces/godville/assets'
    public_dir = '/home/tyler/workspaces/godville/apps/web/public/assets'

    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    for filename, (tw, th), rem_bg, prompt in targets:
        print(f"Generating {filename} with Gemini Image...")
        try:
            raw_img = fetch_ai_image(prompt, base_url, api_key)
            # Intermediate downsample
            resized = raw_img.resize((tw, th), Image.Resampling.LANCZOS)
            pixel_img = quantize_to_palette(resized, remove_bg=rem_bg)

            p1 = os.path.join(assets_dir, filename)
            p2 = os.path.join(public_dir, filename)
            pixel_img.save(p1)
            pixel_img.save(p2)
            print(f" -> Saved {p1} and {p2}")
        except Exception as e:
            print(f"Failed {filename}: {e}")

if __name__ == '__main__':
    main()
