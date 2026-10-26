import { mixSeed, renderItemName, type DivineEvent, type SessionState, type WorldEvent } from '@godville/sim';
import { gameData, translator as t } from './gameData.ts';
import type { MessageValues } from './i18n.ts';
export const n = (value: number) => t.number(value, { maximumFractionDigits: 1 });
export function contentName(kind: 'towns' | 'monsters' | 'trophies', id: string): string {
  return gameData[kind].find(row => row.id === id)?.name_en ?? t.t('ui.unknown');
}
export function questName(id: string): string {
  let hash = 0; for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return t.t(`quest.${hash % 5}`);
}
function itemLabel(session: SessionState, id: string | null): string {
  const inv = session.world.hero.inventory;
  const item = [...Object.values(inv.equipped), ...inv.bag].find(i => i?.id === id);
  const trophy = inv.trophies.find(i => i.id === id);
  return item ? renderItemName(gameData, item) : trophy ? contentName('trophies', trophy.contentId) : t.t('ui.departedItem');
}
export interface DiaryLine { id: string; time: number; text: string; variantKey: string; divine: boolean }
/** Variant identity includes event type. Never repeat one within the previous 20 lines.
 * 21 slots cover even pathological runs of one type; selection never touches sim RNG.
 * Selection is reproducible for a given retained typed history, including after reload. */
export function diaryLines(s: SessionState): DiaryLine[] {
  const events = [...s.world.diary.map(e => ({ event: e, divine: false, time: e.atMs })), ...s.diary.map(e => ({ event: e, divine: true, time: e.atGameMs }))].sort((a,b) => a.time - b.time || Number(a.divine) - Number(b.divine) || a.event.seq - b.event.seq);
  const recent: string[] = [];
  return events.map(({ event: e, divine, time }) => {
    const values: MessageValues = {};
    if (divine) {
      const d = e as DivineEvent;
      switch (d.type) {
        case 'miracle': values.kind = t.t(`ui.${d.kind}`); values.amount = t.hp(d.amount); values.queued = d.queued ? 'yes' : 'no'; break;
        case 'voice': values.keyword = d.keyword ?? t.t('ui.unknownVoice'); values.obeyed = d.obeyed ? 'yes' : 'no'; break;
        case 'upgrade': values.upgrade = t.t(`upgrade.${d.upgrade}`); values.level = d.level; values.cost = d.cost; break;
        case 'charge_used': values.amount = d.amount; break;
        case 'item_blessed': values.item = itemLabel(s, d.itemId); break;
      }
    } else {
      const w = e as WorldEvent;
      switch (w.type) {
        case 'phase': values.phase = t.t(`phase.${w.phase}`); break;
        case 'quest_taken': values.quest = questName(w.questId); break;
        case 'quest_paid': values.quest = questName(w.questId); values.gold = n(w.gold); values.xp = n(w.xp); values.faith = n(w.faith); break;
        case 'level': values.level = w.level; break;
        case 'migration': values.from = contentName('towns', w.from); values.to = contentName('towns', w.to); break;
        case 'return': values.reason = t.t(`reason.${w.reason}`); break;
        case 'encounter': values.monster = contentName('monsters', w.contentId); values.level = w.level; break;
        case 'flee': values.success = w.success ? 'yes' : 'no'; break;
        case 'combat_end': { const encounter = s.world.diary.find(event => event.type === 'encounter' && event.monsterId === w.monsterId); values.monster = encounter?.type === 'encounter' ? contentName('monsters', encounter.contentId) : t.t('ui.opponent'); values.outcome = t.t(`result.${w.outcome}`); values.seconds = n(w.ticks / 10); break; }
        case 'loot': values.item = itemLabel(s, w.id); values.accepted = w.accepted ? 'yes' : 'no'; break;
        case 'find': values.kind = t.t(`resource.${w.kind}`); values.amount = n(w.amount); break;
        case 'diary': break;
        case 'town_service': values.sold = w.sold; values.gold = n(w.gold); values.item = w.boughtId ? itemLabel(s, w.boughtId) : t.t('ui.nothing'); break;
        case 'resurrect': values.gold = n(w.goldLost); values.item = w.itemId ? itemLabel(s, w.itemId) : t.t('ui.nothing'); break;
        case 'voice_effect': values.intent = w.intent; values.amount = n(w.amount); break;
      }
    }
    const prefix = `diary.${e.type}`;
    let variant = mixSeed(s.world.seed, e.seq + (divine ? 100000 : 0)) % 21;
    while (recent.includes(`${prefix}.${variant}`)) variant = (variant + 1) % 21;
    const variantKey = `${prefix}.${variant}`;
    recent.push(variantKey); if (recent.length > 20) recent.shift();
    return { id: `${divine ? 'd' : 'w'}${e.seq}`, time, text: `${t.t(`${prefix}.${variant % 5}`, values)} ${t.t(`diary.coda.${variant}`)}`, variantKey, divine };
  });
}
