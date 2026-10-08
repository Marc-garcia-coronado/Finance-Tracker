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
   Después aplica, **en orden**, los ficheros de [`migrations/`](./migrations)
   (`001_e2ee.sql`, `002_replace_entry.sql`, …). Haz un backup antes de cada una.

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
7. **Excepción documentada: el dictado con IA** (opcional, desactivado por
   defecto). El texto dictado y los nombres de las categorías viajan **sin
   cifrar** a una Edge Function y a Anthropic mientras se interpretan. No se
   almacenan ni se registran; en la base de datos sigue sin haber nada que no
   esté cifrado. Ver [Dictado por voz con IA](#dictado-por-voz-con-ia).

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
- **No tiene backups.** Ver [Backups](#backups).

## Backups

El workflow [`.github/workflows/backup.yml`](./.github/workflows/backup.yml) hace
cada domingo un `pg_dump` del esquema `public`, lo comprime, lo **cifra con gpg
(AES256)** y lo guarda como artifact 30 días. Se cifra porque el repo es público
y los artifacts los puede descargar cualquier usuario de GitHub con sesión.

**Configuración** (Settings → Secrets and variables → Actions):

| Secret | Valor |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler** (la conexión directa es solo IPv6 y los runners de GitHub no la alcanzan) |
| `BACKUP_PASSPHRASE` | Contraseña larga para cifrar el dump. Guárdala en tu gestor de contraseñas: sin ella el backup no se puede restaurar |

**Lanzarlo a mano:** Actions → *Backup DB* → *Run workflow*. Hazlo siempre
**antes de aplicar una migración** (p. ej. `migrations/001_e2ee.sql`).

**Restaurar:**

```bash
# 1. Descarga el artifact db-backup desde la ejecución del workflow y descomprime el zip
gpg -d backup-AAAAMMDD-HHMMSS.sql.gz.gpg | gunzip > backup.sql
# 2. Aplícalo sobre una base de datos vacía (o un proyecto nuevo de Supabase)
psql "$SUPABASE_DB_URL" -f backup.sql
```

> Con el cifrado E2EE activo, los importes, descripciones y nombres del dump van
> cifrados con tu clave maestra: para leerlos en la app hace falta tu contraseña
> o el código de recuperación, además de `BACKUP_PASSPHRASE`.

## Dictado por voz con IA

Permite dictar uno o varios movimientos («ayer 12 euros en el súper y hoy 3,50 de
café») y revisarlos antes de guardarlos (editar / aprobar / eliminar cada uno).

- **Voz → texto:** Web Speech API del navegador (`es-ES`). Nuestro backend no
  recibe audio. Si el navegador no la soporta, se puede escribir la frase.
- **Texto → movimientos:** Edge Function
  [`supabase/functions/parse-movements`](./supabase/functions/parse-movements/index.ts),
  que llama a Claude Haiku 5.5 con salida estructurada. Recibe solo el texto y los
  **nombres** de las categorías (con claves opacas, nunca ids reales). Exige sesión
  y limita a 50 dictados por usuario y día (`ai_usage`, solo un contador).
- **Privacidad:** es la única excepción al cifrado de extremo a extremo (regla 7).
  La función no guarda ni registra el contenido. Cada movimiento se cifra y se
  guarda con `createEntry` solo cuando lo apruebas.
- **Activación:** Configuración → «Dictado con IA» (por dispositivo, apagado por
  defecto, con aviso la primera vez).

### Puesta en marcha

1. Aplica `migrations/005_ai_usage.sql` en el SQL Editor (haz backup antes).
2. Crea una API key en la consola de Anthropic y **pon un límite mensual de gasto**.
3. Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) enlazada al proyecto:

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy parse-movements
   ```

   La key vive solo en los secrets de Supabase; nunca en el repo ni en el cliente.
4. Coste: cada dictado son unos cientos de tokens de Haiku (fracciones de céntimo).
   Las Edge Functions entran en el plan gratuito de Supabase (con cuota mensual).

## Modo demo

Configuración → **Modo demo** muestra datos de ejemplo (cuentas, ~12 meses de
movimientos, objetivos, recurrentes) para enseñar la app sin que se vean los
tuyos. Un aviso fijo lo recuerda en todas las páginas, con botón **Salir**.

- Los datos se generan en el cliente (`src/lib/demo/`) y viven solo en memoria:
  **no se lee ni se escribe nada en Supabase** y no pasan por la caché offline.
- Se pueden crear, anular y editar movimientos de ejemplo; el resto de cambios
  (cuentas, objetivos, recurrentes, importar…) responde «No disponible en el modo demo».
- Dura solo la pestaña (`sessionStorage`) y se desactiva al cerrar sesión.
- Los hooks de `src/lib/queries.ts` pasan por dos wrappers (`useQuery` / `useMutation`)
  que desvían al almacén demo; los componentes no lo saben.

## Estructura

```
schema.sql                 Esquema de partida doble (aplicar en Supabase)
supabase/functions/        Edge Functions (parse-movements: dictado con IA)
src/
  lib/                     supabase client, money, dates, entries, recurring,
                           metrics, queries (react-query), database.types
  components/              UI compartida (Button, Modal, Money, estados…)
  features/
    auth/                  login + AuthProvider + seed
    movimientos/ mensual/ dashboard/ config/ recurrentes/ objetivos/ patrimonio/
  routes/                  ProtectedRoute
```
