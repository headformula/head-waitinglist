/**
 * Tiny Web Audio synthesizer – zero dependencies, zero network requests.
 * Every sound is procedurally generated with oscillators + gain envelopes.
 */

let ctx: AudioContext | null = null
let unlocked = false

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return ctx
}

/**
 * Must be called from a user-gesture handler (pointerdown / click)
 * to unlock the AudioContext on iOS / Safari / Chrome autoplay policy.
 */
export function unlockAudio() {
  if (unlocked) return
  const ac = getCtx()
  if (ac.state === 'suspended') {
    ac.resume()
  }
  // Play a silent buffer to fully unlock on iOS
  const buf = ac.createBuffer(1, 1, ac.sampleRate)
  const src = ac.createBufferSource()
  src.buffer = buf
  src.connect(ac.destination)
  src.start(0)
  unlocked = true
}

/* ── helpers ─────────────────────────────────────────────────────── */

function osc(
  ac: AudioContext,
  type: OscillatorType,
  freq: number,
  start: number,
  dur: number,
  gain: number,
) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.001, start + dur)
  o.connect(g).connect(ac.destination)
  o.start(start)
  o.stop(start + dur + 0.05)
}

function noise(ac: AudioContext, start: number, dur: number, gain: number) {
  const len = Math.max(Math.floor(ac.sampleRate * dur), 1)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.001, start + dur)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1200
  bp.Q.value = 0.8
  src.connect(bp).connect(g).connect(ac.destination)
  src.start(start)
  src.stop(start + dur + 0.05)
}

function safePlay(fn: (ac: AudioContext, t: number) => void) {
  try {
    const ac = getCtx()
    if (ac.state === 'suspended') ac.resume()
    fn(ac, ac.currentTime)
  } catch {
    // Silently ignore audio errors – the game must keep working
  }
}

/* ── public API ──────────────────────────────────────────────────── */

/** Short "click" when a piece is placed on the grid. */
export function playPlace() {
  safePlay((ac, t) => {
    osc(ac, 'sine', 600, t, 0.1, 0.4)
    osc(ac, 'triangle', 900, t, 0.06, 0.25)
    noise(ac, t, 0.05, 0.15)
  })
}

/** Satisfying sweep when one or more lines clear. */
export function playClear(lines: number = 1) {
  safePlay((ac, t) => {
    const baseFreq = 400 + lines * 80
    const dur = 0.3 + lines * 0.06
    osc(ac, 'sine', baseFreq, t, dur, 0.5)
    osc(ac, 'triangle', baseFreq * 1.5, t + 0.03, dur * 0.7, 0.3)
    noise(ac, t, 0.15, 0.25)
    // "ding" at the end
    osc(ac, 'sine', baseFreq * 2, t + dur * 0.4, 0.2, 0.25)
  })
}

/** Combo multiplier sound – ascending arpeggio. */
export function playCombo(combo: number) {
  safePlay((ac, t) => {
    const base = 500 + combo * 60
    for (let i = 0; i < Math.min(combo, 5); i++) {
      osc(ac, 'sine', base + i * 120, t + i * 0.06, 0.2, 0.35)
      osc(ac, 'triangle', base + i * 120 + 5, t + i * 0.06, 0.14, 0.2)
    }
  })
}

/** Game over – descending tones. */
export function playGameOver() {
  safePlay((ac, t) => {
    const notes = [440, 370, 311, 261]
    notes.forEach((freq, i) => {
      osc(ac, 'sine', freq, t + i * 0.2, 0.45, 0.35)
      osc(ac, 'triangle', freq * 0.5, t + i * 0.2, 0.5, 0.2)
    })
  })
}

/** Quick error / invalid placement buzz. */
export function playInvalid() {
  safePlay((ac, t) => {
    osc(ac, 'square', 150, t, 0.12, 0.2)
    osc(ac, 'square', 130, t + 0.06, 0.12, 0.2)
  })
}
