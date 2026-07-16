# Seguridad de la gestión colaborativa de proyectos

Estado del documento: revisión posterior a la implementación. Las secciones
marcadas como **futuro** son recomendaciones de endurecimiento y no describen
funciones disponibles hoy.

## Objetivo

Permitir que el administrador y los integrantes autorizados de un proyecto gestionen, desde un único espacio, la ficha del proyecto, sus hitos y fechas, noticias, eventos e imágenes. Toda mutación debe poder atribuirse a una identidad concreta, generar un historial inmutable y, cuando sea seguro, ser reversible por un administrador.

La facilidad de uso no debe convertir la pertenencia a un proyecto en un permiso global ni permitir que un colaborador se otorgue más privilegios.

## Implementado en este incremento

- `ProjectAccessService` centraliza el alcance: administrador, propietario,
  integrante del proyecto o tercero. Ser docente revisor, por sí solo, no
  concede edición ni upload al proyecto.
- Todos los `ProjectMember` actuales actúan como colaboradores editores. Solo
  propietario y administrador gobiernan integrantes, revisor y comunidad; solo
  administrador cambia estado administrativo, destacado, lee auditoría completa
  o ejecuta rollback.
- `Project.version` y compare-and-set evitan que dos formularios sobrescriban
  silenciosamente sus cambios; el conflicto devuelve `409`.
- El workspace expone edición general, hitos/fechas de calendario y galería. Las
  imágenes se validan, comprimen, limitan a 12, se enlazan de forma atómica y se
  archivan en vez de purgarse desde la gestión ordinaria.
- `News.projectId` y el CRUD anidado `/projects/:projectId/news` comprueban la
  pertenencia mediante `ProjectAccessService`; cada consulta de edición combina
  `newsId` con el `projectId` de la ruta para bloquear IDOR.
- `ProjectAuditLog` conserva actor, correo snapshot, acción, entidad, antes,
  después, metadata privada, fecha y `rollbackOfId`. Un trigger PostgreSQL
  impide `UPDATE` y `DELETE`, y el FK del proyecto usa `RESTRICT`.
- El administrador dispone de historial paginado y rollback con motivo. El
  rollback compara el estado actual, usa versión, se limita a acciones con
  adaptador seguro, crea otra entrada y no puede repetirse.
- Archivar un proyecto sustituye al borrado físico. Las revisiones docentes se
  auditan, pero son informativas y deliberadamente no admiten rollback genérico
  porque también implican el historial de `ApprovalRequest`.
- Cada auditoría crea atómicamente una fila única `ProjectAuditDelivery`. Un
  worker entrega avisos internos al propietario y administradores distintos del
  actor y, si está configurado, invoca un webhook HTTPS firmado con HMAC. Usa
  compare-and-set para reclamar trabajos, clave idempotente, timeout, reintentos
  exponenciales, recuperación de trabajos atascados y tope de cinco intentos.
- La suite backend cubre atribución, IDOR, reviewer sin membresía, escalada por
  `roleInProject`, gobernanza, asociación cruzada de imágenes, append-only,
  rollback no-admin/repetido/divergente/de noticias, concurrencia de media y
  entrega segura del outbox.

## Recomendaciones futuras, no implementadas todavía

- niveles tipados `EDITOR`/`VIEWER` y baja lógica de membresías;
- asociación `Event.projectId` si los eventos generales deben formar parte del
  workspace, además de los hitos que ya funcionan como calendario;
- panel operativo para reintentar o reconocer entregas `FAILED`, métricas y
  alertas sobre la cola; el worker conserva el error pero no existe todavía una
  consola de operación del outbox;
- integrar en producción un proveedor de correo detrás del webhook de seguridad
  y comprobar su entrega; sin ese webhook la plataforma mantiene el aviso
  interno y marca la entrega externa como `SKIPPED`;
- retención y purga supervisada de imágenes archivadas;
- request ID, IP seudonimizada, snapshot de username, `changedFields` y cadena
  criptográfica para evidencia de mayor exigencia;
- pruebas E2E multiusuario y concurrentes contra una base temporal en CI.

## Punto de partida auditado antes del cambio

Esta tabla explica por qué se realizó el incremento; no representa el estado
posterior descrito arriba.

| Área | Comportamiento antes del incremento | Brecha detectada entonces |
| --- | --- | --- |
| Proyecto | `PATCH /projects/:id`, `GET /projects/mine/:id` y `DELETE /projects/:id` aceptan propietario o administrador | `ProjectMember` no recibe capacidad de edición ni puede listar el proyecto como asociado |
| Integrantes | `roleInProject` es texto libre y el propietario reemplaza toda la lista | El texto es descriptivo, no una fuente válida de autorización; una edición concurrente puede perder integrantes |
| Imágenes | `POST /media/upload?projectId=...` enlaza el archivo de inmediato y acepta propietario, administrador o revisor | El revisor tiene un permiso no justificado, el integrante no lo tiene y el enlace no deja auditoría de proyecto |
| Noticias | Creación, edición y eliminación son exclusivas de `ADMIN` | No existe relación `News -> Project`, por lo que no puede comprobarse el alcance del colaborador |
| Eventos | Se autorizan por organizador, administrador o liderazgo de comunidad | No existe relación `Event -> Project`; ser integrante del proyecto no concede ni limita la gestión |
| Calendario/hitos | Solo existen `startedAt`, `phase` y eventos generales | No hay hitos ordenables ni fechas propias del cronograma del proyecto |
| Auditoría | Las aprobaciones y puntos conservan historial, pero las ediciones de proyecto no | No existen snapshot, correo histórico del actor, versión, motivo, request ID ni registro de rollback |
| Alertas | El webhook existente solo entrega enlaces de autenticación | No existe outbox ni alerta por cambios sensibles o intentos repetidos sin permiso |
| Borrado | Algunas imágenes de eventos se eliminan físicamente inmediatamente; eliminar un proyecto borra registros de medios en cascada | Un rollback no puede reconstruir un objeto ya purgado y el archivo físico de un proyecto puede quedar huérfano |

## Principios obligatorios

1. **Denegar por defecto.** El rol global y la relación con el proyecto se comprueban en el servidor en cada mutación.
2. **Una sola política.** Proyectos, hitos, noticias y galería deben llamar al mismo `ProjectAccessService`; una futura asociación de eventos debe reutilizarlo.
3. **`roleInProject` solo se muestra.** Nunca se interpreta como `ADMIN`, `OWNER`, `EDITOR` ni se usa en una consulta de autorización.
4. **El propietario es una propiedad del proyecto.** No se infiere porque exista una fila editable en `ProjectMember`.
5. **Auditoría atómica.** La mutación y su entrada de auditoría se confirman en la misma transacción PostgreSQL. Si una falla, ninguna se guarda.
6. **Rollback no borra historia.** Restaurar crea una mutación nueva con su propia auditoría y referencia al cambio revertido.
7. **Sin efectos externos dentro de la transacción.** La transacción crea auditoría y outbox; el worker entrega notificación/webhook únicamente después del commit.
8. **Borrado recuperable.** Archivar/desvincular es la operación normal. El purgado físico ocurre después de una retención y no se presenta como reversible.

## Roles y capacidades implementadas

En el alcance actual, toda fila `ProjectMember` concede edición colaborativa.
`roleInProject` es únicamente una etiqueta visible y nunca se interpreta como
permiso. `OWNER` se deriva de `Project.ownerId`; `ADMIN` se deriva del rol global.
Separar después `EDITOR` y `VIEWER` mediante un enum sería una evolución, no una
capacidad presente.

Orden de decisión:

1. usuario activo, autenticado y con correo verificado;
2. `ADMIN` puede administrar cualquier proyecto;
3. `ownerId === user.id` recibe capacidades de propietario;
4. una membresía del proyecto recibe capacidad de colaborador;
5. cualquier otro caso se rechaza con `403` o, cuando revelar la existencia sea sensible, `404`.

| Acción | ADMIN | Propietario | Colaborador | Ajeno | Revisor docente |
| --- | :---: | :---: | :---: | :---: | :---: |
| Ver workspace y contenido no publicado | Sí | Sí | Sí | No | Solo flujo de revisión |
| Editar contenido general, fechas, hitos, noticias, eventos e imágenes asociados | Sí | Sí | Sí | No | No |
| Cambiar integrantes o su nivel | Sí | Sí | No | No | No |
| Cambiar propietario | Sí, operación explícita | No | No | No | No |
| Cambiar revisor, aprobación, destacado o campos administrativos | Sí | Según flujo actual de revisión | No | No | Según flujo de revisión |
| Archivar/eliminar proyecto | Sí | Sí, con confirmación | No | No | No |
| Ver auditoría con correo completo | Sí | No | No | No | No |
| Ver actividad resumida del proyecto | Sí | Sí | Sí | No | No |
| Ejecutar rollback | Sí, con motivo y control de versión | No | No | No | No |
| Ver datos personales de inscritos a eventos | Sí | Solo si además gestiona ese evento | Solo si además gestiona ese evento | No | No |

El permiso de edición no incluye gobernanza. Un colaborador no puede añadir otro integrante, ascenderse, cambiar al propietario, aprobar contenido ni trasladar una entidad a otro proyecto.

## Modelo de datos: base implementada y evolución

### Membresía: evolución futura

Hoy toda fila `ProjectMember` concede edición y `roleInProject` es solo una
etiqueta. Para granularidad posterior se propone:

- `ProjectMember.accessLevel`: enum `EDITOR | VIEWER`, obligatorio;
- `ProjectMember.isActive` o `removedAt` para retirar acceso sin perder
  atribución histórica;
- `ProjectMember.addedById`, `createdAt`, `updatedAt`;
- mantener `@@unique([projectId, userId])`;
- no aceptar `ownerId` dentro del DTO ordinario de edición.

### Entidades asociadas

Ya existen `ProjectMilestone`, `Project.version`, `News.projectId` indexado y
`MediaAsset.projectId/archivedAt`. El upload puede crear un asset temporal o
adjuntarlo directamente al proyecto; ambos caminos validan alcance, pero solo el
segundo cambia la versión y crea auditoría de proyecto.

Como evolución futura:

- añadir `Event.projectId` si un evento general debe pertenecer al proyecto; la
  relación no sustituye la privacidad de inscritos;
- valorar versión independiente en noticias/hitos si dejan de usar la versión
  agregada del proyecto;
- añadir posición explícita a hitos si se requiere un orden manual distinto de
  la fecha.

### Auditoría append-only: base implementada y extensiones futuras

La base implementada contiene `id`, proyecto, actor, correo snapshot, acción,
tipo/ID de entidad, snapshots, metadata, fecha y rollback único. Para producción
de mayor exigencia se recomienda añadir:

- `changedFields` calculado en servidor;
- `requestId`, `ipAddressHash` y `userAgent` truncado;
- `actorUsernameSnapshot` y límites explícitos de tamaño para snapshots;
- opcionalmente `previousHash`/`entryHash` para detectar alteración o eliminación fuera de la aplicación.

No deben guardarse contraseñas, tokens, cookies, secretos de webhook, contenido binario, URLs firmadas de storage ni listas completas de correos de inscritos. El correo del actor sí se guarda deliberadamente como snapshot de atribución y su acceso queda limitado a administradores.

La aplicación no expone `UPDATE` ni `DELETE` y el trigger inmutable ya está
implementado. En producción se recomienda además un usuario de base separado y
una política de retención institucional.

### Outbox de alertas implementado

`ProjectAuditDelivery` se crea en la misma transacción que cada
`ProjectAuditLog`:

- `auditLogId` es único y su FK usa `ON DELETE RESTRICT`;
- `status` admite `PENDING`, `PROCESSING`, `SENT`, `SKIPPED` y `FAILED`;
- `attempts`, `nextAttemptAt`, `lastError` y `sentAt` permiten operar y
  diagnosticar la entrega;
- el payload se construye al entregar desde datos del servidor y no se guarda
  desde el DTO del cliente.

El worker reclama cada fila con compare-and-set, recupera periódicamente estados
`PROCESSING` obsoletos, deduplica avisos internos por ID de auditoría y usa el ID
de entrega como clave idempotente del webhook. Un HTTP fallido deja la fila
pendiente con backoff; al quinto intento pasa a `FAILED` sin revertir la edición.
Si el webhook no está configurado, el aviso interno sí se conserva y el canal
externo queda explícitamente `SKIPPED`.

## Política futura por capacidades

La capa de dominio debería exponer capacidades explícitas y no booleanos ambiguos:

```ts
type ProjectCapability =
  | 'PROJECT_EDIT'
  | 'MEMBERS_MANAGE'
  | 'MILESTONE_MANAGE'
  | 'NEWS_MANAGE'
  | 'EVENT_MANAGE'
  | 'GALLERY_MANAGE'
  | 'PROJECT_ARCHIVE'
  | 'AUDIT_READ_FULL'
  | 'AUDIT_ROLLBACK';

assertProjectCapability(user, projectId, capability): Promise<ProjectAccessContext>
```

`ProjectAccessContext` devuelve el proyecto, la clase de actor y la membresía ya comprobada para evitar consultas y criterios divergentes. Las consultas deben incluir `user.isActive`, membresía activa y el mismo `projectId` recibido en la URL.

## Contrato HTTP implementado

Todas las mutaciones colaborativas requieren `expectedVersion`: en el JSON para
`POST`/`PATCH` y rollback, y en query para `DELETE` y upload multipart. Si la
versión cambió desde que se abrió el formulario, responden `409 Conflict` y no
escriben auditoría de éxito.

- `GET /projects/manage/mine`: proyectos propios o asociados; admin recibe todos.
- `GET /projects/:id/manage`: devuelve workspace, capacidades efectivas y versión.
- `PATCH /projects/:id`: campos generales permitidos, `expectedVersion`.
- `GET|POST|PATCH|DELETE /projects/:id/milestones/...`.
- `POST /media/upload`: crea un asset temporal o, con `projectId` y versión, lo
  enlaza y audita de forma atómica.
- `POST /projects/:id/gallery`: enlaza IDs temporales y crea auditoría atómica.
- `DELETE /projects/:id/gallery/:assetId`: marca `archivedAt`; no purga.
- `GET|POST|PATCH|DELETE /projects/:projectId/news/...`: lista, crea, edita y
  archiva noticias dentro del alcance validado del proyecto; la versión es
  obligatoria para mutaciones.
- `GET /projects/:id/audit` y `GET /projects/audit/recent`: solo admin.
- `POST /projects/:id/audit/:auditId/rollback`: solo admin, con versión y motivo.

El CRUD de noticias asociado usa `News.projectId`; el proyecto sale siempre de
la ruta/contexto validado y nunca de un `projectId` libre del body. Los endpoints
de eventos de proyecto siguen siendo una recomendación futura.

Cada endpoint anidado comprueba que la entidad cargada tiene exactamente el `projectId` de la ruta. No basta con comprobar que el actor pertenece a algún proyecto.

## Edición y auditoría atómicas

Secuencia obligatoria:

1. iniciar transacción con aislamiento suficiente para la operación;
2. cargar actor actual desde base y proyecto objetivo;
3. comprobar capacidad y `expectedVersion`;
4. cargar un snapshot normalizado `before`;
5. validar DTO y asociaciones; aplicar solo campos permitidos;
6. incrementar versión y cargar snapshot `after`;
7. insertar `ProjectAuditLog` con el correo actual como snapshot;
8. calcular señales de riesgo e insertar `ProjectAuditDelivery` mediante la
   creación anidada de la auditoría;
9. commit;
10. responder con nueva versión.

No registrar una edición si el `before` y `after` normalizados son iguales. Los intentos denegados pertenecen a un registro de seguridad separado, no a la historia de cambios exitosos.

## Rollback seguro

Un rollback genérico que reescribe el JSON completo es peligroso. Debe ejecutarse mediante un adaptador por `entityType` con allowlist de campos y las mismas invariantes del flujo normal.

Condiciones mínimas:

1. actor con rol global `ADMIN` y correo verificado;
2. `auditId` pertenece al mismo `projectId` de la ruta;
3. la entrada es reversible y no fue revertida antes;
4. `expectedVersion` coincide con la versión actual;
5. no existe una edición posterior sobre la misma entidad; en caso contrario se rechaza con `409` y se pide revisión manual;
6. `reason` no vacío, con longitud limitada;
7. las referencias restauradas todavía existen y pertenecen al proyecto;
8. el snapshot pasa las validaciones actuales del dominio;
9. la restauración y su nueva auditoría `ROLLBACK` ocurren en una sola transacción;
10. se encola una alerta de riesgo alto.

No son rollback automático: creación del proyecto, contraseña/roles globales,
propietario, decisiones de aprobación, likes/puntos, inscripciones, objetos
purgados físicamente y cambios incompatibles con el esquema actual. Deben tener
una operación administrativa específica.

Para imágenes, la operación ordinaria marca `archivedAt` y conserva el objeto,
por lo que el rollback actual puede restaurarlo. Definir una ventana de
retención, un job de purga y el indicador «ya no reversible» queda pendiente
antes de permitir eliminación física automática.

## Alertas internas y webhook — estado actual

Cada cambio auditado genera una entrega; no depende de que la acción ya haya
alcanzado un umbral de riesgo. La metadata marca `HIGH_FREQUENCY` a partir de 20
entradas del mismo actor en cinco minutos y `PRIVILEGED_ACTION` para archivo de
proyecto o rollback, de modo que el panel administrativo puede priorizarlas.

Los destinatarios se obtienen del servidor: propietario activo y cuentas
administradoras activas/verificadas, excluyendo al propio actor y eliminando
duplicados. Nunca se aceptan destinatarios desde el DTO. El aviso interno usa
una clave única por usuario/auditoría; un reintento del webhook no duplica esa
notificación.

El webhook separado usa `SECURITY_ALERT_WEBHOOK_URL` y
`SECURITY_ALERT_WEBHOOK_SECRET`. Fuera de loopback exige HTTPS en producción y
un secreto de al menos 32 bytes. La solicitud tiene timeout, firma
`HMAC-SHA256(timestamp.payload)` y el ID de entrega como `idempotency-key`. El
payload incluye solo IDs, proyecto, acción, tipo de entidad, correo snapshot del
actor, fecha, enlace y correos destinatarios; no incluye `before`, `after`,
metadata, tokens, binarios ni datos de inscritos. El consumidor del webhook es
quien materializa el correo si la instalación lo requiere.

No se reutiliza el canal de enlaces de autenticación. Siguen pendientes la
agregación de correos de alto volumen, alertas por intentos de autorización
denegados y una consola para reintentar entregas `FAILED`.

## Amenazas y controles

| Amenaza | Control requerido |
| --- | --- |
| IDOR cambiando `projectId`, `newsId`, `eventId` o `assetId` | Consulta compuesta por entidad + proyecto y política central antes de mutar |
| Colaborador se asciende o agrega una cuenta cómplice | Gobernanza solo owner/admin; `roleInProject` no concede permisos; campos administrativos fuera del DTO de colaborador |
| Texto `roleInProject = "ADMIN"` se interpreta como permiso | La política ignora la etiqueta; prueba explícita de que el texto no influye |
| Revisor adjunta contenido sin ser colaborador | No autorizar por `reviewerId`; comprobar membresía mediante `ProjectAccessService` |
| Carrera entre dos formularios sobrescribe cambios o integrantes | `expectedVersion`, incremento atómico y `409` |
| Actor borra la evidencia de su cambio | Auditoría append-only, soft delete y acceso a historial restringido |
| Rollback destruye cambios posteriores | Solo última versión compatible; `expectedVersion`; adaptador tipado; `rollbackOfId` único |
| Rollback restaura archivo inexistente o de otro proyecto | Validar asset y pertenencia; retención; marcar entrada no reversible tras purga |
| Webhook caído hace fallar o perder la edición | Outbox transaccional, timeout, cinco intentos con backoff e idempotencia; la edición ya confirmada no se revierte |
| Atacante provoca correo masivo | Dedupe interna y tope de reintentos implementados; agregación por ventana pendiente antes de producción abierta |
| Correo o snapshot filtra información | Panel admin, payload mínimo, sin secretos/binarios/inscritos y política de retención |
| URL externa en portada rastrea visitantes | Preferir `MediaAsset` propio; si se mantienen URLs, allowlist de orígenes y CSP |
| Borrado de proyecto deja archivos físicos huérfanos | Archivo lógico + job de purga que elimina DB y objeto de forma coordinada |

## Pruebas negativas imprescindibles

Las pruebas unitarias/estáticas implementadas cubren la política y las barreras
de dominio. Antes de producción deben repetirse como integración contra una
base aislada; una función de permisos no reemplaza la consulta real de alcance.

### Autorización e IDOR

1. usuario ajeno no lista ni abre el workspace de un proyecto no publicado;
2. un colaborador del proyecto A no modifica una entidad del proyecto B aunque sustituya IDs en la URL/body;
3. un colaborador no añade, elimina ni asciende integrantes, ni cambia owner/reviewer/status/destacado;
4. `roleInProject: "ADMIN"` no concede ninguna capacidad;
5. un docente revisor no sube ni enlaza imágenes si no es propietario, colaborador o admin;
6. un colaborador removido pierde acceso inmediatamente aunque su access token siga vigente;
7. un usuario desactivado o sin correo verificado no muta nada;
8. admin sí puede operar cualquier proyecto, pero cada operación queda atribuida;
9. una noticia/asset existente pero de otro proyecto responde sin filtrar datos sensibles.

### Auditoría

10. una edición válida crea una entrada por entidad modificada con `before`,
    `after`, actor y email snapshot correctos;
11. cambiar luego el correo del usuario no altera entradas antiguas;
12. una validación fallida, `403` o conflicto de versión no crea auditoría de éxito;
13. si falla la inserción de auditoría, la mutación se revierte;
14. no existen rutas para actualizar/eliminar auditoría y el servicio tampoco expone esos métodos;
15. secretos, token, cookie, binario y correos de inscritos nunca aparecen en snapshots ni en el outbox;
16. paginación y filtros no permiten a un no-admin leer correos snapshot.

### Concurrencia y rollback

17. dos PATCH con la misma versión producen un éxito y un `409`, nunca dos escrituras silenciosas;
18. solo admin ejecuta rollback;
19. rollback con `auditId` de otro proyecto se rechaza;
20. rollback de una entrada ya revertida se rechaza;
21. rollback con una edición posterior o versión obsoleta devuelve `409` sin alterar datos;
22. rollback restaura solo campos de allowlist y crea una nueva auditoría enlazada;
23. rollback de imagen purgada o asociación inexistente se rechaza limpiamente;
24. una falla al crear la auditoría de rollback deja la entidad sin cambios.

### Medios, alertas y abuso

25. solo se enlazan imágenes temporales del actor, con firma/MIME válidos, no usadas y dentro de cuota/límite;
26. upload sin proyecto queda temporal; upload directo a proyecto exige capacidad, versión y auditoría;
27. archivar conserva el objeto; no se anuncia purgado reversible hasta implementar retención;
28. una caída del webhook no revierte la mutación y deja el outbox pendiente o `FAILED` tras agotar intentos;
29. sus reintentos usan la misma clave idempotente y no duplican el aviso interno;
30. destinatarios y actor se obtienen de base/configuración, nunca del body;
31. **pendiente:** denegaciones repetidas generan una sola alerta agregada;
32. una URL HTTP externa o secreto débil se rechazan al iniciar en producción.

## Criterio de terminado

La base está lista para demostración cuando una cuenta colaboradora gestiona
únicamente los recursos de su proyecto, el administrador gestiona todos, cada
cambio soportado deja una entrada atómica con correo snapshot, el rollback
seguro restaura sin borrar historia y las pruebas negativas pasan. Para
producción faltan configurar y monitorizar el proveedor que consume el webhook,
operar entregas `FAILED`, retención y purga, backups, observabilidad y E2E
multiusuario en CI. El worker/outbox y el trigger de inmutabilidad a nivel de
base ya están implementados.
