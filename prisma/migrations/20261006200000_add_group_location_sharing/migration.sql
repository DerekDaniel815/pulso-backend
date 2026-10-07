-- Sharing normal por grupo concreto y exclusiones de miembro.
-- No hay backfill: visibilidad_preferida = 'GRUPO' deja de autorizar a todos
-- los grupos. El acceso nuevo existe solo cuando el propietario crea un grant.

CREATE TABLE "usuario_dispositivo_grupo" (
    "id_usuario_dispositivo_grupo" SERIAL NOT NULL,
    "id_usuario_dispositivo" INTEGER NOT NULL,
    "id_grupo" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_dispositivo_grupo_pkey" PRIMARY KEY ("id_usuario_dispositivo_grupo")
);

CREATE UNIQUE INDEX "uq_usuario_dispositivo_grupo" ON "usuario_dispositivo_grupo"("id_usuario_dispositivo", "id_grupo");

CREATE INDEX "ix_usuario_dispositivo_grupo_grupo_activo" ON "usuario_dispositivo_grupo"("id_grupo", "activo");

ALTER TABLE "usuario_dispositivo_grupo" ADD CONSTRAINT "fk_udg_usuario_dispositivo" FOREIGN KEY ("id_usuario_dispositivo") REFERENCES "usuario_dispositivo"("id_usuario_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "usuario_dispositivo_grupo" ADD CONSTRAINT "fk_udg_grupo" FOREIGN KEY ("id_grupo") REFERENCES "grupo"("id_grupo") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "usuario_dispositivo_grupo_exclusion" (
    "id_usuario_dispositivo_grupo_exclusion" SERIAL NOT NULL,
    "id_usuario_dispositivo" INTEGER NOT NULL,
    "id_grupo" INTEGER NOT NULL,
    "id_usuario_excluido" INTEGER NOT NULL,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_dispositivo_grupo_exclusion_pkey" PRIMARY KEY ("id_usuario_dispositivo_grupo_exclusion")
);

CREATE UNIQUE INDEX "uq_usuario_dispositivo_grupo_exclusion" ON "usuario_dispositivo_grupo_exclusion"("id_usuario_dispositivo", "id_grupo", "id_usuario_excluido");

CREATE INDEX "ix_udg_exclusion_usuario" ON "usuario_dispositivo_grupo_exclusion"("id_usuario_excluido");

CREATE INDEX "ix_udg_exclusion_asignacion_grupo" ON "usuario_dispositivo_grupo_exclusion"("id_usuario_dispositivo", "id_grupo");

ALTER TABLE "usuario_dispositivo_grupo_exclusion" ADD CONSTRAINT "fk_udg_exclusion_usuario_dispositivo" FOREIGN KEY ("id_usuario_dispositivo") REFERENCES "usuario_dispositivo"("id_usuario_dispositivo") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "usuario_dispositivo_grupo_exclusion" ADD CONSTRAINT "fk_udg_exclusion_grupo" FOREIGN KEY ("id_grupo") REFERENCES "grupo"("id_grupo") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "usuario_dispositivo_grupo_exclusion" ADD CONSTRAINT "fk_udg_exclusion_usuario" FOREIGN KEY ("id_usuario_excluido") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;
