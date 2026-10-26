/** Dedicated dev batch worker. Never shares a queue with the live 200-trial forecast. */
import { balanceChunks, type BalanceInput, type BalanceResult } from '@godville/sim';
import { expose } from 'comlink';
const api = {
  async run(input: BalanceInput, progress: (result: BalanceResult) => Promise<void>): Promise<BalanceResult> {
    const chunks = balanceChunks(input);
    for (;;) {
      const step = chunks.next();
      if (step.done) return step.value;
      await progress(step.value);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  },
};
export type BalanceWorkerApi = typeof api;
expose(api);
