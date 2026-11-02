import { useEffect, useRef } from 'preact/hooks';
import type { SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import { theme } from '../settings.ts';
export const SCENE_W = 320, SCENE_H = 96;
const GROUND = 78;

/** Procedural ink drawing of the current phase. Purely decorative; the phase is also announced as text. */
function draw(ctx: CanvasRenderingContext2D, s: SessionState) {
  const css = getComputedStyle(ctx.canvas);
  const ink = css.getPropertyValue('--ink').trim() || '#2b2723';
  const rule = css.getPropertyValue('--rule').trim() || '#dfd7c9';
  const accent = css.getPropertyValue('--accent').trim() || '#8b572a';
  const w = s.world, phase = w.phase;
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  // Rolling hills scroll with distance walked.
  ctx.strokeStyle = rule; ctx.beginPath();
  const offset = (w.hero.distance * 7) % 80;
  for (let x = -80; x <= SCENE_W + 80; x += 4) { const y = 52 + Math.sin((x + offset) / 26) * 6; if (x === -80) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(SCENE_W, GROUND); ctx.stroke();
  if (phase === 'town') {
    ctx.strokeStyle = accent;
    for (const [x, hgt] of [[200, 26], [236, 34], [276, 22]] as const) {
      ctx.strokeRect(x, GROUND - hgt, 26, hgt);
      ctx.beginPath(); ctx.moveTo(x - 3, GROUND - hgt); ctx.lineTo(x + 13, GROUND - hgt - 12); ctx.lineTo(x + 29, GROUND - hgt); ctx.stroke();
    }
  }
  const heroX = phase === 'combat' ? 110 : phase === 'return' ? 190 : 140;
  if (phase === 'dead') {
    ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(heroX - 9, GROUND); ctx.lineTo(heroX - 9, GROUND - 20); ctx.arc(heroX, GROUND - 20, 9, Math.PI, 0); ctx.lineTo(heroX + 9, GROUND); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(heroX, GROUND - 22); ctx.lineTo(heroX, GROUND - 10); ctx.moveTo(heroX - 4, GROUND - 18); ctx.lineTo(heroX + 4, GROUND - 18); ctx.stroke();
  } else {
    // Stick-figure hero with a sword; legs alternate with distance so walking reads as motion.
    const step = w.hero.distance % 2 === 0 ? 4 : -4;
    ctx.strokeStyle = ink; ctx.beginPath();
    ctx.arc(heroX, GROUND - 34, 5, 0, Math.PI * 2);
    ctx.moveTo(heroX, GROUND - 29); ctx.lineTo(heroX, GROUND - 14);
    ctx.lineTo(heroX - step, GROUND); ctx.moveTo(heroX, GROUND - 14); ctx.lineTo(heroX + step, GROUND);
    ctx.moveTo(heroX - 7, GROUND - 24); ctx.lineTo(heroX + 7, GROUND - 24);
    ctx.stroke();
    ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(heroX + 7, GROUND - 24); ctx.lineTo(heroX + 16, GROUND - 36); ctx.stroke();
  }
  const combat = w.combat;
  if (combat) {
    const mx = 220, ratio = Math.max(0, combat.fight.monster.hp / Math.max(1, combat.fight.monster.stats.maxHp));
    ctx.strokeStyle = ink; ctx.beginPath(); ctx.ellipse(mx, GROUND - 14, 18, 14, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(mx - 6, GROUND - 18, 2, 0, Math.PI * 2); ctx.arc(mx + 6, GROUND - 18, 2, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
    ctx.strokeStyle = rule; ctx.strokeRect(mx - 20, GROUND - 40, 40, 4);
    ctx.fillStyle = accent; ctx.fillRect(mx - 20, GROUND - 40, 40 * ratio, 4);
  }
}

export function SceneCard({ session: s }: { session: SessionState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const currentTheme = theme.value;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (canvas.width !== SCENE_W * dpr) { canvas.width = SCENE_W * dpr; canvas.height = SCENE_H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, s);
  }, [s, currentTheme]);
  return <section class="card scene-card"><h2 class="card-title">{t.t('ui.scene')}</h2>
    <canvas ref={ref} class="scene" width={SCENE_W} height={SCENE_H} role="img" aria-label={t.t('ui.sceneLabel', { phase: t.t(`phase.${s.world.phase}`) })} />
  </section>;
}
