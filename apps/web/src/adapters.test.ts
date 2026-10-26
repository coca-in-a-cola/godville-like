import { HERO_BASE_STATS, type FightEvent } from '@godville/sim';
import { describe, expect, it } from 'vitest';
import en from '../../../locales/en.json';
import { createTranslator } from './i18n.ts';
import { formatEvent, formatGameTime, summarize } from './logFormat.ts';
import { draftFromStats, parseGp, parseSeed, parseStatDraft } from './statForm.ts';

const t = createTranslator(en, 'en');
const names = { hero: 'Hero', monster: 'Dust Bunny' };

describe('stat editor parsing', () => {
  it('accepts the hero base and reports invalid fields without throwing', () => {
    const ok = parseStatDraft(draftFromStats(HERO_BASE_STATS));
    expect(ok).toEqual({ ok: true, value: HERO_BASE_STATS, errors: {} });
    const bad = parseStatDraft({ ...draftFromStats(HERO_BASE_STATS), crit: '12abc', regen: '', damageMin: '9' });
    expect(bad).toEqual({ ok: false, errors: { crit: 'not_a_number', regen: 'not_a_number', damageMin: 'min_above_max' } });
    expect(parseStatDraft({ ...draftFromStats(HERO_BASE_STATS), maxHp: '1e3' }).ok).toBe(false);
  });

  it('parses seeds and GP strictly', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed('4294967295')).toBe(4294967295);
    expect(parseSeed('4294967296')).toBeNull();
    expect(parseSeed('-1')).toBeNull();
    expect(parseGp('100', 100)).toBe(100);
    expect(parseGp('101', 100)).toBeNull();
  });
});

describe('combat log rendering', () => {
  it('formats game time like the GDD log', () => {
    expect(formatGameTime(t, 3200)).toBe('[00:03.2]');
    expect(formatGameTime(t, 65_000)).toBe('[01:05.0]');
  });

  it('renders hits, crits, counters, dodges and god actions with GDD tones', () => {
    const hit: FightEvent = { type: 'hit', tick: 50, attacker: 'monster', defender: 'hero', counter: false, roll: 10, crit: false, raw: 10, blocked: 4, dealt: 6, hpLoss: 60, hp: 400 };
    expect(formatEvent(t, names, hit)).toEqual({ time: '[00:05.0]', actor: 'Dust Bunny → Hero', text: '−6   (defense −4)', tone: 'taken' });
    const counterCrit: FightEvent = { ...hit, attacker: 'hero', defender: 'monster', counter: true, crit: true, blocked: 0 };
    expect(formatEvent(t, names, counterCrit)).toMatchObject({ text: 'COUNTER CRIT −6', tone: 'crit' });
    expect(formatEvent(t, names, { type: 'dodge', tick: 41, attacker: 'monster', defender: 'hero', counter: false })).toMatchObject({
      time: '[00:04.1]',
      text: 'DODGE',
      tone: 'dodge',
    });
    expect(formatEvent(t, names, { type: 'god', tick: 53, action: 'smite', target: 'monster', cost: 25, amount: 520, hp: 0 })).toEqual({
      time: '[00:05.3]',
      actor: 'GOD',
      text: 'SMITE −52',
      tone: 'god',
    });
    expect(formatEvent(t, names, { type: 'heal', tick: 1, side: 'hero', source: 'vampirism', amount: 15, hp: 900 })).toMatchObject({
      text: '+1.5 (vampirism)',
      tone: 'heal',
    });
    expect(formatEvent(t, names, { type: 'counter', tick: 1, side: 'hero' })).toBeNull();
    expect(summarize([hit, counterCrit, { type: 'counter', tick: 1, side: 'hero' }])).toEqual({ hits: 2, crits: 1, dodges: 0, counters: 1 });
  });
});
