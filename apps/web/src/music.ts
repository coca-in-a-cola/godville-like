/** Procedural calm pad (own_ content, no audio files). The AudioContext starts only after a user gesture. */
const CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [196, 246.94, 329.63],
];
const CHORD_SECONDS = 8;

export function createCalmMusic() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let chord = 0;
  let on = false;
  let volume = 0.4;

  function playChord() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    for (const freq of CHORDS[chord % CHORDS.length]!) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 2.5);
      gain.gain.linearRampToValueAtTime(0, now + CHORD_SECONDS + 2);
      osc.connect(gain).connect(master);
      osc.start(now); osc.stop(now + CHORD_SECONDS + 2.1);
    }
    chord++;
  }
  function ensure(): boolean {
    if (ctx) return true;
    const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext;
    if (!Ctor) return false;
    ctx = new Ctor(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    return true;
  }
  function sync() {
    if (!on) {
      if (timer) { clearInterval(timer); timer = null; }
      void ctx?.suspend();
      return;
    }
    if (!ensure()) return;
    void ctx!.resume();
    if (!timer) { playChord(); timer = setInterval(playChord, CHORD_SECONDS * 1000); }
  }
  return {
    /** Must be called from a user gesture the first time so browsers allow audio. */
    set(next: { on: boolean; volume: number }) {
      volume = next.volume; on = next.on && next.volume > 0;
      if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
      sync();
    },
    dispose() { on = false; sync(); void ctx?.close(); ctx = null; master = null; },
  };
}
