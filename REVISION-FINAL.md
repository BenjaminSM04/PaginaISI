# Revisión final para presentación y despliegue

Fecha: 12 de septiembre de 2026. Institución: Universidad Privada del Valle, Bolivia.

## Alcance y evidencia

Se revisaron los módulos, las fronteras de autorización, los flujos de autenticación y correo, la configuración Docker y las páginas públicas. La verificación combina lectura de código, pruebas automatizadas, una base PostgreSQL aislada y navegación en Chromium. No implica una certificación de seguridad ni una prueba exhaustiva de todas las combinaciones de datos y acciones administrativas.

| Área | Revisión realizada |
|---|---|
| Identidad, navegación y presentación | Paleta, logos, formularios y capturas en escritorio/móvil; encabezados principales accesibles. |
| Registro y perfiles | Dominio exacto `@univalle.edu`, normalización, enlace de activación, bloqueo de acciones y perfiles antes de verificar; campos de seguridad excluidos del perfil público. |
| Login, sesiones y 2FA | Primer cambio obligatorio, rotación, revocación, expiración, cifrado TOTP, recuperación y consumo concurrente de códigos. |
| Correo | Configuración SMTP/Gmail, TLS, autenticación real y pruebas de entrega con destinatarios aislados; mensajes en HTML/texto. |
| Noticias, proyectos y artículos | Catálogos y detalles públicos; contratos de revisión, publicación, versiones, edición colaborativa y permisos cubiertos por las pruebas del repositorio. |
| Comunidades, eventos y mentorías | Pantallas públicas, integridad de responsables, membresías, inscripciones, asistencia y restricciones de enlaces privados. |
| Foro y búsqueda | Listado y detalle, búsqueda, validación de tags, mejor respuesta y consistencia de puntos. |
| Ranking e insignias | Reglas existentes y corrección de filtros y clasificación mensual de estudiantes elegibles. |
| Incubadora, clientes y aplicaciones | Navegación pública y pruebas de estados, accesos y reglas de edición. |
| Reportes y administración | Resolución única de reportes, puntos dentro de la transacción y conservación del último administrador ante cambios concurrentes. |
| Notificaciones, auditoría y archivos | Pruebas de permisos, deduplicación, bitácora/rollback, validación de uploads, cuotas y referencias pendientes. |
| Infraestructura | Migraciones aplicadas, contenedores saludables, health con PostgreSQL, correo desde el contenedor y secretos excluidos de Git. |

## Correcciones de esta entrega

1. Registro institucional validado por el servidor y el formulario; pantalla obligatoria de verificación, reenvío y salida de sesión.
2. SMTP directo configurable con Gmail, validación de TLS/puertos/remitente, plantillas institucionales y diagnóstico sin exponer secretos.
3. Comparación íntegra de tokens de renovación mediante SHA-256. La migración cierra las sesiones antiguas sin modificar contraseñas.
4. Conflictos de registro simultáneo devuelven un error controlado. Los fallos al preparar o entregar correo quedan registrados sin contenido privado.
5. Ranking valida límites/categorías y excluye usuarios no elegibles antes de aplicar el límite mensual, con orden estable en empates.
6. Reportes inexistentes de usuarios se rechazan; una decisión y sus puntos se confirman juntos y no pueden sobrescribirse concurrentemente.
7. Los cambios de roles se serializan para conservar un administrador activo.
8. Formularios con etiquetas asociadas, placeholders profesionales y títulos principales correctos en siete catálogos.
9. Guía y generador de configuración de despliegue que conserva claves, configura HTTPS/CORS y desactiva demo/Swagger.
10. Integración del inicializador de producción agregado al repositorio backend: conserva reglas e insignias existentes y revoca sesiones, tokens y desafíos al solicitar un restablecimiento administrativo de contraseña. Publicación de imágenes y activación de Coolify manuales hasta completar la configuración definitiva.

## Validación

- Backend: 124 pruebas unitarias y de contratos aprobadas; typecheck y build correctos.
- Integración: 16 pruebas con PostgreSQL desechable aprobadas, incluyendo registro, correo, recuperación, replay, 2FA, ranking, concurrencia administrativa e inicialización de despliegue.
- Frontend: 8 pruebas aprobadas; typecheck, lint y build correctos. Persisten advertencias previas de tipado `any` y uso de imágenes, sin errores de lint.
- Chromium: 26 páginas públicas/detalles y 6 recorridos móviles; sin errores JavaScript, respuestas 500 ni desbordamiento horizontal en los recorridos comprobados. Se probó el rechazo de un correo externo y la pantalla de activación con una respuesta controlada para evitar crear cuentas o enviar mensajes reales.
- SMTP: Gmail aceptó TLS y autenticación tanto desde el equipo como desde el contenedor. La comprobación no envía mensajes; el flujo de correo completo se verificó con un receptor local aislado.

## Pendiente externo para publicar

Falta la URL pública HTTPS definitiva. El `.env` actual funciona localmente y contiene las credenciales privadas de correo. Cuando se confirme el dominio, ejecutar el generador explicado en [DESPLIEGUE.md](DESPLIEGUE.md), transferir la configuración por un canal privado y comprobar un correo real recibido en un buzón institucional.

Las cuentas previas conservan sus correos originales. La recuperación requiere que la dirección guardada sea un buzón real accesible. Antes de abrir el sitio al público, asignar las cuentas predefinidas a sus responsables y completar sus cambios de contraseña; el contenido de presentación existente no se elimina automáticamente.
