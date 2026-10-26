/** Runs the 200-trial Monte Carlo forecast off the UI thread. */

import { forecastFight, type FightState, type ForecastResult } from '@godville/sim';
import { expose } from 'comlink';

const api = {
  forecast(state: FightState, seed: number): ForecastResult {
    return forecastFight(state, { seed });
  },
};

export type ForecastWorkerApi = typeof api;

expose(api);
