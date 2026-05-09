-- Add numeric serial for display (frontend expects numeric cartelaId).
ALTER TABLE "Cartela" ADD COLUMN "serial" SERIAL;
CREATE UNIQUE INDEX "Cartela_serial_key" ON "Cartela"("serial");

-- Store cartela serial on Winner for easy event emission.
ALTER TABLE "Winner" ADD COLUMN "cartelaSerial" INTEGER NOT NULL DEFAULT 0;

