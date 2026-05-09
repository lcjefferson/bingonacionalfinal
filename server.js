const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
// Serve the React frontend build (Vite) from /frontend/dist
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- Round Configuration (business rules) ---
// Backend is authoritative: frontend only renders.
const RULES = {
  numberMax: 90, // valid numbers: 1..numberMax
  predrawSeconds: 300, // 5 minutes
  drawEveryMs: 3000,
  minCartelasToStart: 0, // minimum sold cartelas to start a round (0 = starts by schedule)
  maxCartelasPerRound: 20000, // global cap per round
  donationPerCartela: 0.2,
  prizes: { quadra: 20, quina: 20, keno: 150 }
};

// --- Game Engine State ---
const STATE_WAITING = 'WAITING'; // Predraw
const STATE_PLAYING = 'PLAYING'; // Sorteio
const STATE_FINISHED = 'FINISHED'; // Alguém bateu o bingo

let gameState = STATE_WAITING;
let predrawTime = RULES.predrawSeconds;
let drawInterval = null;
let drawnNumbers = [];
let availableNumbers = [];
let roundId = 108719;
let drawStartedAt = null;
let accumulated = 591.74;
let accumulatedDays = 37;
const donationPerCartela = RULES.donationPerCartela;
const prizes = { ...RULES.prizes };
let soldCartelasThisRound = 0;
let cartelaRegistry = new Set(); // guarantees uniqueness within the round

function getGameMeta() {
  return {
    roundId,
    donation: donationPerCartela,
    prizes: { ...prizes },
    accumulated,
    accumulatedDays,
    drawStartedAt,
    rules: {
      numberMax: RULES.numberMax,
      minCartelasToStart: RULES.minCartelasToStart,
      maxCartelasPerRound: RULES.maxCartelasPerRound
    },
    soldCartelas: soldCartelasThisRound,
    remainingCartelas: Math.max(0, RULES.maxCartelasPerRound - soldCartelasThisRound)
  };
}

// { socketId: [ { id: 1, numbers: [1, 5, 23, ...] }, ... ] }
let playersCartelas = {};
let globalCartelaCounter = 1;

// Prize Flags (can only be won once per round)
let quadraWinner = null;
let quinaWinner = null;
let kenoWinner = null;

// --- Engine Loop ---
setInterval(() => {
  if (gameState === STATE_WAITING) {
    if (predrawTime > 0) {
      predrawTime--;
      io.emit('timer_tick', predrawTime);
    } else {
      startRound();
    }
  }
}, 1000);

function startRound() {
  gameState = STATE_PLAYING;
  drawnNumbers = [];
  availableNumbers = Array.from({ length: RULES.numberMax }, (_, i) => i + 1);
  availableNumbers.sort(() => Math.random() - 0.5); // Shuffle
  drawStartedAt = Date.now();
  
  quadraWinner = null;
  quinaWinner = null;
  kenoWinner = null;

  io.emit('state_change', { state: gameState, meta: getGameMeta() });
  
  // Draw balls every 3 seconds
  drawInterval = setInterval(() => {
    drawNextBall();
  }, RULES.drawEveryMs);
}

function drawNextBall() {
  if (gameState !== STATE_PLAYING) {
    clearInterval(drawInterval);
    return;
  }

  // No more balls and nobody hit Keno => finish the round and restart.
  if (availableNumbers.length === 0) {
    endRound({ reason: 'NO_WINNER' });
    return;
  }

  const newNum = availableNumbers.pop();
  drawnNumbers.push(newNum);
  
  io.emit('new_ball', { number: newNum, drawnCount: drawnNumbers.length });

  checkWinners();
}

function checkWinners() {
  // Verifies all sold cartelas
  for (const [socketId, cartelas] of Object.entries(playersCartelas)) {
    for (const cartela of cartelas) {
      // How many hits in this cartela?
      let hits = 0;
      for (const num of cartela.numbers) {
        if (drawnNumbers.includes(num)) hits++;
      }

      // Check Quadra (4 hits)
      if (hits === 4 && !quadraWinner) {
        quadraWinner = { socketId, cartelaId: cartela.id };
        io.emit('winner', { type: 'QUADRA', cartelaId: cartela.id });
      }

      // Check Quina (5 hits)
      if (hits === 5 && !quinaWinner) {
        quinaWinner = { socketId, cartelaId: cartela.id };
        io.emit('winner', { type: 'QUINA', cartelaId: cartela.id });
      }

      // Check Keno (15 hits - full cartela)
      if (hits === 15 && !kenoWinner) {
        kenoWinner = { socketId, cartelaId: cartela.id };
        io.emit('winner', { type: 'KENO', cartelaId: cartela.id });
        endRound();
        return; // Round over, stop checking
      }
    }
  }
}

function endRound({ reason = 'KENO_WIN' } = {}) {
  gameState = STATE_FINISHED;
  clearInterval(drawInterval);
  io.emit('state_change', { state: gameState, meta: getGameMeta(), reason });
  io.emit('round_summary', {
    roundId,
    reason,
    totalBallsDrawn: drawnNumbers.length,
    winners: {
      quadra: quadraWinner,
      quina: quinaWinner,
      keno: kenoWinner
    }
  });

  // Reset to WAITING after 10 seconds
  setTimeout(() => {
    resetEngine();
  }, 10000);
}

function resetEngine() {
  gameState = STATE_WAITING;
  predrawTime = RULES.predrawSeconds;
  drawStartedAt = null;
  roundId += 1;
  drawnNumbers = [];
  availableNumbers = [];
  playersCartelas = {}; // Clear cartelas for new round
  globalCartelaCounter = 1;
  soldCartelasThisRound = 0;
  cartelaRegistry = new Set();
  io.emit('state_change', { state: gameState, meta: getGameMeta() });
}

function createUniqueCartelaNumbers() {
  // Generate a unique 15-number cartela (unique within the round).
  // Note: as maxCartelasPerRound approaches combinations, generation becomes harder.
  for (let attempt = 0; attempt < 2000; attempt++) {
    const nums = new Set();
    while (nums.size < 15) {
      nums.add(Math.floor(Math.random() * RULES.numberMax) + 1);
    }
    const arr = Array.from(nums).sort((a, b) => a - b);
    const sig = arr.join('-');
    if (!cartelaRegistry.has(sig)) {
      cartelaRegistry.add(sig);
      return arr;
    }
  }
  return null;
}

// --- Socket.io Events ---
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);
  
  // Send current state to new connection
  socket.emit('sync_state', {
    state: gameState,
    predrawTime,
    drawnNumbers,
    cartelas: playersCartelas[socket.id] || [],
    meta: getGameMeta()
  });

  // Handle Buy Cartelas
  socket.on('buy_cartelas', (qty) => {
    if (gameState !== STATE_WAITING) {
      socket.emit('game_error', 'Rodada já iniciada. Aguarde a próxima.');
      return;
    }

    const requested = Number(qty);
    if (!Number.isFinite(requested) || requested < 1) {
      socket.emit('game_error', 'Quantidade inválida.');
      return;
    }

    if (soldCartelasThisRound + requested > RULES.maxCartelasPerRound) {
      socket.emit('game_error', 'Limite de cartelas da rodada atingido.');
      return;
    }

    if (!playersCartelas[socket.id]) {
      playersCartelas[socket.id] = [];
    }

    const newCartelas = [];
    for (let i = 0; i < requested; i++) {
      const numbers = createUniqueCartelaNumbers();
      if (!numbers) {
        socket.emit('game_error', 'Não foi possível gerar cartelas únicas. Tente menos quantidade.');
        break;
      }
      const cartela = {
        id: globalCartelaCounter++,
        numbers
      };
      newCartelas.push(cartela);
      playersCartelas[socket.id].push(cartela);
    }

    if (!newCartelas.length) return;

    soldCartelasThisRound += newCartelas.length;
    const spent = newCartelas.length * donationPerCartela;
    accumulated = Math.round((accumulated + spent * 0.12) * 100) / 100;
    io.emit('game_meta', getGameMeta());
    socket.emit('cartelas_bought', playersCartelas[socket.id]);
  });

  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    // Optional: Keep cartelas even if disconnected to allow reconnection logic later
  });
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// SPA fallback (Express v5-compatible): serve index.html for any non-file route.
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});
