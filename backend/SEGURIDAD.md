# Autenticación para producción

Las cuentas y hashes existentes se conservan. La migración `20260909200000_password_policy_totp` marca las nueve cuentas predefinidas del seed con `mustChangePassword=true`. Los seeds siguen usando sus contraseñas originales y crean esas cuentas con la bandera activa. No ejecutes un reset del seed sobre una base con datos que deban conservarse.

El primer acceso muestra `/cambiar-contrasena`. La API consulta la bandera vigente en cada petición autenticada y responde `403 PASSWORD_CHANGE_REQUIRED` al resto del sistema, incluidos los administradores. Permite consultar la identidad, renovar/cerrar sesión y cambiar/restablecer contraseña. El cambio requiere la contraseña actual, una nueva diferente, al menos 12 caracteres y hasta 72 bytes UTF-8; rechaza patrones predecibles. Actualiza el hash, libera la bandera e invalida sesiones y desafíos anteriores en una transacción. El registro y la recuperación usan la misma política.

## Configuración obligatoria

El registro público acepta exclusivamente correos con dominio exacto `@univalle.edu`. La API y el formulario normalizan espacios externos y mayúsculas; rechazan dominios parecidos, subdominios y sufijos adicionales. La cuenta queda pendiente hasta confirmar el enlace enviado a su correo. No puede utilizar funciones protegidas ni aparecer en perfiles/directorios públicos antes de verificarse. Las cuentas existentes y sus contraseñas se conservan.

El módulo de correo admite SMTP directo y el webhook anterior como alternativa. SMTP tiene prioridad si está configurado. Gmail requiere `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD` (contraseña de aplicación) y `SMTP_FROM`. En 587, usar `SMTP_SECURE=false`: STARTTLS sigue siendo obligatorio. La conexión valida certificados TLS y no registra destinatarios, secretos ni enlaces. Los mensajes incluyen HTML y texto, con vencimiento de 30 minutos para recuperación y 24 horas para verificación. `AUTH_DEV_LINKS=false` habilita la entrega real y evita devolver enlaces al navegador.

Comprobar conectividad y autenticación sin enviar mensajes: `npm run mail:verify -- ../.env` desde backend, o `docker compose exec api npm run mail:verify` desde el despliegue. La aceptación SMTP no garantiza la llegada a la bandeja: también intervienen las políticas antispam del destinatario. Si falla una entrega, se registra un error sin datos privados y puede solicitarse otro enlace tras un minuto.

La migración `20260911090000_refresh_token_integrity` cierra sesiones guardadas con hashes antiguos. Los tokens de renovación ahora se comparan mediante SHA-256 del JWT completo: bcrypt truncaba los valores a 72 bytes y podía confundir dos rotaciones. Después de actualizar, los usuarios deben volver a iniciar sesión una vez. Las contraseñas siguen protegidas con bcrypt.

Generar `TOTP_ENCRYPTION_KEY` con `openssl rand -hex 32` y guardarla como secreto del servidor, independiente de ambos secretos JWT. Producción y Compose rechazan su ausencia. No ponerla en variables `NEXT_PUBLIC_*`, repositorios o logs. Guardar una copia protegida junto al plan de respaldo de PostgreSQL; sin esta clave los secretos TOTP no se pueden recuperar. Cambiarla requiere recifrar previamente los registros existentes; no reemplazarla como una rotación ordinaria de JWT.

Usar HTTPS, hora del servidor sincronizada y correo transaccional configurado. En producción: `AUTH_DEV_LINKS=false`, `SEED_ON_FIRST_RUN=false`, `ALLOW_DEMO_SEED=false`. Esto conserva las cuentas existentes y evita inicializar contenido de demostración. Las cuentas predeterminadas deben quedar asignadas a sus responsables y completar su primer acceso antes de abrir el servicio al público.

Aplicar `npm run db:deploy` antes de iniciar la versión nueva; el contenedor lo ejecuta automáticamente. Respaldar datos y uploads antes de actualizar. Las otras migraciones de esta entrega aplican la paleta guinda a la configuración guardada, conservan colores de estados/logos y retiran los avisos conocidos del seed; no borran contenido de usuarios.

## Dos factores

En **Mi cuenta → Seguridad**, confirmar la contraseña actual, escanear el QR con una aplicación autenticadora y validar el primer código. El QR se genera localmente, sin enviar la clave a terceros. La configuración pendiente vence a los diez minutos y se cancela al cambiar/restablecer la contraseña. Activar o desactivar 2FA revoca las demás sesiones y entrega una sesión nueva al navegador actual.

TOTP usa SHA-1, seis dígitos y periodos de 30 segundos, con tolerancia de un periodo para desfase de reloj. El secreto se cifra con AES-256-GCM, un IV aleatorio y la identidad de la cuenta como datos autenticados. Los secretos viven en una tabla separada y no se incluyen en respuestas de perfil. Se rechaza reutilizar un periodo ya consumido, incluso bajo peticiones simultáneas.

Al activarlo se muestran una sola vez diez códigos de recuperación. Cada uno es de un solo uso y la base conserva únicamente su hash. Guardarlos de forma privada. La recuperación de contraseña por correo mantiene 2FA activo. Si se pierden la aplicación y todos los códigos, hace falta un procedimiento institucional de verificación de identidad; no existe un endpoint público para desactivar esa protección.

| Ruta POST `/api/auth` | Requisito y resultado |
|---|---|
| `/login` | Contraseña válida. Si tiene 2FA, devuelve `requiresTwoFactor`, `challengeToken` y `expiresIn`; todavía no entrega sesión ni cookie. |
| `/two-factor/verify` | `challengeToken` y `code`; código TOTP o de recuperación. Solo el éxito emite access token y cookie httpOnly. |
| `/two-factor/setup` | Bearer y `password`; devuelve QR, clave manual y vencimiento. |
| `/two-factor/enable` | Bearer, `password` y `code`; confirma la configuración, entrega códigos de recuperación y sesión nueva. |
| `/two-factor/disable` | Bearer, `password` y `code`; elimina los secretos y entrega sesión nueva. |

Los desafíos de login vencen a los cinco minutos, están ligados a la versión de seguridad de la cuenta, se guardan como hashes y se consumen una vez. Hay cinco intentos por desafío y un límite persistente por cuenta; crear otro desafío no lo reinicia. Al agotar el presupuesto la cuenta espera diez minutos. Los endpoints también tienen límites por IP. Las respuestas de autenticación usan `Cache-Control: no-store`.

## Validación reproducible

Usar Node 24 LTS y Docker con contenedores Linux:

```bash
npm ci
npm run prisma:generate
npm run check
npm run test:auth:integration
npm audit
```

La integración crea y elimina su propio contenedor PostgreSQL 16 con puerto efímero en loopback, sin usar `DATABASE_URL` del proyecto. Aplica todas las migraciones y prueba HTTP real, cambio obligatorio, sesiones revocadas, cifrado, vencimiento, bloqueo de intentos y consumo concurrente de TOTP/recuperación. Las pruebas de contratos del backend necesitan el frontend hermano, como en D-PISI.

Referencias técnicas: [SMTP y TLS de Nodemailer](https://nodemailer.com/smtp), [configuración Gmail](https://support.google.com/mail/answer/7104828), [recuperación segura de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OTPAuth](https://github.com/hectorm/otpauth), [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
