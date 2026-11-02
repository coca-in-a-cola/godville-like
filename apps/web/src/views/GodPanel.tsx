import { useState } from 'preact/hooks';
import { faithUpgradeCost, type FaithUpgrade, type SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import { n } from '../viewFormat.ts';
import type { Act } from '../gameView.tsx';
import { Meter } from './HeroPanel.tsx';
export function GodPanel({ session: s, godName, act, disabled }: { session: SessionState; godName: string; act: Act; disabled: boolean }) {
  const [voice, setVoice] = useState('');
  const g = s.world.god;
  const seconds = Math.ceil((360000 - g.regenCarryMs) / (1 + s.upgrades.flow) / 1000);
  return <section class="card god-card"><h2 class="card-title">{t.t('god.title')}</h2><p class="deity"><span class="eyebrow">{t.t('ui.deity')}</span> {godName}</p><Meter label={t.t('ui.godpower')} value={g.gp} max={g.gpMax} kind="godpower" text={t.t('god.gp', { gp: g.gp, max: g.gpMax })} /><p class="hint num">{t.t('ui.flowRate', { seconds, rate: n(360 / (1 + s.upgrades.flow)) })}</p><p class="num">{t.t('ui.charges', { charges: s.charges, overflow: s.overflowGp })}</p><button disabled={disabled || s.charges === 0 || g.gpMax - g.gp < 100} onClick={() => void act({ type: 'use_charge' })}>{t.t('ui.useCharge')}</button><p class="hint">{t.t('ui.chargeHint')}</p>
    <h3>{t.t('ui.miracles')}</h3><div class="miracles">{(['smite','blessing'] as const).map(type => <div class="intervention" key={type}><button class="miracle" disabled={disabled || g.gp < 25 || s.world.phase === 'dead'} onClick={() => void act({ type })} title={t.t(`ui.${type}Hint`)}>{t.t(`button.${type}`, { cost: 25 })}</button></div>)}</div>{s.world.combat && s.world.combat.fight.queue.length > 0 && <p class="hint">{t.t('god.queued', { count: s.world.combat.fight.queue.length })}</p>}
    <details class="hint-drawer"><summary class="hint">{t.t('ui.blessing')} / {t.t('ui.smite')}</summary><p class="hint">{t.t('ui.blessingHint')}</p><p class="hint">{t.t('ui.smiteHint')}</p></details>
    <form class="voice" onSubmit={event => { event.preventDefault(); void act({ type: 'voice', keyword: voice }); }}><label for="voice">{t.t('ui.voice')}</label><div class="voice-row"><input id="voice" value={voice} autoComplete="off" onInput={event => setVoice(event.currentTarget.value)} list="voice-words" /><datalist id="voice-words">{['fight','flee','rest','town','dig'].map(word => <option value={word} key={word} />)}</datalist><button disabled={disabled || s.world.phase === 'dead'}>{t.t('ui.sendVoice')}</button></div><p class="hint">{t.t('ui.voiceHint', { chance: 30 + s.upgrades.clarity * 10 })}</p></form>
    <h3>{t.t('ui.faithUpgrades', { faith: n(s.world.faith) })}</h3>{(['capacity','flow','miracle','clarity'] as FaithUpgrade[]).map(upgrade => { const cost = faithUpgradeCost(s, upgrade); return <div class="upgrade" key={upgrade}><h4>{t.t(`upgrade.${upgrade}`)} <span class="num">{t.t('ui.upgradeLevel', { level: s.upgrades[upgrade], max: upgrade === 'clarity' ? 7 : 10 })}</span></h4><p class="hint">{t.t(`upgrade.${upgrade}Hint`)}</p><button disabled={disabled || cost === null || s.world.faith < cost} onClick={() => void act({ type: 'upgrade', upgrade })}>{cost === null ? t.t('ui.capped') : t.t('ui.buyUpgrade', { cost })}</button></div>; })}
    <h3>{t.t('ui.temple')}</h3><p class="num">{t.t('ui.bricks', { bricks: n(s.world.bricks) })}</p><p class="hint">{t.t('ui.templeDeferred')}</p>
  </section>;
}
