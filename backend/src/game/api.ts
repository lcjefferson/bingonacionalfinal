import { Router } from 'express'
import { prisma } from '../db'

function requireUserId(req: any, res: any): string | null {
  const userId = req.session?.userId
  if (!userId) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED' })
    return null
  }
  return userId
}

export const gameApiRouter = Router()

gameApiRouter.get('/rounds', async (_req, res) => {
  const rounds = await prisma.round.findMany({
    orderBy: { roundNumber: 'desc' },
    take: 30,
    select: {
      roundNumber: true,
      status: true,
      startedAt: true,
      endedAt: true,
      reason: true,
      _count: { select: { balls: true, cartelas: true, winners: true } },
    },
  })
  res.json({ rounds })
})

gameApiRouter.get('/rounds/:roundNumber', async (req, res) => {
  const roundNumber = Number(req.params.roundNumber)
  if (!Number.isFinite(roundNumber)) {
    res.status(400).json({ error: 'INVALID_ROUND' })
    return
  }

  const round = await prisma.round.findUnique({
    where: { roundNumber },
    select: {
      roundNumber: true,
      status: true,
      startedAt: true,
      endedAt: true,
      reason: true,
      rulesSnapshot: true,
      balls: { orderBy: { order: 'asc' }, select: { order: true, number: true, drawnAt: true } },
      winners: {
        orderBy: { createdAt: 'asc' },
        select: { type: true, cartelaSerial: true, user: { select: { name: true, login: true } } },
      },
    },
  })

  if (!round) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }

  res.json({ round })
})

gameApiRouter.get('/me/prizes', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return

  const prizes = await prisma.winner.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      type: true,
      cartelaSerial: true,
      createdAt: true,
      round: { select: { roundNumber: true } },
    },
  })

  res.json({ prizes })
})

