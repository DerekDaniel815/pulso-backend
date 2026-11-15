ALTER TABLE "ubicacion" DROP CONSTRAINT "ubicacion_fuente_check";

ALTER TABLE "ubicacion"
ADD CONSTRAINT "ubicacion_fuente_check" CHECK ("fuente" IN ('GNSS', 'CELL', 'NETWORK'));
