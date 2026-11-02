import { useState } from 'preact/hooks';
import type { GameRuntime } from '../gameRuntime.ts';
import { gameData, translator as t } from '../gameData.ts';
import type { PlayerProfile } from '../sessionSchema.ts';

const PORTRAITS = [
  'portrait_1',
  'portrait_2',
  'portrait_3',
  'portrait_4',
  'portrait_5',
  'portrait_6',
] as const;

export function StartScreen({ runtime }: { runtime: GameRuntime }) {
  const namePool = gameData.names.length > 0
    ? gameData.names.map((n) => n.name_en)
    : ['Alec the Bold', 'Gwen of the Hills', 'Brog the Clumsy', 'Sera the Swift', 'Dorin the Stout', 'Finn the Lucky'];

  const getRandomName = () => namePool[Math.floor(Math.random() * namePool.length)]!;

  const [suggestedHero, setSuggestedHero] = useState<string>(getRandomName);
  const [heroInput, setHeroInput] = useState<string>('');
  const [godInput, setGodInput] = useState<string>('');
  const [selectedPortrait, setSelectedPortrait] = useState<string>(PORTRAITS[0]);
  const [calmMusic, setCalmMusic] = useState<boolean>(true);
  const [starting, setStarting] = useState<boolean>(false);

  const handleReroll = () => {
    setSuggestedHero(getRandomName());
  };

  const handleStart = async (e: Event) => {
    e.preventDefault();
    if (starting) return;
    setStarting(true);
    const profile: PlayerProfile = {
      heroName: heroInput.trim() || suggestedHero,
      godName: godInput.trim() || t.t('start.defaultGodName'),
      portraitId: selectedPortrait,
      calmMusic,
    };
    try {
      await runtime.startGame(profile);
    } finally {
      setStarting(false);
    }
  };

  return (
    <main class="ledger start-screen">
      <section class="start-card">
        <header class="start-header">
          <p class="eyebrow">{t.t('ui.edition')}</p>
          <h1>{t.t('start.title')}</h1>
          <p class="lore-line">{t.t('start.lore1')}</p>
          <p class="lore-line">{t.t('start.lore2')}</p>
        </header>

        <form onSubmit={handleStart} class="start-form">
          <div class="form-group">
            <label for="hero-name">{t.t('start.heroLabel')}</label>
            <div class="input-with-button">
              <input
                id="hero-name"
                type="text"
                value={heroInput}
                onInput={(e) => setHeroInput(e.currentTarget.value)}
                placeholder={t.t('start.heroPlaceholder', { name: suggestedHero })}
                maxLength={50}
              />
              <button
                type="button"
                class="btn-reroll"
                onClick={handleReroll}
                title={t.t('start.reroll')}
                aria-label={t.t('start.reroll')}
              >
                🎲
              </button>
            </div>
            <p class="field-hint">{t.t('start.optionalHint')}</p>
          </div>

          <div class="form-group">
            <label for="god-name">{t.t('start.godLabel')}</label>
            <input
              id="god-name"
              type="text"
              value={godInput}
              onInput={(e) => setGodInput(e.currentTarget.value)}
              placeholder={t.t('start.godPlaceholder')}
              maxLength={50}
            />
            <p class="field-hint">{t.t('start.optionalHint')}</p>
          </div>

          <div class="form-group">
            <label>{t.t('start.portraitLabel')}</label>
            <div class="portrait-selector" role="radiogroup" aria-label={t.t('start.portraitLabel')}>
              {PORTRAITS.map((p, idx) => (
                <button
                  type="button"
                  key={p}
                  class={`portrait-option ${selectedPortrait === p ? 'selected' : ''}`}
                  onClick={() => setSelectedPortrait(p)}
                  role="radio"
                  aria-checked={selectedPortrait === p}
                  aria-label={`Portrait ${idx + 1}`}
                >
                  <img src={`./assets/${p}.png`} width={48} height={48} alt={`Portrait ${idx + 1}`} class="portrait-thumb" />
                </button>
              ))}
            </div>
          </div>

          <div class="form-group checkbox-group">
            <label class="music-checkbox">
              <input
                type="checkbox"
                checked={calmMusic}
                onChange={(e) => setCalmMusic(e.currentTarget.checked)}
              />
              <span>{t.t('start.calmMusic')}</span>
            </label>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-start-game" disabled={starting}>
              {starting ? t.t('ui.loading') : t.t('start.submit')}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
