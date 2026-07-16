# Guía de demostración del Portal ISI

Para una defensa cronometrada, con discurso, recorrido por roles, contingencias y preguntas técnicas, consulta [`PRESENTACION-FINAL.md`](PRESENTACION-FINAL.md).

## 1. Arranque y acceso

Desde la raíz del proyecto:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Completa POSTGRES_PASSWORD, JWT_ACCESS_SECRET y JWT_REFRESH_SECRET en .env.
docker compose up -d --build
docker compose ps
```

Servicios locales:

- Portal: <http://localhost:3000>
- API: <http://localhost:4000/api>
- Health: <http://localhost:4000/api/health>
- Swagger: <http://localhost:4000/docs> si `ENABLE_SWAGGER=true`

En una base nueva, Docker aplica migraciones y carga el seed automáticamente. En una base existente conserva los datos. Compruébalo con:

```bash
docker compose logs api | grep -E "Primera base|Seed inicial"
```

En PowerShell sustituye `grep` por `Select-String -Pattern 'Primera base|Seed inicial'`.

Todas las cuentas demo usan `password123` y el portal solo publica puertos en `127.0.0.1`.

## 2. Circuito completo de aprobación con el seed

Este es el recorrido recomendado para demostrar el flujo editorial completo sin crear datos improvisados. Parte de una base recién sembrada y termina sin proyectos ni artículos pendientes u observados.

Todas las cuentas usan la contraseña `password123`.

| Tipo | Contenido preparado por el seed | Estado inicial | Autor | Revisor asignado |
|---|---|---|---|---|
| Proyecto | Tutor virtual de algoritmos | Pendiente | `mrojas` | `rmendoza` |
| Proyecto | Sistema de votación estudiantil con blockchain | Observado | `pcondori` | `lgutierrez` |
| Artículo | Benchmark de ORMs TypeScript sobre PostgreSQL: Prisma, TypeORM y Drizzle | Pendiente | `pcondori` | `rmendoza` |
| Reporte de foro | Respuesta marcada como poco útil o copiada | Pendiente | Reporta `mrojas` | Modera `admin` |

Los otros cuatro proyectos y tres artículos ya están aprobados. Por eso, al finalizar este circuito deben quedar **6 proyectos** y **4 artículos** publicados.

### Paso 1 — Reenviar el proyecto observado

1. Inicia sesión con `pcondori@est.isi.edu.bo`.
2. Abre `/cuenta?tab=proyectos`.
3. Busca **Sistema de votación estudiantil con blockchain**. La tarjeta muestra el estado observado y el comentario del seed: falta el análisis de amenazas y el plan de pruebas.
4. Pulsa **Corregir y reenviar**.
5. Haz una corrección real en la **Descripción completa** para que el reenvío corresponda a la observación; por ejemplo, agrega que se incorporó un análisis STRIDE y un plan de pruebas de integridad, anonimato y doble voto.
6. Conserva a Laura Gutiérrez (`lgutierrez`) como docente revisor y pulsa **Guardar y reenviar a revisión**.
7. Comprueba en `/cuenta?tab=proyectos` que el estado cambió a pendiente.

Resultado: se crea una nueva solicitud de aprobación y nuevas entradas de auditoría, sin borrar la observación anterior.

### Paso 2 — Aprobar el proyecto y el artículo de Roberto Mendoza

1. Cierra la sesión anterior e inicia con `rmendoza@isi.edu.bo`.
2. Abre `/revision`; en el tab **Proyectos** debe aparecer **Tutor virtual de algoritmos**.
3. Pulsa **Revisar contenido completo** y luego **Aprobar (+40 pts al autor)**. El comentario es opcional al aprobar.
4. Cambia al tab **Artículos**.
5. Revisa **Benchmark de ORMs TypeScript sobre PostgreSQL: Prisma, TypeORM y Drizzle** y pulsa **Aprobar (+35 pts al autor)**.
6. Confirma que ambos tabs muestran su bandeja vacía para este docente.

Resultado: María Rojas recibe `+40` Dev Points y Pablo Condori recibe `+35` Research Points. Ambos autores reciben una notificación persistente.

### Paso 3 — Aprobar el proyecto reenviado

1. Cierra sesión e inicia con `lgutierrez@isi.edu.bo`.
2. Abre `/revision` y deja activo el tab **Proyectos**.
3. Expande **Sistema de votación estudiantil con blockchain**, verifica la corrección y pulsa **Aprobar (+40 pts al autor)**.
4. Confirma que la bandeja de proyectos de Laura quedó vacía.

Resultado: el proyecto entra a la vitrina pública, Pablo recibe `+40` Dev Points y el historial conserva tanto la observación como el reenvío y la aprobación.

### Paso 4 — Resolver el reporte sembrado

1. Cierra sesión e inicia con `admin@isi.edu.bo`.
2. Abre `/admin/reportes`; debe haber un reporte pendiente de tipo `ANSWER`, creado por `mrojas`.
3. Para un resultado final reproducible, pulsa **Descartar**. Si quieres demostrar gamificación, **Válido** suma `+5` a quien reportó y **Válido + penalizar autor** además resta `-15` al autor de la respuesta.
4. Confirma que la bandeja **Pendientes** quedó vacía.

### Paso 5 — Verificar el cierre

1. Sin iniciar sesión, abre `/proyectos`: deben mostrarse **6 proyectos**.
2. Abre `/articulos`: deben mostrarse **4 artículos**.
3. Inicia como `pcondori` y abre `/cuenta?tab=puntos`: deben figurar las nuevas transacciones de proyecto y artículo aprobados.
4. Abre `/notificaciones` para mostrar los avisos de revisión.
5. Inicia como `admin`, recarga `/admin` y verifica: **6 proyectos aprobados**, **0 proyectos pendientes**, **4 artículos aprobados**, **0 artículos pendientes** y **0 reportes sin resolver**.
6. Abre `/admin/auditoria` y filtra el proyecto de votación para enseñar la observación, corrección y decisión final.

El flujo de aprobación editorial solo aplica a proyectos y artículos; el reporte usa un flujo separado de moderación. Noticias, comunidades, eventos y mentorías no quedan pendientes de revisión en este modelo.

Si el escenario ya fue modificado, vuelve al estado exacto del seed con el reset de la [sección 6](#6-persistencia-y-reset).

## 3. Recorrido por perfiles

### Administrador

Inicia sesión con `admin@isi.edu.bo`.

1. Abre `/admin` para ver métricas.
2. En `/admin/noticias` crea una noticia y asóciala a una comunidad y/o evento.
3. En `/admin/gamificacion` alterna entre **Insignias** y **Puntos**.
4. En Insignias puedes crear/editar, elegir un SVG del catálogo o convertir PNG/JPEG/WebP a un SVG seguro, previsualizarlo y otorgarlo por username.
5. En `/revision` también puedes actuar como revisor global.
6. Abre `/notificaciones` para alternar **Todas / No leídas / Preferencias**.
7. En `/comunidades/gestionar` crea, edita, desactiva o reactiva comunidades y asigna responsables.
8. En `/proyectos/gestionar` puedes abrir cualquiera de los seis proyectos y cambiar entre **Datos / Calendario / Noticias / Imágenes / Historial**.
9. En `/admin/auditoria` busca por proyecto o correo, revisa IP/user-agent, señales de riesgo y estado del aviso. El rollback exige motivo y solo se habilita si el estado sigue siendo compatible.

### Docente revisor

Inicia sesión con `rmendoza@isi.edu.bo` o `lgutierrez@isi.edu.bo`.

1. Abre `/revision`.
2. Expande **Revisar contenido completo**.
3. Aprueba un envío o escribe un comentario y márcalo como observado.
4. Revisa ambos tabs: Proyectos y Artículos.
5. Crea una mentoría desde `/mentorias/nueva` y gestiona las autorizadas en `/mentorias/gestionar`.
6. Si eres docente asesor, abre `/comunidades/gestionar` para editar únicamente tus comunidades.

### Estudiante con contenido observado

Inicia sesión con `pcondori@est.isi.edu.bo`.

1. Abre `/cuenta?tab=proyectos`.
2. El proyecto de votación muestra la devolución del docente.
3. Pulsa **Corregir y reenviar**, modifica el análisis y guarda.
4. El estado vuelve a pendiente y se crea otra entrada de historial.
5. En `/cuenta?tab=articulos` también puedes editar/revisar el artículo enviado.
6. En `/cuenta?tab=seguridad` verifica el correo, cambia contraseña y revisa/revoca sesiones.

### Colaborador de proyecto

Inicia sesión con `pcondori@est.isi.edu.bo` y abre `/proyectos/gestionar`.

1. Además de su proyecto observado, Pablo figura como colaborador Backend de **Sistema de Gestión de Biblioteca**.
2. Abre ese proyecto y cambia entre los switches **Datos / Calendario / Noticias / Imágenes**.
3. El calendario ya contiene dos hitos, la galería tres imágenes y el proyecto una noticia asociada; no es necesario crear contenido para probar la vista.
4. Edita un hito o agrega una noticia. El formulario envía la versión actual y un conflicto concurrente responde `409` sin sobrescribir al otro usuario.
5. Cambia al administrador, abre **Historial** y muestra el correo exacto del actor, snapshots, estado del aviso y rollback con motivo.

El colaborador no puede cambiar integrantes, docente revisor, comunidad, estado ni destacado. `jmamani` es líder del proyecto Biblioteca y sí puede gobernar su equipo; ADMIN puede operar los seis proyectos.

### Líder de comunidad

Inicia sesión con `avargas@est.isi.edu.bo` o `dquispe@est.isi.edu.bo`.

1. Abre `/comunidades`: por defecto verás la Sociedad Científica; cambia al tab **Comunidades**.
2. Crea eventos o mentorías vinculados a su comunidad.
3. En un evento administrado agrega fotos. El portal muestra el tamaño original y el tamaño WebP almacenado.
4. En `/comunidades/gestionar` actualiza la comunidad que lideras.
5. Edita el evento, elimina fotos, marca asistencia y exporta CSV.

### Recuperación y correo en demo

Con `AUTH_DEV_LINKS=true` y `WEB_ORIGIN` en loopback, `/olvide-contrasena` y el tab Seguridad muestran un enlace de prueba sin enviar correo real. Esta opción es rechazada por configuración si el origen no es local. En despliegue usa `AUTH_EMAIL_WEBHOOK_URL` HTTPS y `AUTH_EMAIL_WEBHOOK_SECRET`.

## 4. Funciones públicas destacadas

- `/articulos/deteccion-retinopatia-diabetica-cnn`: switch **Resumen/Visor de PDF** dentro de la misma página.
- `/eventos/ctf-isi-2026`: galería, inscripción y **Agregar a Google Calendar**.
- `/noticias`: tabs **10 más recientes** y **Más valoradas**, categorías y enlaces a comunidad/evento.
- `/foro`: búsqueda y filtro por tags; al preguntar se pueden crear tags libres (máximo 5).
- `/foro/preguntar`: hasta 2 imágenes; una respuesta también admite hasta 2.
- `/ranking`: cada insignia usa su icono SVG correspondiente.
- `/mentorias`: inscripción, video/Teams según permiso y panel de gestión por roles.
- Los formularios de proyectos, artículos, noticias, eventos y comunidades permiten subir imágenes; se reencodifican a WebP. Artículos acepta además un PDF local para el visor sandboxeado.

## 5. Datos listos para enseñar

Una base nueva contiene 9 usuarios, 6 comunidades, 10 noticias, 6 proyectos con 13 hitos y 12 imágenes, 4 artículos, 7 eventos con 18 inscripciones y 8 imágenes, 3 mentorías, 6 preguntas/respuestas con 5 imágenes, 10 insignias, 93 movimientos de puntos y 33 entradas de auditoría. Las portadas son remotas para no ocupar el storage local; las cargas hechas durante la demo sí se decodifican, eliminan metadatos y almacenan como WebP.

Escenarios especialmente completos:

- **Biblioteca:** `jmamani` líder; `pcondori` Backend; `mrojas` Frontend; 2 hitos, 3 imágenes, 1 noticia y 7 auditorías.
- **AgroMonitor:** `dquispe` líder; `jmamani` Backend; 3 hitos, 3 imágenes, 1 noticia y 8 auditorías.
- **Detector de phishing:** `avargas` y `mrojas`; 2 hitos, 2 imágenes y 5 auditorías.

## 6. Persistencia y reset

Reiniciar sin perder datos:

```bash
docker compose restart
```

Detener sin borrar:

```bash
docker compose down
```

Reset total de la demostración (destructivo):

```bash
docker compose down -v
docker compose up -d --build
```

El segundo comando crea volúmenes nuevos, aplica todas las migraciones y ejecuta el seed una única vez.

## 7. Comprobación rápida

Desde PowerShell y la raíz del proyecto, el preflight verifica Docker, API/PostgreSQL, contenido público, renderizado de las páginas y acceso administrativo. No modifica el contenido demo: realiza login y logout de ADMIN, no deja una sesión activa y conserva únicamente la fila revocada como trazabilidad.

```powershell
./scripts/verificar-demo.ps1
```

El script usa `admin@isi.edu.bo` y `password123`. También comprueba el workspace colaborativo y la estructura paginada de la bitácora. Si la contraseña demo fue cambiada, defínela solo para la sesión actual:

```powershell
$env:DEMO_ADMIN_PASSWORD = Read-Host 'Contraseña demo ADMIN' -MaskInput
try { ./scripts/verificar-demo.ps1 } finally { Remove-Item Env:DEMO_ADMIN_PASSWORD -ErrorAction SilentlyContinue }
```

Para aislar un endpoint concreto si el preflight falla:

```bash
curl http://localhost:4000/api/health
curl "http://localhost:4000/api/news?limit=10&sort=top"
curl "http://localhost:4000/api/forum/questions?tags=nestjs"
curl http://localhost:3000
```

Antes de exponer el portal fuera del equipo local, desactiva `SEED_ON_FIRST_RUN`, elimina las cuentas demo, rota todos los secretos, configura HTTPS y usa almacenamiento S3 con copias de seguridad.
