-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolSistema" AS ENUM ('USUARIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoSimulationSession" AS ENUM ('ACTIVA', 'EXPIRADA', 'FINALIZADA');

-- CreateTable
CREATE TABLE "usuario" (
    "id_usuario" SERIAL NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(30),
    "password_hash" VARCHAR(255) NOT NULL,
    "rol" "RolSistema" NOT NULL DEFAULT 'USUARIO',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "usuario_contacto" (
    "id_usuario_contacto" SERIAL NOT NULL,
    "id_usuario_1" INTEGER NOT NULL,
    "id_usuario_2" INTEGER NOT NULL,
    "id_usuario_solicitante" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "usuario_1_comparte_ubicacion" BOOLEAN NOT NULL DEFAULT false,
    "usuario_2_comparte_ubicacion" BOOLEAN NOT NULL DEFAULT false,
    "fecha_solicitud" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_respuesta" TIMESTAMPTZ(6),
    "fecha_actualizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_contacto_pkey" PRIMARY KEY ("id_usuario_contacto")
);

-- CreateTable
CREATE TABLE "dispositivo" (
    "id_dispositivo" SERIAL NOT NULL,
    "codigo_dispositivo" VARCHAR(50) NOT NULL,
    "imei" VARCHAR(30),
    "modelo" VARCHAR(100),
    "numero_serie" VARCHAR(100),
    "estado" VARCHAR(30) NOT NULL DEFAULT 'FABRICADO',
    "token_hash" VARCHAR(64),
    "ultima_conexion" TIMESTAMPTZ(6),
    "fecha_fabricacion" TIMESTAMPTZ(6),
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivo_pkey" PRIMARY KEY ("id_dispositivo")
);

-- CreateTable
CREATE TABLE "usuario_dispositivo" (
    "id_usuario_dispositivo" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_dispositivo" INTEGER NOT NULL,
    "alias" VARCHAR(100),
    "ubicacion_activa" BOOLEAN NOT NULL DEFAULT false,
    "visibilidad_preferida" VARCHAR(20) NOT NULL DEFAULT 'SOLO_YO',
    "fecha_asignacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_desvinculacion" TIMESTAMPTZ(6),
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuario_dispositivo_pkey" PRIMARY KEY ("id_usuario_dispositivo")
);

-- CreateTable
CREATE TABLE "grupo" (
    "id_grupo" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(500),
    "id_creador" INTEGER NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupo_pkey" PRIMARY KEY ("id_grupo")
);

-- CreateTable
CREATE TABLE "grupo_usuario" (
    "id_grupo_usuario" SERIAL NOT NULL,
    "id_grupo" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "rol" VARCHAR(20) NOT NULL DEFAULT 'MIEMBRO',
    "fecha_ingreso" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grupo_usuario_pkey" PRIMARY KEY ("id_grupo_usuario")
);

-- CreateTable
CREATE TABLE "grupo_invitacion" (
    "id_invitacion" SERIAL NOT NULL,
    "id_grupo" INTEGER NOT NULL,
    "id_usuario_invitador" INTEGER NOT NULL,
    "id_usuario_invitado" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "fecha_invitacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_respuesta" TIMESTAMPTZ(6),

    CONSTRAINT "grupo_invitacion_pkey" PRIMARY KEY ("id_invitacion")
);

-- CreateTable
CREATE TABLE "ubicacion" (
    "id_ubicacion" BIGSERIAL NOT NULL,
    "id_usuario_dispositivo" INTEGER NOT NULL,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(10,6) NOT NULL,
    "altitud" DECIMAL(10,2),
    "precision_gps" DECIMAL(10,2),
    "velocidad" DECIMAL(10,2),
    "fecha_hora_dispositivo" TIMESTAMPTZ(6) NOT NULL,
    "fecha_hora_servidor" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fue_sincronizada_offline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ubicacion_pkey" PRIMARY KEY ("id_ubicacion")
);

-- CreateTable
CREATE TABLE "emergencia" (
    "id_emergencia" BIGSERIAL NOT NULL,
    "codigo_publico" VARCHAR(30) NOT NULL,
    "id_usuario_dispositivo" INTEGER NOT NULL,
    "id_simulation_session" INTEGER,
    "tipo" VARCHAR(50),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    "fecha_inicio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" TIMESTAMPTZ(6),
    "activada_desde" VARCHAR(20) NOT NULL,
    "descripcion" VARCHAR(500),

    CONSTRAINT "emergencia_pkey" PRIMARY KEY ("id_emergencia")
);

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

-- CreateTable
CREATE TABLE "notificacion" (
    "id_notificacion" BIGSERIAL NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "alcance" VARCHAR(20) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "mensaje" VARCHAR(1000),
    "tipo_referencia" VARCHAR(30),
    "id_referencia" BIGINT,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id_notificacion")
);

-- CreateTable
CREATE TABLE "notificacion_usuario" (
    "id_notificacion_usuario" BIGSERIAL NOT NULL,
    "id_notificacion" BIGINT NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha_lectura" TIMESTAMPTZ(6),

    CONSTRAINT "notificacion_usuario_pkey" PRIMARY KEY ("id_notificacion_usuario")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE INDEX "ix_usuario_contacto_usuario_1" ON "usuario_contacto"("id_usuario_1", "estado");

-- CreateIndex
CREATE INDEX "ix_usuario_contacto_usuario_2" ON "usuario_contacto"("id_usuario_2", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuario_contacto" ON "usuario_contacto"("id_usuario_1", "id_usuario_2");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_codigo_dispositivo_key" ON "dispositivo"("codigo_dispositivo");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_imei_key" ON "dispositivo"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_numero_serie_key" ON "dispositivo"("numero_serie");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_token_hash_key" ON "dispositivo"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "ux_dispositivo_asignacion_activa" ON "usuario_dispositivo"("id_dispositivo") WHERE (estado = true);

-- CreateIndex
CREATE UNIQUE INDEX "uq_grupo_usuario" ON "grupo_usuario"("id_grupo", "id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "ux_invitacion_pendiente" ON "grupo_invitacion"("id_grupo", "id_usuario_invitado") WHERE ((estado)::text = 'PENDIENTE'::text);

-- CreateIndex
CREATE INDEX "ix_ubicacion_asignacion_fecha" ON "ubicacion"("id_usuario_dispositivo", "fecha_hora_dispositivo" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "emergencia_codigo_publico_key" ON "emergencia"("codigo_publico");

-- CreateIndex
CREATE INDEX "ix_emergencia_estado" ON "emergencia"("estado");

-- CreateIndex
CREATE INDEX "ix_emergencia_simulation_session" ON "emergencia"("id_simulation_session");

-- CreateIndex
CREATE INDEX "ix_simulation_session_expire" ON "simulation_session"("estado", "expira_en");

-- CreateIndex
CREATE INDEX "ix_simulation_session_assignment_estado" ON "simulation_session"("id_usuario_dispositivo", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ux_simulation_session_activa" ON "simulation_session"("id_usuario_dispositivo") WHERE ("estado" = 'ACTIVA'::"EstadoSimulationSession");

-- CreateIndex
CREATE INDEX "ix_notificacion_usuario_usuario" ON "notificacion_usuario"("id_usuario", "leida");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notificacion_usuario" ON "notificacion_usuario"("id_notificacion", "id_usuario");

-- AddForeignKey
ALTER TABLE "usuario_contacto" ADD CONSTRAINT "fk_contacto_usuario_1" FOREIGN KEY ("id_usuario_1") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "usuario_contacto" ADD CONSTRAINT "fk_contacto_usuario_2" FOREIGN KEY ("id_usuario_2") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "usuario_contacto" ADD CONSTRAINT "fk_contacto_solicitante" FOREIGN KEY ("id_usuario_solicitante") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "usuario_dispositivo" ADD CONSTRAINT "fk_usuario_dispositivo_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "usuario_dispositivo" ADD CONSTRAINT "fk_usuario_dispositivo_dispositivo" FOREIGN KEY ("id_dispositivo") REFERENCES "dispositivo"("id_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "grupo" ADD CONSTRAINT "fk_grupo_creador" FOREIGN KEY ("id_creador") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "grupo_usuario" ADD CONSTRAINT "fk_grupo_usuario_grupo" FOREIGN KEY ("id_grupo") REFERENCES "grupo"("id_grupo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "grupo_usuario" ADD CONSTRAINT "fk_grupo_usuario_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "grupo_invitacion" ADD CONSTRAINT "fk_invitacion_grupo" FOREIGN KEY ("id_grupo") REFERENCES "grupo"("id_grupo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "grupo_invitacion" ADD CONSTRAINT "fk_invitacion_usuario_invitador" FOREIGN KEY ("id_usuario_invitador") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "grupo_invitacion" ADD CONSTRAINT "fk_invitacion_usuario_invitado" FOREIGN KEY ("id_usuario_invitado") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ubicacion" ADD CONSTRAINT "fk_ubicacion_usuario_dispositivo" FOREIGN KEY ("id_usuario_dispositivo") REFERENCES "usuario_dispositivo"("id_usuario_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "emergencia" ADD CONSTRAINT "fk_emergencia_usuario_dispositivo" FOREIGN KEY ("id_usuario_dispositivo") REFERENCES "usuario_dispositivo"("id_usuario_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "emergencia" ADD CONSTRAINT "fk_emergencia_simulation_session" FOREIGN KEY ("id_simulation_session") REFERENCES "simulation_session"("id_simulation_session") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "simulation_session" ADD CONSTRAINT "fk_simulation_session_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "simulation_session" ADD CONSTRAINT "fk_simulation_session_usuario_dispositivo" FOREIGN KEY ("id_usuario_dispositivo") REFERENCES "usuario_dispositivo"("id_usuario_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notificacion_usuario" ADD CONSTRAINT "fk_notificacion_usuario_notificacion" FOREIGN KEY ("id_notificacion") REFERENCES "notificacion"("id_notificacion") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notificacion_usuario" ADD CONSTRAINT "fk_notificacion_usuario_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

