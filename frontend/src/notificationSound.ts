let chime: HTMLAudioElement | null = null
let unlocked = false

function writeWavHeader(view: DataView, sampleCount: number, sampleRate: number) {
  const byteRate = sampleRate * 2
  view.setUint32(0, 0x52494646)
  view.setUint32(4, 36 + sampleCount * 2, true)
  view.setUint32(8, 0x57415645)
  view.setUint32(12, 0x666d7420)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  view.setUint32(36, 0x64617461)
  view.setUint32(40, sampleCount * 2, true)
}

function makeChimeUrl() {
  const sampleRate = 22050
  const duration = 0.42
  const sampleCount = Math.floor(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  writeWavHeader(view, sampleCount, sampleRate)
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate
    const first = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 7)
    const second = t > 0.12 ? Math.sin(2 * Math.PI * 1175 * t) * Math.exp(-(t - 0.12) * 6) : 0
    const sample = Math.max(-1, Math.min(1, (first + second) * 0.85))
    view.setInt16(44 + i * 2, sample * 32767, true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }))
}

function getChime() {
  if (!chime) {
    chime = new Audio(makeChimeUrl())
    chime.preload = "auto"
  }
  return chime
}

export function unlockNotificationSound() {
  const audio = getChime()
  audio.muted = true
  audio.volume = 1
  audio.currentTime = 0
  void audio
    .play()
    .then(() => {
      audio.pause()
      audio.currentTime = 0
      audio.muted = false
      unlocked = true
    })
    .catch(() => undefined)
}

export function playNotificationSound() {
  const audio = getChime()
  audio.muted = false
  audio.volume = 1
  audio.currentTime = 0
  const play = () => {
    void audio.play().then(() => {
      unlocked = true
    }).catch(() => {
      if (!unlocked) unlockNotificationSound()
    })
  }
  play()
}
