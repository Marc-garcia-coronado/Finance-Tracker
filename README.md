# Finanzas personales (PWA)

App web instalable de finanzas personales para un único usuario. Sustituye un
Excel con páginas Dashboard, Config, Movimientos, Mensual, Recurrentes,
Objetivos y Patrimonio.

El modelo de datos es **partida doble**: cada movimiento tiene ≥2 líneas que
suman 0. El dinero se guarda **siempre en céntimos (enteros)**. El patrimonio se
**deriva** de los movimientos, nunca se introduce a mano.

## Stack

- **Vite + React + TypeScript** (estricto)
- **Supabase** (Postgres + Auth + RLS) como único backend — sin servidor propio
- **Tailwind CSS**
- **@tanstack/react-query** (datos), **react-hook-form + zod** (formularios),
  **react-router-dom** (rutas)
- **vite-plugin-pwa** (instalable), **date-fns** (fechas), **recharts** (gráficos)

## Cómo arrancar

Requisitos: Node 18+ y un proyecto de Supabase.

1. **Instala dependencias**

   ```bash
   npm install
   ```

2. **Aplica el esquema** en Supabase: abre el **SQL Editor**, pega el contenido
   de [`schema.sql`](./schema.sql) y ejecútalo. Crea tablas, vistas, RPC, RLS y
   grants. Es idempotente (`if not exists` / `create or replace`).

3. **Configura las variables de entorno**: copia `.env.example` a `.env.local` y
   rellena con los valores de **Supabase → Project Settings → API**:

   ```bash
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-o-publishable-key
   ```

   > Solo la **anon / publishable key** va en el cliente. La **service_role /
   > secret key** NUNCA entra en el frontend ni en el repo.

4. **Arranca en local**

   ```bash
   npm run dev
   ```

   Regístrate con email + contraseña. En el primer acceso se siembran las
   cuentas y asignaciones por defecto (`seed_default_accounts`).

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck (`tsc -b`) + build de producción |
| `npm run preview` | Sirve el build localmente |
| `npm run typecheck` | Solo comprobación de tipos |
| `npm test` | Tests (Vitest) |
| `npm run gen:types` | Regenera `src/lib/database.types.ts` desde Supabase (necesita la CLI autenticada y `SUPABASE_PROJECT_ID`) |

## Reglas transversales (aplican a todo el código)

1. **Dinero = enteros en céntimos.** Conversión solo vía `src/lib/money.ts`
   (`centsToEuro`, `euroToCents`, `formatEuro`). Prohibido `parseFloat` sobre
   dinero o sumar euros como decimales.
2. **Los movimientos se crean SOLO con la RPC `create_entry`** y se anulan SOLO
   con `void_entry` (wrappers en `src/lib/entries.ts`). Nunca `insert`/`update`/
   `delete` directo sobre `entries` o `entry_lines` desde el cliente.
3. **Ledger append-only:** un movimiento pasado no se edita ni borra; se anula
   (crea su inverso) y se vuelve a crear.
4. **Solo la anon key** en el cliente. La service_role key jamás en el repo.
5. UI en español, con estados de carga / error / vacío y accesibilidad.
6. Tipado estricto contra los tipos generados de Supabase. Sin `any`.

## Despliegue gratuito del frontend

Es una SPA estática (`npm run build` → `dist/`). En cualquiera de las dos
opciones, define las variables de entorno **`VITE_SUPABASE_URL`** y
**`VITE_SUPABASE_ANON_KEY`** en el panel del proveedor.

### Vercel

- Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
- El rewrite de SPA ya está en [`vercel.json`](./vercel.json) (todas las rutas →
  `index.html`, necesario para el router del cliente).

### Cloudflare Pages

- Build command: `npm run build`. Output directory: `dist`.
- El rewrite de SPA ya está en [`public/_redirects`](./public/_redirects).

## PWA (instalar en el iPhone)

En Safari (iOS): abre la web → **Compartir** → **Añadir a pantalla de inicio**.
Se instala con icono propio y se abre en modo `standalone`. El shell se cachea
para abrir offline; los datos siguen requiriendo red.

## Notas importantes del free tier de Supabase

- **Pausa a los 7 días sin actividad.** Workaround: el workflow
  [`.github/workflows/keepalive.yml`](./.github/workflows/keepalive.yml) hace un
  ping cada 3 días. Añade en el repo los secrets **`SUPABASE_URL`** y
  **`SUPABASE_ANON_KEY`** (Settings → Secrets and variables → Actions).
- **No tiene backups.** Configura un export periódico: renombra
  [`.github/workflows/backup.yml.example`](./.github/workflows/backup.yml.example)
  a `backup.yml` y añade el secret **`SUPABASE_DB_URL`** (la connection string de
  Postgres). Hace un `pg_dump` semanal y lo guarda como artifact.

## Estructura

```
schema.sql                 Esquema de partida doble (aplicar en Supabase)
src/
  lib/                     supabase client, money, dates, entries, recurring,
                           metrics, queries (react-query), database.types
  components/              UI compartida (Button, Modal, Money, estados…)
  features/
    auth/                  login + AuthProvider + seed
    movimientos/ mensual/ dashboard/ config/ recurrentes/ objetivos/ patrimonio/
  routes/                  ProtectedRoute
```
