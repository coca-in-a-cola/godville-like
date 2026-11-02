/** UI preferences kept outside the save envelope. Pure parsers are tested; storage access never throws. */
import { signal } from '@preact/signals';

export type Theme = 'light' | 'dark';
export interface MusicSettings { on: boolean; volume: number }
export const THEME_KEY = 'godville.theme';
export const MUSIC_KEY = 'godville.music';
export const DEFAULT_MUSIC: MusicSettings = { on: true, volume: 0.4 };

export function parseTheme(raw: string | null): Theme {
  return raw === 'dark' ? 'dark' : 'light';
}
export function parseMusic(raw: string | null, fallbackOn = DEFAULT_MUSIC.on): MusicSettings {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (value && typeof value === 'object') {
      const { on, volume } = value as Record<string, unknown>;
      return {
        on: typeof on === 'boolean' ? on : fallbackOn,
        volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DEFAULT_MUSIC.volume,
      };
    }
  } catch { /* fall through to defaults */ }
  return { on: fallbackOn, volume: DEFAULT_MUSIC.volume };
}

function read(key: string): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* preferences are best-effort */ }
}

export const theme = signal<Theme>(parseTheme(read(THEME_KEY)));
export const music = signal<MusicSettings>(parseMusic(read(MUSIC_KEY)));
/** True once the user has an explicit music preference; otherwise the profile's calmMusic choice applies. */
export const musicStored = read(MUSIC_KEY) !== null;

export function applyTheme(value: Theme = theme.value): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = value;
}
export function setTheme(value: Theme): void {
  theme.value = value; write(THEME_KEY, value); applyTheme(value);
}
export function setMusic(value: MusicSettings): void {
  music.value = value; write(MUSIC_KEY, JSON.stringify(value));
}
