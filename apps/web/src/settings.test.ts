import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC, parseMusic, parseTheme } from './settings.ts';
import { roadCells } from './roadMap.ts';
import { gameData } from './gameData.ts';

describe('UI preferences', () => {
  it('defaults to the light paper theme and accepts only known values', () => {
    expect(parseTheme(null)).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('neon')).toBe('light');
  });
  it('parses music settings defensively and clamps volume', () => {
    expect(parseMusic(null)).toEqual(DEFAULT_MUSIC);
    expect(parseMusic(null, false)).toEqual({ on: false, volume: DEFAULT_MUSIC.volume });
    expect(parseMusic('{"on":false,"volume":3}')).toEqual({ on: false, volume: 1 });
    expect(parseMusic('not json')).toEqual(DEFAULT_MUSIC);
  });
});

describe('road map strip', () => {
  it('uses one cell per 10 miles, places every town and marks the hero cell', () => {
    const cells = roadCells(gameData.towns, 57);
    expect(cells.length).toBe(Math.floor(Math.max(...gameData.towns.map(t => t.base_mile)) / 10) + 2);
    for (const town of gameData.towns) expect(cells[Math.floor(town.base_mile / 10)]!.townId).toBe(town.id);
    expect(cells.filter(c => c.hero).map(c => c.startMile)).toEqual([50]);
    expect(roadCells(gameData.towns, 500).at(-1)!.startMile).toBe(510);
  });
});
