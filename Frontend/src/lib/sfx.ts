/**
 * Sonidos opcionales (apagados por defecto). Se generan con Web Audio, sin
 * archivos: un "clic", un "pop", un spray (ruido filtrado), un "swoosh" y un
 * acorde corto de "hecho". La preferencia se guarda en este navegador.
 */
export type Sfx = 'click' | 'pop' | 'spray' | 'swoosh' | 'success' | 'error';

const KEY = 'myout.sfx';
let ctx: AudioContext | null = null;
const listeners = new Set<(on: boolean) => void>();

export function sfxEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSfxEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* sin almacenamiento: dura lo que la página */
  }
  for (const l of listeners) l(on);
  if (on) play('pop');
}

export function onSfxChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(a: AudioContext, start: number, dur: number, gain: number, freq: number, q = 0.8) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(start);
}

export function play(name: Sfx): void {
  if (!sfxEnabled()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (name) {
    case 'click':
      tone(a, 1800, t, 0.04, 'square', 0.03);
      break;
    case 'pop':
      tone(a, 420, t, 0.12, 'sine', 0.12, 980);
      break;
    case 'spray':
      noise(a, t, 0.35, 0.08, 5200, 0.6);
      break;
    case 'swoosh':
      noise(a, t, 0.28, 0.07, 900, 0.5);
      tone(a, 520, t, 0.25, 'sine', 0.03, 140);
      break;
    case 'success':
      tone(a, 523, t, 0.12, 'triangle', 0.08);
      tone(a, 784, t + 0.09, 0.2, 'triangle', 0.08);
      break;
    case 'error':
      tone(a, 220, t, 0.18, 'sawtooth', 0.04, 150);
      break;
  }
}
