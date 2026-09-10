-- CreateEnum
CREATE TYPE "RolSistema" AS ENUM ('USUARIO', 'ADMIN');

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "rol" "RolSistema" NOT NULL DEFAULT 'USUARIO';
