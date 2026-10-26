import { inventoryStats, worldZone, type SessionState } from '@godville/sim';
import { gameData, translator as t } from '../gameData.ts';
import { n, contentName, questName } from '../viewFormat.ts';
import type { Act } from '../gameView.tsx';
import { InventoryPanel } from './InventoryPanel.tsx';
export function Meter({ label, value, max, text, kind = '' }: { label: string; value: number; max: number; text: string; kind?: string }) {
  return <div class={`ledger-meter ${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span class="meter-fill" style={{ width: `${Math.max(0, Math.min(100, value / Math.max(1,max) * 100))}%` }} /><span class="meter-label">{text}</span></div>;
}
export function HeroPanel({ session: s, act, disabled }: { session: SessionState; act: Act; disabled: boolean }) {
  const w = s.world, h = w.hero, st = h.stats, raw = inventoryStats(h.base, h.inventory);
  const rows = [
    ['maxHp', t.hp(st.maxHp), '—', n(raw.maxHp)],
    ['damage', `${n(st.damageMin)}–${n(st.damageMax)}`, '—', `${n(raw.damageMin)}–${n(raw.damageMax)}`],
    ['attackSpeed', n(st.attackSpeedBp / 100), '200%', n(raw.attackSpeed)],
    ['defense', n(st.defense), '—', n(raw.defense)],
    ['crit', n(st.critBp / 100), '50%', n(raw.crit)],
    ['evasion', n(st.evasionBp / 100), '60%', n(raw.evasion)],
    ['regen', n(st.regenMilliHp / 1000), '—', n(raw.regen)],
    ['vampirism', n(st.vampirismBp / 100), '30%', n(raw.vampirism)],
    ['counter', n(st.counterBp / 100), '40%', n(raw.counter)],
  ];
  return <><section class="sheet"><p class="eyebrow">{t.t('ui.heroSheet')}</p><h2>{t.t('ui.heroName')}</h2><p class="phase">{t.t(`phase.${w.phase}`)} · {t.t('ui.level', { level: h.level })}</p>
    <Meter label={t.t('ui.hp')} value={h.hp} max={st.maxHp} text={t.t('hp.value', { hp: t.hp(h.hp), max: t.hp(st.maxHp) })} kind="health" />
    <Meter label={t.t('ui.xp')} value={h.xp} max={h.nextLevelXp} text={t.t('ui.xpValue', { xp: n(h.xp), max: n(h.nextLevelXp) })} />
    <dl class="facts"><dt>{t.t('ui.gold')}</dt><dd>{n(h.gold)}</dd><dt>{t.t('ui.faith')}</dt><dd>{n(w.faith)}</dd><dt>{t.t('ui.town')}</dt><dd>{contentName('towns', h.currentTownId)}</dd><dt>{t.t('ui.road')}</dt><dd>{t.t('ui.distance', { distance: n(h.distance), zone: worldZone(w, gameData) })}</dd><dt>{t.t('ui.courage')}</dt><dd>{t.number(h.courage, { style: 'percent' })}</dd><dt>{t.t('ui.alignment')}</dt><dd>{n(h.alignment)}</dd></dl>
    <h3>{t.t('ui.quest')}</h3><p>{h.quest ? questName(h.quest.id) : t.t('ui.noQuest')}</p>{h.quest && <Meter label={t.t('ui.quest')} value={h.quest.progress} max={100} text={t.t('ui.percent', { value: n(h.quest.progress) })} />}
    <h3>{t.t('ui.stats')}</h3><p class="hint">{t.t('ui.statsHint')}</p><table><thead><tr><th>{t.t('ui.stat')}</th><th>{t.t('ui.effective')}</th><th>{t.t('ui.raw')}</th><th>{t.t('ui.cap')}</th></tr></thead><tbody>{rows.map(([key, value, cap, total]) => <tr key={key}><th scope="row">{t.t(key === 'damage' ? 'ui.damage' : `stat.${key}`)}</th><td>{value}</td><td>{total}</td><td>{cap}</td></tr>)}</tbody></table>
  </section><InventoryPanel session={s} act={act} disabled={disabled} /></>;
}
