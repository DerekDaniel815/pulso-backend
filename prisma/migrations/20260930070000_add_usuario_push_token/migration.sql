-- CreateTable
CREATE TABLE "usuario_push_token" (
    "id_usuario_push_token" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "plataforma" VARCHAR(20) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_push_token_pkey" PRIMARY KEY ("id_usuario_push_token")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_push_token_token_key" ON "usuario_push_token"("token");

-- CreateIndex
CREATE INDEX "ix_usuario_push_token_usuario_activo" ON "usuario_push_token"("id_usuario", "activo");

-- AddForeignKey
ALTER TABLE "usuario_push_token" ADD CONSTRAINT "fk_usuario_push_token_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;
