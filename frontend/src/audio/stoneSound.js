let audioCtx = null;
let stoneBuffer = null;
let muted = false;

try {
  muted = localStorage.getItem('play361_muted') === '1';
} catch (_) {}

try {
  audioCtx = new AudioContext();
  fetch('/putstone.mp3')
    .then((res) => res.arrayBuffer())
    .then((buf) => audioCtx.decodeAudioData(buf))
    .then((decoded) => { stoneBuffer = decoded; })
    .catch(() => {});
} catch (_) {}

export function initStoneSound() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function playStoneSound() {
  if (muted || !audioCtx || !stoneBuffer) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const src = audioCtx.createBufferSource();
  src.buffer = stoneBuffer;
  src.connect(audioCtx.destination);
  src.start();
  src.onended = () => src.disconnect();
}

export function playHintSound() {
  if (muted || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);
  osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}

export function playGameEndSound() {
  if (muted || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.15);
    gain.gain.setValueAtTime(0.18, now + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.5);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  });
}

export function isSoundMuted() {
  return muted;
}

export function toggleSound() {
  muted = !muted;
  try { localStorage.setItem('play361_muted', muted ? '1' : '0'); } catch (_) {}
  return muted;
}
