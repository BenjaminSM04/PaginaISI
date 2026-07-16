# Estado y roadmap del Portal ISI

El estado funcional puede mostrarse siguiendo el [`guion de presentación final`](PRESENTACION-FINAL.md); este roadmap separa lo ya demostrable de los requisitos pendientes para operar públicamente.

## Estado actual

El portal ya compila y ejecuta como un sistema completo con Next.js, NestJS y PostgreSQL. La autenticación, roles, publicaciones, revisión docente, comunidades, eventos, mentorías, foro, reportes, gamificación, búsqueda, administración y storage local/S3 tienen API y pantallas funcionales.

La revisión de julio de 2026 dejó resueltos los riesgos de arranque destructivo, secretos por defecto, edición posterior a aprobación, logout expirado, refresh concurrente del navegador, uploads falsificados, exposición de reuniones, migraciones inexistentes, dependencias vulnerables y contenedores privilegiados. El stack fue validado desde una base vacía con un smoke test real.

La tanda de demostración añadió seed automático idempotente, ciclo completo de corrección/reenvío, visor PDF por switches segmentados, gamificación por switches y editor de SVG seguro, compresión WebP, galerías de eventos, Google Calendar, tags libres/búsqueda e imágenes en foro, noticias relacionadas y gestión completa de mentorías.

La fase 2 ya está implementada: notificaciones persistentes y configurables; recuperación/verificación/cambio de contraseña; sesiones rotatorias por dispositivo; CRUD protegido de comunidades; edición y asistencia de eventos; eliminación física de galerías; carga directa de PDF/portadas; cuota de almacenamiento y limpieza conservadora de huérfanos.

La gestión colaborativa de proyectos también está implementada: propietario, integrantes y ADMIN trabajan en un workspace con ficha, hitos/calendario, noticias e imágenes. Todas las mutaciones exigen versión, se auditan con correo y snapshots en una bitácora append-only y generan un outbox de avisos; ADMIN dispone de búsqueda global y rollback conflict-aware. El seed de presentación incluye 33 entradas y escenarios completos para seis proyectos.

## Antes de publicar en Internet

1. **Identidad institucional:** conectar el webhook ya preparado a un proveedor real de correo, evaluar MFA y, si existe, integrar SSO OIDC/SAML. Añadir bloqueo progresivo por cuenta si la política institucional lo requiere.
2. **Infraestructura:** dominio y TLS detrás de un proxy, PostgreSQL administrado, bucket S3/R2/Supabase, copias de seguridad automáticas y prueba documentada de restauración.
3. **Calidad:** pruebas E2E de los flujos críticos, CI para `check`/auditorías/Docker, revisión de migraciones y un entorno staging separado. Las 42 pruebas backend actuales son unitarias/de contrato; no sustituyen un navegador multiusuario.
4. **Observabilidad:** logs JSON con request ID, métricas, alertas, seguimiento de errores y una consola para reintentar/reconocer entregas de auditoría `FAILED`. La bitácora administrativa persistente ya existe.
5. **Privacidad:** política de privacidad, términos, retención/eliminación de datos, consentimiento para perfiles públicos y revisión de qué miembros aparecen en comunidades.
6. **Operación:** crear el primer administrador mediante un procedimiento seguro, rotar secretos, definir responsables de moderación y documentar rollback.

## Próximo bloque funcional (fase 3)

- Estadísticas históricas para docentes, comunidades, eventos y contenidos.
- Exportaciones de auditoría con filtros/fechas y panel operativo del outbox.
- Calendario iCal, recordatorios programados y correo transaccional en cola.
- Paginación/DTOs tipados en listados heredados y cliente TypeScript generado desde OpenAPI.
- Pruebas E2E en navegador para login, revisión, foro, eventos, uploads y recuperación.

## Escalabilidad y mantenimiento

- Índices de búsqueda PostgreSQL (`pg_trgm` o full text) y caché para rankings, home y búsquedas frecuentes.
- Jobs asíncronos para correo, thumbnails y notificaciones (la limpieza conservadora local al arranque ya existe).
- Reconciliación periódica de contadores derivados (likes, votos, respuestas y puntos).
- Migrar gradualmente el frontend a `strict: true`, eliminar los `any` restantes y convertir imágenes a `next/image` con una allowlist.
- Mejorar accesibilidad de labels, menús, diálogos, foco, navegación por teclado y anuncios de estado.

## Funciones de fase posterior

- Insignias automáticas configurables por condiciones compuestas.
- Estadísticas docentes y de comunidades.
- Calendario iCal y recordatorios.
- Recomendación de proyectos, mentorías y habilidades por tags.
- Integración institucional/SSO si la universidad dispone de proveedor OIDC/SAML.
- Moderación asistida, siempre con decisión humana y trazabilidad.
