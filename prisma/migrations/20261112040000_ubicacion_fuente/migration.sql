ALTER TABLE "ubicacion"
ADD COLUMN "fuente" VARCHAR(8) NOT NULL DEFAULT 'GNSS';

ALTER TABLE "ubicacion"
ADD CONSTRAINT "ubicacion_fuente_check" CHECK ("fuente" IN ('GNSS', 'CELL'));
