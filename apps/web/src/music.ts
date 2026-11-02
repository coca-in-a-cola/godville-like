/**
 * Procedural Web Audio Engine (Calm Music & Sound Effects).
 * - Slow synth pads through a low-pass biquad filter and synthetic impulse reverb.
 * - Rare seeded pentatonic bell/chime notes.
 * - Quiet procedural SFX (hit, crit, dodge, smite, blessing, level up).
 * - Only starts after user gesture / Start Game.
 * - Pauses on hidden tab; SFX are silenced when fast-forwarding (> 1x speed or catch-up).
 */

import { mixSeed } from '@godville/sim';

// Pentatonic scale frequencies in Hz (C major / A minor pentatonic across 2 octaves)
const PENTATONIC = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
];

const CHORDS = [
  [174.61, 220.00, 261.63, 329.63], // Fmaj7
  [196.00, 246.94, 293.66, 349.23], // G7 / Gsus4
  [220.00, 261.63, 329.63, 392.00], // Am7
  [196.00, 246.94, 329.63, 392.00], // Em7
];

const CHORD_DURATION = 9; // seconds per chord

export interface AudioEngine {
  set(settings: { on: boolean; volume: number }): void;
  playHit(): void;
  playCrit(): void;
  playDodge(): void;
  playSmite(): void;
  playBlessing(): void;
  playLevelUp(): void;
  playMonsterSound(family: string): void;
  setFastForward(fast: boolean): void;
  dispose(): void;
}

export function createCalmMusic(seed = 20261102): AudioEngine {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  let reverb: ConvolverNode | null = null;

  let chordTimer: ReturnType<typeof setInterval> | null = null;
  let bellTimer: ReturnType<typeof setInterval> | null = null;

  let chordIdx = 0;
  let noteCounter = 0;
  let musicOn = false;
  let volume = 0.4;
  let isFastForward = false;

  function createReverbBuffer(context: AudioContext, seconds = 2.5, decay = 2.0): AudioBuffer {
    const rate = context.sampleRate;
    const length = rate * seconds;
    const impulse = context.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const factor = Math.exp(-n * decay);
      left[i] = ((Math.random() * 2) - 1) * factor;
      right[i] = ((Math.random() * 2) - 1) * factor;
    }
    return impulse;
  }

  function initContext(): boolean {
    if (ctx) return true;
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      : undefined;
    if (!AudioContextClass) return false;

    ctx = new AudioContextClass();

    // Master
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Reverb & Filter
    reverb = ctx.createConvolver();
    reverb.buffer = createReverbBuffer(ctx);

    lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(650, ctx.currentTime);
    lowpass.Q.setValueAtTime(0.7, ctx.currentTime);

    // Music routing: Music -> Lowpass -> Reverb (wet) + Dry -> Master
    musicGain = ctx.createGain();
    musicGain.gain.setValueAtTime(0.5, ctx.currentTime);

    lowpass.connect(musicGain);
    reverb.connect(musicGain);
    musicGain.connect(masterGain);

    // SFX routing: SFX -> Master
    sfxGain = ctx.createGain();
    sfxGain.gain.setValueAtTime(0.35, ctx.currentTime);
    sfxGain.connect(masterGain);

    return true;
  }

  function playPadChord() {
    if (!ctx || !lowpass || !reverb || !musicOn) return;
    const now = ctx.currentTime;
    const chord = CHORDS[chordIdx % CHORDS.length]!;

    for (const freq of chord) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Warm slight detune for stereo lushness
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 3.0);
      gain.gain.setValueAtTime(0.045, now + CHORD_DURATION - 2.5);
      gain.gain.linearRampToValueAtTime(0, now + CHORD_DURATION + 1.5);

      osc.connect(gain);
      gain.connect(lowpass);
      gain.connect(reverb);

      osc.start(now);
      osc.stop(now + CHORD_DURATION + 2.0);
    }
    chordIdx++;
  }

  function playPentatonicNote() {
    if (!ctx || !reverb || !musicOn) return;
    const now = ctx.currentTime;
    noteCounter++;

    // Seeded note selection
    const pseudoRandom = mixSeed(seed, noteCounter);
    const noteIdx = pseudoRandom % PENTATONIC.length;
    const freq = PENTATONIC[noteIdx]!;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Bell envelope: instant soft attack, gentle exponential decay
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    osc.connect(gain);
    gain.connect(reverb);
    if (lowpass) gain.connect(lowpass);

    osc.start(now);
    osc.stop(now + 3.0);
  }

  function syncState() {
    if (!musicOn) {
      if (chordTimer) { clearInterval(chordTimer); chordTimer = null; }
      if (bellTimer) { clearInterval(bellTimer); bellTimer = null; }
      void ctx?.suspend();
      return;
    }

    if (!initContext()) return;
    void ctx!.resume();

    if (!chordTimer) {
      playPadChord();
      chordTimer = setInterval(playPadChord, CHORD_DURATION * 1000);
    }
    if (!bellTimer) {
      bellTimer = setInterval(playPentatonicNote, 5500);
    }
  }

  // Handle visibility change: pause on hidden, resume on visible
  const handleVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      void ctx?.suspend();
    } else if (musicOn) {
      void ctx?.resume();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  // SFX Helper
  function playTone(freqStart: number, freqEnd: number, duration: number, peakVol: number, type: OscillatorType = 'sine') {
    if (!ctx || !sfxGain || isFastForward || !musicOn) return;
    if (document.visibilityState === 'hidden') return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(peakVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  return {
    set(next: { on: boolean; volume: number }) {
      volume = next.volume;
      musicOn = next.on && next.volume > 0;
      if (masterGain && ctx) {
        masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      }
      syncState();
    },

    setFastForward(fast: boolean) {
      isFastForward = fast;
    },

    playHit() {
      playTone(130, 45, 0.07, 0.12, 'triangle');
    },

    playCrit() {
      playTone(520, 260, 0.14, 0.18, 'sine');
      playTone(1040, 520, 0.14, 0.12, 'triangle');
    },

    playDodge() {
      playTone(320, 580, 0.09, 0.08, 'sine');
    },

    playSmite() {
      playTone(880, 80, 0.28, 0.25, 'sawtooth');
    },

    playBlessing() {
      if (!ctx || !sfxGain || isFastForward || !musicOn) return;
      const now = ctx.currentTime;
      [329.63, 440.0, 554.37, 659.25].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);
        gain.gain.setValueAtTime(0, now + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.1, now + i * 0.07 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(sfxGain!);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.4);
      });
    },

    playLevelUp() {
      if (!ctx || !sfxGain || isFastForward || !musicOn) return;
      const now = ctx.currentTime;
      [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.14, now + i * 0.1 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.5);
        osc.connect(gain);
        gain.connect(sfxGain!);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.55);
      });
    },

    playMonsterSound(family: string) {
      if (!ctx || !sfxGain || isFastForward || !musicOn) return;
      if (document.visibilityState === 'hidden') return;
      const now = ctx.currentTime;
      switch (family) {
        case 'spider':
          // Rapid high chittering clicks
          [1600, 1200, 1800, 1400].forEach((freq, i) => {
            const osc = ctx!.createOscillator();
            const gain = ctx!.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.03);
            gain.gain.setValueAtTime(0.08, now + i * 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.03 + 0.025);
            osc.connect(gain).connect(sfxGain!);
            osc.start(now + i * 0.03);
            osc.stop(now + i * 0.03 + 0.03);
          });
          break;
        case 'golem':
          // Heavy seismic thud / subterranean grind
          playTone(85, 30, 0.22, 0.24, 'triangle');
          playTone(45, 20, 0.35, 0.28, 'sawtooth');
          break;
        case 'wraith':
          // Ethereal ghostly descending wail
          playTone(580, 190, 0.32, 0.15, 'sine');
          break;
        case 'leech':
          // Squelch / suction pop
          playTone(180, 520, 0.11, 0.16, 'triangle');
          break;
        case 'brute':
        default:
          // Guttural roaring growl
          playTone(160, 55, 0.24, 0.22, 'sawtooth');
          break;
      }
    },

    dispose() {
      musicOn = false;
      syncState();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      void ctx?.close();
      ctx = null;
      masterGain = null;
      musicGain = null;
      sfxGain = null;
      lowpass = null;
      reverb = null;
    },
  };
}
