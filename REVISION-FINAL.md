# Revisión final para presentación y despliegue

Fecha: 12 de septiembre de 2026. Institución: Universidad Privada del Valle, Bolivia.

## Alcance y evidencia

Se revisaron los módulos, las fronteras de autorización, los flujos de autenticación y correo, la configuración Docker y las páginas públicas. La verificación combina lectura de código, pruebas automatizadas, una base PostgreSQL aislada y navegación en Chromium. No implica una certificación de seguridad ni una prueba exhaustiva de todas las combinaciones de datos y acciones administrativas.

| Área | Revisión realizada |
|---|---|
| Identidad, navegación y presentación | Paleta, logos, formularios y capturas en escritorio/móvil; encabezados principales accesibles. |
| Registro y perfiles | Dominio `univalle.edu` y subdominios institucionales, normalización, enlace de activación, bloqueo de acciones y perfiles antes de verificar; campos de seguridad excluidos del perfil público. |
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

Los commits quedaron publicados en el original y en B-PISI, F-PISI y D-PISI. Las comprobaciones de los tres primeros pasaron. El CI de D-PISI requiere configurar `SUBMODULES_TOKEN` para descargar el backend privado; falló durante checkout, antes de ejecutar pruebas. La versión conjunta se verificó localmente. Las instrucciones están en [DESPLIEGUE.md](DESPLIEGUE.md).

URL pública confirmada: https://www.isilp.com. Se comprobó respuesta HTTP 200 del portal, login y `/api/health`, con base de datos disponible; el dominio sin www redirige al dominio confirmado. Se preparó `.env.production` privado y se configuró `PUBLIC_WEB_URL` en F-PISI. Sigue pendiente incorporar la configuración al servidor conservando sus secretos actuales, desplegar la nueva versión y comprobar un correo real recibido en un buzón institucional. La revisión pública no envió correos ni modificó cuentas. Los formularios de login, registro y recuperación respondieron HTTP 200 y se renderizaron en Chromium. El registro publicado aún muestra ejemplos de nombre/usuario y la etiqueta genérica «Email»; las mejoras institucionales del código revisado todavía requieren actualizar la versión en producción.

Las cuentas previas conservan sus correos originales. La recuperación requiere que la dirección guardada sea un buzón real accesible. Antes de abrir el sitio al público, asignar las cuentas predefinidas a sus responsables y completar sus cambios de contraseña; el contenido de presentación existente no se elimina automáticamente.

## Corrección de registro, correo y perfil

Se aceptan el dominio institucional y subdominios válidos (estudiantes, posgrado y otros), manteniendo el rechazo de dominios falsos. Los usuarios pendientes reciben una explicación de activación; su perfil permanece oculto hasta verificar. La página pública consulta sin caché, reserva el estado inexistente para HTTP 404 y ofrece reintentar los errores temporales.

Validación de esta corrección: 125 pruebas de backend, 17 de integración con PostgreSQL desechable y 10 de frontend aprobadas; typecheck, lint y builds correctos, con advertencias de lint anteriores. Chromium comprobó el rechazo de un dominio falso, la aceptación de est.univalle.edu y la explicación de activación mediante respuestas controladas. Una segunda prueba de navegador con API aislada confirmó que Reintentar recupera un perfil tras HTTP 503 y que HTTP 404 muestra el estado inexistente. Los contenedores locales se reconstruyeron y quedaron saludables. Gmail aceptó TLS y autenticación desde el host y el contenedor actualizado; no se enviaron correos reales. La recepción institucional y la actualización de Coolify quedan a cargo del despliegue.
