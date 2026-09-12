# Preparación del despliegue

La aplicación se ejecuta con Docker Compose: PostgreSQL, API y web. En el repositorio D-PISI, `backend` y `frontend` son submódulos de B-PISI y F-PISI. Actualizar siempre ambos a los commits indicados por D-PISI.

## Configuración privada

El `.env` local contiene las claves de base de datos, JWT, cifrado TOTP y correo. No se publica en Git ni se incluye en las imágenes Docker. Conservarlo en un canal privado y restringir su acceso en el servidor. No generar otra clave TOTP al trasladar una base con 2FA activo.

El correo usa `siciunivalle@gmail.com` como remitente técnico. Esto es independiente de la política de registro: las cuentas nuevas del portal deben usar `@univalle.edu` y verificar su correo. Las cuentas anteriores conservan sus direcciones; la recuperación llega al correo registrado de cada usuario. Una dirección ficticia del seed no puede recibir mensajes reales.

La URL definitiva aún debe proporcionarse. Hasta entonces, `PUBLIC_WEB_URL` y `WEB_ORIGIN` apuntan a localhost. No transferir esa configuración sin adaptar la URL, porque los enlaces de recuperación apuntarían al equipo del destinatario.

Cuando exista el dominio HTTPS, desde la raíz y con Node 24:

```bash
node scripts/preparar-despliegue.cjs https://tu-dominio-real
```

El comando genera `.env.production` conservando los secretos existentes y configurando la URL pública, CORS, correo real, Swagger desactivado y seed desactivado. No modifica el `.env` local. Está pensado para Nginx con `/api/` y `/uploads/` dirigidos directamente al backend (`TRUST_PROXY_HOPS=1`). Si se añade otra capa de proxy, revisar esa cantidad y las cabeceras confiables.

## Servidor

1. Clonar D-PISI con sus submódulos:

   ```bash
   git clone --recurse-submodules https://github.com/incubadoradesarrollo-source/D-PISI.git
   cd D-PISI
   ```

2. Transferir `.env.production` de forma privada y guardarlo como `.env` en esa carpeta. En Linux: `chmod 600 .env`.
3. Respaldar/restaurar la base y los archivos de `uploads` si se trasladan los datos actuales. El seed queda desactivado y una base nueva no tendrá las cuentas anteriores. No ejecutar el seed de demostración sobre datos que deban conservarse.
   Si se actualiza un servidor existente, conservar su nombre de proyecto Compose mediante `COMPOSE_PROJECT_NAME` o `docker compose -p NOMBRE_EXISTENTE`; cambiar de carpeta puede seleccionar volúmenes vacíos. Consultar el nombre actual con `docker compose ls`.
4. Configurar HTTPS en Nginx. Usar el ejemplo `nginx/socesi.conf.example` de D-PISI dentro del servidor HTTPS correspondiente al dominio real. Los puertos de Compose se publican solo en loopback.
5. Iniciar:

   ```bash
   docker compose up -d --build --wait --wait-timeout 240
   docker compose exec api npm run mail:verify
   docker compose ps
   ```

6. Comprobar `https://tu-dominio-real/api/health`, el login, un registro institucional y la recuperación de una cuenta con correo real. Los enlaces de verificación y recuperación solo se utilizan una vez. Revisar también spam.

Las migraciones se aplican al iniciar la API. La actualización de integridad de sesiones cierra sesiones antiguas y exige volver a iniciar sesión; no cambia contraseñas ni secretos TOTP.

Para una base de producción nueva, el backend incluye `npm run seed:deploy`: crea únicamente roles, reglas, insignias y la cuenta administrativa. No carga proyectos ni noticias de demostración y conserva las reglas existentes al repetirse. Proporcionar `ADMIN_SEED_EMAIL`, `ADMIN_SEED_USERNAME` y `ADMIN_SEED_PASSWORD` mediante variables privadas del proceso que ejecuta el comando. La cuenta inicial exige cambiar su contraseña. `ADMIN_SEED_RESET_PASSWORD=true` solicita expresamente restablecerla y revoca las sesiones anteriores; no usar esa opción para un reinicio ordinario.

## Variante con Coolify

Los repositorios B-PISI y F-PISI conservan sus workflows de Coolify. Cada push ejecuta comprobaciones; publicar imágenes y llamar al webhook requiere ejecutar manualmente **Actions → Run workflow**. Esto permite completar las variables y la URL antes de activar el servidor.

Configurar las variables privadas de la API en Coolify desde el `.env`, incluidas `PUBLIC_WEB_URL` y las variables SMTP. En F-PISI, configurar además la variable de repositorio `PUBLIC_WEB_URL` con el origen HTTPS definitivo antes de construir la imagen. Los secretos de Actions `COOLIFY_WEBHOOK` y `COOLIFY_TOKEN` permanecen en GitHub; no se copian al código ni al `.env` del frontend. Revisar la ruta interna `API_INTERNAL_URL` del frontend de acuerdo con la red del servidor.

## Operación local

```bash
docker compose up -d --build --wait
docker compose logs --tail=100 api web
docker compose stop
```

Portal: `http://localhost:3000`. El correo real también funciona localmente, pero sus enlaces abren localhost y deben probarse en el mismo equipo.

`docker compose stop` conserva los datos. Para actualizaciones: respaldar primero, actualizar el repositorio y sus submódulos, y reconstruir. No usar `down -v` para una actualización: elimina los volúmenes de base de datos y archivos.
