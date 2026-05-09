import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db'
import { hashPassword, verifyPassword } from './password'
import { issueCsrfToken, requireCsrf } from './csrf'

declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}

const RegisterSchema = z.object({
  name: z.string().min(3).max(60),
  login: z.string().min(3).max(40),
  password: z.string().min(4).max(120),
})

const LoginSchema = z.object({
  login: z.string().min(3).max(40),
  password: z.string().min(4).max(120),
})

export const authRouter = Router()

authRouter.get('/csrf', (req, res) => {
  const token = issueCsrfToken(res)
  res.json({ token })
})

authRouter.post('/register', requireCsrf, async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
    return
  }

  const { name, login, password } = parsed.data
  const exists = await prisma.user.findUnique({ where: { login } })
  if (exists) {
    res.status(409).json({ error: 'LOGIN_TAKEN' })
    return
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      name,
      login,
      passwordHash,
      wallet: {
        create: {
          balanceTotal: 0,
          balanceBonusKeno: 0,
          balanceWithdrawable: 0,
        },
      },
    },
    select: { id: true, name: true, login: true },
  })

  req.session.userId = user.id
  res.json({ user })
})

authRouter.post('/login', requireCsrf, async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
    return
  }

  const { login, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { login } })
  if (!user) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' })
    return
  }

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' })
    return
  }

  req.session.userId = user.id
  res.json({ user: { id: user.id, name: user.name, login: user.login } })
})

authRouter.post('/logout', requireCsrf, async (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bn.sid')
    res.json({ ok: true })
  })
})

authRouter.get('/me', async (req, res) => {
  const userId = req.session.userId
  if (!userId) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED' })
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      login: true,
      wallet: {
        select: {
          balanceTotal: true,
          balanceBonusKeno: true,
          balanceWithdrawable: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!user) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED' })
    return
  }

  res.json({ user })
})

