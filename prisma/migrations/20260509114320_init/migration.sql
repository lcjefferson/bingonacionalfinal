-- CreateEnum
CREATE TYPE "GameState" AS ENUM ('WAITING', 'PLAYING', 'FINISHED');

-- CreateEnum
CREATE TYPE "RoundEndReason" AS ENUM ('KENO_WIN', 'NO_WINNER');

-- CreateEnum
CREATE TYPE "WinnerType" AS ENUM ('QUADRA', 'QUINA', 'KENO');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('DEPOSIT_FAKE', 'WITHDRAW_REQUEST_FAKE', 'BUY_CARTELAS', 'PAYOUT', 'ADJUST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "balanceTotal" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "balanceBonusKeno" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "balanceWithdrawable" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "GameState" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "reason" "RoundEndReason",
    "rulesSnapshot" JSONB NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawnBall" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawnBall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cartela" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "numbers" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cartela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Winner" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cartelaId" TEXT NOT NULL,
    "type" "WinnerType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Winner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Round_roundNumber_key" ON "Round"("roundNumber");

-- CreateIndex
CREATE INDEX "DrawnBall_roundId_idx" ON "DrawnBall"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawnBall_roundId_order_key" ON "DrawnBall"("roundId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DrawnBall_roundId_number_key" ON "DrawnBall"("roundId", "number");

-- CreateIndex
CREATE INDEX "Cartela_roundId_idx" ON "Cartela"("roundId");

-- CreateIndex
CREATE INDEX "Cartela_userId_idx" ON "Cartela"("userId");

-- CreateIndex
CREATE INDEX "Winner_roundId_idx" ON "Winner"("roundId");

-- CreateIndex
CREATE INDEX "Winner_userId_idx" ON "Winner"("userId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawnBall" ADD CONSTRAINT "DrawnBall_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cartela" ADD CONSTRAINT "Cartela_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cartela" ADD CONSTRAINT "Cartela_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_cartelaId_fkey" FOREIGN KEY ("cartelaId") REFERENCES "Cartela"("id") ON DELETE CASCADE ON UPDATE CASCADE;
