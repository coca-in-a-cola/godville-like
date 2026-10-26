/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { createSession, renderItemName, type WorldEvent, type DivineEvent } from '@godville/sim';
import { gameData, translator as t } from './gameData.ts';
import { contentName, diaryLines, questName } from './viewFormat.ts';
import en from '../../../locales/en.json';
import { IntlMessageFormat } from 'intl-messageformat';

describe('localized player view formatting', () => {
  it('resolves catalog labels and full equipment names, and makes missing keys visible', () => {
    for (const kind of ['towns','monsters','trophies'] as const) for (const row of gameData[kind]) expect(contentName(kind,row.id)).toBe(row.name_en);
    expect(contentName('monsters','missing')).toBe(t.t('ui.unknown'));
    expect(t.t('a.deliberately.missing.key')).toBe('a.deliberately.missing.key');
    const s = createSession(gameData,42);
    for (const item of Object.values(s.world.hero.inventory.equipped)) expect(renderItemName(gameData,item!)).toContain(gameData.bases.find(b => b.id === item!.baseId)!.name_en);
    expect(questName('quest_42')).not.toMatch(/^quest\./);
  });
  it('parses every locale message as ICU, not an interpolated source string', () => {
    for (const [key,source] of Object.entries(en)) expect(() => new IntlMessageFormat(source,'en'), key).not.toThrow();
  });
  it('renders every world and divine event with typed parameters and five main variants', () => {
    const s = createSession(gameData,42);

    // Keep discriminated payload checking on the fixtures rather than widening with casts.
    const fixtures: WorldEvent[] = [
      {type:'phase',phase:'town',seq:0,atMs:0}, {type:'quest_taken',questId:'quest_1',seq:1,atMs:1},
      {type:'quest_paid',questId:'quest_1',gold:60,xp:60,faith:3,seq:2,atMs:2}, {type:'level',level:2,seq:3,atMs:3},
      {type:'migration',from:gameData.towns[0]!.id,to:gameData.towns[1]!.id,seq:4,atMs:4}, {type:'return',reason:'hp',seq:5,atMs:5},
      {type:'encounter',monsterId:'monster_1',contentId:gameData.monsters[0]!.id,level:1,seq:6,atMs:6}, {type:'flee',success:true,seq:7,atMs:7},
      {type:'combat_end',monsterId:'monster_1',outcome:'hero_won',ticks:20,hp:100,seq:8,atMs:8}, {type:'loot',kind:'item',id:'starter_weapon',accepted:true,seq:9,atMs:9},
      {type:'find',kind:'gold',amount:5,seq:10,atMs:10}, {type:'diary',variant:0,seq:11,atMs:11},
      {type:'town_service',sold:1,gold:3,boughtId:null,seq:12,atMs:12}, {type:'resurrect',goldLost:1,itemId:null,seq:13,atMs:13},
      {type:'voice_effect',intent:'rest',amount:5,seq:14,atMs:14},
    ];
    const divine: DivineEvent[] = [
      {type:'miracle',kind:'blessing',queued:true,amount:0,strengthBp:10000,seq:0,atRealMs:15,atGameMs:15},
      {type:'voice',keyword:'rest',obeyed:false,seq:1,atRealMs:16,atGameMs:16},
      {type:'upgrade',upgrade:'flow',level:1,cost:5,seq:2,atRealMs:17,atGameMs:17},
      {type:'charge_used',amount:100,seq:3,atRealMs:18,atGameMs:18},
      {type:'item_blessed',itemId:'starter_weapon',seq:4,atRealMs:19,atGameMs:19},
    ];

    s.world.diary = fixtures; s.diary = divine;
    const lines = diaryLines(s);
    expect(lines).toHaveLength(20);
    expect(lines.map(l => l.text).join('\n')).not.toMatch(/diary\.|undefined|monster_1|starter_weapon|quest_1/);
    expect(lines.find(l => l.id === 'w6')!.text).toContain(gameData.monsters[0]!.name_en);
    expect(lines).toEqual(diaryLines(s));
    for (const event of [...fixtures,...divine]) for (let i=0;i<5;i++) expect(en).toHaveProperty(`diary.${event.type}.${i}`);
  });
  it('does not reuse a composite variant in the previous twenty lines, even for repeated travel', () => {
    const s = createSession(gameData,42);
    s.world.diary = Array.from({length:100},(_,seq) => ({type:'diary',variant:seq%16,seq,atMs:seq}));
    const lines = diaryLines(s);
    for (let i=0;i<lines.length;i++) {
      expect(lines.slice(Math.max(0,i-20),i).map(l => l.variantKey)).not.toContain(lines[i]!.variantKey);
      expect(lines.slice(Math.max(0,i-20),i).map(l => l.text)).not.toContain(lines[i]!.text);
    }
  });
});
