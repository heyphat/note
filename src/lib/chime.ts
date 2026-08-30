/**
 * Tiny Web Audio chime used when a pomodoro session completes.
 * Lazy-constructs the AudioContext on first call — the first gesture that
 * triggers a chime is the user's "Start" click, so the audio-unlock
 * requirement is satisfied by the time we actually play.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Soft two-note chime, ~250 ms total. Safe to call on any thread. */
export function playChime() {
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  const play = (freq: number, startOffset: number, duration: number) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + startOffset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.02);
  };

  play(880, 0, 0.18);
  play(1320, 0.12, 0.18);
}
