import { useEffect, useRef, useState } from 'preact/hooks';
import type { SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import { theme } from '../settings.ts';
import type { GameRuntime } from '../gameRuntime.ts';

export const SCENE_W = 320;
export const SCENE_H = 96;
const GROUND_Y = 74;

const SCENE_ASSETS = [
  'bg_sky.png', 'bg_hills.png', 'bg_forest.png', 'bg_road.png',
  'building_tavern.png', 'building_shop.png', 'building_temple.png', 'building_inn.png',
  'hero_walk.png', 'hero_attack.png', 'hero_hit.png', 'hero_death.png',
  'monster_spider_idle.png', 'monster_golem_idle.png', 'monster_wraith_idle.png',
  'monster_leech_idle.png', 'monster_brute_idle.png'
];

const imageCache = new Map<string, HTMLImageElement>();

function getAsset(name: string, onLoaded?: () => void): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const src = `./assets/${name}`;
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    img.onload = () => {
      onLoaded?.();
    };
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function SceneCard({ session: s, runtime: r }: { session: SessionState; runtime?: GameRuntime }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTheme = theme.value;
  const timeScale = r ? r.timeScale.value : 1;
  const isCatchingUp = r ? r.catchingUp.value : false;
  const [, setAssetsLoaded] = useState(0);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  // Preload all scene sprite assets on mount
  useEffect(() => {
    for (const name of SCENE_ASSETS) {
      getAsset(name, () => setAssetsLoaded((c) => c + 1));
    }
  }, []);

  const isFastForwarding = timeScale > 1 || isCatchingUp;
  const isPaused = timeScale === 0;
  const isStaticFrame = isFastForwarding || prefersReducedMotion || isPaused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    // Palette Colors (32-color DB32 standard)
    const isDark = currentTheme === 'dark';
    const skyColor = isDark ? '#151620' : '#c8daf4';
    const hillFarColor = isDark ? '#252636' : '#94b3c8';
    const hillNearColor = isDark ? '#333744' : '#689478';
    const groundColor = isDark ? '#443f38' : '#8e7956';
    const roadColor = isDark ? '#2e2c28' : '#b09f7a';
    const heroInk = isDark ? '#f4eedb' : '#221f1a';
    const goldColor = '#fbf236';
    const smiteBlue = '#639bff';
    const damageRed = '#d95763';
    const whiteColor = '#ffffff';

    const w = s.world;
    const phase = w.phase;
    const dist = w.hero.distance;

    // 1. Layer 0: Sky
    const skyImg = getAsset('bg_sky.png');
    if (skyImg) {
      ctx.drawImage(skyImg, 0, 0, SCENE_W, SCENE_H);
    } else {
      ctx.fillStyle = skyColor;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    }

    // 2. Layer 1: Distant Hills Parallax
    const hillsImg = getAsset('bg_hills.png');
    if (hillsImg) {
      const farOffset = Math.floor((dist * 2) % SCENE_W);
      ctx.drawImage(hillsImg, -farOffset, 0, SCENE_W, SCENE_H);
      ctx.drawImage(hillsImg, SCENE_W - farOffset, 0, SCENE_W, SCENE_H);
    } else {
      ctx.fillStyle = hillFarColor;
      ctx.beginPath();
      const farOffset = (dist * 2) % 320;
      ctx.moveTo(0, SCENE_H);
      for (let x = 0; x <= SCENE_W; x += 8) {
        const y = 46 + Math.sin((x + farOffset) / 36) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(SCENE_W, SCENE_H);
      ctx.closePath();
      ctx.fill();
    }

    // 3. Layer 2: Midground Forest Parallax
    const forestImg = getAsset('bg_forest.png');
    if (forestImg) {
      const nearOffset = Math.floor((dist * 6) % SCENE_W);
      ctx.drawImage(forestImg, -nearOffset, 0, SCENE_W, SCENE_H);
      ctx.drawImage(forestImg, SCENE_W - nearOffset, 0, SCENE_W, SCENE_H);
    } else {
      ctx.fillStyle = hillNearColor;
      ctx.beginPath();
      const nearOffset = (dist * 6) % 320;
      ctx.moveTo(0, SCENE_H);
      for (let x = 0; x <= SCENE_W; x += 6) {
        const y = 58 + Math.sin((x + nearOffset) / 22) * 8;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(SCENE_W, SCENE_H);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Layer 3: Foreground Ground & Road
    const roadImg = getAsset('bg_road.png');
    if (roadImg) {
      const roadOffset = Math.floor((dist * 16) % SCENE_W);
      ctx.drawImage(roadImg, -roadOffset, 0, SCENE_W, SCENE_H);
      ctx.drawImage(roadImg, SCENE_W - roadOffset, 0, SCENE_W, SCENE_H);
    } else {
      ctx.fillStyle = groundColor;
      ctx.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);
      ctx.fillStyle = roadColor;
      ctx.fillRect(0, GROUND_Y + 4, SCENE_W, 12);
      ctx.fillStyle = isDark ? '#4a463d' : '#8c7d5c';
      const dashOffset = (dist * 12) % 24;
      for (let x = -24; x < SCENE_W + 24; x += 24) {
        ctx.fillRect(x - dashOffset, GROUND_Y + 9, 12, 2);
      }
    }

    // 5. Render Modes
    if (phase === 'town') {
      // Town Architecture: 4 detailed fantasy pixel-art buildings
      const buildings = [
        { x: 20, img: 'building_tavern.png', label: 'TAVERN', color: '#8f563b' },
        { x: 92, img: 'building_shop.png', label: 'MARKET', color: '#5b6ee1' },
        { x: 168, img: 'building_temple.png', label: 'TEMPLE', color: '#76428a' },
        { x: 244, img: 'building_inn.png', label: 'INN', color: '#4b692f' },
      ];

      for (const b of buildings) {
        const bImg = getAsset(b.img);
        if (bImg) {
          ctx.drawImage(bImg, b.x, GROUND_Y - 48, 48, 48);
        } else {
          // Fallback box
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x + 4, GROUND_Y - 40, 40, 40);
        }
        // Small sign label
        ctx.font = 'bold 7px monospace';
        ctx.fillStyle = goldColor;
        ctx.fillText(b.label, b.x + 8, GROUND_Y - 50);
      }

      // Hero in town
      drawHeroSprite(ctx, 150, GROUND_Y, 'idle', false, 0, heroInk);

    } else if (phase === 'dead') {
      // Tombstone & fallen hero sprite
      const tombX = 148;
      const deathImg = getAsset('hero_death.png');
      if (deathImg) {
        ctx.drawImage(deathImg, tombX - 24, GROUND_Y - 18, 32, 32);
      }

      // Tombstone stone
      ctx.fillStyle = '#696a6a';
      ctx.beginPath();
      ctx.moveTo(tombX, GROUND_Y);
      ctx.lineTo(tombX, GROUND_Y - 26);
      ctx.arc(tombX + 12, GROUND_Y - 26, 12, Math.PI, 0);
      ctx.lineTo(tombX + 24, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      // Cross on tombstone
      ctx.fillStyle = '#222034';
      ctx.fillRect(tombX + 10, GROUND_Y - 28, 4, 16);
      ctx.fillRect(tombX + 5, GROUND_Y - 23, 14, 4);

      // Flickering soul / spirit
      const soulY = GROUND_Y - 44 + Math.sin(Date.now() / 200) * 3;
      ctx.fillStyle = 'rgba(99, 155, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(tombX + 12, soulY, 6, 0, Math.PI * 2);
      ctx.fill();

    } else if (phase === 'combat' && w.combat) {
      // Combat Mode
      const fight = w.combat.fight;
      const monsterFamily = w.combat.monster.family;
      const recentLog = r ? r.combatLog.value.slice(-3) : [];

      let heroLunge = 0;
      let monsterLunge = 0;
      let hasHitFlash = false;
      let hasSmite = false;
      let floatText = '';
      let floatColor = damageRed;
      let heroAction: 'idle' | 'attack' | 'hit' = 'idle';

      for (const entry of recentLog) {
        const ev = entry.event;
        if (ev.type === 'hit') {
          if (ev.attacker === 'hero') {
            heroLunge = 10;
            heroAction = 'attack';
          } else {
            monsterLunge = -10;
            heroAction = 'hit';
          }
          hasHitFlash = true;
          floatText = `-${ev.dealt}`;
          if (ev.crit) {
            floatText = `CRIT! -${ev.dealt}`;
            floatColor = goldColor;
          }
        } else if (ev.type === 'dodge') {
          floatText = 'DODGE';
          floatColor = '#c0c0c0';
        } else if (ev.type === 'god' && ev.action === 'smite') {
          hasSmite = true;
          floatText = `SMITE -${ev.amount}`;
          floatColor = smiteBlue;
        }
      }

      const heroX = 96 + (isStaticFrame ? 0 : heroLunge);
      const monsterX = 214 + (isStaticFrame ? 0 : monsterLunge);

      // Draw Hero Combat Sprite
      drawHeroSprite(ctx, heroX, GROUND_Y, heroAction, false, 0, heroInk);

      // Draw Monster Combat Sprite (64x32 2-frame sprite)
      const monsterFrame = isStaticFrame ? 0 : Math.floor((dist * 3) % 2);
      drawMonsterSprite(ctx, monsterX, GROUND_Y, monsterFamily, monsterFrame, isDark);

      // Hit flash overlay
      if (hasHitFlash && !isStaticFrame) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      }

      // Smite divine lightning
      if (hasSmite && !isStaticFrame) {
        ctx.strokeStyle = whiteColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(monsterX + 8, 0);
        ctx.lineTo(monsterX + 14, 25);
        ctx.lineTo(monsterX + 4, 45);
        ctx.lineTo(monsterX + 12, GROUND_Y - 20);
        ctx.stroke();

        ctx.strokeStyle = smiteBlue;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Floating text
      if (floatText && !isStaticFrame) {
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = floatColor;
        ctx.fillText(floatText, monsterX - 6, GROUND_Y - 38);
      }

      // Health bars above combatants
      const heroRatio = Math.max(0, Math.min(1, fight.hero.hp / Math.max(1, fight.hero.stats.maxHp)));
      const monsterRatio = Math.max(0, Math.min(1, fight.monster.hp / Math.max(1, fight.monster.stats.maxHp)));

      // Hero mini bar
      ctx.fillStyle = '#323c39';
      ctx.fillRect(heroX - 10, GROUND_Y - 44, 30, 4);
      ctx.fillStyle = '#6abe30';
      ctx.fillRect(heroX - 10, GROUND_Y - 44, 30 * heroRatio, 4);

      // Monster mini bar
      ctx.fillStyle = '#323c39';
      ctx.fillRect(monsterX - 10, GROUND_Y - 44, 30, 4);
      ctx.fillStyle = '#ac3232';
      ctx.fillRect(monsterX - 10, GROUND_Y - 44, 30 * monsterRatio, 4);

    } else {
      // Walking Mode (phase quest or return)
      const walkFrame = isStaticFrame ? 0 : Math.floor((dist * 4) % 4);
      const isReturning = phase === 'return';
      const heroX = isReturning ? 180 : 130;
      drawHeroSprite(ctx, heroX, GROUND_Y, 'walk', isReturning, walkFrame, heroInk);
    }

    // 6. Static Frame Overlay (Fast-forwarding… or Paused)
    if (isStaticFrame) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, SCENE_W, 20);
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = goldColor;
      ctx.textAlign = 'center';
      const label = isPaused
        ? '⏸ Paused'
        : prefersReducedMotion
        ? 'Reduced motion'
        : '⚡ Fast-forwarding…';
      ctx.fillText(label, SCENE_W / 2, 13);
      ctx.textAlign = 'left';
    }

  }, [s, currentTheme, timeScale, isCatchingUp, prefersReducedMotion, isPaused, isStaticFrame, r]);

  return (
    <section class="card scene-card">
      <div class="scene-header">
        <h2 class="card-title">{t.t('ui.scene')}</h2>
        <span class="scene-badge num">{isFastForwarding ? '⚡ Fast' : `${timeScale}×`}</span>
      </div>
      <div class="canvas-wrapper">
        <canvas
          ref={canvasRef}
          class="scene-canvas"
          width={SCENE_W}
          height={SCENE_H}
          role="img"
          aria-label={t.t('ui.sceneLabel', { phase: t.t(`phase.${s.world.phase}`) })}
        />
      </div>
    </section>
  );
}

function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mode: 'walk' | 'attack' | 'hit' | 'death' | 'idle',
  flip: boolean,
  frame: number = 0,
  ink: string = '#221f1a'
) {
  ctx.save();
  if (flip) {
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.translate(-x, -y);
  }

  let imgName: string;
  let sx: number;
  if (mode === 'attack') {
    imgName = 'hero_attack.png';
    sx = (frame % 2) * 32;
  } else if (mode === 'hit') {
    imgName = 'hero_hit.png';
    sx = 0;
  } else if (mode === 'death') {
    imgName = 'hero_death.png';
    sx = 0;
  } else if (mode === 'walk') {
    imgName = 'hero_walk.png';
    sx = (frame % 4) * 32;
  } else {
    imgName = 'hero_walk.png';
    sx = 0;
  }

  const img = getAsset(imgName);
  if (img) {
    ctx.drawImage(img, sx, 0, 32, 32, x - 16, y - 32, 32, 32);
  } else {
    // Vector fallback
    drawHeroFallback(ctx, x - 8, y, frame, flip, ink);
  }
  ctx.restore();
}

function drawMonsterSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  family: string,
  frame: number = 0,
  isDark: boolean = false
) {
  ctx.save();
  const imgName = `monster_${family}_idle.png`;
  const img = getAsset(imgName);
  if (img) {
    const sx = (frame % 2) * 32;
    ctx.drawImage(img, sx, 0, 32, 32, x - 16, y - 32, 32, 32);
  } else {
    drawMonsterFallback(ctx, x - 10, y, family, isDark);
  }
  ctx.restore();
}

function drawHeroFallback(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, flip: boolean, ink: string) {
  ctx.save();
  if (flip) {
    ctx.translate(x + 16, y);
    ctx.scale(-1, 1);
    ctx.translate(-x - 16, -y);
  }
  // Cloak
  ctx.fillStyle = '#3f3f74';
  ctx.fillRect(x + 2, y - 24, 12, 14);
  // Head
  ctx.fillStyle = '#eecc9a';
  ctx.fillRect(x + 4, y - 32, 8, 8);
  // Hair / helmet
  ctx.fillStyle = '#8f563b';
  ctx.fillRect(x + 3, y - 34, 10, 4);
  // Legs
  ctx.fillStyle = ink;
  const legOffset = frame === 1 ? 3 : frame === 3 ? -3 : 0;
  ctx.fillRect(x + 4 - legOffset, y - 10, 3, 10);
  ctx.fillRect(x + 9 + legOffset, y - 10, 3, 10);
  // Sword
  ctx.fillStyle = '#cbbdb8';
  ctx.fillRect(x + 14, y - 26, 2, 16);
  ctx.restore();
}

function drawMonsterFallback(ctx: CanvasRenderingContext2D, x: number, y: number, family: string, isDark: boolean) {
  ctx.save();
  switch (family) {
    case 'spider':
      ctx.fillStyle = isDark ? '#ac3232' : '#663931';
      ctx.beginPath();
      ctx.arc(x + 10, y - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbf236';
      ctx.fillRect(x + 6, y - 14, 2, 2);
      ctx.fillRect(x + 10, y - 14, 2, 2);
      break;
    case 'golem':
      ctx.fillStyle = '#696a6a';
      ctx.fillRect(x, y - 28, 20, 26);
      ctx.fillStyle = '#847e87';
      ctx.fillRect(x + 2, y - 26, 16, 12);
      break;
    case 'wraith':
      ctx.fillStyle = 'rgba(118, 66, 138, 0.8)';
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 28);
      ctx.lineTo(x + 18, y - 16);
      ctx.lineTo(x + 14, y - 2);
      ctx.lineTo(x + 2, y - 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'leech':
      ctx.fillStyle = '#45283c';
      ctx.beginPath();
      ctx.ellipse(x + 10, y - 10, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'brute':
    default:
      ctx.fillStyle = '#8f563b';
      ctx.fillRect(x, y - 26, 18, 22);
      break;
  }
  ctx.restore();
}
