# Preparación para producción del Portal ISI

Estado al 13 de julio de 2026: la plataforma está lista para validación con cliente y demostración local. El código compila, las migraciones se aplican, Docker queda saludable y los controles automatizados pasan. Publicarla en Internet requiere completar la operación institucional descrita aquí; no son páginas faltantes que deban simularse.

## Evidencia disponible hoy

- backend: typecheck, build y 42/42 pruebas exitosas;
- frontend: typecheck, lint sin errores, build de producción y 38 páginas generadas;
- dependencias de producción: 0 vulnerabilidades reportadas por `npm audit` en ambas aplicaciones;
- Docker: PostgreSQL, API y web saludables; 9 migraciones aplicadas;
- preflight: 23/23 comprobaciones de contenedores, contenido, páginas, login ADMIN, gestión colaborativa y auditoría;
- smoke multiusuario: colaborador autorizado edita y versiona, tercero recibe 404, ADMIN ve el correo del actor y ejecuta rollback, outbox termina en `SKIPPED` sin webhook;
- seed inicial: probado dos veces sobre PostgreSQL vacío; la segunda ejecución no borra ni duplica datos.

## Bloqueantes antes de abrir Internet

### 1. Identidad, correo y cuentas iniciales

- Desactivar `SEED_ON_FIRST_RUN` y eliminar todas las cuentas/credenciales demo.
- Definir un procedimiento de bootstrap para el primer ADMIN con identidad comprobada y contraseña de un solo uso.
- Conectar `AUTH_EMAIL_WEBHOOK_URL` a un proveedor transaccional y verificar entrega, rebotes y reputación del dominio.
- Conectar `SECURITY_ALERT_WEBHOOK_URL` a correo/automatización institucional; monitorizar estados `FAILED`.
- Decidir MFA para administradores y docentes. Preferir SSO OIDC/SAML si la universidad dispone de proveedor.
- Definir política de bloqueo/recuperación de cuenta y soporte de identidad.

### 2. Dominio, TLS y red

- Elegir dominio definitivo y emitir certificados TLS con renovación automática.
- Colocar web/API detrás de un proxy o plataforma administrada; exponer únicamente 443.
- Configurar `WEB_ORIGIN`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL` y `NEXT_PUBLIC_API_URL` con URLs HTTPS exactas.
- Ajustar `TRUST_PROXY_HOPS` al número real de proxies confiables; no usar un valor genérico.
- Mantener PostgreSQL y storage sin acceso público y limitar salida/entrada por red.
- Aplicar rate limiting también en el borde y documentar los límites esperados.

### 3. Datos, backups y continuidad

- Usar PostgreSQL administrado o una operación equivalente con cifrado, alta disponibilidad y actualizaciones.
- Crear backups automáticos y, si el proveedor lo permite, recuperación a un punto en el tiempo.
- Realizar y registrar al menos una restauración completa en staging; un backup no probado no cuenta como recuperable.
- Definir RPO/RTO, responsables, retención y procedimiento de desastre.
- Ejecutar migraciones primero en staging y conservar un plan de rollback compatible con cada release.
- Separar usuario de migración y usuario de runtime con privilegios mínimos.

### 4. Archivos y contenido

- Configurar y probar `STORAGE_DRIVER=s3` con bucket privado, cifrado, lifecycle y copias/replicación según política.
- Definir CDN o URL pública controlada y CORS del bucket; no entregar credenciales ni URLs firmadas en auditoría.
- Añadir análisis antimalware para PDFs/archivos si se aceptará contenido de usuarios externos.
- Definir retención y purga supervisada de imágenes archivadas y entregas huérfanas.
- Reemplazar portadas/PDF externos del seed por activos institucionales propios antes de una demo sin Internet o de cualquier publicación real.

### 5. Privacidad, gobierno y soporte

- Aprobar términos de uso, política de privacidad, consentimiento de perfiles públicos y política de cookies.
- Definir qué datos son obligatorios, quién puede verlos, por cuánto tiempo se conservan y cómo se atienden rectificación/eliminación.
- Nombrar responsables de administración, revisión docente, moderación, incidentes y solicitudes de usuarios.
- Definir política sobre propiedad intelectual de proyectos, artículos, fotos y material de comunidades.
- Revisar accesibilidad con usuarios y el estándar exigido por la institución.

## Calidad y operación recomendadas para el primer release

### CI/CD y staging

- Inicializar y proteger el repositorio Git; esta carpeta todavía no tiene historial Git.
- Ejecutar en cada cambio: backend `npm run check`, frontend `npm run check`, auditorías, build Docker y migración sobre PostgreSQL temporal.
- Añadir E2E de navegador para login/refresh/logout, recuperación, revisión, foro con fotos, evento, upload, gestión colaborativa y rollback.
- Usar un staging aislado, con secretos y datos distintos de producción.
- Exigir revisión de código, checks verdes y aprobación explícita de migraciones antes del despliegue.

### Observabilidad

- Emitir logs JSON con request ID/correlation ID y redacción de tokens, cookies y datos sensibles.
- Añadir métricas de latencia, errores, logins fallidos, uploads, conexiones DB, outbox pendiente/fallido y espacio de storage.
- Conectar seguimiento de excepciones y alertas con responsables/horarios definidos.
- Crear un panel para reintentar o reconocer entregas `ProjectAuditDelivery.FAILED`.
- Configurar probes externos y un runbook para caídas de web, API, DB, correo y storage.

### Seguridad adicional

- Realizar threat modeling y una revisión/pentest independiente antes de manejar datos reales.
- Rotar y almacenar secretos en el gestor de la plataforma; JWT access, JWT refresh, correo y alertas deben ser independientes.
- Probar restauración, revocación de sesiones, cambio de contraseña, rollback y respuesta ante abuso.
- Revisar CSP/headers con los dominios finales y eliminar orígenes que no se usen.
- Decidir si IP de auditoría debe seudonimizarse y formalizar quién puede consultar correos/snapshots.

## Mejoras no bloqueantes del dominio

- niveles de membresía de proyecto `EDITOR`/`VIEWER` y baja lógica;
- relación directa `Event.projectId` si el calendario de proyecto debe usar eventos generales además de hitos;
- estadísticas históricas y exportación de auditoría;
- iCal y recordatorios programados;
- full-text PostgreSQL/caché para búsquedas y rankings con volumen alto;
- cliente TypeScript generado desde OpenAPI y eliminación gradual de `any` heredados;
- optimización/allowlist de imágenes remotas y revisión de advertencias de rendimiento restantes.

## Secuencia de salida recomendada

1. Congelar alcance funcional del release.
2. Resolver decisiones institucionales: dominio, identidad, correo, privacidad, responsables, RPO/RTO.
3. Crear producción y staging administrados; configurar secretos, PostgreSQL, S3 y TLS.
4. Incorporar CI/E2E, observabilidad y backups con restauración comprobada.
5. Ensayar migraciones y carga con datos ficticios en staging.
6. Hacer revisión de seguridad y corregir hallazgos de severidad alta/crítica.
7. Crear ADMIN real, desactivar seed demo y ejecutar checklist de aceptación.
8. Lanzar primero a un grupo piloto, observar y recién después ampliar el acceso.

## Criterio de go-live

No publicar hasta que todos estos puntos estén evidenciados:

- [ ] no existen cuentas ni contraseñas demo;
- [ ] dominio/TLS/CORS/proxy están validados;
- [ ] correo de autenticación y alertas se entrega y monitoriza;
- [ ] PostgreSQL y S3 tienen backup, retención y restauración probada;
- [ ] staging y CI/E2E cubren los flujos críticos;
- [ ] logs, métricas, errores y alertas tienen responsable;
- [ ] privacidad, términos, moderación e incidentes están aprobados;
- [ ] migración y rollback del release fueron ensayados;
- [ ] revisión de seguridad no tiene hallazgos altos/críticos abiertos;
- [ ] piloto institucional aprobó accesibilidad y flujo operativo.

La guía de demostración sigue en [`GUIA-DEMO.md`](GUIA-DEMO.md) y la revisión específica de edición colaborativa en [`SEGURIDAD-GESTION-COLABORATIVA.md`](SEGURIDAD-GESTION-COLABORATIVA.md).
