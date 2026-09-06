let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(
  audioCtx: AudioContext,
  destination: AudioNode,
  freq: number,
  startAt: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = "sine",
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(gainPeak, startAt + 0.04); // soft attack
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration); // smooth decay
  osc.connect(gain);
  gain.connect(destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/**
 * Original, synthesized "AzaleaOS" boot chime - a soft ascending three-note
 * arpeggio (like the clean minimal startup chimes on distros such as
 * elementary OS / Pop!_OS) layered with a very quiet sub pad for warmth.
 * No external audio asset needed, so no licensing concerns, and it degrades
 * silently if Web Audio / autoplay is unavailable.
 */
export function playBootChime(): void {
  try {
    const audioCtx = getCtx();

    const run = () => {
      const master = audioCtx.createGain();
      master.gain.value = 0.5;
      master.connect(audioCtx.destination);

      const now = audioCtx.currentTime + 0.05;
      // Soft ascending arpeggio - A4, C#5, E5, A5 (A major, airy/optimistic)
      tone(audioCtx, master, 440.0, now, 0.9, 0.16, "sine");
      tone(audioCtx, master, 554.37, now + 0.11, 0.85, 0.14, "sine");
      tone(audioCtx, master, 659.25, now + 0.22, 0.85, 0.13, "sine");
      tone(audioCtx, master, 880.0, now + 0.34, 1.1, 0.15, "triangle");
      // quiet low pad underneath for warmth
      tone(audioCtx, master, 220.0, now, 1.3, 0.05, "sine");
    };

    if (audioCtx.state === "suspended") {
      // Autoplay policy: resume on first user gesture, then play once.
      const resume = () => {
        audioCtx.resume().then(run).catch(() => {});
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
    } else {
      run();
    }
  } catch {
    // Audio is a nice-to-have; never let it break boot.
  }
}
