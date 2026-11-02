import { useEffect, useRef, useState } from 'preact/hooks';
import type { SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import { theme } from '../settings.ts';
import type { GameRuntime } from '../gameRuntime.ts';

export const SCENE_W = 320;
export const SCENE_H = 96;
const GROUND_Y = 74;

export function SceneCard({ session: s, runtime: r }: { session: SessionState; runtime?: GameRuntime }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTheme = theme.value;
  const timeScale = r ? r.timeScale.value : 1;
  const isCatchingUp = r ? r.catchingUp.value : false;

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

  const isFastForwarding = timeScale > 1 || isCatchingUp;
  const isPaused = timeScale === 0;
  const isStaticFrame = isFastForwarding || prefersReducedMotion || isPaused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    // Palette Colors (32-color DB32 / Godville standard)
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

    // Clear background
    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);

    const w = s.world;
    const phase = w.phase;
    const dist = w.hero.distance;

    // 1. Far Hills Parallax
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

    // 2. Near Hills / Forest Parallax
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

    // 3. Ground & Road
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);
    ctx.fillStyle = roadColor;
    ctx.fillRect(0, GROUND_Y + 4, SCENE_W, 12);

    // Road dashed line
    ctx.fillStyle = isDark ? '#4a463d' : '#8c7d5c';
    const dashOffset = (dist * 12) % 24;
    for (let x = -24; x < SCENE_W + 24; x += 24) {
      ctx.fillRect(x - dashOffset, GROUND_Y + 9, 12, 2);
    }

    // 4. Render Modes
    if (phase === 'town') {
      // Town Buildings
      const buildings = [
        { x: 40, w: 44, h: 36, label: 'TAVERN', color: '#663931' },
        { x: 100, w: 52, h: 42, label: 'MARKET', color: '#8f563b' },
        { x: 170, w: 48, h: 48, label: 'TEMPLE', color: '#76428a' },
        { x: 236, w: 42, h: 34, label: 'INN', color: '#4b692f' },
      ];
      for (const b of buildings) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
        // Roof
        ctx.fillStyle = '#ac3232';
        ctx.beginPath();
        ctx.moveTo(b.x - 4, GROUND_Y - b.h);
        ctx.lineTo(b.x + b.w / 2, GROUND_Y - b.h - 10);
        ctx.lineTo(b.x + b.w + 4, GROUND_Y - b.h);
        ctx.closePath();
        ctx.fill();
        // Door & window
        ctx.fillStyle = '#222034';
        ctx.fillRect(b.x + b.w / 2 - 4, GROUND_Y - 14, 8, 14);
        ctx.fillStyle = goldColor;
        ctx.fillRect(b.x + 6, GROUND_Y - b.h + 8, 6, 6);
        ctx.fillRect(b.x + b.w - 12, GROUND_Y - b.h + 8, 6, 6);
      }
      // Hero in town
      drawHero(ctx, 150, GROUND_Y, 0, false, heroInk);
    } else if (phase === 'dead') {
      // Tombstone
      const tombX = 148;
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

      for (const entry of recentLog) {
        const ev = entry.event;
        if (ev.type === 'hit') {
          if (ev.attacker === 'hero') heroLunge = 10;
          else monsterLunge = -10;
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

      // Draw Hero
      drawHero(ctx, heroX, GROUND_Y, 1, false, heroInk);

      // Draw Monster
      drawMonster(ctx, monsterX, GROUND_Y, monsterFamily, isDark);

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
      drawHero(ctx, heroX, GROUND_Y, walkFrame, isReturning, heroInk);
    }

    // 5. Static Frame Overlay (Fast-forwarding… or Paused)
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

  }, [s, currentTheme, timeScale, isCatchingUp, prefersReducedMotion]);

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

function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, flip: boolean, ink: string) {
  ctx.save();
  if (flip) {
    ctx.translate(x + 16, y);
    ctx.scale(-1, 1);
    ctx.translate(-x - 16, -y);
  }

  // Cloak / Body
  ctx.fillStyle = '#3f3f74';
  ctx.fillRect(x + 2, y - 24, 12, 14);

  // Head
  ctx.fillStyle = '#eecc9a';
  ctx.fillRect(x + 4, y - 32, 8, 8);

  // Helmet / Hair
  ctx.fillStyle = '#8f563b';
  ctx.fillRect(x + 3, y - 34, 10, 4);

  // Legs walk cycle
  ctx.fillStyle = ink;
  const legOffset = frame === 1 ? 3 : frame === 3 ? -3 : 0;
  ctx.fillRect(x + 4 - legOffset, y - 10, 3, 10);
  ctx.fillRect(x + 9 + legOffset, y - 10, 3, 10);

  // Sword
  ctx.fillStyle = '#cbbdb8';
  ctx.fillRect(x + 14, y - 26, 2, 16);
  ctx.fillStyle = '#d9a066';
  ctx.fillRect(x + 12, y - 20, 6, 2);

  ctx.restore();
}

function drawMonster(ctx: CanvasRenderingContext2D, x: number, y: number, family: string, isDark: boolean) {
  ctx.save();
  switch (family) {
    case 'spider':
      ctx.fillStyle = isDark ? '#ac3232' : '#663931';
      ctx.beginPath();
      ctx.arc(x + 10, y - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#fbf236';
      ctx.fillRect(x + 6, y - 14, 2, 2);
      ctx.fillRect(x + 10, y - 14, 2, 2);
      // Legs
      ctx.strokeStyle = isDark ? '#df7126' : '#222034';
      ctx.lineWidth = 1.5;
      for (const lx of [-6, -2, 2, 6]) {
        ctx.beginPath();
        ctx.moveTo(x + 10, y - 10);
        ctx.lineTo(x + 10 + lx * 2, y);
        ctx.stroke();
      }
      break;

    case 'golem':
      ctx.fillStyle = '#696a6a';
      ctx.fillRect(x, y - 28, 20, 26);
      ctx.fillStyle = '#847e87';
      ctx.fillRect(x + 2, y - 26, 16, 12);
      ctx.fillStyle = '#595652';
      ctx.fillRect(x + 4, y - 8, 4, 8);
      ctx.fillRect(x + 12, y - 8, 4, 8);
      // Eye glow
      ctx.fillStyle = '#5fcde4';
      ctx.fillRect(x + 6, y - 22, 3, 2);
      ctx.fillRect(x + 11, y - 22, 3, 2);
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
      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 6, y - 22, 2, 2);
      ctx.fillRect(x + 10, y - 22, 2, 2);
      break;

    case 'leech':
      ctx.fillStyle = '#45283c';
      ctx.beginPath();
      ctx.ellipse(x + 10, y - 10, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ac3232';
      ctx.beginPath();
      ctx.arc(x + 3, y - 10, 3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'brute':
    default:
      ctx.fillStyle = '#8f563b';
      ctx.fillRect(x, y - 26, 18, 22);
      ctx.fillStyle = '#222034';
      ctx.fillRect(x + 3, y - 22, 3, 2);
      ctx.fillRect(x + 10, y - 22, 3, 2);
      // Horns
      ctx.fillStyle = '#fbf236';
      ctx.fillRect(x + 1, y - 30, 3, 4);
      ctx.fillRect(x + 14, y - 30, 3, 4);
      break;
  }
  ctx.restore();
}
