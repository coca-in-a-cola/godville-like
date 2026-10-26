import { render } from 'preact';
import { translator } from './gameData.ts';
import './styles.css';
import './game.css';

try {
const sandbox = new URLSearchParams(location.search).get('sandbox') === '1' || location.hash === '#sandbox';
if (sandbox) {
  const [{ App }, { startLoop }] = await Promise.all([import('./app.tsx'), import('./sandbox.ts')]);
  document.title = translator.t('app.title');
  render(<App />, document.getElementById('app')!);
  const stop = startLoop();
  if (import.meta.hot) import.meta.hot.dispose(stop);
} else {
  const [{ GameView }, { createBrowserGame }] = await Promise.all([import('./gameView.tsx'), import('./browserGame.ts')]);
  document.title = translator.t('ui.title');
  const game = createBrowserGame();
  render(<GameView runtime={game.runtime} />, document.getElementById('app')!);
  if (import.meta.hot) import.meta.hot.dispose(game.dispose);
}
} catch (error) {
  document.title = translator.t('ui.title');
  render(<main class="ledger"><aside class="notice error" role="alert"><h1>{translator.t('ui.error')}</h1><p>{String(error)}</p><p>{translator.t('ui.errorAdvice')}</p><button onClick={() => location.reload()}>{translator.t('ui.reload')}</button></aside></main>, document.getElementById('app')!);
}
