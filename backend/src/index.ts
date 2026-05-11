import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import pgSession from 'connect-pg-simple'
import http from 'http'
import path from 'path'
import { Server } from 'socket.io'

import { browserCookieSecure, getEnv } from './env'
import { authRouter } from './auth/routes'
import { walletRouter } from './wallet/routes'
import { GameEngine } from './game/engine'
import { userRouter } from './user/routes'
import { gameApiRouter } from './game/api'

const env = getEnv()
const app = express()

if (env.TRUST_PROXY) {
  app.set('trust proxy', 1)
}

app.use(
  helmet({
    contentSecurityPolicy: false, // enable later when we have final asset strategy
  }),
)
app.use(express.json())
app.use(cookieParser())

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
)

const PgSession = pgSession(session)

const sessionMiddleware = session({
  name: 'bn.sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: env.NODE_ENV === 'production' ? env.TRUST_PROXY : false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: browserCookieSecure(env),
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
  store: new PgSession({
    conString: env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: true,
  }),
})

app.use(sessionMiddleware)

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/user', userRouter)
app.use('/api/game', gameApiRouter)

// Serve existing frontend build (same as legacy server.js)
app.use(express.static(path.join(process.cwd(), 'frontend', 'dist')))
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'frontend', 'dist', 'index.html'))
})

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: env.CORS_ORIGIN, credentials: true },
})

// Share express-session with Socket.IO
io.engine.use(sessionMiddleware as any)

const engine = new GameEngine(io)
void engine.init()

io.on('connection', (socket) => {
  const reqAny = socket.request as any
  const userId: string | undefined = reqAny?.session?.userId
  if (!userId) {
    void engine.syncStateForGuest().then((payload) => {
      socket.emit('sync_state', payload)
    })
    socket.on('buy_cartelas', () => {
      socket.emit('game_error', 'Você precisa estar logado para comprar cartelas.')
    })
    return
  }

  void engine.syncStateForUser(userId).then((payload) => socket.emit('sync_state', payload))

  socket.on('buy_cartelas', async (qty: number) => {
    try {
      const cartelas = await engine.buyCartelas(userId, qty)
      socket.emit('cartelas_bought', cartelas)
    } catch (e: any) {
      const msg =
        e?.message === 'INSUFFICIENT_FUNDS'
          ? 'Saldo insuficiente.'
          : e?.message === 'ROUND_ALREADY_STARTED'
            ? 'Rodada já iniciada. Aguarde a próxima.'
            : e?.message === 'ROUND_CARTELA_LIMIT'
              ? 'Limite de cartelas da rodada atingido.'
              : 'Erro no servidor'
      socket.emit('game_error', msg)
    }
  })
})

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${env.PORT}`)
})

