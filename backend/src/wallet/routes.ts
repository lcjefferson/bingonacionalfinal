import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { requireCsrf } from '../auth/csrf'

function requireUser(req: any, res: any): string | null {
  const userId = req.session?.userId
  if (!userId) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED' })
    return null
  }
  return userId
}

const DepositSchema = z.object({
  amount: z.coerce.number().positive().max(100000),
})

const WithdrawSchema = z.object({
  amount: z.coerce.number().positive().max(100000),
})

export const walletRouter = Router()

walletRouter.post('/deposit_fake', requireCsrf, async (req, res) => {
  const userId = requireUser(req, res)
  if (!userId) return

  const parsed = DepositSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
    return
  }

  const amount = parsed.data.amount

  const updated = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: { balanceTotal: { increment: amount }, balanceWithdrawable: { increment: amount } },
      create: { userId, balanceTotal: amount, balanceWithdrawable: amount, balanceBonusKeno: 0 },
    })

    await tx.ledgerEntry.create({
      data: {
        userId,
        type: 'DEPOSIT_FAKE',
        amount,
        balanceAfter: wallet.balanceTotal,
        metadata: { source: 'deposit_fake' },
      },
    })

    return wallet
  })

  res.json({ wallet: updated })
})

walletRouter.get('/statement', async (req, res) => {
  const userId = requireUser(req, res)
  if (!userId) return

  const [wallet, entries] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ])

  res.json({ wallet, entries })
})

walletRouter.post('/withdraw_request_fake', requireCsrf, async (req, res) => {
  const userId = requireUser(req, res)
  if (!userId) return

  const parsed = WithdrawSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
    return
  }

  const amount = parsed.data.amount

  const updated = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } })
    if (!wallet) throw new Error('NO_WALLET')

    const withdrawable = Number(wallet.balanceWithdrawable)
    if (withdrawable < amount - 1e-9) throw new Error('INSUFFICIENT_WITHDRAWABLE')

    const newWithdrawable = withdrawable - amount
    const w2 = await tx.wallet.update({
      where: { userId },
      data: { balanceWithdrawable: new Prisma.Decimal(newWithdrawable) },
    })

    await tx.ledgerEntry.create({
      data: {
        userId,
        type: 'WITHDRAW_REQUEST_FAKE',
        amount: new Prisma.Decimal(-amount),
        balanceAfter: w2.balanceTotal,
        metadata: { source: 'withdraw_request_fake' },
      },
    })

    return w2
  })

  res.json({ wallet: updated })
})

