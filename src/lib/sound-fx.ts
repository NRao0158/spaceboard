type Sound = 'drop' | 'connect' | 'chime'
let context: AudioContext | undefined

export function unlockSound() {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => {})
  } catch { /* Sound is optional on unsupported or restricted browsers. */ }
}

export function playSound(sound: Sound, enabled: boolean) {
  if (!enabled || context?.state !== 'running') return
  const audio = context
  const tones = sound === 'chime' ? [440, 554, 659] : sound === 'connect' ? [520, 790] : [240]
  tones.forEach((frequency, index) => {
    const time = audio.currentTime + index * .065
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.setValueAtTime(frequency, time)
    oscillator.type = 'sine'
    gain.gain.setValueAtTime(.001, time)
    gain.gain.exponentialRampToValueAtTime(.035, time + .012)
    gain.gain.exponentialRampToValueAtTime(.001, time + .15)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(time)
    oscillator.stop(time + .17)
  })
}

const soundKey = 'spaceboard:sound'
export function readSoundPreference() {
  try { return localStorage.getItem(soundKey) === 'on' } catch { return false }
}
export function saveSoundPreference(enabled: boolean) {
  try { localStorage.setItem(soundKey, enabled ? 'on' : 'off') } catch { /* Optional storage. */ }
}
