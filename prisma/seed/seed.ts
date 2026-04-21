import { PrismaClient } from '../../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding...');

  const usuarios = [
    { email: 'admin@example.com', name: 'Admin' },
    { email: 'brandon@example.com', name: 'Brandon' },
    { email: 'carlos@example.com', name: 'Carlos' },
    { email: 'maria@example.com', name: 'María' },
    { email: 'jorge@example.com', name: 'Jorge' },
  ];

  for (const usuario of usuarios) {
    await prisma.user.upsert({
      where: { email: usuario.email },
      update: {},
      create: usuario,
    });
  }

  console.log('✅ 5 usuarios creados');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
