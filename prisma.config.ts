import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Neon recomienda una conexión directa para migraciones. En local seguimos
    // usando DATABASE_URL, por lo que Docker no necesita ningún cambio.
    url: process.env.DIRECT_URL ?? env('DATABASE_URL'),
  },
});
