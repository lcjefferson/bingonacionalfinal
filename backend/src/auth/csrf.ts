import crypto from 'crypto'

import { browserCookieSecure, getEnv } from '../env'

const CSRF_COOKIE = 'bn.csrf'

export function issueCsrfToken(res: any) {
  const env = getEnv()
  const token = crypto.randomBytes(24).toString('hex')
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: browserCookieSecure(env),
    path: '/',
  })
  return token
}

export function requireCsrf(req: any, res: any, next: any) {
  const cookie = req.cookies?.[CSRF_COOKIE]
  const header = req.headers['x-csrf-token']
  if (!cookie || !header || cookie !== header) {
    res.status(403).json({ error: 'CSRF_INVALID' })
    return
  }
  next()
}

