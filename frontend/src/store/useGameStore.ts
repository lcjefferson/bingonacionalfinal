import { create } from 'zustand'
import { getSocket } from '../lib/socket'
import type {
  Cartela,
  GameMeta,
  GameState,
  NewBallPayload,
  RoundSummaryPayload,
  StateChangePayload,
  SyncStatePayload,
  WinnerPayload,
} from '../types'

type GameStore = {
  connected: boolean
  state: GameState
  predrawTime: number
  drawnNumbers: number[]
  cartelas: Cartela[]
  meta: GameMeta | null
  lastReason: StateChangePayload['reason']
  lastWinner: WinnerPayload | null
  lastRoundSummary: RoundSummaryPayload | null
  error: string | null

  connect: () => void
  buyCartelas: (qty: number) => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  state: 'WAITING',
  predrawTime: 0,
  drawnNumbers: [],
  cartelas: [],
  meta: null,
  lastReason: undefined,
  lastWinner: null,
  lastRoundSummary: null,
  error: null,

  connect: () => {
    const s = getSocket()
    if ((s as any).__bn_bound) return
    ;(s as any).__bn_bound = true

    s.on('connect', () => set({ connected: true, error: null }))
    s.on('disconnect', () => set({ connected: false }))

    s.on('sync_state', (data: SyncStatePayload) => {
      set({
        state: data.state,
        predrawTime: data.predrawTime,
        drawnNumbers: data.drawnNumbers ?? [],
        cartelas: data.cartelas ?? [],
        meta: data.meta ?? null,
        lastWinner: null,
        error: null,
      })
    })

    s.on('state_change', (data: StateChangePayload) => {
      const next: Partial<GameStore> = {
        state: data.state,
        meta: data.meta ?? null,
        lastReason: data.reason,
        error: null,
      }
      // Match legacy behavior: when returning to WAITING, clear client-side round data.
      if (data.state === 'WAITING') {
        next.drawnNumbers = []
        next.cartelas = []
        next.lastWinner = null
        next.lastRoundSummary = null
      }
      set(next as Partial<GameStore> as any)
    })

    s.on('timer_tick', (timeLeft: number) => set({ predrawTime: Number(timeLeft) || 0 }))

    s.on('new_ball', (data: NewBallPayload) => {
      const prev = get().drawnNumbers
      set({ drawnNumbers: [...prev, data.number], error: null })
    })

    s.on('winner', (data: WinnerPayload) => set({ lastWinner: data, error: null }))

    s.on('round_summary', (data: RoundSummaryPayload) =>
      set({ lastRoundSummary: data, error: null }),
    )

    s.on('cartelas_bought', (cartelas: Cartela[]) => set({ cartelas: cartelas ?? [], error: null }))

    s.on('game_meta', (meta: GameMeta) => set({ meta: meta ?? null, error: null }))

    s.on('game_error', (msg: unknown) =>
      set({ error: typeof msg === 'string' ? msg : 'Erro no servidor' }),
    )
  },

  buyCartelas: (qty: number) => {
    const s = getSocket()
    const n = Math.max(1, Math.floor(qty || 1))
    s.emit('buy_cartelas', n)
  },
}))

