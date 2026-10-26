import { useState } from 'preact/hooks';
import type { SessionAction } from '@godville/sim';
import type { GameRuntime } from './gameRuntime.ts';
import { translator as t } from './gameData.ts';
import { HeroPanel } from './views/HeroPanel.tsx';
import { LivePanel } from './views/LivePanel.tsx';
import { GodPanel } from './views/GodPanel.tsx';
export type Act = (action: SessionAction) => Promise<void>;
export function GameView({ runtime: r }: { runtime: GameRuntime }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const s = r.canonicalSession.value;
  const disabled = pending || r.loading.value || r.catchingUp.value || r.status.value !== 'ready';
  const act: Act = async action => {
    if (disabled) return;
    setPending(true);
    try {
      const result = await r.userAction(action);
      setMessage(result ? result.ok ? t.t('ui.actionAccepted') : t.t(`reject.${result.reason}`) : t.t('ui.actionUnavailable'));
    } catch (error) { setMessage(t.t('ui.actionFailed', { error: String(error) })); }
    finally { setPending(false); }
  };
  return <main class="ledger">
    <header class="masthead"><div><p class="eyebrow">{t.t('ui.edition')}</p><h1>{t.t('ui.title')}</h1><p>{t.t('ui.subtitle')}</p></div><div class="edition"><span>{t.t('ui.localOnly')}</span><span>{t.t('ui.clockRule')}</span><a href="?sandbox=1">{t.t('ui.sandbox')}</a></div></header>
    <nav class="mobile-nav" aria-label={t.t('ui.sections')}><a href="#hero">{t.t('ui.hero')}</a><a href="#live">{t.t('ui.live')}</a><a href="#god">{t.t('god.title')}</a></nav>
    {r.status.value === 'readonly' && <aside class="notice" role="status">{t.t('ui.readonly')} <button onClick={() => location.reload()}>{t.t('ui.reload')}</button></aside>}
    {r.errors.value.length > 0 && <aside class="notice error" role="alert"><strong>{t.t('ui.error')}</strong><ul>{r.errors.value.map(error => <li key={error}>{error}</li>)}</ul><p>{t.t('ui.errorAdvice')}</p><button onClick={() => location.reload()}>{t.t('ui.reload')}</button></aside>}
    {(r.loading.value || r.catchingUp.value) && <aside class="notice" role="status" aria-live="polite"><strong>{t.t(r.catchingUp.value ? 'ui.catchingUp' : 'ui.loading')}</strong><progress max={Math.max(1, r.progress.value.totalMs)} value={r.progress.value.completedMs} /><p>{t.t('ui.progress', { done: t.number(r.progress.value.completedMs / 1000, { maximumFractionDigits: 0 }), total: t.number(r.progress.value.totalMs / 1000, { maximumFractionDigits: 0 }) })}</p></aside>}
    {s && <div class="game-columns" aria-busy={r.catchingUp.value}><div id="hero"><HeroPanel session={s} act={act} disabled={disabled} /></div><div id="live"><LivePanel runtime={r} session={s} /></div><div id="god"><GodPanel session={s} act={act} disabled={disabled} /><p class="action-result" role="status" aria-live="polite">{message}</p></div></div>}
    <footer>{t.t('ui.footer')}</footer>
  </main>;
}
