# 🗄️ Guía Completa: Prisma 7 + NestJS + MySQL

---

## 📋 Requisitos Previos

- Node.js v20.19 o superior (Prisma 7 lo requiere)
- NestJS CLI instalado
- Docker Desktop (para levantar MySQL local)
- Un proyecto NestJS ya inicializado

---

## 📦 PASO 1 — Instalación de dependencias

```bash
# CLI de Prisma (como devDependency)
npm install --save-dev prisma

# Cliente de Prisma + dotenv para variables de entorno
npm install @prisma/client dotenv

# Módulo de config de NestJS
npm i --save @nestjs/config

# Adaptador para MySQL/MariaDB
# ⚠️ En Prisma 7 ya no hay driver interno — hay que instalar el adapter explícitamente
npm install @prisma/adapter-mariadb

# Para ejecutar el seeder en TypeScript
npm install --save-dev tsx
```

> **¿Por qué `@prisma/adapter-mariadb` para MySQL?**
> Prisma 7 eliminó el engine en Rust y ahora depende de adapters externos por base de datos.
> `@prisma/adapter-mariadb` es el adapter oficial compatible con MySQL 8.x.

---

## 🐳 PASO 2 — Levantar MySQL con Docker

Crea un archivo `docker-compose.yml` en la raíz del proyecto:

```yaml
version: '3.9'

services:
  prismaconfigdb:
    image: mysql:8.0
    container_name: prismaconfig-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: prismaconfigdb
    ports:
      - '3306:3306'
    volumes:
      - ./mysql_data:/var/lib/mysql
```

Levanta el contenedor:

```bash
docker-compose up -d
```

---

## 🚀 PASO 3 — Inicializar Prisma

```bash
npx prisma init
```

Esto genera automáticamente:

- `prisma/schema.prisma` — donde defines tus modelos
- `.env` — variables de entorno
- `prisma.config.ts` — **nuevo en Prisma 7**, configuración centralizada

---

## ⚙️ PASO 4 — Configurar variables de entorno

El `npx prisma init` genera un `.env` con un ejemplo para PostgreSQL. Cámbialo a variables separadas para MySQL:

```env
# .env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=prismaconfigdb
```

> **¿Por qué variables separadas y no `DATABASE_URL`?**
> El adapter `PrismaMariaDb` recibe un objeto de configuración, no un connection string.
> Puedes parsear `DATABASE_URL` manualmente si lo prefieres, pero variables separadas
> son más limpias y funcionan igual en Railway.

---

## ⚙️ PASO 5 — Configurar `prisma.config.ts`

> **Este archivo es lo más nuevo y confuso de Prisma 7.**
> Antes el `DATABASE_URL` vivía directo en `schema.prisma`. Ahora Prisma separó responsabilidades:
> el schema solo tiene modelos, y `prisma.config.ts` maneja la conexión y configuración del CLI.

```ts
// prisma.config.ts (raíz del proyecto)
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
```

---

## 📄 PASO 6 — Configurar `schema.prisma`

```prisma
// prisma/schema.prisma
generator client {
  provider     = "prisma-client"
  output   = "../generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "mysql"
  // ⚠️ NO pongas url aquí — eso ahora va en prisma.config.ts
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

> **Puntos críticos:**
>
> - `provider = "prisma-client"` — ya NO es `prisma-client-js`
> - `output` es **obligatorio** en Prisma 7 — el cliente se genera en tu `src/`, no en `node_modules`
> - `moduleFormat = "cjs"` — **indispensable para NestJS** que corre en CommonJS

---

## 🔄 PASO 7 — Crear migración inicial y generar cliente

```bash
# Crea la migración y la aplica a la DB
npx prisma migrate dev --name init

# Genera el cliente TypeScript en src/generated/prisma
npx prisma generate
```

> El orden importa: primero migra, luego genera el cliente.

---

## 🔌 PASO 8 — Crear `PrismaService` y `PrismaModule`

```ts
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaMariaDb({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 5,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```ts
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

> **¿Por qué `@Global()`?**
> Para no tener que importar `PrismaModule` en cada módulo — lo declaras una vez en `AppModule` y el `PrismaService` queda disponible en toda la app.

---

## ⚙️ PASO 9 — Configurar `main.ts`

```ts
// src/main.ts
// ⚠️ dotenv/config DEBE ir primero antes de cualquier otro import
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

> **Crítico:** Si `import 'dotenv/config'` no está en la primera línea, cuando NestJS
> empieza a cargar los módulos las variables aún no están disponibles y el adapter
> se instancia con `undefined`.

---

## ⚙️ PASO 10 — Registrar `PrismaModule` en `AppModule`

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
```

---

## 🌱 PASO 11 — Crear el Seeder

```
prisma/
  schema.prisma
  seed/
    seed.ts     ← aquí va el seeder
  migrations/
```

```ts
// prisma/seed/seed.ts
import { PrismaClient } from '../../src/generated/prisma/client';
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
```

> **¿Por qué `upsert` y no `create`?**
> Para que el seed sea idempotente — puedes correrlo múltiples veces sin duplicar datos ni fallar.

Correr el seed:

```bash
npx prisma db seed
```

---

## 🚂 PASO 12 — Deploy a Railway

### Variables de entorno en Railway

En el panel de Railway → tu servicio → **Variables**, agrega:

```
DB_HOST=tu-host.railway.app
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tupassword
DB_NAME=tunombredb
NODE_ENV=production
```

### Scripts en `package.json`

```json
{
  "scripts": {
    "build": "prisma generate && nest build",
    "start:prod": "prisma migrate deploy && node dist/main",
    "postinstall": "prisma generate"
  }
}
```

> - `postinstall` garantiza que el cliente se regenere en cada `npm install` en Railway
> - `prisma migrate deploy` aplica migraciones pendientes antes de arrancar
> - `prisma generate` en `build` asegura que el cliente esté fresco antes de compilar

---

## ❌ Errores comunes y soluciones

| Error                                                        | Causa                                                                          | Solución                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `exports is not defined in ES module scope`                  | Falta `moduleFormat = "cjs"` en el generator                                   | Agregar `moduleFormat = "cjs"` al schema y borrar `dist/` y `src/generated/` antes de regenerar |
| `prepareCacheLength of undefined`                            | Se está pasando `undefined` o un string directo al adapter en vez de un objeto | Pasar objeto de config `{ host, port, user, password, database }` al `PrismaMariaDb`            |
| `Access denied for user 'WINUSER'@... (using password: NO)`  | Las variables de entorno no se cargan antes de instanciar el adapter           | Mover `import 'dotenv/config'` a la **primera línea** de `main.ts`                              |
| `pool timeout after 10015ms`                                 | Variables de entorno vacías — el adapter no puede conectar                     | Verificar `.env` y que `dotenv/config` cargue antes que todo                                    |
| `Cannot find module './seed.ts'`                             | `ts-node` no resuelve rutas relativas correctamente en Windows                 | Usar `tsx` en lugar de `ts-node` en `prisma.config.ts`                                          |
| `"tsx" no se reconoce como comando`                          | `tsx` no está instalado                                                        | `npm install --save-dev tsx`                                                                    |
| `Cannot find name 'process'` en `prisma.config.ts`           | Faltan tipos de Node                                                           | `npm i --save-dev @types/node` y agregar `"node"` a `types` en `tsconfig.json`                  |
| `Cannot find module '../generated/prisma/client'` en Railway | `prisma generate` no corrió en el deploy                                       | Agregar `"postinstall": "prisma generate"` al `package.json`                                    |
| `PrismaConfigEnvError: Missing DATABASE_URL`                 | Prisma CLI no encuentra la URL                                                 | Asegurarse de que `prisma.config.ts` construya la URL desde las variables separadas             |
| `Using engine type "client" requires adapter`                | Usas el provider viejo `prisma-client-js`                                      | Cambiar a `provider = "prisma-client"` en el schema                                             |

---

## ❌ ERROR 1 — `Cannot find name 'process'` en `prisma.config.ts`

```
Cannot find name 'process'. Do you need to install type definitions for node?
Try `npm i --save-dev @types/node`
```

**Causa:** Faltan los tipos de Node.js en el proyecto.

**Solución:**

```bash
npm install --save-dev @types/node
```

Luego agrega `"node"` al campo `types` de tu `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

---

## 🗂️ Estructura final del proyecto

```
├── prisma/
│   ├── generated/           ← generado por `prisma generate` (output aquí se ve más limpio)
│   │   └── prisma/
│   │       └── client.ts
│   ├── migrations/
│   │   └── 20260421060253_init/
│   │       ├── migration.sql
│   │       └── migration_lock.toml
│   ├── seed/
│   │   └── seed.ts
│   └── schema.prisma
├── src/
│   ├── prisma/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── app.module.ts
│   └── main.ts
├── prisma.config.ts
├── docker-compose.yml
├── .env
├── .env.template
└── package.json
```

> **Nota:** El `generated` se colocó dentro de `prisma/` en lugar de `src/` — estéticamente más limpio y mantiene todo lo relacionado a Prisma junto. Solo asegúrate de ajustar los imports en `prisma.service.ts` y `seed.ts` apuntando a `../generated/prisma/client` y `../../generated/prisma/client` respectivamente.

---

## 🔄 Resumen de comandos del flujo completo

```bash
# Instalación
npm install --save-dev prisma tsx @types/node
npm install @prisma/client dotenv @prisma/adapter-mariadb @nestjs/config

# Inicializar
npx prisma init

# Levantar DB local
docker-compose up -d

# Primera migración
npx prisma migrate dev --name init

# Generar cliente
npx prisma generate

# Correr seed
npx prisma db seed

# Desarrollo
npm run start:dev

# Ver datos en UI
npx prisma studio
```

---

> **Fuentes:** Documentación oficial Prisma 7 (prisma.io), GitHub releases prisma/prisma, blog oficial Prisma, experiencia real de configuración en Windows + NestJS + MySQL + Railway.
