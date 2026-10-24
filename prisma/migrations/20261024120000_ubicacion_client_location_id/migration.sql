ALTER TABLE "ubicacion"
ADD COLUMN "client_location_id" VARCHAR(40);

CREATE UNIQUE INDEX "uq_ubicacion_asignacion_client_id"
ON "ubicacion" ("id_usuario_dispositivo", "client_location_id");
