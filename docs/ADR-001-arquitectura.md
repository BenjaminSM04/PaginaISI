# ADR-001: Arquitectura del Portal Académico Gamificado de ISI

**Status:** Propuesto
**Fecha:** 2026-07-06
**Deciders:** Benjamin (equipo del proyecto), dirección de carrera ISI

## Contexto

La carrera de Ingeniería de Sistemas Informáticos necesita un portal que no sea solo informativo: combina página institucional, sociedad científica, comunidades, vitrina de proyectos y artículos con aprobación docente, eventos con inscripción, foro Q&A tipo Stack Overflow y un sistema de gamificación (puntos e insignias) con rankings.

Restricciones dadas:

- Stack fijado: Next.js + React + TypeScript + Tailwind + shadcn/ui en frontend; NestJS + Prisma + PostgreSQL en backend; JWT; Swagger; Docker Compose. Prohibido .NET/C#/SQL Server.
- Debe ser presentable como proyecto universitario y luego evolucionar a producción, mantenido por estudiantes.
- Todo punto ganado debe ser auditable (transacciones, no solo contadores).
- Contenido pasa por flujo de aprobación: borrador → pendiente → aprobado/observado/rechazado → archivado.
- Storage local en desarrollo, con arquitectura lista para migrar a S3/Cloudinary/Supabase/MinIO.

El stack ya está decidido; este ADR fija las decisiones estructurales que el stack no dicta por sí solo.

## Decisión

Monorepo simple con dos aplicaciones desacopladas (`backend/` NestJS REST + `frontend/` Next.js App Router) comunicadas solo por HTTP/JSON documentado en Swagger; PostgreSQL como única fuente de datos; gamificación basada en un ledger de transacciones; aprobaciones como máquina de estados única + historial auditable; storage detrás de un patrón Strategy; theming dual (institucional + acento "cyber" delimitado).

## Opciones consideradas

### D1 — Estructura de repositorio

| Opción | Complejidad | Onboarding estudiantes | Docker | Escala |
|---|---|---|---|---|
| A. Repos separados | Media | Media | Simple | Buena |
| B. Monorepo con workspaces + Turborepo | Alta | Baja | Compleja (hoisting) | Excelente |
| C. **Monorepo simple (backend/ + frontend/ independientes)** | Baja | Alta | Simple (un Dockerfile por app) | Suficiente |

**Elegida: C.** Cada app tiene su propio `package.json` y Dockerfile; un solo repositorio facilita la entrega universitaria y el versionado conjunto. Turborepo se puede adoptar después sin reescribir nada.

### D2 — Contrato API y tipos compartidos

| Opción | Complejidad | Riesgo de divergencia |
|---|---|---|
| A. Paquete `shared/` de tipos | Media | Bajo, pero acopla builds |
| B. Codegen OpenAPI → cliente TS | Media-alta | Muy bajo |
| C. **Swagger como fuente de verdad + tipos espejo disciplinados en frontend** | Baja | Medio (mitigado con revisión) |

**Elegida: C** para el MVP; B queda como evolución natural (el Swagger ya existirá, solo se añade el generador).

### D3 — Autenticación y autorización

| Opción | Seguridad | Complejidad | Ajuste al requisito |
|---|---|---|---|
| A. Sesiones con cookies del lado servidor | Alta | Media | No cumple "JWT" |
| B. **JWT access (corto) + refresh con rotación** | Alta | Media | Cumple |
| C. Proveedor externo (Supabase Auth/Clerk) | Alta | Baja | Dependencia externa innecesaria |

**Elegida: B.** Access token Bearer de ~15 min manejado en memoria por el cliente; refresh token en cookie `httpOnly SameSite=Lax` con rotación. Passport + `RolesGuard` global con decorador `@Roles()`; relación User↔Role muchos-a-muchos (un usuario puede ser estudiante y líder de comunidad a la vez). Contraseñas con bcrypt.

### D4 — Gamificación

| Opción | Auditabilidad | Rendimiento de rankings | Flexibilidad |
|---|---|---|---|
| A. Contadores acumulados en Profile | Nula | Excelente | Baja |
| B. Solo ledger (calcular todo al vuelo) | Total | Pobre a escala | Alta |
| C. **Ledger `PointsTransaction` + agregados denormalizados en Profile actualizados en la misma transacción DB** | Total | Excelente | Alta |

**Elegida: C.** El ledger guarda: categoría (DEV/RESEARCH/COMMUNITY), motivo (enum de reglas), monto (± para penalizaciones), origen (`sourceType`+`sourceId`) y fecha. Consecuencias directas:

- Ranking general y por categoría: lectura de agregados (rápido).
- Ranking mensual/histórico: agregación sobre el ledger por rango de fechas (índice en `createdAt`).
- Límite diario de likes: conteo de transacciones del día antes de acreditar.
- Idempotencia: restricción única sobre (motivo, sourceType, sourceId, userId) evita acreditar dos veces el mismo hecho.
- Reglas de puntos en tabla `PointRule` editable desde el panel admin, con valores por defecto sembrados (proyecto aprobado +40, respuesta aceptada +30, etc.).

### D5 — Flujo de aprobación (proyectos, artículos)

| Opción | Trazabilidad | Reutilización |
|---|---|---|
| A. Campo `status` en cada entidad | Nula (sin historial) | Baja |
| B. **`status` en la entidad + `ApprovalRequest` como historial de ciclos de revisión** | Total | Alta (mismo mecanismo para Project y Article) |

**Elegida: B.** Estados unificados: `DRAFT → PENDING → APPROVED / OBSERVED / REJECTED → ARCHIVED`. `OBSERVED` devuelve al autor con comentarios y permite reenviar a `PENDING`. Cada decisión del docente/admin crea un registro (revisor, decisión, comentario, fecha). Los puntos e insignias se otorgan al pasar a `APPROVED`, vía el ledger idempotente de D4. `ApprovalRequest` usa `targetType` + `targetId` (validado en servicio, no por FK polimórfica) — trade-off aceptado: Prisma no soporta FKs polimórficas y separar tablas duplicaría lógica.

### D6 — Votos, likes y anti-abuso

Voto único por usuario y objetivo: `Vote(userId, targetType[QUESTION|ANSWER], targetId, value ±1)` con restricción única compuesta; cambiar de voto actualiza el registro. `Like(userId, targetType[PROJECT|ARTICLE|COMMENT], targetId)` con la misma técnica. Self-like/self-vote bloqueado en la capa de servicio comparando contra el autor. Reportes con estados (pendiente/válido/descartado); reporte válido acredita puntos al reportante y penaliza spam. Sanitización de HTML/Markdown en el backend antes de persistir.

### D7 — Almacenamiento de archivos

| Opción | Dev | Producción | Migración |
|---|---|---|---|
| A. Solo disco local | Trivial | Inviable | Reescritura |
| B. Solo cloud desde el día 1 | Fricción | Buena | — |
| C. **Patrón Strategy: `STORAGE_DRIVER=local\|s3`** | Trivial | Buena | Cambiar una variable |

**Elegida: C.** Interfaz `StorageService` con dos drivers: local (escribe en `uploads/` y Nest lo sirve estático) y S3-compatible con AWS SDK v3 (cubre S3, MinIO, Supabase Storage y Cloudflare R2; Cloudinary requeriría un tercer driver con su SDK — la interfaz lo permite). `MediaAsset` registra provider, key, URL, mime, tamaño y dueño, de modo que migrar de proveedor no rompe referencias.

### D8 — Estrategia de renderizado del frontend

| Opción | SEO | Interactividad | Complejidad |
|---|---|---|---|
| A. SPA pura | Pobre | Alta | Baja |
| B. SSR total | Buena | Media | Alta |
| C. **Híbrido: públicas con SSR/ISR, autenticadas client-side con TanStack Query** | Buena | Alta | Media |

**Elegida: C.** Home, noticias, proyectos, artículos, eventos y perfiles públicos se renderizan en servidor con revalidación (importante para visibilidad institucional). Foro, formularios, panel admin y todo lo autenticado usa client components + TanStack Query (caché, reintentos, invalidación tras mutaciones).

### D9 — Theming dual

Tokens de shadcn/ui (variables CSS) + `next-themes` para claro/oscuro. La estética institucional es la base global; la sociedad científica y comunidades técnicas usan una clase de ámbito (`theme-sci`) que redefine primario/acento hacia la paleta cyber sin duplicar componentes. Los colores exactos se calibran contra los mockups (tarea pendiente de análisis).

### D10 — Despliegue

`docker-compose.yml` con tres servicios: `db` (postgres:16-alpine, volumen persistente, healthcheck), `api` (build multi-stage node:20-alpine; ejecuta `prisma migrate deploy` y seed opcional al arrancar) y `web` (Next.js `output: standalone`). Variables de entorno separadas por servicio con `.env.example` versionados.

## Análisis de trade-offs

Lo que se compra con estas decisiones es auditabilidad (ledger + historial de aprobaciones), reversibilidad (storage y contrato API intercambiables) y simplicidad operativa (dos apps, un compose), a cambio de dos costos conscientes: duplicación disciplinada de tipos entre back y front (D2, reversible con codegen) y validación en capa de servicio donde la DB no puede garantizar integridad (referencias polimórficas de D5/D6). Ambos costos son bajos para un equipo estudiantil y no bloquean la evolución a producción.

## Consecuencias

- Más fácil: auditar puntos y decisiones docentes; migrar storage; presentar el proyecto (un repo, un `docker compose up`); añadir módulos NestJS de fase 2 (notificaciones, reportes exportables).
- Más difícil: mantener tipos sincronizados a mano hasta adoptar codegen; los agregados denormalizados exigen que toda escritura de puntos pase por un único servicio (regla de código, no de DB).
- A revisitar: cache (Redis) para rankings si el tráfico crece; Turborepo/workspaces cuando haya paquetes compartidos; WebSockets para notificaciones en fase 2; rate limiting fino por endpoint.

## Action items

1. [ ] Analizar mockups y fijar paleta/tokens definitivos.
2. [ ] Estructura del repo + Docker Compose + `.env.example`.
3. [ ] Schema Prisma (25+ entidades) + migración inicial + seed demo.
4. [ ] Backend: auth/RBAC → módulos de contenido → foro → gamificación (con Swagger).
5. [ ] Frontend: base y theming → páginas públicas → foro/ranking/perfil → panel admin.
6. [ ] README, checklist de endpoints y verificación cruzada de configuración.
