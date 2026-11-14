// Semua suara disintesis WebAudio — tidak ada file audio, tidak ada jaringan.
// Tembakan = ledakan noise yang difilter, bunyi lain = osilator pendek.
// AudioContext dibuat malas saat gestur pertama; di mode ?shot/?test tetap diam.
export function createAudio() {
  let context = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    const length = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const time = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(time);
    source.stop(time + duration);
  }

  function tone(freq, duration, type, gainValue, slideTo = 0, when = 0) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const time = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration);
  }

  return {
    unlock,
    setMuted(value) { muted = value; },
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 1400, 0.5); tone(160, 0.2, 'sawtooth', 0.16, 55); }
      else if (kind === 'smg') noise(0.09, 2600, 0.28);
      else if (kind === 'pistol') noise(0.12, 2000, 0.34);
      else noise(0.16, 1800, 0.4);
    },
    dryFire() { tone(1400, 0.03, 'square', 0.08); },
    reload() { tone(700, 0.05, 'square', 0.1); tone(500, 0.05, 'square', 0.1, 0, 0.22); tone(900, 0.06, 'square', 0.12, 0, 0.6); },
    hit(kill) { tone(kill ? 1500 : 1100, 0.07, 'sine', 0.18); if (kill) tone(1900, 0.09, 'sine', 0.16, 0, 0.07); },
    hurt() { noise(0.14, 500, 0.3); tone(110, 0.16, 'sine', 0.22, 70); },
    beep(planting) { tone(planting ? 950 : 1250, 0.09, 'square', 0.14); },
    plantDone() { tone(880, 0.12, 'square', 0.16); tone(1320, 0.18, 'square', 0.16, 0, 0.12); },
    explosion() {
      noise(1.1, 320, 0.9);
      tone(90, 0.9, 'sine', 0.5, 32);
      noise(0.5, 1200, 0.4, 0.05);
    },
    grenadePin() { tone(1800, 0.04, 'square', 0.1); },
    roundWin() { tone(523, 0.14, 'triangle', 0.2); tone(659, 0.14, 'triangle', 0.2, 0, 0.14); tone(784, 0.26, 'triangle', 0.22, 0, 0.28); },
    roundLoss() { tone(392, 0.16, 'triangle', 0.2); tone(330, 0.16, 'triangle', 0.2, 0, 0.16); tone(262, 0.3, 'triangle', 0.22, 0, 0.32); },
    buy() { tone(1050, 0.06, 'sine', 0.14); tone(1400, 0.08, 'sine', 0.14, 0, 0.06); },
  };
}
