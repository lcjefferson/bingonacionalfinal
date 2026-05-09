export const RULES = {
  numberMax: 90,
  /** Countdown (WAITING) before the draw starts */
  predrawSeconds: 300, // 5 minutes
  drawEveryMs: 3000,
  minCartelasToStart: 0,
  maxCartelasPerRound: 20000,
  donationPerCartela: 0.2,
  prizes: { quadra: 20, quina: 20, keno: 150 },
} as const

