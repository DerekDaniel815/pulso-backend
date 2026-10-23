-- Caducidad lógica del marcador y cierre de emergencia.
-- No borra filas de ubicacion ni emergencias.

ALTER TABLE "emergencia" ADD COLUMN "motivo_finalizacion" VARCHAR(20);
ALTER TABLE "emergencia" ADD COLUMN "finalizada_desde" VARCHAR(20);

CREATE INDEX "ix_ubicacion_asignacion_servidor" ON "ubicacion"("id_usuario_dispositivo", "fecha_hora_servidor" DESC);

CREATE INDEX "ix_emergencia_estado_inicio" ON "emergencia"("estado", "fecha_inicio");

CREATE UNIQUE INDEX "ux_emergencia_activa" ON "emergencia"("id_usuario_dispositivo") WHERE estado = 'ACTIVA';
