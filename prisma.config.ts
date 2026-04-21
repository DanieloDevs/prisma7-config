import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/seed.ts',
  },
  datasource: {
    url: `mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT ?? 3306}/${DB_NAME}`,
  },
});

// Lo que mas confunde en prisma es que el url ya no esta directo en el schema de prisma
