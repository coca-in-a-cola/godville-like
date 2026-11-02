import type { SessionState } from '@godville/sim';
import { gameData, translator as t } from '../gameData.ts';
import { roadCells } from '../roadMap.ts';
import { absoluteMile, n } from '../viewFormat.ts';
export function RoadMapCard({ session: s }: { session: SessionState }) {
  const mile = absoluteMile(s);
  const cells = roadCells(gameData.towns, mile);
  return <section class="card roadmap-card"><h2 class="card-title">{t.t('ui.roadmap')} <span class="hint">{t.t('ui.roadmapCell')}</span></h2>
    <ol class="road" aria-label={t.t('ui.heroMarker', { mile: n(mile) })} style={`--cells:${cells.length}`}>
      {cells.map(cell => { const town = cell.townId ? gameData.towns.find(row => row.id === cell.townId) : undefined; return <li key={cell.index} class={`road-cell${town ? ' town' : ''}${cell.hero ? ' hero' : ''}`} title={t.t('ui.mileMark', { mile: cell.startMile })}>
        {town && <span class="road-town">{town.name_en}</span>}
        {cell.hero && <span class="road-hero" aria-hidden="true" />}
      </li>; })}
    </ol>
    <p class="hint num">{t.t('ui.heroMarker', { mile: n(mile) })}</p>
  </section>;
}
