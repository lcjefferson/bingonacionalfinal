export type GameState = 'WAITING' | 'PLAYING' | 'FINISHED'

export type Cartela = {
  id: number
  numbers: number[]
}

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
  cartelas: Cartela[]
  meta: GameMeta
}

export type StateChangePayload = {
  state: GameState
  meta: GameMeta
  reason?: 'KENO_WIN' | 'NO_WINNER'
}

export type NewBallPayload = {
  number: number
  drawnCount: number
}

export type WinnerPayload = {
  type: 'QUADRA' | 'QUINA' | 'KENO'
  cartelaId: number
}

export type RoundSummaryPayload = {
  roundId: number
  reason: 'KENO_WIN' | 'NO_WINNER'
  totalBallsDrawn: number
  winners: {
    quadra: { socketId: string; cartelaId: number } | null
    quina: { socketId: string; cartelaId: number } | null
    keno: { socketId: string; cartelaId: number } | null
  }
}

