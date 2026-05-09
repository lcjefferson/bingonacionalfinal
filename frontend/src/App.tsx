import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from './store/useGameStore'
import { apiGet, apiPost } from './lib/api'

function fmt2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(s / 60)
  return `${fmt2(m)}:${fmt2(s % 60)}`
}

function formatBRL(n: number) {
  const nn = Number.isFinite(n) ? n : 0
  return `R$${nn.toFixed(2).replace('.', ',')}`
}

function formatMetaDateTime(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}-${hh}:${mi}`
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v))
}

function gradientForNumber(n: number) {
  const nn = clamp(Number(n) || 1, 1, 90)
  const hue = (nn * 137.508) % 360
  const sat = 86
  const light = 60
  const dark = 30
  return `radial-gradient(circle at 40% 35%, hsl(${hue} ${sat}% ${light}%), hsl(${hue} ${sat}% ${dark}%))`
}

type BallConfig = { size: number; left: number; top: number; fontSize: number }

function BallQueue({
  numbersLatestFirst,
}: {
  numbersLatestFirst: number[]
}) {
  const configs: BallConfig[] = [
    // Fixed slots forming an "arc" (keep each ball in its spot).
    { size: 240, left: 30, top: 120, fontSize: 100 },  // newest (big)
    { size: 150, left: 300, top: 40, fontSize: 62 },
    { size: 120, left: 500, top: 70, fontSize: 52 },
    { size: 98, left: 660, top: 140, fontSize: 44 },
  ]

  const prevSlotNumsRef = useRef<(number | null)[]>([null, null, null, null])
  const [lastRemoved, setLastRemoved] = useState<number | null>(null)
  const [enterSlots, setEnterSlots] = useState<Record<number, boolean>>({})

  useEffect(() => {
    const prev = prevSlotNumsRef.current
    const next = [0, 1, 2, 3].map((i) => numbersLatestFirst[i] ?? null)

    const changedSlots: number[] = []
    for (let i = 0; i < next.length; i++) {
      if (next[i] != null && next[i] !== prev[i]) changedSlots.push(i)
    }

    // Removed ball is what used to be in slot 3, when we had a full queue and latest changed.
    if (next[0] != null && prev[0] != null && next[0] !== prev[0] && prev[3] != null) {
      setLastRemoved(prev[3])
      window.setTimeout(() => setLastRemoved(null), 650)
    } else {
      setLastRemoved(null)
    }

    if (changedSlots.length) {
      const flags: Record<number, boolean> = {}
      for (const s of changedSlots) flags[s] = true
      setEnterSlots(flags)
      // clear enter flags so transitions don't loop
      window.setTimeout(() => setEnterSlots({}), 700)
    }

    prevSlotNumsRef.current = next
  }, [numbersLatestFirst])

  return (
    <>
      {configs.map((cfg, idx) => {
        const num = numbersLatestFirst[idx]
        if (!num) return null
        const isLatest = idx === 0
        return (
          <div
            key={idx}
            className={`draw-ball ${isLatest ? 'ball-latest' : 'ball-ghost'}${enterSlots[idx] ? ' ball-enter' : ''}`}
            style={{
              width: cfg.size,
              height: cfg.size,
              left: cfg.left,
              top: cfg.top,
              zIndex: 50 - idx,
              background: gradientForNumber(num),
            }}
          >
            <span className="ball-number" style={{ fontSize: cfg.fontSize }}>
              {fmt2(num)}
            </span>
          </div>
        )
      })}

      {lastRemoved != null && (
        <div
          className="draw-ball ball-exit"
          style={{
            width: configs[configs.length - 1].size,
            height: configs[configs.length - 1].size,
            left: configs[configs.length - 1].left,
            top: configs[configs.length - 1].top,
            zIndex: 1,
            background: gradientForNumber(lastRemoved),
          }}
        >
          <span className="ball-number" style={{ fontSize: configs[configs.length - 1].fontSize }}>
            {fmt2(lastRemoved)}
          </span>
        </div>
      )}
    </>
  )
}

function App() {
  const connect = useGameStore((s) => s.connect)
  const state = useGameStore((s) => s.state)
  const predrawTime = useGameStore((s) => s.predrawTime)
  const drawnNumbers = useGameStore((s) => s.drawnNumbers)
  const cartelas = useGameStore((s) => s.cartelas)
  const meta = useGameStore((s) => s.meta)
  const buyCartelas = useGameStore((s) => s.buyCartelas)
  const lastWinner = useGameStore((s) => s.lastWinner)
  const lastRoundSummary = useGameStore((s) => s.lastRoundSummary)
  const error = useGameStore((s) => s.error)

  const [qty, setQty] = useState(5)
  // Showing all cartelas together (no single-selection navigation needed).
  const [predrawNow, setPredrawNow] = useState(() => formatMetaDateTime(new Date()))
  const [elapsed, setElapsed] = useState('00:00')

  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const [sessionName, setSessionName] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [winnerOpen, setWinnerOpen] = useState(false)
  const [winnerText, setWinnerText] = useState('Temos um ganhador no Keno!')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)

  const [menuModal, setMenuModal] = useState<null | 'AO_VIVO' | 'SORTEIOS' | 'MEUS_PREMIOS' | 'HISTORICO' | 'NARRACAO'>(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  const [headerModal, setHeaderModal] = useState<null | 'DEPOSITAR' | 'SACAR' | 'EXTRATO' | 'DADOS'>(null)
  const [saldoOpen, setSaldoOpen] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [saldo, setSaldo] = useState(() => ({
    total: 0,
    bonusKeno: 0,
    saqueDisponivel: 0,
  }))
  const [statement, setStatement] = useState<{ entries: any[] } | null>(null)
  const [depositAmount, setDepositAmount] = useState<number>(50)
  const [rounds, setRounds] = useState<any[] | null>(null)
  const [myPrizes, setMyPrizes] = useState<any[] | null>(null)
  const [narrationEnabled, setNarrationEnabled] = useState<boolean>(true)
  const [profileName, setProfileName] = useState<string>('')
  const [profilePass, setProfilePass] = useState<string>('')
  const [withdrawAmount, setWithdrawAmount] = useState<number>(30)

  useEffect(() => {
    connect()
  }, [connect])

  useEffect(() => {
    // Load CSRF + session user from backend.
    const boot = async () => {
      try {
        const csrf = await apiGet<{ token: string }>('/api/auth/csrf')
        setCsrfToken(csrf.token)
      } catch {
        // keep null; POSTs will fail until backend is reachable
      }

      try {
        const me = await apiGet<{
          user: {
            id: string
            name: string
            login: string
            narrationEnabled?: boolean
            wallet: {
              balanceTotal: string
              balanceBonusKeno: string
              balanceWithdrawable: string
            } | null
          }
        }>('/api/auth/me')

        setSessionName(me.user.name)
        setProfileName(me.user.name)
        if (typeof me.user.narrationEnabled === 'boolean') setNarrationEnabled(me.user.narrationEnabled)
        const w = me.user.wallet
        if (w) {
          setSaldo({
            total: Number(w.balanceTotal),
            bonusKeno: Number(w.balanceBonusKeno),
            saqueDisponivel: Number(w.balanceWithdrawable),
          })
        }
      } catch (e) {
        // Not logged in is fine.
        setSessionName(null)
      }
    }
    void boot()
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setPredrawNow(formatMetaDateTime(new Date())), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    // elapsed timer during draw
    const tick = () => {
      const startedAt = meta?.drawStartedAt
      if (!startedAt) {
        setElapsed('00:00')
        return
      }
      const sec = Math.floor((Date.now() - startedAt) / 1000)
      const m = String(Math.floor(sec / 60)).padStart(2, '0')
      const s = String(sec % 60).padStart(2, '0')
      setElapsed(`${m}:${s}`)
    }
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [meta?.drawStartedAt])

  const showToast = (msg: string, ms = 3200) => {
    setToastMsg(msg)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), ms)
  }

  const ensureCsrf = async () => {
    if (csrfToken) return csrfToken
    const csrf = await apiGet<{ token: string }>('/api/auth/csrf')
    setCsrfToken(csrf.token)
    return csrf.token
  }

  useEffect(() => {
    const onDoc = () => setSaldoOpen(false)
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  useEffect(() => {
    if (error) showToast(error, 3500)
  }, [error])

  useEffect(() => {
    if (lastRoundSummary?.reason === 'NO_WINNER') {
      showToast('Rodada encerrada sem ganhador. Reiniciando…', 4500)
    }
  }, [lastRoundSummary?.reason])

  useEffect(() => {
    if (!lastWinner) return
    const map: Record<string, string> = { QUADRA: 'Quadra', QUINA: 'Quina', KENO: 'Keno' }
    const label = map[lastWinner.type] ?? lastWinner.type
    setWinnerText(`Temos um ganhador de ${label}! Cartela #${lastWinner.cartelaId}`)
    setWinnerOpen(true)
  }, [lastWinner])

  useEffect(() => {
    // Reset per round/state changes
    if (state === 'WAITING') {
      setWinnerOpen(false)
    }
  }, [state])

  const last = drawnNumbers.length ? drawnNumbers[drawnNumbers.length - 1] : null
  const recent = useMemo(() => [...drawnNumbers].reverse().slice(0, 24), [drawnNumbers])
  const ballQueue = useMemo(() => [...drawnNumbers].slice(-4).reverse(), [drawnNumbers])

  const cartelasTitle = `Cartelas: ${cartelas.length}`

  const kenoBadgeText = useMemo(() => {
    if (state === 'FINISHED') return 'Rodada encerrada'
    if (!cartelas.length) return 'Sem cartelas'
    let best = 0
    for (const c of cartelas) {
      let hits = 0
      for (const n of c.numbers) if (drawnNumbers.includes(n)) hits++
      if (hits > best) best = hits
    }
    if (best >= 15) return 'Keno!'
    if (best >= 5) return `Melhor cartela: ${best}/15 · Quina+`
    if (best === 4) return 'Melhor cartela: 4/15 · Quadra'
    return `Melhor cartela: ${best}/15`
  }, [cartelas, drawnNumbers, state])

  const cartelasList = useMemo(() => {
    if (!cartelas.length) return null
    return cartelas.map((c) => (
      <div key={c.id} className="cartela-card">
        <div className="cartela-card__head">
          <span>Cartela #{c.id}</span>
          <span>{cartelas.length} no total</span>
        </div>
        <div className="cartela-grid">
          {c.numbers.map((n) => (
            <div
              key={`${c.id}-${n}`}
              className={`cartela-cell${drawnNumbers.includes(n) ? ' cartela-cell--hit' : ''}${
                last === n ? ' cartela-cell--last' : ''
              }`}
            >
              {fmt2(n)}
            </div>
          ))}
        </div>
      </div>
    ))
  }, [cartelas, drawnNumbers, last])

  const isPredraw = state !== 'PLAYING'
  const predrawLayoutClass = `predraw-layout${isPredraw ? '' : ' hidden'}`
  const drawLayoutClass = `draw-layout${state === 'PLAYING' ? '' : ' hidden'}`
  const guestClass = `header-auth header-auth--guest${sessionName ? ' hidden' : ''}`
  const userClass = `header-auth header-auth--user${sessionName ? '' : ' hidden'}`

  return (
    <>
      <header className="header">
        <div className="logo">
          <img
            src="https://space-clientes.nyc3.cdn.digitaloceanspaces.com/bingonacional.club/logo_site.png"
            alt="Bingo Nacional"
          />
        </div>
        <div className="header-right">
          <div className={guestClass} id="header-guest">
            <button type="button" className="btn-login" onClick={() => { setLoginError(null); setLoginOpen(true) }}>
              ENTRAR
            </button>
            <button type="button" className="btn-register" onClick={() => { setRegisterError(null); setRegisterOpen(true) }}>
              REGISTRAR
            </button>
          </div>
          <div className={userClass} id="header-user">
            <div className="header-userbar">
              <div className="header-greeting" id="header-greeting">
                {sessionName ? `Olá, ${sessionName}` : ''}
              </div>

              <div className="header-saldo-wrap">
                <button
                  type="button"
                  className="header-saldo"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSaldoOpen((v) => !v)
                  }}
                  aria-label="Saldo"
                  title="Saldo"
                >
                  <div className="header-saldo__label">Saldo</div>
                  <div className="header-saldo__value">{formatBRL(saldo.total)}</div>
                </button>

                <div className={`header-saldo-menu${saldoOpen ? '' : ' hidden'}`}>
                  <div className="header-saldo-row">
                    <span>Saldo Total</span>
                    <b>{formatBRL(saldo.total)}</b>
                  </div>
                  <div className="header-saldo-row">
                    <span>Bônus Keno</span>
                    <b>{formatBRL(saldo.bonusKeno)}</b>
                  </div>
                  <div className="header-saldo-row">
                    <span>Saque disponível</span>
                    <b>{formatBRL(saldo.saqueDisponivel)}</b>
                  </div>
                </div>
              </div>

              <div className="header-menu">
                <button type="button" className="header-menu-item" onClick={() => setHeaderModal('DEPOSITAR')}>
                  <div className="header-menu-item__icon">💳</div>
                  <div className="header-menu-item__text">Depositar</div>
                </button>
                <button type="button" className="header-menu-item" onClick={() => setHeaderModal('SACAR')}>
                  <div className="header-menu-item__icon">🏧</div>
                  <div className="header-menu-item__text">Sacar</div>
                </button>
                <button type="button" className="header-menu-item" onClick={() => setHeaderModal('EXTRATO')}>
                  <div className="header-menu-item__icon">🧾</div>
                  <div className="header-menu-item__text">Extrato</div>
                </button>
                <button type="button" className="header-menu-item" onClick={() => setHeaderModal('DADOS')}>
                  <div className="header-menu-item__icon">👤</div>
                  <div className="header-menu-item__text">Dados</div>
                </button>
                <button
                  type="button"
                  className="header-menu-item"
                  onClick={() => {
                    void (async () => {
                      try {
                        const token = await ensureCsrf()
                        await apiPost('/api/auth/logout', {}, token)
                      } catch {
                        // ignore
                      } finally {
                        setSessionName(null)
                        setSaldo({ total: 0, bonusKeno: 0, saqueDisponivel: 0 })
                        setSaldoOpen(false)
                        showToast('Você saiu da sessão.')
                      }
                    })()
                  }}
                >
                  <div className="header-menu-item__icon">🚪</div>
                  <div className="header-menu-item__text">Sair</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="game-area">
        <aside className={`sidebar${sidebarExpanded ? ' sidebar--expanded' : ''}`}>
          <button
            type="button"
            className={`sb-item${sidebarExpanded ? ' sb-item--expanded' : ''} sb-item--toggle`}
            onClick={() => setSidebarExpanded((v) => !v)}
            aria-label="Abrir/fechar menu"
            title="Menu"
          >
            <span className="sb-icon sb-icon--plain">☰</span>
            <span className="sb-text">Menu</span>
          </button>

          <button
            type="button"
            className={`sb-item${sidebarExpanded ? ' sb-item--expanded' : ''}`}
            onClick={() => setMenuModal('AO_VIVO')}
            aria-label="Ao Vivo"
            title="Ao Vivo"
          >
            <span className="sb-icon">◉</span>
            <span className="sb-text">Ao Vivo</span>
          </button>

          <button
            type="button"
            className={`sb-item${sidebarExpanded ? ' sb-item--expanded' : ''}`}
            onClick={() => setMenuModal('SORTEIOS')}
            aria-label="Sorteios"
            title="Sorteios"
          >
            <span className="sb-icon">📅</span>
            <span className="sb-text">Sorteios</span>
          </button>

          <button
            type="button"
            className={`sb-item${sidebarExpanded ? ' sb-item--expanded' : ''}`}
            onClick={() => setMenuModal('MEUS_PREMIOS')}
            aria-label="Meus prêmios"
            title="Meus prêmios"
          >
            <span className="sb-icon">🏆</span>
            <span className="sb-text">Meus prêmios</span>
          </button>

          <button
            type="button"
            className={`sb-item${sidebarExpanded ? ' sb-item--expanded' : ''}`}
            onClick={() => setMenuModal('HISTORICO')}
            aria-label="Histórico"
            title="Histórico"
          >
            <span className="sb-icon">📜</span>
            <span className="sb-text">Histórico</span>
          </button>

          <button
            type="button"
            className={`sb-item${sidebarExpanded ? ' sb-item--expanded' : ''}`}
            onClick={() => setMenuModal('NARRACAO')}
            aria-label="Narração"
            title="Narração"
          >
            <span className="sb-icon">🗣️</span>
            <span className="sb-text">Narração</span>
          </button>
        </aside>

        <div className="game-content" id="game-content">
          <div className={predrawLayoutClass} id="predraw-layout">
            <div className="col-left">
              <div className="box countdown-box">
                <div className="box-title yellow">Próximo Sorteio</div>
                <div className="countdown-time" id="cd-timer">
                  {fmtTime(predrawTime)}
                </div>
              </div>

              <div className="info-row">
                <div className="box info-box">
                  <div className="box-title yellow">Sorteio</div>
                  <div className="box-value white" id="meta-predraw-round">
                    #{meta?.roundId ?? '—'}
                  </div>
                </div>
                <div className="box info-box">
                  <div className="box-title yellow">Dia-Hora</div>
                  <div className="box-value white meta-datetime" id="meta-predraw-datetime">
                    {predrawNow}
                  </div>
                </div>
                <div className="box info-box">
                  <div className="box-title yellow">Doação</div>
                  <div className="box-value white" id="meta-predraw-donation">
                    {formatBRL(meta?.donation ?? NaN)}
                  </div>
                </div>
              </div>

              <div className="box prize-box predraw-prize">
                <div className="prize-name yellow">Quadra</div>
                <div className="prize-value white" id="meta-prize-quadra">
                  {formatBRL(meta?.prizes?.quadra ?? NaN)}
                </div>
              </div>
              <div className="box prize-box predraw-prize">
                <div className="prize-name yellow">Quina</div>
                <div className="prize-value white" id="meta-prize-quina">
                  {formatBRL(meta?.prizes?.quina ?? NaN)}
                </div>
              </div>
              <div className="box prize-box predraw-prize">
                <div className="prize-name yellow">Keno</div>
                <div className="prize-value white" id="meta-prize-keno">
                  {formatBRL(meta?.prizes?.keno ?? NaN)}
                </div>
              </div>

              <div className="box acum-box">
                <div className="acum-name yellow">Acumulado</div>
                <div className="acum-val-wrap">
                  <div className="acum-val-bg">
                    <span className="acum-val" id="meta-acum-val">
                      {formatBRL(meta?.accumulated ?? NaN)}
                    </span>
                  </div>
                  <div className="acum-badge" id="meta-acum-badge">
                    {meta?.accumulatedDays ?? '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-right">
              <div className="controls-panel">
                <div className="qty-grid">
                  {[5, 10, 20, 30, 40, 50, 100, 200].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`qty-btn${qty === n ? ' selected' : ''}`}
                      onClick={() => setQty(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="buy-row">
                  <button type="button" className="adj-btn" aria-label="Diminuir quantidade" onClick={() => setQty((v) => Math.max(1, v - 1))}>
                    −
                  </button>
                  <div className="qty-display" id="qty-display">
                    {qty}
                  </div>
                  <button type="button" className="adj-btn" aria-label="Aumentar quantidade" onClick={() => setQty((v) => Math.min(200, v + 1))}>
                    +
                  </button>
                  <div className="total-display">
                    {formatBRL(qty * (meta?.donation ?? 0.2))}
                  </div>
                  <button
                    type="button"
                    className="doar-btn"
                    onClick={() => {
                      if (!sessionName) {
                        showToast('Entre ou registre-se para doar.')
                        setLoginError(null)
                        setLoginOpen(true)
                        return
                      }
                      buyCartelas(qty)
                    }}
                  >
                    DOAR
                  </button>
                </div>
              </div>

              <div className="cartelas-panel">
                <div className="cartelas-header">
                  <div className="cartelas-title" id="cartelas-title-predraw">
                    {cartelasTitle}
                  </div>
                </div>
                <div className="cartelas-body">
                  {!cartelas.length ? (
                    <p className="cartela-empty-msg">Nenhuma cartela ainda. Escolha a quantidade e clique em DOAR.</p>
                  ) : (
                    cartelasList
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={drawLayoutClass} id="draw-layout">
            <div className="draw-prizes-row">
              <div className="box prize-box draw-prize">
                <div className="prize-name yellow">Quadra</div>
                <div className="prize-value white" id="meta-draw-prize-quadra">
                  {formatBRL(meta?.prizes?.quadra ?? NaN)}
                </div>
              </div>
              <div className="box prize-box draw-prize">
                <div className="prize-name yellow">Quina</div>
                <div className="prize-value white" id="meta-draw-prize-quina">
                  {formatBRL(meta?.prizes?.quina ?? NaN)}
                </div>
              </div>
              <div className="box prize-box draw-prize">
                <div className="prize-name yellow">Keno</div>
                <div className="prize-value white" id="meta-draw-prize-keno">
                  {formatBRL(meta?.prizes?.keno ?? NaN)}
                </div>
              </div>
              <div className="box acum-box draw-acum">
                <div className="acum-name white" style={{ fontSize: '1.2rem', textShadow: 'none' }}>
                  Acumulado
                </div>
                <div className="acum-val-bg" style={{ padding: '2px 10px', border: '1px solid #555' }}>
                  <span className="acum-val" style={{ fontSize: '1.4rem' }} id="meta-draw-acum">
                    {formatBRL(meta?.accumulated ?? NaN)}
                  </span>
                </div>
                <div
                  className="acum-badge"
                  style={{ right: '-10px', top: '-10px', bottom: 'auto', width: '25px', height: '25px', fontSize: '1rem' }}
                  id="meta-draw-acum-badge"
                >
                  {meta?.accumulatedDays ?? '—'}
                </div>
              </div>
            </div>

            <div className="draw-main-area">
              <div className="draw-left">
                <div className="draw-info-col">
                  <div className="box info-box draw-info">
                    <div className="box-title yellow">Sorteio</div>
                    <div className="box-value white" id="meta-draw-round">
                      #{meta?.roundId ?? '—'}
                    </div>
                  </div>
                  <div className="box info-box draw-info">
                    <div className="box-title yellow">Tempo</div>
                    <div className="box-value white" id="meta-draw-elapsed" style={{ fontSize: '1.3rem' }}>
                      {elapsed}
                    </div>
                  </div>
                  <div className="box info-box draw-info">
                    <div className="box-title yellow">Doação</div>
                    <div className="box-value white" id="meta-draw-donation">
                      {formatBRL(meta?.donation ?? NaN)}
                    </div>
                  </div>
                  <div className="box ordem-box">
                    <div className="ordem-label white">ORDEM</div>
                    <div className="ordem-value yellow" id="ordem-val">
                      {drawnNumbers.length}
                    </div>
                  </div>
                </div>

                <div className="ball-anim-area" id="ball-anim-area">
                  <BallQueue numbersLatestFirst={ballQueue} />
                </div>
              </div>

              <div className="draw-right">
                <div className="recent-balls-panel" id="recent-balls-panel">
                  <div className="recent-balls-title">Últimas bolas sorteadas</div>
                  <div className="recent-balls-chips" id="recent-balls-chips">
                    {recent.map((n, i) => (
                      <span
                        key={`${n}-${i}`}
                        className={`recent-ball-chip${i === 0 ? ' recent-ball-chip--latest' : ''}`}
                      >
                        {fmt2(n)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="cartelas-panel" style={{ marginTop: 10 }}>
                  <div className="cartelas-header">
                    <div className="cartelas-title" id="cartelas-title-draw">
                      {cartelasTitle}
                    </div>
                    <div className="badge-keno" id="badge-keno-status">
                      {kenoBadgeText}
                    </div>
                  </div>
                  <div className="cartelas-body">
                    {!cartelas.length ? (
                      <p className="cartela-empty-msg">Nenhuma cartela ainda. Escolha a quantidade e clique em DOAR.</p>
                    ) : (
                      cartelasList
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="number-board-wrap">
              <div className="number-board" id="number-board">
                {Array.from({ length: 90 }, (_, idx) => idx + 1).map((n) => (
                  <div
                    key={n}
                    className={`num-cell${
                      n === last ? ' last-drawn' : drawnNumbers.includes(n) ? ' drawn' : ''
                    }`}
                  >
                    {fmt2(n)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className={`toast${toastMsg ? '' : ' hidden'}`} id="toast" role="status">
        {toastMsg ?? ''}
      </div>

      {/* Login Modal (demo) */}
      <div className={`modal${loginOpen ? '' : ' hidden'}`} id="loginModal" onClick={(e) => e.target === e.currentTarget && setLoginOpen(false)}>
        <div className="modal-dialog">
          <div className="modal-content">
            <h3 style={{ color: 'black' }}>Entrar</h3>
            <p className={`form-error${loginError ? '' : ' hidden'}`} id="login-error">
              {loginError ?? ''}
            </p>
            <input type="text" id="login-user" placeholder="CPF ou usuário" autoComplete="username" />
            <input type="password" id="login-pass" placeholder="Senha" autoComplete="current-password" />
            <button
              type="button"
              className="btn-preto"
              id="do-login-btn"
              onClick={() => {
                void (async () => {
                  const login = (document.getElementById('login-user') as HTMLInputElement | null)?.value?.trim() ?? ''
                  const password = (document.getElementById('login-pass') as HTMLInputElement | null)?.value ?? ''
                  if (login.length < 3) {
                    setLoginError('Informe CPF ou usuário (mín. 3 caracteres).')
                    return
                  }
                  if (password.length < 4) {
                    setLoginError('Senha muito curta.')
                    return
                  }
                  try {
                    const token = await ensureCsrf()
                    await apiPost('/api/auth/login', { login, password }, token)
                    const me = await apiGet<any>('/api/auth/me')
                    setSessionName(me.user.name)
                    const w = me.user.wallet
                    if (w) {
                      setSaldo({
                        total: Number(w.balanceTotal),
                        bonusKeno: Number(w.balanceBonusKeno),
                        saqueDisponivel: Number(w.balanceWithdrawable),
                      })
                    }
                    setLoginError(null)
                    setLoginOpen(false)
                    showToast('Sessão iniciada.')
                  } catch (e) {
                    setLoginError('Usuário ou senha inválidos.')
                  }
                })()
              }}
            >
              Entrar
            </button>
          </div>
        </div>
      </div>

      {/* Register Modal (demo) */}
      <div className={`modal${registerOpen ? '' : ' hidden'}`} id="registerModal" onClick={(e) => e.target === e.currentTarget && setRegisterOpen(false)}>
        <div className="modal-dialog">
          <div className="modal-content">
            <h3 style={{ color: 'black' }}>Registrar</h3>
            <p className={`form-error${registerError ? '' : ' hidden'}`} id="register-error">
              {registerError ?? ''}
            </p>
            <input type="text" id="reg-name" placeholder="Nome completo" autoComplete="name" />
            <input type="text" id="reg-cpf" placeholder="CPF" autoComplete="off" />
            <input type="password" id="reg-pass" placeholder="Senha (mín. 4 caracteres)" autoComplete="new-password" />
            <button
              type="button"
              className="btn-preto"
              id="do-register-btn"
              onClick={() => {
                void (async () => {
                  const name = (document.getElementById('reg-name') as HTMLInputElement | null)?.value?.trim() ?? ''
                  const login = ((document.getElementById('reg-cpf') as HTMLInputElement | null)?.value ?? '').replace(/\D/g, '')
                  const password = (document.getElementById('reg-pass') as HTMLInputElement | null)?.value ?? ''
                  if (name.length < 3) {
                    setRegisterError('Informe seu nome completo.')
                    return
                  }
                  if (login.length !== 11) {
                    setRegisterError('CPF deve ter 11 dígitos.')
                    return
                  }
                  if (password.length < 4) {
                    setRegisterError('Senha com pelo menos 4 caracteres.')
                    return
                  }
                  try {
                    const token = await ensureCsrf()
                    await apiPost('/api/auth/register', { name, login, password }, token)
                    const me = await apiGet<any>('/api/auth/me')
                    setSessionName(me.user.name)
                    const w = me.user.wallet
                    if (w) {
                      setSaldo({
                        total: Number(w.balanceTotal),
                        bonusKeno: Number(w.balanceBonusKeno),
                        saqueDisponivel: Number(w.balanceWithdrawable),
                      })
                    }
                    setRegisterError(null)
                    setRegisterOpen(false)
                    showToast('Conta criada. Você já pode doar.')
                  } catch (e) {
                    setRegisterError('Não foi possível criar conta.')
                  }
                })()
              }}
            >
              Criar conta
            </button>
          </div>
        </div>
      </div>

      {/* Winner Modal */}
      <div className={`modal${winnerOpen ? '' : ' hidden'}`} id="winnerModal" onClick={(e) => e.target === e.currentTarget && setWinnerOpen(false)}>
        <div className="modal-dialog" style={{ maxWidth: 400, textAlign: 'center' }}>
          <div
            className="modal-content"
            style={{ background: 'linear-gradient(to bottom, #FFD700, #FFA500)', border: '3px solid white' }}
          >
            <h2 style={{ color: 'black', fontSize: '2.5rem', textShadow: '2px 2px white' }}>BINGO!</h2>
            <p style={{ color: 'black', fontSize: '1.2rem', fontWeight: 'bold' }} id="winnerText">
              {winnerText}
            </p>
            <button type="button" className="btn-preto" id="close-winner-btn" style={{ marginTop: 20 }} onClick={() => setWinnerOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Menu Modals */}
      <div
        className={`modal${menuModal ? '' : ' hidden'}`}
        onClick={(e) => e.target === e.currentTarget && setMenuModal(null)}
      >
        <div className="modal-dialog" style={{ maxWidth: 520 }}>
          <div className="modal-content">
            <h3 style={{ color: 'black' }}>
              {menuModal === 'AO_VIVO' && 'Ao Vivo'}
              {menuModal === 'SORTEIOS' && 'Sorteios'}
              {menuModal === 'MEUS_PREMIOS' && 'Meus prêmios'}
              {menuModal === 'HISTORICO' && 'Histórico'}
              {menuModal === 'NARRACAO' && 'Narração'}
            </h3>
            {menuModal === 'AO_VIVO' && (
              <p style={{ color: 'black', fontWeight: 700 }}>
                Você já está na tela Ao Vivo. Aqui mostramos apenas o status do backend.
              </p>
            )}

            {menuModal === 'SORTEIOS' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>Sorteios/rodadas (últimas 30).</p>
                <button
                  type="button"
                  className="btn-preto"
                  onClick={() => {
                    void (async () => {
                      try {
                        const r = await apiGet<any>('/api/game/rounds')
                        setRounds(r.rounds ?? [])
                      } catch {
                        showToast('Não foi possível carregar sorteios.')
                      }
                    })()
                  }}
                >
                  Carregar
                </button>
                <div style={{ marginTop: 12, maxHeight: 260, overflow: 'auto', color: 'black' }}>
                  {(rounds ?? []).map((rd) => (
                    <div
                      key={rd.roundNumber}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '6px 0',
                        borderBottom: '1px solid #eee',
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      <span>#{rd.roundNumber}</span>
                      <span>{rd.status}</span>
                      <span>Bolas: {rd._count?.balls ?? 0}</span>
                      <span>Cartelas: {rd._count?.cartelas ?? 0}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {menuModal === 'MEUS_PREMIOS' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>Meus prêmios (vitórias).</p>
                <button
                  type="button"
                  className="btn-preto"
                  onClick={() => {
                    void (async () => {
                      try {
                        const r = await apiGet<any>('/api/game/me/prizes')
                        setMyPrizes(r.prizes ?? [])
                      } catch {
                        showToast('Não foi possível carregar prêmios.')
                      }
                    })()
                  }}
                >
                  Carregar
                </button>
                <div style={{ marginTop: 12, maxHeight: 260, overflow: 'auto', color: 'black' }}>
                  {(myPrizes ?? []).map((p, idx) => (
                    <div
                      key={`${p.round?.roundNumber ?? 'x'}-${idx}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '6px 0',
                        borderBottom: '1px solid #eee',
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      <span>Rodada #{p.round?.roundNumber ?? '—'}</span>
                      <span>{p.type}</span>
                      <span>Cartela #{p.cartelaSerial}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {menuModal === 'HISTORICO' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>
                  Histórico: use “Sorteios” para ver rodadas; aqui exibimos resumo e vencedores por rodada (próxima iteração).
                </p>
              </>
            )}

            {menuModal === 'NARRACAO' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>Narração</p>
                <label style={{ color: 'black', fontWeight: 800, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={narrationEnabled}
                    onChange={(e) => {
                      const next = e.target.checked
                      setNarrationEnabled(next)
                      void (async () => {
                        try {
                          const token = await ensureCsrf()
                          await apiPost('/api/user/me', { narrationEnabled: next }, token)
                          showToast('Configuração salva.')
                        } catch {
                          showToast('Não foi possível salvar.')
                        }
                      })()
                    }}
                  />
                  Ativar narração
                </label>
              </>
            )}
            <button type="button" className="btn-preto" onClick={() => setMenuModal(null)}>
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Header Modals */}
      <div
        className={`modal${headerModal ? '' : ' hidden'}`}
        onClick={(e) => e.target === e.currentTarget && setHeaderModal(null)}
      >
        <div className="modal-dialog" style={{ maxWidth: 520 }}>
          <div className="modal-content">
            <h3 style={{ color: 'black' }}>
              {headerModal === 'DEPOSITAR' && 'Depositar'}
              {headerModal === 'SACAR' && 'Sacar'}
              {headerModal === 'EXTRATO' && 'Extrato'}
              {headerModal === 'DADOS' && 'Dados'}
            </h3>
            {headerModal === 'DEPOSITAR' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>
                  Depósito fake (MVP). Isso credita saldo para você testar o bingo.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, width: 160 }}
                  />
                  <button
                    type="button"
                    className="btn-preto"
                    onClick={() => {
                      void (async () => {
                        try {
                          const token = await ensureCsrf()
                          await apiPost<any>('/api/wallet/deposit_fake', { amount: depositAmount }, token)
                          // Refresh /me to update saldo
                          const me = await apiGet<any>('/api/auth/me')
                          const w = me.user.wallet
                          if (w) {
                            setSaldo({
                              total: Number(w.balanceTotal),
                              bonusKeno: Number(w.balanceBonusKeno),
                              saqueDisponivel: Number(w.balanceWithdrawable),
                            })
                          }
                          showToast('Depósito realizado.')
                        } catch (e) {
                          showToast('Não foi possível depositar.')
                        }
                      })()
                    }}
                  >
                    Depositar
                  </button>
                </div>
              </>
            )}

            {headerModal === 'EXTRATO' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>Extrato (últimas movimentações).</p>
                <button
                  type="button"
                  className="btn-preto"
                  onClick={() => {
                    void (async () => {
                      try {
                        const r = await apiGet<any>('/api/wallet/statement')
                        setStatement(r)
                      } catch {
                        showToast('Não foi possível carregar o extrato.')
                      }
                    })()
                  }}
                >
                  Carregar
                </button>
                <div style={{ marginTop: 12, maxHeight: 220, overflow: 'auto', color: 'black' }}>
                  {(statement?.entries ?? []).map((e, idx) => (
                    <div
                      key={e.id ?? idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '6px 0',
                        borderBottom: '1px solid #eee',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      <span>{e.type}</span>
                      <span>{Number(e.amount).toFixed(2).replace('.', ',')}</span>
                      <span>{new Date(e.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {headerModal === 'SACAR' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>
                  Saque fake (MVP). Debita do “saque disponível” para simular solicitação.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                    style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, width: 160 }}
                  />
                  <button
                    type="button"
                    className="btn-preto"
                    onClick={() => {
                      void (async () => {
                        try {
                          const token = await ensureCsrf()
                          await apiPost<any>('/api/wallet/withdraw_request_fake', { amount: withdrawAmount }, token)
                          const me = await apiGet<any>('/api/auth/me')
                          const w = me.user.wallet
                          if (w) {
                            setSaldo({
                              total: Number(w.balanceTotal),
                              bonusKeno: Number(w.balanceBonusKeno),
                              saqueDisponivel: Number(w.balanceWithdrawable),
                            })
                          }
                          showToast('Saque solicitado.')
                        } catch {
                          showToast('Não foi possível solicitar saque.')
                        }
                      })()
                    }}
                  >
                    Solicitar
                  </button>
                </div>
              </>
            )}
            {headerModal === 'DADOS' && (
              <>
                <p style={{ color: 'black', fontWeight: 700 }}>Dados do usuário</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
                    placeholder="Nome"
                  />
                  <input
                    type="password"
                    value={profilePass}
                    onChange={(e) => setProfilePass(e.target.value)}
                    style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
                    placeholder="Nova senha (opcional)"
                  />
                  <button
                    type="button"
                    className="btn-preto"
                    onClick={() => {
                      void (async () => {
                        try {
                          const token = await ensureCsrf()
                          await apiPost('/api/user/me', { name: profileName, password: profilePass || undefined }, token)
                          setProfilePass('')
                          setSessionName(profileName)
                          showToast('Dados atualizados.')
                        } catch {
                          showToast('Não foi possível atualizar.')
                        }
                      })()
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </>
            )}
            <button type="button" className="btn-preto" onClick={() => setHeaderModal(null)}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
