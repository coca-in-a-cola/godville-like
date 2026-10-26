import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import en from '../../../locales/en.json';
import { createTranslator } from './i18n.ts';

const t = createTranslator(en, 'en');

describe('ICU localization', () => {
  it('renders plurals from en.json', () => {
    expect(t.t('log.dodges', { count: 1 })).toBe('1 dodge');
    expect(t.t('log.dodges', { count: 3 })).toBe('3 dodges');
    expect(t.t('god.queued', { count: 2 })).toBe('2 interventions queued for the next tick');
    expect(t.t('outcome.summary', { seconds: '21.4', hits: 1, crits: 0, dodges: 2, counters: 1 })).toBe(
      '21.4 s of game time · 1 hit · 0 crits · 2 dodges · 1 counter',
    );
  });

  it('parses every message in en.json as valid ICU', () => {
    for (const [key, message] of Object.entries(en)) {
      expect(() => new IntlMessageFormat(message, 'en'), key).not.toThrow();
    }
  });

  it('formats HP tenths and shows missing keys verbatim', () => {
    expect(t.hp(875)).toBe('87.5');
    expect(t.hp(1000)).toBe('100');
    expect(t.t('no.such.key')).toBe('no.such.key');
  });
});
