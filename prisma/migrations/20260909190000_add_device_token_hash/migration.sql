-- AlterTable
ALTER TABLE "dispositivo" ADD COLUMN "token_hash" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_token_hash_key" ON "dispositivo"("token_hash");
