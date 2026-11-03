# God-like Visual Style Guide & Art Direction

## Core Aesthetic Invariant
- **Retro Fantasy Pixel Art (16-bit / 32-color)**:
  - All visual assets (characters, buildings, backgrounds, icons) must conform to the 32-color canonical palette (`PALETTE_32` derived from DB32/Endesga).
  - Native display resolution: Canvas 2D operates at **320×96 native pixels** with integer scaling (`image-rendering: pixelated; image-rendering: crisp-edges;`).
  - No blurry anti-aliasing or continuous color gradients. All pixel borders must be sharp, with alpha transparency for characters, monsters, buildings, and icons.

## Target Asset Resolutions
1. **Portraits**: 48×48 px with transparent background.
   - Distinct character archetypes: Knight, Wizard, Rogue, Elf Ranger, Dwarf Warrior, Sun Cleric.
2. **Hero Sprites**: 32×32 px frames.
   - Walk cycle: 4 frames.
   - Attack: 2 frames.
   - Hit / Damage: 1 frame (with white flash).
   - Death: 1 frame (laying down / tombstone).
3. **Monster Families**: 32×32 px frames (2 frames idle, 2 frames attack, 2 frames death).
   - `spider`: Multi-legged arachnid, chittering mandibles, glowing eyes.
   - `golem`: Heavy carved stone / mossy granite automaton.
   - `wraith`: Spectral floating phantom, ethereal cowl, spectral glow.
   - `leech`: Segmented blood-sucking burrower with suction maw.
   - `brute`: Muscular horned bipedal beast with spiked club.
4. **Parallax Backgrounds**: 320×96 px layered horizontal loops.
   - Layer 0: Sky with subtle pixel clouds / gradient steps.
   - Layer 1: Distant mountain peaks / rolling hills (scroll speed ×0.25).
   - Layer 2: Midground forest / stone ruins (scroll speed ×0.75).
   - Layer 3: Foreground road / milestone path (scroll speed ×1.0).
5. **Town Buildings**: 48×48 px per building (Tavern, Market, Temple, Inn).
   - Procedural town-seeded palettes:
     - `godville`: Classical sandstone and terracotta red.
     - `tradeburg`: Coastal slate and vibrant sea-blue.
     - `beerburgh`: Heavy dark timber, brewery brick, and copper/amber.
     - `godvillewood`: Ancient pine, ivy thatch, and moonlit cyan windows.
6. **Icons**: 16×16 px equipment, resource, and UI indicators.

## Generation & Quantization Pipeline
1. Prompt generator: `gemini-3.1-flash-image` via Antigravity API (`https://agy.mice.zone/v1`).
2. Downsampler: Nearest-neighbor / block average to target resolution.
3. Quantizer: Euclidean color distance mapping to `PALETTE_32`.
4. Alpha mask: High-contrast background color removal with edge erosion to ensure clean sprite transparency.
