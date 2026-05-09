import { Prisma } from '@prisma/client'
import type { Server } from 'socket.io'
import { prisma } from '../db'
import { RULES } from './rules'
import type { GameMeta, GameState, RoundEndReason, SyncStatePayload, WinnerType } from './types'

type WinnerRef = { userId: string; cartelaId: string; cartelaSerial: number } | null

export class GameEngine {
  private state: GameState = 'WAITING'
  private predrawTime = RULES.predrawSeconds
  private drawInterval: NodeJS.Timeout | null = null
  private drawnNumbers: number[] = []
  private availableNumbers: number[] = []
  private drawStartedAt: number | null = null
  private soldCartelasThisRound = 0

  private roundDbId: string | null = null
  private roundNumber = 1

  private quadraWinner: WinnerRef = null
  private quinaWinner: WinnerRef = null
  private kenoWinner: WinnerRef = null

  private cartelaRegistry = new Set<string>()

  // Fake meta values for now (will become real later)
  private accumulated = 0
  private accumulatedDays = 0

  /** Guards concurrent endRound paths; unlocked before scheduling the next WAITING reset. */
  private closingRoundInProgress = false
  /** Only one delayed reset timer so we never create duplicate NEXT rounds */
  private nextRoundTimer: NodeJS.Timeout | null = null

  constructor(private io: Server) {}

  async init() {
    await this.ensureCurrentRound()
    this.startPredrawTicker()
  }

  private startPredrawTicker() {
    setInterval(async () => {
      if (this.state !== 'WAITING') return
      if (this.predrawTime > 0) {
        this.predrawTime--
        this.io.emit('timer_tick', this.predrawTime)
      } else {
        await this.startRound()
      }
    }, 1000)
  }

  private async ensureCurrentRound() {
    // Find latest roundNumber, else create round 1 in WAITING
    const last = await prisma.round.findFirst({ orderBy: { roundNumber: 'desc' } })
    if (!last) {
      const created = await prisma.round.create({
        data: {
          roundNumber: 1,
          status: 'WAITING',
          rulesSnapshot: {
            ...RULES,
          },
        },
      })
      this.roundDbId = created.id
      this.roundNumber = created.roundNumber
      return
    }

    if (last.status === 'WAITING') {
      this.roundDbId = last.id
      this.roundNumber = last.roundNumber
      return
    }

    // If last is not WAITING, create next WAITING round
    const created = await prisma.round.create({
      data: {
        roundNumber: last.roundNumber + 1,
        status: 'WAITING',
        rulesSnapshot: { ...RULES },
      },
    })
    this.roundDbId = created.id
    this.roundNumber = created.roundNumber
  }

  private meta(): GameMeta {
    return {
      roundId: this.roundNumber,
      donation: RULES.donationPerCartela,
      prizes: { ...RULES.prizes },
      accumulated: this.accumulated,
      accumulatedDays: this.accumulatedDays,
      drawStartedAt: this.drawStartedAt,
      rules: {
        numberMax: RULES.numberMax,
        minCartelasToStart: RULES.minCartelasToStart,
        maxCartelasPerRound: RULES.maxCartelasPerRound,
      },
      soldCartelas: this.soldCartelasThisRound,
      remainingCartelas: Math.max(0, RULES.maxCartelasPerRound - this.soldCartelasThisRound),
    }
  }

  async syncStateForUser(userId: string): Promise<SyncStatePayload> {
    const roundId = this.roundDbId
    const cartelas = roundId
      ? await prisma.cartela.findMany({
          where: { roundId, userId },
          orderBy: { serial: 'asc' },
          select: { serial: true, numbers: true },
        })
      : []

    return {
      state: this.state,
      predrawTime: this.predrawTime,
      drawnNumbers: this.drawnNumbers,
      cartelas: cartelas.map((c) => ({ id: c.serial, numbers: c.numbers })),
      meta: this.meta(),
    }
  }

  async syncStateForGuest(): Promise<SyncStatePayload> {
    return {
      state: this.state,
      predrawTime: this.predrawTime,
      drawnNumbers: this.drawnNumbers,
      cartelas: [],
      meta: this.meta(),
    }
  }

  async buyCartelas(userId: string, qty: number) {
    if (this.state !== 'WAITING') {
      throw new Error('ROUND_ALREADY_STARTED')
    }
    const requested = Math.max(1, Math.floor(qty))
    if (this.soldCartelasThisRound + requested > RULES.maxCartelasPerRound) {
      throw new Error('ROUND_CARTELA_LIMIT')
    }
    if (!this.roundDbId) throw new Error('NO_ROUND')

    const cost = requested * RULES.donationPerCartela

    // Debit wallet (fake) and create ledger entry; then create cartelas
    const created = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } })
      if (!wallet) throw new Error('NO_WALLET')

      const total = Number(wallet.balanceTotal)
      const withdrawable = Number(wallet.balanceWithdrawable)
      if (withdrawable + total < cost - 1e-9) throw new Error('INSUFFICIENT_FUNDS')

      // Spend withdrawable first, then total
      const spendFromWithdrawable = Math.min(withdrawable, cost)
      const remaining = cost - spendFromWithdrawable
      const spendFromTotal = remaining

      const newWithdrawable = withdrawable - spendFromWithdrawable
      const newTotal = total - spendFromTotal

      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          balanceWithdrawable: new Prisma.Decimal(newWithdrawable),
          balanceTotal: new Prisma.Decimal(newTotal),
        },
      })

      await tx.ledgerEntry.create({
        data: {
          userId,
          type: 'BUY_CARTELAS',
          amount: new Prisma.Decimal(-cost),
          balanceAfter: updated.balanceTotal,
          metadata: { qty: requested, round: this.roundNumber },
        },
      })

      const cartelasToCreate = []
      for (let i = 0; i < requested; i++) {
        const numbers = this.createUniqueCartelaNumbers()
        cartelasToCreate.push(
          tx.cartela.create({
            data: {
              roundId: this.roundDbId!,
              userId,
              numbers,
            },
            select: { serial: true, numbers: true },
          }),
        )
      }

      const cartelas = await Promise.all(cartelasToCreate)
      return { wallet: updated, cartelas }
    })

    this.soldCartelasThisRound += created.cartelas.length

    // Broadcast meta update and return cartelas for this user
    this.io.emit('game_meta', this.meta())
    return created.cartelas.map((c) => ({ id: c.serial, numbers: c.numbers }))
  }

  private createUniqueCartelaNumbers(): number[] {
    for (let attempt = 0; attempt < 2500; attempt++) {
      const nums = new Set<number>()
      while (nums.size < 15) nums.add(Math.floor(Math.random() * RULES.numberMax) + 1)
      const arr = Array.from(nums).sort((a, b) => a - b)
      const sig = arr.join('-')
      if (!this.cartelaRegistry.has(sig)) {
        this.cartelaRegistry.add(sig)
        return arr
      }
    }
    // fallback: allow duplicates if extremely unlikely to find unique
    const nums = new Set<number>()
    while (nums.size < 15) nums.add(Math.floor(Math.random() * RULES.numberMax) + 1)
    return Array.from(nums).sort((a, b) => a - b)
  }

  private async startRound() {
    if (!this.roundDbId) await this.ensureCurrentRound()
    if (!this.roundDbId) throw new Error('NO_ROUND')

    this.state = 'PLAYING'
    this.drawnNumbers = []
    this.availableNumbers = Array.from({ length: RULES.numberMax }, (_, i) => i + 1)
    this.availableNumbers.sort(() => Math.random() - 0.5)
    this.drawStartedAt = Date.now()

    this.quadraWinner = null
    this.quinaWinner = null
    this.kenoWinner = null

    // Reset uniqueness registry from DB for this round
    this.cartelaRegistry = new Set()
    const existing = await prisma.cartela.findMany({ where: { roundId: this.roundDbId }, select: { numbers: true } })
    for (const c of existing) this.cartelaRegistry.add(c.numbers.join('-'))

    await prisma.round.update({
      where: { id: this.roundDbId },
      data: { status: 'PLAYING', startedAt: new Date(), endedAt: null, reason: null },
    })

    this.io.emit('state_change', { state: this.state, meta: this.meta() })

    this.drawInterval = setInterval(() => {
      void this.drawNextBall()
    }, RULES.drawEveryMs)
  }

  private async drawNextBall() {
    if (this.state !== 'PLAYING') return
    if (!this.roundDbId) return

    if (this.availableNumbers.length === 0) {
      await this.endRound('NO_WINNER')
      return
    }

    const newNum = this.availableNumbers.pop()!
    this.drawnNumbers.push(newNum)

    await prisma.drawnBall.create({
      data: {
        roundId: this.roundDbId,
        order: this.drawnNumbers.length,
        number: newNum,
      },
    })

    this.io.emit('new_ball', { number: newNum, drawnCount: this.drawnNumbers.length })
    await this.checkWinners()
  }

  private async checkWinners() {
    if (!this.roundDbId) return
    const drawnSet = new Set(this.drawnNumbers)

    const cartelas = await prisma.cartela.findMany({
      where: { roundId: this.roundDbId },
      select: { id: true, serial: true, userId: true, numbers: true },
    })

    for (const c of cartelas) {
      let hits = 0
      for (const n of c.numbers) if (drawnSet.has(n)) hits++

      if (hits === 4 && !this.quadraWinner) {
        this.quadraWinner = { userId: c.userId, cartelaId: c.id, cartelaSerial: c.serial }
        await prisma.winner.create({
          data: { roundId: this.roundDbId, userId: c.userId, cartelaId: c.id, cartelaSerial: c.serial, type: 'QUADRA' },
        })
        this.io.emit('winner', { type: 'QUADRA', cartelaId: c.serial })
      }

      if (hits === 5 && !this.quinaWinner) {
        this.quinaWinner = { userId: c.userId, cartelaId: c.id, cartelaSerial: c.serial }
        await prisma.winner.create({
          data: { roundId: this.roundDbId, userId: c.userId, cartelaId: c.id, cartelaSerial: c.serial, type: 'QUINA' },
        })
        this.io.emit('winner', { type: 'QUINA', cartelaId: c.serial })
      }

      if (hits === 15 && !this.kenoWinner) {
        this.kenoWinner = { userId: c.userId, cartelaId: c.id, cartelaSerial: c.serial }
        await prisma.winner.create({
          data: { roundId: this.roundDbId, userId: c.userId, cartelaId: c.id, cartelaSerial: c.serial, type: 'KENO' },
        })
        this.io.emit('winner', { type: 'KENO', cartelaId: c.serial })
        await this.endRound('KENO_WIN')
        return
      }
    }
  }

  private async endRound(reason: RoundEndReason) {
    if (this.closingRoundInProgress || this.state !== 'PLAYING') return
    this.closingRoundInProgress = true

    try {
      if (this.drawInterval) {
        clearInterval(this.drawInterval)
        this.drawInterval = null
      }
      if (!this.roundDbId) return

      this.state = 'FINISHED'

      await prisma.round.update({
        where: { id: this.roundDbId },
        data: { status: 'FINISHED', endedAt: new Date(), reason },
      })

      const finishedRoundDbId = this.roundDbId
      const finishedRoundNumber = this.roundNumber

      this.io.emit('state_change', { state: this.state, meta: this.meta(), reason })
      this.io.emit('round_summary', {
        roundId: finishedRoundNumber,
        reason,
        totalBallsDrawn: this.drawnNumbers.length,
        winners: {
          quadra: this.quadraWinner ? { socketId: this.quadraWinner.userId, cartelaId: this.quadraWinner.cartelaSerial } : null,
          quina: this.quinaWinner ? { socketId: this.quinaWinner.userId, cartelaId: this.quinaWinner.cartelaSerial } : null,
          keno: this.kenoWinner ? { socketId: this.kenoWinner.userId, cartelaId: this.kenoWinner.cartelaSerial } : null,
        },
      })

      if (this.nextRoundTimer) clearTimeout(this.nextRoundTimer)
      this.nextRoundTimer = setTimeout(() => {
        this.nextRoundTimer = null
        void this.resetEngine(finishedRoundDbId)
      }, 10000)
    } finally {
      this.closingRoundInProgress = false
    }
  }

  private async resetEngine(expectedFinishedRoundDbId?: string) {
    if (expectedFinishedRoundDbId && this.roundDbId !== expectedFinishedRoundDbId) return

    let wait = await prisma.round.findFirst({
      where: { status: 'WAITING' },
      orderBy: { roundNumber: 'desc' },
    })

    if (!wait) {
      const agg = await prisma.round.aggregate({ _max: { roundNumber: true } })
      const nextNumber = (agg._max.roundNumber ?? 0) + 1
      try {
        wait = await prisma.round.create({
          data: {
            roundNumber: nextNumber,
            status: 'WAITING',
            rulesSnapshot: { ...RULES },
          },
        })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          wait = await prisma.round.findFirst({
            where: { status: 'WAITING' },
            orderBy: { roundNumber: 'desc' },
          })
        } else {
          throw e
        }
      }
    }

    if (!wait) return

    this.roundDbId = wait.id
    this.roundNumber = wait.roundNumber

    this.state = 'WAITING'
    this.predrawTime = RULES.predrawSeconds
    this.drawStartedAt = null
    this.drawnNumbers = []
    this.availableNumbers = []
    this.soldCartelasThisRound = 0
    this.cartelaRegistry = new Set()

    this.quadraWinner = null
    this.quinaWinner = null
    this.kenoWinner = null

    this.io.emit('state_change', { state: this.state, meta: this.meta() })
  }
}

