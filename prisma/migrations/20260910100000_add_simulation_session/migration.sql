-- CreateEnum
CREATE TYPE "EstadoSimulationSession" AS ENUM ('ACTIVA', 'EXPIRADA', 'FINALIZADA');

-- CreateTable
CREATE TABLE "simulation_session" (
    "id_simulation_session" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_usuario_dispositivo" INTEGER NOT NULL,
    "estado" "EstadoSimulationSession" NOT NULL DEFAULT 'ACTIVA',
    "ultima_actividad" TIMESTAMPTZ(6) NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "fecha_inicio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" TIMESTAMPTZ(6),
    "ubicacion_activa_previa" BOOLEAN NOT NULL,
    "habilito_ubicacion_activa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "simulation_session_pkey" PRIMARY KEY ("id_simulation_session")
);

-- AlterTable
ALTER TABLE "emergencia" ADD COLUMN "id_simulation_session" INTEGER;

-- CreateIndex
CREATE INDEX "ix_simulation_session_expire" ON "simulation_session"("estado", "expira_en");

-- CreateIndex
CREATE INDEX "ix_simulation_session_assignment_estado" ON "simulation_session"("id_usuario_dispositivo", "estado");

-- CreateIndex
CREATE INDEX "ix_emergencia_simulation_session" ON "emergencia"("id_simulation_session");

-- CreateIndex
CREATE UNIQUE INDEX "ux_simulation_session_activa" ON "simulation_session"("id_usuario_dispositivo") WHERE "estado" = 'ACTIVA'::"EstadoSimulationSession";

-- AddForeignKey
ALTER TABLE "simulation_session" ADD CONSTRAINT "fk_simulation_session_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "simulation_session" ADD CONSTRAINT "fk_simulation_session_usuario_dispositivo" FOREIGN KEY ("id_usuario_dispositivo") REFERENCES "usuario_dispositivo"("id_usuario_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "emergencia" ADD CONSTRAINT "fk_emergencia_simulation_session" FOREIGN KEY ("id_simulation_session") REFERENCES "simulation_session"("id_simulation_session") ON DELETE NO ACTION ON UPDATE NO ACTION;
