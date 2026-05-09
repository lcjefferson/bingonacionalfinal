import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db'
import { requireCsrf } from '../auth/csrf'
import { hashPassword } from '../auth/password'

function requireUserId(req: any, res: any): string | null {
  const userId = req.session?.userId
  if (!userId) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED' })
    return null
  }
  return userId
}

const UpdateSchema = z.object({
  name: z.string().min(3).max(60).optional(),
  password: z.string().min(4).max(120).optional(),
  narrationEnabled: z.boolean().optional(),
})

export const userRouter = Router()

userRouter.get('/me', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, login: true, narrationEnabled: true },
  })
  res.json({ user })
})

userRouter.put('/me', requireCsrf, async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
    return
  }

  const { name, password, narrationEnabled } = parsed.data
  const data: any = {}
  if (typeof name === 'string') data.name = name
  if (typeof narrationEnabled === 'boolean') data.narrationEnabled = narrationEnabled
  if (typeof password === 'string' && password.length) {
    data.passwordHash = await hashPassword(password)
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, login: true, narrationEnabled: true },
  })
  res.json({ user })
})

