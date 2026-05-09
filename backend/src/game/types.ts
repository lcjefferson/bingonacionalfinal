import type { RULES } from './rules'

export type GameState = 'WAITING' | 'PLAYING' | 'FINISHED'
export type RoundEndReason = 'KENO_WIN' | 'NO_WINNER'
export type WinnerType = 'QUADRA' | 'QUINA' | 'KENO'

export type GameMeta = {
  roundId: number
  donation: number
  prizes: { quadra: number; quina: number; keno: number }
  accumulated: number
  accumulatedDays: number
  drawStartedAt: number | null
  rules: {
    numberMax: number
    minCartelasToStart: number
    maxCartelasPerRound: number
  }
  soldCartelas: number
  remainingCartelas: number
}

export type SyncStatePayload = {
  state: GameState
  predrawTime: number
  drawnNumbers: number[]
  cartelas: { id: number; numbers: number[] }[]
  meta: GameMeta
}

