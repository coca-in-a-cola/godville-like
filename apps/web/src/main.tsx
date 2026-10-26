import { render } from 'preact';
import { App } from './app.tsx';
import { translator } from './gameData.ts';
import { startLoop } from './sandbox.ts';
import './styles.css';

document.title = translator.t('app.title');
render(<App />, document.getElementById('app')!);
startLoop();
