import { inventoryStats, type SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import type { PlayerProfile } from '../sessionSchema.ts';
import { n, passportLine } from '../viewFormat.ts';
export function Meter({ label, value, max, text, kind = '' }: { label: string; value: number; max: number; text: string; kind?: string }) {
  return <div class={`ledger-meter ${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span class="meter-fill" style={{ width: `${Math.max(0, Math.min(100, value / Math.max(1,max) * 100))}%` }} /><span class="meter-label">{text}</span></div>;
}
export function Portrait({ profile }: { profile: PlayerProfile }) {
  const portraitId = profile.portraitId || 'portrait_1';
  return (
    <span class="portrait" role="img" aria-label={t.t('ui.portraitAlt', { hero: profile.heroName })}>
      <img
        src={`./assets/${portraitId}.png`}
        alt={profile.heroName}
        width={48}
        height={48}
        class="portrait-img"
        onError={(e) => {
          // Graceful fallback to initial if image fails
          const target = e.currentTarget as HTMLElement;
          target.style.display = 'none';
          if (target.parentElement) target.parentElement.textContent = profile.heroName.trim().charAt(0).toUpperCase();
        }}
      />
    </span>
  );
}
export function HeroCard({ session: s, profile }: { session: SessionState; profile: PlayerProfile }) {
  const h = s.world.hero;
  return <section class="card hero-card"><h2 class="card-title">{t.t('ui.heroTitle')}</h2>
    <div class="hero-head"><Portrait profile={profile} /><div><h3 class="hero-name">{profile.heroName}</h3><p class="passport"><span class="eyebrow">{t.t('ui.passport')}</span> {passportLine(s)}</p></div></div>
    <p class="phase">{t.t(`phase.${s.world.phase}`)}</p>
    <dl class="facts"><dt>{t.t('ui.alignment')}</dt><dd class="num">{n(h.alignment)}</dd><dt>{t.t('ui.courage')}</dt><dd class="num">{t.number(h.courage, { style: 'percent' })}</dd><dt>{t.t('ui.gold')}</dt><dd class="num">{n(h.gold)}</dd><dt>{t.t('ui.faith')}</dt><dd class="num">{n(s.world.faith)}</dd></dl>
  </section>;
}
export function StatusCard({ session: s }: { session: SessionState }) {
  const h = s.world.hero, g = s.world.god, q = h.quest;
  return <section class="card status-card"><h2 class="card-title">{t.t('ui.status')}</h2>
    <Meter label={t.t('ui.hp')} value={h.hp} max={h.stats.maxHp} text={t.t('hp.value', { hp: t.hp(h.hp), max: t.hp(h.stats.maxHp) })} kind="health" />
    <Meter label={t.t('ui.godpower')} value={g.gp} max={g.gpMax} text={t.t('god.gp', { gp: g.gp, max: g.gpMax })} kind="godpower" />
    <Meter label={t.t('ui.quest')} value={q?.progress ?? 0} max={100} text={q ? t.t('ui.questMeter', { value: n(q.progress) }) : t.t('ui.questNone')} kind="quest" />
    <Meter label={t.t('ui.xp')} value={h.xp} max={h.nextLevelXp} text={t.t('ui.xpValue', { xp: n(h.xp), max: n(h.nextLevelXp) })} kind="xp" />
  </section>;
}
export function StatsCard({ session: s }: { session: SessionState }) {
  const h = s.world.hero, st = h.stats, raw = inventoryStats(h.base, h.inventory);
  const pct = (bp: number) => t.t('ui.percent', { value: n(bp / 100) });
  const rows: [string, string, string, number | null][] = [
    ['stat.maxHp', t.hp(st.maxHp), n(raw.maxHp), null],
    ['ui.damage', `${n(st.damageMin)}–${n(st.damageMax)}`, `${n(raw.damageMin)}–${n(raw.damageMax)}`, null],
    ['stat.attackSpeed', pct(st.attackSpeedBp), n(raw.attackSpeed), 200],
    ['stat.defense', n(st.defense), n(raw.defense), null],
    ['stat.crit', pct(st.critBp), n(raw.crit), 50],
    ['stat.evasion', pct(st.evasionBp), n(raw.evasion), 60],
    ['stat.regen', n(st.regenMilliHp / 1000), n(raw.regen), null],
    ['stat.vampirism', pct(st.vampirismBp), n(raw.vampirism), 30],
    ['stat.counter', pct(st.counterBp), n(raw.counter), 40],
  ];
  return <section class="card stats-card"><h2 class="card-title">{t.t('ui.characteristics')}</h2>
    <dl class="stat-block">{rows.map(([key, value, total, cap]) => <div class="stat-cell" key={key} title={`${t.t('ui.raw')} ${total}`}><dt>{t.t(key)}</dt><dd class="num">{value}</dd>{cap !== null && <dd class="stat-cap">{t.t('stat.cap', { cap })}</dd>}</div>)}</dl>
    <p class="hint">{t.t('ui.statsHint')}</p>
  </section>;
}
