ALTER TABLE "dispositivo"
ADD COLUMN "mqtt_password_hash" VARCHAR(64);

CREATE UNIQUE INDEX "dispositivo_mqtt_password_hash_key"
ON "dispositivo"("mqtt_password_hash");

ALTER TABLE "usuario_dispositivo"
ADD COLUMN "mqtt_control_revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "mqtt_secuencia" (
    "id_dispositivo" INTEGER NOT NULL,
    "secuencia" BIGINT NOT NULL,
    "recibido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mqtt_secuencia_pkey" PRIMARY KEY ("id_dispositivo", "secuencia")
);

ALTER TABLE "mqtt_secuencia"
ADD CONSTRAINT "fk_mqtt_secuencia_dispositivo"
FOREIGN KEY ("id_dispositivo") REFERENCES "dispositivo"("id_dispositivo")
ON DELETE NO ACTION ON UPDATE NO ACTION;
