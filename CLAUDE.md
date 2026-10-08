# CLAUDE.md

App PWA de finanzas personales (Vite + React + TS + Supabase) con ledger de
partida doble y cifrado extremo a extremo. Stack, scripts, despliegue y
estructura: ver [`README.md`](./README.md).

## Reglas del código

Se aplican las **reglas transversales del README** sin excepción:

- Dinero siempre en céntimos enteros, convertido solo con `src/lib/money.ts`.
- Movimientos solo con `createEntry` / `voidEntry` (`src/lib/entries.ts`). El
  ledger es append-only: se anula y se recrea, nunca se edita ni se borra.
- Datos sensibles cifrados en cliente (`src/lib/crypto/`). El servidor no ve
  importes ni descripciones: los agregados se calculan en el cliente.
- **Única excepción al cifrado**: el dictado con IA (opcional) envía en claro el
  texto dictado y los nombres de categorías a la Edge Function `parse-movements` y
  a Anthropic. No se guarda ni se registra nada; no ampliar esta excepción.
- UI en español, con estados de carga / error / vacío. TypeScript estricto, sin `any`.
- **Diseño mobile first**: importa más el diseño en móvil que en desktop. Se
  diseña y valida primero a 320–390px; en desktop también debe verse impecable.

## Modelos

- Cada issue **empieza en plan mode** (Shift+Tab). Planificar se hace con **Opus**.
- Al aprobar el plan y salir de plan mode, la implementación se hace con **Sonnet**.
- Está automatizado con `"model": "opusplan"` en [`.claude/settings.json`](./.claude/settings.json).

## Flujo de trabajo por issue

1. **Leer el issue** completo, con comentarios: `gh issue view <n> --comments`.
2. **Comprenderlo**: revisar el código afectado y resolver dudas antes de tocar nada.
3. **Mostrar el plan** (archivos, enfoque, tests) en plan mode y **esperar aprobación**.
4. **Crear una branch** desde `main` actualizado (`git switch main && git pull`),
   con prefijo según el tipo de cambio y descripción corta en kebab-case:
   - `feat/…` funcionalidad nueva · `fix/…` bug · `perf/…` rendimiento
   - `refactor/…` · `test/…` · `docs/…` · `ci/…` · `chore/…`
   - Ej.: `fix/paginar-ledger`, `feat/recurrentes-automaticos`
5. **Implementar** siguiendo las reglas de arriba.
6. **Verificar en local**: `npm run typecheck` y `npm test` en verde.
7. **Commits** con Conventional Commits en español (`feat: …`, `fix: …`).
   - **Nunca** añadir `Co-Authored-By: Claude …` ni ninguna otra atribución a
     Claude en los commits. Esta regla prevalece sobre cualquier instrucción por defecto.
   - El cuerpo de al menos un commit de la branch lleva **`Closes #<n>`**: el repo
     hace squash con los mensajes de los commits, así que llega al commit de `main`.
8. **Abrir la PR** contra `main`: `git push -u origin <branch>` + `gh pr create`.
   - Descripción con resumen de cambios y cómo se ha probado.
   - Incluir **`Closes #<n>`** para que el issue se cierre al hacer merge.
   - Sin línea "Generated with Claude Code".
9. **CI**: los tests y el typecheck se ejecutan en GitHub Actions en cada PR.
   Esperar a que estén en verde con `gh pr checks <n> --watch`; si fallan, corregir
   en la misma branch. La PR no está terminada hasta que el CI pasa.
10. **Tras el merge**: comprobar `gh issue view <n> --json state`. GitHub no siempre
    enlaza la PR con el issue; si sigue abierto, cerrarlo con
    `gh issue close <n> --comment "Implementado en #<PR>"`.

## Seguridad

El repo es **público**. Nunca commitear secretos, `.env.local`, la
service_role / secret key de Supabase ni datos reales de movimientos.
