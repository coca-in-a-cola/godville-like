import { useEffect, useRef, useState } from 'preact/hooks';
import { proxy, wrap } from 'comlink';
import { balanceLoadout, normalizeStats, type BalanceResult } from '@godville/sim';
import type { BalanceWorkerApi } from './balance.worker.ts';
import { gameData } from './gameData.ts';

export function BalancePanel() {
  const [zone, setZone] = useState('1');
  const [seed, setSeed] = useState('20261027');
  const [status, setStatus] = useState('Ready');
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [loadout, setLoadout] = useState<ReturnType<typeof balanceLoadout> | null>(null);
  const [runConfig, setRunConfig] = useState<{ zone: number; seed: number } | null>(null);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; worker.current?.terminate(); }, []);
  const cancel = () => {
    generation.current++; worker.current?.terminate(); worker.current = null;
    setStatus('Cancelled — partial data only (not a completed 10,000-fight run)');
  };
  const start = async () => {
    const id = ++generation.current;
    setResult(null); setLoadout(null);
    let instance: Worker | null = null;
    try {
      if (!/^\d+$/.test(zone) || !/^\d+$/.test(seed)) throw new RangeError('Zone and seed must be unsigned integers');
      const z = Number(zone); const s = Number(seed);
      const kit = balanceLoadout(gameData, z, s);
      setLoadout(kit);
      setRunConfig({ zone: z, seed: s });
      instance = new Worker(new URL('./balance.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      setStatus('Running');
      const api = wrap<BalanceWorkerApi>(instance);
      const r = await api.run({ hero: kit.hero, monsters: gameData.monsters, zone: z, seed: s, trials: 10000, maxTicks: 6000 }, proxy(async (partial: BalanceResult) => {
        if (id === generation.current) setResult(partial);
      }));
      if (id === generation.current) { setResult(r); setStatus('Complete'); }
    } catch (error) {
      if (id === generation.current) setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      instance?.terminate();
      if (id === generation.current) worker.current = null;
    }
  };
  const busy = status === 'Running';
  const pct = (n: number | null) => n === null ? 'n/a (no wins)' : `${(n * 100).toFixed(2)}%`;
  return <section class="panel" data-testid="balance-panel">
    <h2>Combat balance · dev batch</h2>
    <p>Fresh full-HP hero, hero level=max(1,zone), gear level=zone. Six generated items held fixed; no selection, interventions or flee policy. Five families sampled uniformly. Independent encounter/combat seeds.</p>
    <div class="setup-row">
      <label class="field">Batch zone (0–100)<input aria-label="Batch zone" value={zone} disabled={busy} onInput={(e) => setZone(e.currentTarget.value)} /></label>
      <label class="field">Batch seed (uint32)<input aria-label="Batch seed" value={seed} disabled={busy} onInput={(e) => setSeed(e.currentTarget.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void start()}>Run 10,000 fights</button>
      <button type="button" disabled={!busy} onClick={cancel}>Cancel batch</button>
    </div>
    <p role="status" data-testid="balance-status">{status} · {result?.trials ?? 0}/10000</p>
    <progress max={10000} value={result?.trials ?? 0} aria-label="Batch progress" />
    {result && <>
      <p>Wins {result.wins} · losses {result.losses} · draws {result.draws} · unresolved {result.unresolved}</p>
      <p>Win rate {pct(result.winRate)} · HP wins-only {pct(result.meanHpWins)} · HP all trials {pct(result.meanHpAll)} · mean duration {result.meanDurationSeconds.toFixed(2)}s (includes capped unresolved).</p>
      <p>GDD reference: about 85% wins; 40–60% remaining HP. This is a measurement, not a balance certification.</p>
      <details><summary>Per-family data / downloadable JSON</summary><pre style={{ overflowX: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>
        <a download="balance.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ ...runConfig, maxTicks: 6000, requestedTrials: 10000, loadout, result }, null, 2))}`}>Download result and loadout</a>
      </details>
    </>}
    {loadout && <details><summary>Used hero stats and six-slot gear recipes</summary><pre style={{ overflowX: 'auto' }}>{JSON.stringify({ ...loadout, normalizedHero: normalizeStats(loadout.hero) }, null, 2)}</pre></details>}
  </section>;
}
