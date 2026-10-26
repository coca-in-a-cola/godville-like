/**
 * Browser adapter: owns the clocks and copies plain sim state into signals.
 * The sim itself never sees signals, timers or the DOM.
 */

import { batch, computed, signal } from '@preact/signals';
import {
  GP_MAX_BASE,
  HERO_BASE_STATS,
  advanceFight,
  advanceGodpower,
  createFight,
  createGodState,
  createWorldClock,
  deriveForecastSeed,
  estimateDuel,
  requestIntervention,
  scaleRealToGame,
  type FightEvent,
  type FightState,
  type ForecastResult,
  type GameSpeed,
  type GodState,
  type InterventionKind,
  type InterventionRejection,
  type StatBlock,
  type WorldClock,
} from '@godville/sim';
import { wrap } from 'comlink';
import type { ForecastWorkerApi } from './forecast.worker.ts';
import { gameData } from './gameData.ts';
import { draftFromStats, parseGp, parseSeed, parseStatDraft, type StatDraft } from './statForm.ts';

/**
 * Sandbox monster preset: the GDD zone-1 starting formulas (HP 40+18L,
 * damage 3+1.5L to 5+2.5L, defense 0.6L) with a 1.2 s interval (+25% attack
 * speed). Not a generated family; every value is editable.
 */
export const MONSTER_PRESET: StatBlock = {
  maxHp: 58,
  damageMin: 4.5,
  damageMax: 7.5,
  attackSpeed: 25,
  defense: 0.6,
  crit: 0,
  evasion: 0,
  regen: 0,
  vampirism: 0,
  counter: 0,
};

const DEFAULT_SEED = 20261026;

// ---- editor drafts -------------------------------------------------------

export const heroDraft = signal<StatDraft>(draftFromStats(HERO_BASE_STATS));
export const monsterDraft = signal<StatDraft>(draftFromStats(MONSTER_PRESET));
export const seedDraft = signal(String(DEFAULT_SEED));
export const gpDraft = signal(String(GP_MAX_BASE));
export const monsterId = signal(gameData.monsters[0]?.id ?? '');

export const heroParsed = computed(() => parseStatDraft(heroDraft.value));
export const monsterParsed = computed(() => parseStatDraft(monsterDraft.value));
export const seedParsed = computed(() => parseSeed(seedDraft.value));
export const gpParsed = computed(() => parseGp(gpDraft.value, GP_MAX_BASE));
export const setupValid = computed(
  () => heroParsed.value.ok && monsterParsed.value.ok && seedParsed.value !== null && gpParsed.value !== null,
);

// ---- live state ----------------------------------------------------------

export const fight = signal<FightState>(
  createFight({ seed: DEFAULT_SEED, hero: HERO_BASE_STATS, monster: MONSTER_PRESET }),
);
export const god = signal<GodState>(createGodState(GP_MAX_BASE));
export const events = signal<readonly FightEvent[]>([]);
export const running = signal(false);
export const speed = signal<GameSpeed>('watched');
export const rejection = signal<InterventionRejection | null>(null);
export const forecast = signal<{ result: ForecastResult; tick: number } | null>(null);
export const pageVisible = signal(typeof document === 'undefined' || document.visibilityState === 'visible');
/** The drafts that produced the current fight, to flag unapplied edits. */
const appliedDrafts = signal({ hero: heroDraft.value, monster: monsterDraft.value, seed: seedDraft.value });
export const setupDirty = computed(
  () =>
    appliedDrafts.value.hero !== heroDraft.value ||
    appliedDrafts.value.monster !== monsterDraft.value ||
    appliedDrafts.value.seed !== seedDraft.value,
);

export const monsterName = computed(
  () => gameData.monsters.find((m) => m.id === monsterId.value)?.name_en ?? monsterId.value,
);
export const estimate = computed(() => estimateDuel(fight.value.hero, fight.value.monster));

let worldClock: WorldClock = createWorldClock();
/** Bumped on every reset so late forecast results from an old fight are dropped. */
let fightGeneration = 0;

export function resetFight(): boolean {
  const hero = heroParsed.value;
  const monster = monsterParsed.value;
  const seed = seedParsed.value;
  const gp = gpParsed.value;
  if (!hero.ok || !monster.ok || seed === null || gp === null) return false;
  batch(() => {
    fight.value = createFight({ seed, hero: hero.value, monster: monster.value });
    god.value = createGodState(gp);
    events.value = [];
    running.value = false;
    rejection.value = null;
    forecast.value = null;
    appliedDrafts.value = { hero: heroDraft.value, monster: monsterDraft.value, seed: seedDraft.value };
  });
  worldClock = createWorldClock();
  fightGeneration += 1;
  return true;
}

export function toggleRunning(): void {
  if (fight.value.outcome !== null) return;
  running.value = !running.value;
}

export function intervene(kind: InterventionKind): void {
  const result = requestIntervention(fight.value, god.value, kind);
  batch(() => {
    if (result.ok) {
      fightGeneration++;
      forecast.value = null;
      fight.value = result.fight;
      god.value = result.god;
      rejection.value = null;
    } else {
      rejection.value = result.reason;
    }
  });
}

// ---- clocks --------------------------------------------------------------

const FRAME_MS = 50;
const FORECAST_INTERVAL_MS = 1000;

/**
 * Starts the real-time loop. Real elapsed ms always feed godpower; only the
 * running fight receives game time, scaled by the 1x/0.1x speed.
 */
export function startLoop(): () => void {
  let last = performance.now();
  let fraction = 0;

  const frame = (): void => {
    const now = performance.now();
    fraction += now - last;
    last = now;
    const realMs = Math.floor(fraction);
    if (realMs <= 0) return;
    fraction -= realMs;

    const nextGod = advanceGodpower(god.value, realMs);
    let nextFight: FightState | null = null;
    let newEvents: FightEvent[] = [];
    if (running.value && fight.value.outcome === null) {
      const scaled = scaleRealToGame(worldClock, realMs, speed.value);
      worldClock = scaled.clock;
      const advanced = advanceFight(fight.value, scaled.gameMs);
      nextFight = advanced.state;
      newEvents = advanced.events;
    }
    batch(() => {
      if (nextGod.gp !== god.value.gp || nextGod.regenCarryMs !== god.value.regenCarryMs) god.value = nextGod;
      if (nextFight !== null) {
        fight.value = nextFight;
        if (newEvents.length > 0) events.value = [...events.value, ...newEvents].slice(-400);
        if (nextFight.outcome !== null) running.value = false;
      }
    });
  };

  const worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' });
  const forecastApi = wrap<ForecastWorkerApi>(worker);
  let inFlight = false;
  let lastInput: FightState | null = null;

  // At most one forecast per real second, only while the page is visible.
  // States are immutable, so an unchanged reference means an unchanged answer.
  const requestForecast = (): void => {
    const state = fight.value;
    if (inFlight || !pageVisible.value || state.outcome !== null || state === lastInput) return;
    const generation = fightGeneration;
    inFlight = true;
    lastInput = state;
    forecastApi
      .forecast(state, deriveForecastSeed(state.seed, state.tick))
      .then((result) => {
        if (generation === fightGeneration) forecast.value = { result, tick: state.tick };
      })
      .catch((error: unknown) => console.error('forecast failed', error))
      .finally(() => {
        inFlight = false;
      });
  };

  const onVisibility = (): void => {
    pageVisible.value = document.visibilityState === 'visible';
  };
  document.addEventListener('visibilitychange', onVisibility);
  const frameTimer = setInterval(frame, FRAME_MS);
  const forecastTimer = setInterval(requestForecast, FORECAST_INTERVAL_MS);
  requestForecast();

  return () => {
    clearInterval(frameTimer);
    clearInterval(forecastTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    worker.terminate();
  };
}
