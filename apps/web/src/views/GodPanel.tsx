import { useState } from 'preact/hooks';
import { faithUpgradeCost, type FaithUpgrade, type SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import { n } from '../viewFormat.ts';
import type { Act } from '../gameView.tsx';
import { Meter } from './HeroPanel.tsx';
export function GodPanel({ session: s, act, disabled }: { session: SessionState; act: Act; disabled: boolean }) {
  const [voice, setVoice] = useState('');
  const g = s.world.god;
  const seconds = Math.ceil((360000 - g.regenCarryMs) / (1 + s.upgrades.flow) / 1000);
  return <section class="sheet divine"><p class="eyebrow">{t.t('ui.divineOffice')}</p><h2>{t.t('god.title')}</h2><Meter label={t.t('god.title')} value={g.gp} max={g.gpMax} kind="godpower" text={t.t('god.gp', { gp: g.gp, max: g.gpMax })} /><p class="hint">{t.t('ui.flowRate', { seconds, rate: n(360 / (1 + s.upgrades.flow)) })}</p><p>{t.t('ui.charges', { charges: s.charges, overflow: s.overflowGp })}</p><button disabled={disabled || s.charges === 0 || g.gpMax - g.gp < 100} onClick={() => void act({ type: 'use_charge' })}>{t.t('ui.useCharge')}</button><p class="hint">{t.t('ui.chargeHint')}</p>
    <hr />{(['blessing','smite'] as const).map(type => <div class="intervention" key={type}><button class="miracle" disabled={disabled || g.gp < 25 || s.world.phase === 'dead'} onClick={() => void act({ type })}>{t.t(`button.${type}`, { cost: 25 })}</button><p class="hint">{t.t(`ui.${type}Hint`)}</p></div>)}{s.world.combat && s.world.combat.fight.queue.length > 0 && <p class="hint">{t.t('god.queued', { count: s.world.combat.fight.queue.length })}</p>}
    <form onSubmit={event => { event.preventDefault(); void act({ type: 'voice', keyword: voice }); }}><label for="voice">{t.t('ui.voice')}</label><input id="voice" value={voice} autoComplete="off" onInput={event => setVoice(event.currentTarget.value)} list="voice-words" /><datalist id="voice-words">{['fight','flee','rest','town','dig'].map(word => <option value={word} key={word} />)}</datalist><button disabled={disabled || s.world.phase === 'dead'}>{t.t('ui.sendVoice')}</button><p class="hint">{t.t('ui.voiceHint', { chance: 30 + s.upgrades.clarity * 10 })}</p></form>
    <h3>{t.t('ui.faithUpgrades', { faith: n(s.world.faith) })}</h3>{(['capacity','flow','miracle','clarity'] as FaithUpgrade[]).map(upgrade => { const cost = faithUpgradeCost(s, upgrade); return <div class="upgrade" key={upgrade}><h4>{t.t(`upgrade.${upgrade}`)} <span>{t.t('ui.upgradeLevel', { level: s.upgrades[upgrade], max: upgrade === 'clarity' ? 7 : 10 })}</span></h4><p class="hint">{t.t(`upgrade.${upgrade}Hint`)}</p><button disabled={disabled || cost === null || s.world.faith < cost} onClick={() => void act({ type: 'upgrade', upgrade })}>{cost === null ? t.t('ui.capped') : t.t('ui.buyUpgrade', { cost })}</button></div>; })}
    <hr /><h3>{t.t('ui.temple')}</h3><p>{t.t('ui.bricks', { bricks: n(s.world.bricks) })}</p><p class="hint">{t.t('ui.templeDeferred')}</p>
  </section>;
}
