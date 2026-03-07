# ToolsPK con Bitácora en la nube

Esta versión corrige el problema de la bitácora que guardaba las gestiones por dispositivo.
Ahora las gestiones se guardan en el servidor mediante API y pueden compartirse entre celular, laptop y cualquier otro equipo.

## Qué cambió

- La bitácora ya no usa `localStorage` para el historial principal.
- El login de bitácora se valida en el servidor.
- Las gestiones se guardan en una base central.
- Si el servidor en la nube todavía no tiene gestiones, la bitácora puede migrar automáticamente las gestiones viejas que estaban guardadas solo en ese dispositivo.
- Si existe `DATABASE_URL`, usa PostgreSQL.
- Si no existe `DATABASE_URL`, usa un archivo JSON local solo para desarrollo.

## Variables de entorno recomendadas en Railway

- `BITACORA_USER`
- `BITACORA_PASS`
- `SESSION_SECRET`
- `DATABASE_URL`  ← esta la conectas al servicio PostgreSQL de Railway
- `ANTHROPIC_API_KEY` ← solo si también vas a usar el análisis con Claude

## Implementación en Railway

1. Sube este repositorio a GitHub.
2. En Railway crea un proyecto nuevo.
3. Conecta tu repositorio GitHub.
4. Agrega un servicio PostgreSQL.
5. En el servicio web agrega estas variables:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `BITACORA_USER=tu_usuario`
   - `BITACORA_PASS=tu_contraseña`
   - `SESSION_SECRET=una_clave_larga_y_aleatoria`
   - `ANTHROPIC_API_KEY=...` si la ocupas
6. Railway instalará dependencias y levantará `node server.js`.
7. La tabla de gestiones se crea sola al arrancar.

## Nota

La carpeta `data/` es solo un respaldo para desarrollo local si no configuras PostgreSQL.
Para que las gestiones sí se compartan entre dispositivos en producción, debes usar `DATABASE_URL` en Railway.
