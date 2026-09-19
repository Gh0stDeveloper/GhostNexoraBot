# Ghost Nexora Bot — Próximas integraciones y mejoras

> Documento de seguimiento oficial
>
> Estado general: EN PROGRESO
>
> Última actualización: 2026-09-19
>
> Repositorio: Gh0stDeveloper/GhostNexoraBot

Este archivo conserva el plan acordado para continuar mejorando Ghost Nexora Bot sin depender del contexto de una conversación. Cada fase debe completarse en orden. Cuando una tarea se empiece, cambia su estado a EN PROGRESO. Cuando quede implementada, validada y fusionada a main, cambia su estado a TERMINADO.

---

## Convención de estados

| Estado | Significado |
|---|---|
| PENDIENTE | Todavía no se ha iniciado |
| EN PROGRESO | Hay trabajo activo en una rama/PR |
| BLOQUEADO | Depende de otra tarea, decisión o integración |
| POSPUESTO | Se conserva pendiente pero se ejecutará después de las fases actualmente priorizadas |
| TERMINADO | Implementado, probado y fusionado a main |

### Regla de cierre

Una fase solo se marca como TERMINADO cuando:

1. el código está implementado;
2. TypeScript, PowerShell u otra parte afectada compila según corresponda;
3. los smoke tests y CI relacionados están en verde;
4. no se rompe la superficie de comandos existente;
5. los cambios están fusionados a main;
6. este documento se actualiza con lo realizado y, cuando aplique, con el PR y commit final.

---

# Orden de trabajo acordado

| Fase | Área | Estado |
|---|---|---|
| Fase A | Login y seguridad Web | TERMINADO |
| Fase E | Dashboard Web V2 | EN PROGRESO |
| Fase F | Observabilidad, métricas y operación | PENDIENTE |
| Fase B | Núcleo multiplataforma compartido | POSPUESTO |
| Fase C | Paridad Discord y Telegram | POSPUESTO |
| Fase D | Runtime y entrega WhatsApp | POSPUESTO |

Orden actualizado por decisión de proyecto: después de Fase A se prioriza Fase E. Las fases B, C y D quedan pospuestas hasta terminar las fases de Dashboard/operación prioritarias.

---

# Estado técnico de partida

Ghost Nexora Bot ya tiene una base multiplataforma con:

- PlatformAdapter;
- NormalizedMessage;
- NormalizedUi;
- adapters para WhatsApp, Discord y Telegram;
- capacidades declaradas por plataforma;
- dashboard administrativo;
- portal de subbots;
- métricas operativas;
- health/runtime;
- sistema de providers;
- sistema de actualización e instaladores.

Todavía existe una capa de compatibilidad V1 de WhatsApp. CommandContext conserva socket y message específicos de Baileys, mientras Discord y Telegram aún mantienen routers y subconjuntos de comandos propios. El objetivo de las fases siguientes es reducir esa duplicación y convertir el proyecto en un motor realmente compartido.

---

# FASE A — Login y seguridad Web

Estado: TERMINADO

## Objetivo

Simplificar la página pública de acceso y endurecer el sistema de autenticación del dashboard sin exponer información interna innecesaria.

## A1. Login público minimalista

Estado: TERMINADO

La pantalla /login debe mostrar únicamente:

- marca Ghost Nexora Bot;
- título Iniciar sesión;
- campo Token de acceso;
- botón Acceder;
- error genérico cuando corresponda.

Retirar de la vista pública:

- cómo se distingue un token administrativo de un token de subbot;
- explicación de sesiones HttpOnly;
- detalles de separación de roles;
- arquitectura interna;
- mecanismos de autorización;
- información que solo interese a desarrolladores.

El backend puede seguir detectando automáticamente el tipo de token y redirigiendo al panel correcto.

## A2. Mensajes de error genéricos

Estado: TERMINADO

Nunca revelar si:

- el token administrativo existe pero es incorrecto;
- un subbot concreto existe o no;
- el token pertenecía a una instancia;
- una cuenta determinada está registrada.

Respuesta pública recomendada: Credenciales no válidas.

Los detalles reales deben quedarse únicamente en logs administrativos sanitizados.

## A3. Rate limiting del login

Estado: TERMINADO

Añadir límites de intentos por origen.

Base recomendada:

- 5 intentos por minuto;
- 20 intentos por hora;
- hash de IP u origen para no persistir datos innecesarios en claro;
- ventana temporal con expiración;
- respuesta uniforme ante bloqueo.

## A4. CSRF y validación de Origin

Estado: TERMINADO

Añadir protección explícita a mutaciones Web.

Revisar especialmente:

- /api/control;
- logout;
- descargas y restores de backups;
- futuras acciones administrativas.

Usar:

- validación de Origin;
- token CSRF para formularios o mutaciones cuando corresponda;
- mantener SameSite como capa adicional, no como única defensa.

## A5. Sesiones administrativas revocables

Estado: TERMINADO

La sesión actual está firmada mediante HMAC y expiración. Añadir un registro de sesiones para revocación individual.

Modelo propuesto:

- session_id;
- role;
- created_at;
- last_seen;
- expires_at;
- ip_hash;
- user_agent_hash;
- revoked_at.

Permitir desde el dashboard:

- ver sesiones activas;
- cerrar una sesión;
- cerrar todas las demás sesiones;
- caducar sesiones antiguas.

## A6. 2FA administrativo, Passkeys y biometría del dispositivo

Estado: TERMINADO

Añadir segundo factor y acceso fuerte para cuentas privilegiadas.

Opciones:

1. Passkeys/WebAuthn como mecanismo principal moderno;
2. autenticador de plataforma: huella digital, Face ID/rostro, PIN o bloqueo del dispositivo según Android, iOS, Windows o navegador;
3. TOTP como método alternativo o de recuperación cuando se añada;
4. soporte posterior para llaves FIDO2 externas.

En móvil, la Web no recibe ni almacena la huella: Android/iOS valida localmente al usuario y WebAuthn entrega una prueba criptográfica. En producción pública debe usarse HTTPS; localhost/loopback puede usarse para desarrollo.

Configuración sugerida: ADMIN_2FA_REQUIRED=true.

Los portales de subbot mantienen aislamiento y pueden registrar su propia Passkey sin obtener privilegios sobre MainBot.

## A7. Roles Web y permisos limitados

Estado: TERMINADO

Roles acordados:

- Owner: dueño del bot, control total, seguridad, sesiones, staff, backups y acciones críticas;
- Admin: operación diaria con permisos limitados y sin control de seguridad/credenciales críticas;
- Support: diagnóstico, lectura y acciones de soporte muy acotadas;
- Subbot Owner: únicamente su propia instancia, sus grupos, configuración y sesión; nunca MainBot ni otros subbots.

Los permisos deben aplicarse en backend, no solo ocultando botones.

## A8. Reautenticación para acciones críticas

Estado: TERMINADO

Solicitar confirmación adicional para acciones como:

- salir de un grupo;
- resetear una sesión;
- broadcast global;
- acreditar NXC;
- conceder subbots;
- restaurar backups;
- reiniciar servicios;
- actualizar runtime;
- eliminar datos.

---

# FASE B — Núcleo multiplataforma compartido

Estado: PENDIENTE

## Objetivo

Conseguir que WhatsApp, Discord y Telegram ejecuten el mismo motor de comandos y que las diferencias queden exclusivamente en los adapters de salida y entrada.

Arquitectura objetivo:

Evento → Normalizer → Command Engine → Adapter de plataforma.

Adapters objetivo:

- WhatsAppAdapter;
- DiscordAdapter;
- TelegramAdapter.

## B1. Eliminar dependencia progresiva de Baileys en CommandContext

Estado: PENDIENTE

Actualmente CommandContext conserva:

- socket;
- message.

Están marcados como compatibilidad V1.

Migrar comandos gradualmente para que usen:

- adapter;
- normalizedMessage;
- servicios compartidos;
- helpers neutrales.

No eliminar los campos V1 de golpe. Hacer migraciones por lotes con smoke tests.

## B2. Un solo Command Engine

Estado: PENDIENTE

El comando debe implementarse una sola vez y responder mediante una API neutral con operaciones equivalentes a:

- reply;
- ui.card;
- ui.list;
- ui.carousel;
- media.send;
- edit;
- react.

Cada plataforma traduce la intención a su formato nativo.

## B3. Metadata central de comandos

Estado: PENDIENTE

Extender el registro de comandos para incluir:

- nombre;
- aliases;
- categoría;
- plataformas disponibles;
- argumentos;
- permisos;
- capacidades requeridas;
- descripción.

La metadata central debe alimentar:

- router;
- menús;
- ayuda;
- slash commands;
- documentación;
- dashboard de comandos.

## B4. Capability-aware command execution

Estado: PENDIENTE

Los comandos deben declarar capacidades requeridas cuando aplique:

- botones;
- embeds;
- carrusel;
- archivos;
- polls;
- moderación;
- edición;
- reacciones.

Si una plataforma no soporta algo, utilizar fallback y no duplicar el comando.

## B5. RequestContext inmutable

Estado: PENDIENTE

Evitar estado mutable compartido durante procesamiento concurrente.

El contexto por mensaje debe contener de forma inmutable:

- plataforma;
- instancia;
- chat;
- usuario;
- locale;
- permisos;
- message ID;
- correlation o request ID.

---

# FASE C — Paridad Discord y Telegram

Estado: PENDIENTE

## Objetivo

Eliminar routers mantenidos manualmente cuando sea posible y generar la experiencia de cada plataforma desde el catálogo central.

## C1. Slash commands de Discord generados automáticamente

Estado: PENDIENTE

Generar discordApplicationCommands desde el catálogo central.

Ejemplo conceptual:

- WhatsApp: .spotify Imagine Dragons
- Discord: /spotify query:Imagine Dragons
- Telegram: /spotify Imagine Dragons

No mantener manualmente tres definiciones si la función es la misma.

## C2. Aliases centralizados

Estado: PENDIENTE

Eliminar mapas duplicados de aliases en routers de Discord y Telegram conforme se migren comandos.

## C3. Menús y ayuda generados desde metadata

Estado: PENDIENTE

La ayuda de cada plataforma debe salir del mismo registro:

- nombre;
- categoría;
- descripción;
- argumentos;
- permisos;
- capacidades;
- aliases;
- disponibilidad.

## C4. Component IDs persistentes de Discord

Estado: PENDIENTE

Actualmente los comandos largos de componentes pueden quedar asociados a un mapa RAM con TTL.

Problema:

Botón viejo → token RAM → reinicio → token perdido.

Mejorar con:

- IDs firmados; o
- persistencia temporal en SQLite.

Los botones válidos deberían sobrevivir reinicios dentro de su TTL.

## C5. Media streaming en Discord

Estado: PENDIENTE

Evitar cargar archivos remotos completos mediante arrayBuffer cuando no sea necesario.

Objetivo:

HTTP stream → archivo temporal o stream → multipart upload → cleanup.

Compartir el pipeline multimedia con las otras plataformas cuando sea viable.

## C6. Rate limiting Discord por buckets

Estado: PENDIENTE

Evolucionar el control actual de 429 para considerar:

- global bucket;
- route bucket;
- channel o guild cuando aplique;
- cola;
- retry-after;
- telemetría.

---

# FASE D — Runtime y entrega WhatsApp

Estado: PENDIENTE

## Objetivo

Mejorar concurrencia, estabilidad y tolerancia a cambios o fallos de WhatsApp y Baileys.

## D1. Eliminar activeUserId mutable del WhatsAppAdapter

Estado: PENDIENTE

Actualmente el adapter mantiene un usuario activo para resolver locale.

Riesgo conceptual:

- Usuario A usa español;
- Usuario B usa inglés;
- ambas ejecuciones pueden solaparse.

Pasar el usuario y locale explícitamente en cada contexto de envío.

## D2. Caché de mensajes por chat con TTL y LRU

Estado: PENDIENTE

Cambiar claves simples por chatId:messageId.

Añadir:

- límite LRU;
- TTL;
- limpieza automática;
- tamaño adecuado para múltiples grupos concurrentes.

Objetivo inicial sugerido:

- 500 a 1000 referencias;
- TTL de 10 a 20 minutos.

## D3. Colas de ejecución

Estado: PENDIENTE

Introducir límites de concurrencia.

Ejemplo inicial:

- global: 20;
- por grupo: 3;
- por usuario: 2;
- downloads: 4;
- IA: 3.

Los valores finales se ajustarán con métricas reales.

## D4. Outbox fiable

Estado: PENDIENTE

Pipeline objetivo:

Comando → Respuesta → Outbox → Adapter → Plataforma.

Estados:

- pending;
- sending;
- sent;
- retry;
- failed.

Backoff inicial:

1 s → 3 s → 10 s.

Aplicar especialmente a:

- broadcasts;
- descargas;
- mensajes costosos;
- operaciones de subbots.

## D5. Fallback automático de UI

Estado: PENDIENTE

Cuando una interfaz avanzada no pueda enviarse:

Carousel → Card → List → Plain text.

Esto evita que un cambio de WhatsApp o Baileys deje inutilizable un comando completo.

## D6. MediaPipeline común

Estado: PENDIENTE

Crear una capa compartida para:

- límites de tamaño;
- descarga temporal;
- streaming;
- MIME;
- nombres;
- cleanup;
- retries;
- transcodificación cuando aplique.

---

# FASE E — Dashboard Web V2

Estado: EN PROGRESO

## Objetivo

Convertir Operations Center en un dashboard de producto más ordenado y menos dependiente de vistas técnicas.

## E0. Inventario de comunidades por plataforma

Estado: TERMINADO

Objetivo inmediato:

- recuperar y mostrar correctamente los grupos en los que está MainBot y cada subbot de WhatsApp;
- no depender únicamente de una sincronización completa: usar también eventos y tráfico real como recuperación;
- mostrar último intento, última sincronización correcta y último error de WhatsApp;
- separar el inventario visualmente por WhatsApp, Discord y Telegram;
- persistir guilds de Discord y enriquecerlos con metadata REST;
- persistir grupos y supergrupos observados en Telegram mediante mensajes y cambios `my_chat_member`;
- indicar de forma explícita que Telegram Bot API no ofrece una enumeración histórica completa;
- mostrar estado ACTIVO/OFFLINE/DESACTIVADO/SIN DATOS por plataforma;
- mantener aislamiento de instancias: un Subbot Owner solo ve la información de su subbot.

## E1. Navegación lateral

Estado: TERMINADO

Reemplazar o complementar tabs horizontales con sidebar.

Estructura propuesta:

- Dashboard;
- Plataformas;
- Grupos;
- Usuarios;
- Economía;
- Subbots;
- Comandos;
- Providers;
- Logs;
- Jobs;
- Seguridad;
- Backups;
- Ajustes.

En móvil usar drawer o hamburger.

Implementación E1 en curso:

- componente de navegación compartido entre página pública, Admin/Support y portal Subbot;
- sidebar fijo en escritorio;
- hamburger + drawer + overlay en móvil;
- cierre por botón, overlay, enlace y tecla Escape;
- bloqueo de scroll del body mientras el drawer está abierto;
- estado activo por sección en Admin/Subbot y por hash en la página pública;
- misma marca, jerarquía visual, espaciado e iconografía en las tres superficies;
- Admin/Support conserva únicamente las secciones permitidas por rol;
- Subbot conserva aislamiento y solo muestra sus propias secciones;
- página pública usa el mismo shell sin exponer controles privados;
- acceso /login queda como acción del sidebar público;
- navegación accesible mediante aria-current, aria-expanded, aria-controls y focus-visible.

Cierre:

- PR: #79 `feat: complete Phase E1 unified navigation`;
- merge a `main`: `5f368efb3da6d6839035cd946664d5fca3d2b909`;
- CI principal: success;
- V2 Phase 0, Phase 6 y Phase 8: success;
- smoke E1, Typecheck, Build e i18n: success.

## E2. Separar información operativa de diagnóstico

Estado: TERMINADO

La vista principal debe priorizar:

- grupos;
- usuarios;
- uptime;
- alertas;
- estado de plataformas;
- tráfico;
- errores relevantes.

Mover elementos como:

- Pipeline DAG;
- heap delta;
- microsegundos internos;
- instrumentation;

a una sección Developer o Diagnostics.

Implementación E2 en curso:

- Resumen prioriza plataformas activas, comunidades, tráfico, sincronización e incidencias;
- Centro de alertas movido al Resumen operativo;
- analítica de uso/uptime se mantiene en Resumen porque es información operativa;
- nueva sección Diagnóstico para Owner, Admin, Support y Subbot Owner sobre su propia instancia;
- CPU, RAM, heap, Node.js, Ollama y logs técnicos quedan exclusivamente en Diagnóstico;
- Pipeline DAG y tiempos internos en µs quedan exclusivamente en Diagnóstico;
- profiler de comandos, incluyendo heap delta, se mueve de Auditoría a Diagnóstico;
- telemetría detallada de providers se conserva en Diagnóstico mientras E4 prepara su pantalla de producto;
- Auditoría queda enfocada en historial de acciones administrativas;
- actividad detallada de grupos se mueve a Grupos;
- aislamiento de MainBot/subbots se mantiene.

Cierre:

- PR: #78 `feat: complete Phase E2 operations diagnostics split`;
- merge a `main`: `dc27f30eb0a11739c900593b51b2e3e7203940aa`;
- CI principal: success;
- V2 Phase 0, Phase 6 y Phase 8: success;
- Typecheck, Build, smoke E2, E3, V19, dashboard histórico e i18n: success.

## E3. Pantalla Plataformas

Estado: TERMINADO

Mostrar por plataforma.

WhatsApp:

- online u offline;
- número parcialmente oculto;
- grupos;
- mensajes por minuto;
- reconexiones;
- última actividad.

Discord:

- gateway;
- guilds;
- sequence;
- eventos;
- command sync;
- último error.

Telegram:

- estado;
- configuración;
- eventos;
- último error.

Acciones:

- diagnosticar;
- reiniciar conexión;
- ver logs;
- activar o desactivar cuando sea seguro.

Implementación actual de E3:

- nueva sección Plataformas en Admin;
- vista aislada y solo lectura en portal Subbot;
- WhatsApp: grupos, mensajes/min, reconexiones, última actividad, cuenta parcialmente ocultada;
- Discord: guilds, eventos, sequence, reconnects, session resume, scope y sincronización de comandos;
- Telegram: grupos observados, updates, offset, reconnects, webhook y bridge channel;
- diagnóstico detallado por plataforma;
- logs recientes filtrados y sanitizados;
- acciones server-side con CSRF/Origin y auditoría;
- Admin puede conectar/reiniciar; solo Owner puede desconectar;
- desconectar exige autenticación reciente;
- token del Control API permanece exclusivamente en servidor;
- contrato Control API V2 ampliado con métricas y endpoint restart por plataforma.

Cierre:

- PR: #77 `feat: complete Phase E3 platforms dashboard`;
- merge a `main`: `f6d557309d2029fd4d47cff39e41bc952e291a9d`;
- CI principal: success;
- V2 Phase 0–8: success;
- Typecheck, Build, E0 smoke, E3 smoke e i18n: success.

## E4. Dashboard de Providers y APIs

Estado: TERMINADO

Mostrar:

- LemPi;
- Spotify;
- Jikan;
- Anime1v;
- OpenRouter;
- otros providers detectados por tráfico real.

Datos:

- online, degraded, offline, sin datos y no configurado;
- requests;
- success rate;
- éxitos y fallos;
- latencia media;
- última latencia;
- último éxito;
- último fallo;
- último error sanitizado;
- circuit breaker cerrado, abierto o semiabierto.

Implementación E4:

- sección Providers dedicada en Admin/Support y portal Subbot;
- aislamiento por `instance_key`: cada subbot solo ve su propia telemetría;
- catálogo principal visible aunque todavía no exista tráfico;
- estado de configuración calculado sin exponer API keys, secrets ni tokens;
- providers adicionales aparecen automáticamente cuando publican telemetría;
- helper compartido `trackedProviderCall()` para registrar éxito, fallo y latencia sin duplicar lógica;
- circuit breaker persistente basado en 3 fallos consecutivos y ventana de 5 minutos;
- LemPi mantiene telemetría global y por endpoint/provider;
- Spotify publica telemetría de autenticación y Web API;
- Jikan queda instrumentado en anime, colección/waifus y búsquedas auxiliares;
- Anime1v, Consumet, WeebAPI y AnimeAPI publican telemetría individual;
- OpenRouter publica telemetría de estado y peticiones de IA;
- la vista Web calcula estado operativo, error rate, success rate y circuit state;
- la telemetría detallada de providers salió de Developer/Diagnostics para evitar duplicación y ahora vive en su pantalla de producto.

Cierre:

- Typecheck, Build y smoke E4 obligatorios en CI;
- E4 mantiene compatibilidad con MainBot y aislamiento de subbots;
- no se muestran valores de configuración sensibles en la Web.

## E5. Centro de comandos

Estado: TERMINADO

Tabla:

- Comando;
- Categoría;
- WhatsApp;
- Discord;
- Telegram;
- Invocaciones;
- Éxito;
- Latencia;
- Estado.

Permite detectar inmediatamente qué comandos aún no tienen paridad multiplataforma.

Implementación E5:

- nueva sección Comandos dedicada en Admin/Support y portal Subbot;
- aislamiento por `instance_key`: cada portal usa únicamente el catálogo y métricas de la instancia seleccionada;
- catálogo de paridad centralizado a partir de los tokens que aceptan realmente los routers nativos de Discord y Telegram;
- WhatsApp conserva el catálogo efectivo principal y sirve como referencia actual para detectar brechas de paridad;
- disponibilidad WhatsApp/Discord/Telegram persistida en `ops_command_catalog`;
- migración compatible con bases SQLite anteriores a E5 mediante detección de columnas y `ALTER TABLE`;
- Web tolera un runtime antiguo durante una actualización y aplica valores conservadores si las nuevas columnas todavía no existen;
- invocaciones, éxitos, fallos y latencia agregan también ejecuciones nativas de Discord y Telegram;
- las métricas nativas no sobrescriben descripción, categoría ni metadata de paridad del catálogo;
- búsqueda por nombre, categoría, descripción o estado;
- filtros por categoría, paridad completa, paridad pendiente y disponibilidad en Discord/Telegram;
- resumen con total de comandos, comandos con paridad completa y cobertura por plataforma;
- comandos sin paridad completa quedan identificados visualmente;
- la tabla operativa muestra invocaciones, tasa de éxito, latencia media y estado;
- Developer/Diagnostics conserva el profiler técnico profundo con latencias mínima/máxima, heap y métricas internas, evitando duplicarlo en E5;
- no se exponen handlers, código fuente, tokens, credenciales ni configuración sensible.

Cierre:

- Typecheck, Build y smoke E5 son obligatorios en CI;
- E5 mantiene aislamiento entre MainBot y cada subbot;
- el catálogo de paridad representa la implementación real actual y podrá alimentarse desde metadata central cuando se complete B3/C1.

## E6. Editor de configuración de comandos

Estado: TERMINADO

Configurar desde Web:

- habilitado o deshabilitado;
- plataforma;
- cooldown;
- grupos;
- privado;
- categorías;
- permisos.

Debe respetar aislamiento entre MainBot y subbots.

Implementación E6:

- configuración persistente por `instance_key` y comando;
- activación global del comando y activación independiente por WhatsApp, Discord y Telegram;
- cooldown adicional por usuario, comando, plataforma e instancia;
- control de uso en grupos y chats privados;
- categorías completas habilitables o deshabilitables por instancia;
- permisos adicionales `inherit`, `staff` y `owner`, sin reducir nunca los permisos definidos por el comando;
- enforcement en los routers de WhatsApp, Discord y Telegram;
- alias resueltos al comando canónico para que la configuración y la telemetría no se fragmenten;
- menú y buscador de WhatsApp ocultan comandos no disponibles por E6, pero no por un cooldown transitorio;
- editor Web integrado en Admin/Support y portal Subbot;
- Support conserva acceso de solo lectura; Admin puede editar salvo comandos/categoría Owner; Owner tiene control completo;
- el portal Subbot queda forzado a su propia instancia;
- las plataformas no soportadas por el catálogo real no pueden habilitarse desde Web;
- eliminación permanente de un subbot limpia también configuración, aliases y cooldowns E6.

Cierre:

- implementación completa fusionada en `main`;
- Typecheck y Build en verde;
- smoke dedicado `scripts/phase-e6-command-config-smoke.mjs` obligatorio en CI;
- aislamiento MainBot/subbots, permisos, cooldowns, plataformas, categorías, menú y buscador cubiertos por la validación E6;
- CI principal validado correctamente sobre `8016ab107ff272bea9c80c4684023a5bcb128760`.

## E7. Vista detallada de grupo

Estado: TERMINADO

Rutas implementadas:

- `/admin/groups/<jid>?instance=<instance_key>`;
- `/subbot/groups/<jid>`.

Mostrar:

- nombre, JID, descripción, foto y fechas;
- miembros y admins desde el último metadata de WhatsApp;
- estado de admin del propio bot cuando el snapshot permite identificarlo;
- actividad agregada: mensajes hoy, 7 días, 30 días y miembros activos;
- idioma;
- adult mode y sincronización con la categoría `adult`;
- bienvenida y despedida, incluidos mensajes personalizados;
- anti-link y anti-spam;
- restricted mode;
- mute;
- perfil efectivo de comandos;
- configuración persistente por instancia.

Acciones seguras:

- abrir o cerrar el grupo para escritura;
- bloquear o permitir edición de información;
- silenciar 8 horas o 7 días y reactivar notificaciones;
- configurar protecciones y comportamiento del grupo;
- enviar un broadcast únicamente al grupo seleccionado;
- salir del grupo con reautenticación crítica.

Implementación E7:

- inventario WhatsApp enlazado a una vista individual;
- rutas protegidas por sesión y permiso `groups:view`;
- Owner puede revisar MainBot o un subbot; Admin/Support permanecen limitados a MainBot;
- Subbot Owner queda forzado a su propio `instance_key`;
- miembros/admins y configuración se reflejan en tablas operativas separadas por instancia;
- los JID de participantes se muestran parcialmente ocultos en la interfaz;
- escrituras Web exigen CSRF/Origin y `groups:manage`;
- todas las acciones validan que el grupo pertenezca a la instancia antes de encolarse;
- configuración y broadcasts se ejecutan dentro del runtime MainBot/subbot correspondiente;
- eliminación permanente de un subbot limpia los snapshots y políticas de grupo E7;
- smoke dedicado `scripts/phase-e7-group-detail-smoke.mjs` integrado al CI.

Cierre:

- Typecheck y Build en verde;
- smoke E7 en verde;
- auditoría ES/EN e i18n boundary en verde;
- Windows installer y suite completa de regresiones en verde;
- CI principal #2766: success sobre `690415c9a418681173345d0e1ebe2013b3ae3237`;
- payloads temporales de configuración/broadcast se eliminan al terminar o fallar la acción para no retener contenido innecesario.

## E8. Dashboard de usuarios

Estado: TERMINADO

Buscar por:

- número;
- JID;
- nombre.

Mostrar, según permisos:

- NXC;
- banco;
- XP;
- nivel;
- profesión;
- inventario;
- comandos;
- grupos;
- warnings;
- ban;
- subbots.

Implementación E8:

- nueva sección `Usuarios` en Operations Center;
- búsqueda por número, JID o `display_name` observado por la telemetría;
- resultados y ficha filtrados por la instancia seleccionada;
- Owner puede seleccionar MainBot/subbots; Admin y Support permanecen limitados a MainBot;
- XP, nivel y comandos desde perfiles locales de la instancia;
- grupos y actividad por usuario desde tablas de actividad locales;
- warnings por grupo para roles con permiso de moderación;
- cartera y banco leídos directamente desde la economía global compartida, sólo para Owner;
- inventario y subbots visibles únicamente con permisos específicos;
- estado de ban distingue entre activo, sin ban y registro de bans no disponible, sin inventar un subsistema de bans que no exista;
- permisos específicos `users:view`, `users:financial`, `users:moderation` y `users:subbots`;
- smoke dedicado `scripts/phase-e8-user-dashboard-smoke.mjs` integrado al CI.

Cierre:

- Typecheck y Build en verde;
- smoke E8 en verde;
- aislamiento ES/EN y auditor i18n boundary en verde;
- Windows installer, Termux y suite completa de regresiones en verde;
- CI principal #2778: success sobre `d8ae811b618f6c32537bcff4cfbb9d3db36d7e36`.

## E9. Ledger de economía

Estado: TERMINADO

Añadir un libro contable de movimientos.

Modelo implementado:

- transaction_id;
- user;
- type/kind;
- amount;
- wallet_delta y bank_delta;
- wallet/bank/balance_before;
- wallet/bank/balance_after;
- source;
- counterparty;
- instancia MainBot/subbot;
- timestamp.

Ejemplos:

- +95 NXC por work;
- -500 NXC por shop;
- +200 NXC por admin_credit;
- -10 NXC por game.

Objetivo: poder auditar siempre de dónde salió o a dónde fue cada cambio de saldo.

Implementación E9:

- tabla global `economy_transactions` en la base de economía compartida;
- IDs de transacción independientes `nxc_<random>`;
- trigger automático sobre `global_economy_users` para que ningún cambio de wallet/banco quede sin registro;
- saldo anterior/posterior y delta exacto de wallet/banco calculados por SQLite sobre el cambio real;
- apertura/importación y cierre/merge de cuentas también auditados;
- `economy_global_ledger` enriquece automáticamente la transacción con tipo, origen, contraparte, nota e instancia;
- módulos legacy de juegos, RPG, minería, profesiones, waifus y economía avanzada publican metadata al ledger global;
- los movimientos sin metadata quedan marcados como `automatic_guard`, nunca invisibles;
- nueva sección Owner-only `Economía` en Operations Center;
- filtros por usuario, tipo, origen y periodo;
- resumen de créditos, débitos, neto, total y movimientos sin atribuir;
- tabla con saldo antes/después, deltas, instancia y transaction_id;
- smoke ejecutable E9 integrado al CI.

Cierre:

- Typecheck y Build en verde;
- smoke E9 de ledger y ranking público en verde;
- auditoría ES/EN e i18n boundary en verde;
- Atomic wallet multi-process en verde tras hacer idempotente la inicialización concurrente de triggers;
- Global wallet migration, Banking V10, V4 persistence y V5 compatibility en verde;
- Windows installer y suite completa de regresiones en verde;
- CI principal #2806: success sobre `373f552ff59a8731ba53b6df25d1684747bb3f70`;
- top público de comandos rediseñado a filas compactas en dos columnas, con descripción de una línea y métricas condensadas.


## E10. Logs en tiempo real

Estado: TERMINADO

Filtros:

- todos;
- WhatsApp;
- Discord;
- Telegram;
- errores;
- downloads;
- API;
- comandos.

Sanitizar antes de mostrar:

- tokens;
- API keys;
- cookies;
- credenciales;
- session IDs.

Implementación E10:

- `ops_runtime_logs` ampliado con categoría indexada y migración compatible con instalaciones existentes;
- backfill automático de categorías para logs históricos durante la migración;
- sanitización antes de persistir: secrets configurados, Bearer/Basic, query tokens, API keys, passwords, cookies, session IDs y JWT;
- segunda sanitización defensiva al leer desde Web, incluyendo valores exactos de secrets configurados;
- retención limitada a 72 horas y máximo 1,000 eventos por instancia;
- stream incremental por ID mediante `/api/ops/logs`, sin cache y con aislamiento de sesión;
- endpoint protegido por permisos y 2FA/MFA completado;
- polling live cada 3 segundos, con pausa manual y pausa automática cuando la pestaña no está visible;
- filtros Todos, WhatsApp, Discord, Telegram, Errores, Downloads, API y Comandos;
- filtro adicional por nivel y búsqueda por fuente/evento;
- contadores de eventos, errores, warnings, comandos, API y downloads de la última hora;
- comandos registran únicamente nombre, resultado y duración; no se conserva texto ni argumentos del usuario;
- providers registran nombre, latencia y código de error sanitizado;
- sección `Logs` para Owner/Admin/Support y portal de subbot;
- Owner puede cambiar de instancia; Admin/Support quedan en MainBot; un subbot sólo consulta su propia instancia;
- smoke dedicado E10 integrado al CI.

Cierre:

- Typecheck y Build en verde;
- E1 y E2 actualizados y en verde conservando navegación/diagnóstico aislados;
- smoke E10 en verde con migración de schema antiguo, backfill de categoría y pruebas reales de redacción de secretos;
- API live con permiso `logs:view`, aislamiento por instancia y MFA obligatorio;
- auditoría ES/EN e i18n boundary en verde;
- Atomic wallet multi-process, Global wallet migration, Banking V10, V4 persistence y V5 compatibility en verde;
- Windows installer y suite completa de regresiones en verde;
- CI principal #2831: success sobre `098d691deb9e42be5a4604adceb9a6d395524201`.

## E11. Jobs activos

Estado: TERMINADO

Mostrar trabajos como:

- yt-dlp;
- FFmpeg;
- downloads;
- broadcasts;
- IA;
- actualizaciones.

Estados:

- waiting;
- running;
- completed;
- failed;
- cancelled.

Acciones:

- cancelar;
- reintentar;
- ver error.

Implementación E11:

- registro persistente `ops_jobs` aislado por `instance_key`;
- requests de control `ops_job_requests` para cancelar/reintentar desde Web sin ejecutar acciones en el proceso de Next.js;
- estados waiting/running/completed/failed/cancelled, progreso 0-100, timestamps, origen, detalle y error sanitizado;
- retención máxima de 7 días y 500 jobs por instancia;
- jobs activos antiguos se marcan como fallidos después de un reinicio/stale timeout;
- yt-dlp y FFmpeg se registran como procesos cancelables reales;
- generaciones Ollama se registran desde la cola y pueden abortarse;
- downloads de comandos se muestran como jobs padre con progreso por etapa;
- broadcasts reportan progreso y pueden detener el envío a los grupos restantes;
- solicitudes de actualización segura se registran y son reintentables;
- sección `Jobs` en Admin y Subbot con filtros por estado/tipo, búsqueda, progreso, error y auto-refresh;
- Cancelar/Reintentar sólo se muestran cuando el job declara la capacidad correspondiente;
- permisos `jobs:view` / `jobs:manage`, CSRF, MFA general del panel y aislamiento MainBot/subbots;
- limpieza de jobs al eliminar permanentemente un subbot;
- auditoría administrativa por `jobId`;
- smoke ejecutable E11 integrado al CI.

Cierre:

- Typecheck y Build en verde;
- smoke E11 ejecutable en verde para creación, progreso, cancelación, reintento y sanitización;
- yt-dlp, FFmpeg, Ollama, downloads, broadcasts y solicitudes de update instrumentados;
- E1/E2 siguen en verde con navegación aislada de Jobs;
- acceso adulto regular corregido: `dick`, `fuck`, `cum`, `preñar` y comandos equivalentes ya no heredan una restricción Owner/Staff accidental;
- `adultmode` queda como autoridad del grupo y `adult18 accept` mantiene la confirmación de mayoría de edad;
- smoke de acceso adulto para usuario normal en verde, preservando restricciones Owner-only de categorías no adultas;
- auditoría ES/EN e i18n boundary en verde;
- Atomic wallet multi-process, Global wallet migration, Banking V10, V4 persistence y V5 compatibility en verde;
- Windows installer y suite completa de regresiones en verde;
- CI principal #2866: success sobre `aa4c4b6dedb4c1f20d63119816874372ef2fdd8a`.

## E12. Actualizaciones desde Dashboard

Estado: PENDIENTE

Mostrar:

- versión instalada;
- commit actual;
- rama;
- nueva versión;
- changelog;
- estado del update.

Progreso:

Fetch → Dependencies → Build → Migration → Restart → Healthcheck.

Nunca ocultar el error real al owner.

## E13. Backups mejorados

Estado: PENDIENTE

Añadir:

- backups automáticos;
- retención;
- tamaño;
- hash;
- descarga;
- restauración;
- verificación previa;
- restore de prueba.

Backups por tipo:

- economía;
- configuración;
- subbots;
- sesiones;
- grupos;
- completo.

## E14. Diseño visual

Estado: PENDIENTE

Mantener el tema oscuro pero acercarlo a un producto terminado.

Priorizar:

- cards limpias;
- sidebar;
- status pills;
- gráficas;
- skeleton loading;
- empty states;
- modales;
- toasts;
- command palette;
- responsive móvil.

Reducir textos internos y técnicos en vistas de administración normal.

---

# FASE F — Observabilidad, métricas y operación

Estado: PENDIENTE

## Objetivo

Tener visibilidad suficiente para saber por qué una función falla o se vuelve lenta antes de que afecte significativamente a los usuarios.

## F1. PlatformRuntimeRegistry

Estado: PENDIENTE

Estado uniforme de todas las plataformas.

Debe poder representar, como mínimo:

WhatsApp:
- state;
- latency;
- events.

Discord:
- state;
- latency;
- guilds.

Telegram:
- state;
- latency;
- events.

## F2. Métricas de colas

Estado: PENDIENTE

Medir:

- queue depth;
- wait time;
- execution time;
- retries;
- failures;
- saturation.

Separar por:

- plataforma;
- provider;
- command;
- download;
- IA.

## F3. Métricas de adapters

Estado: PENDIENTE

Registrar:

- mensajes enviados;
- mensajes fallidos;
- retries;
- edit failures;
- typing failures;
- upload bytes;
- latency;
- rate limits.

## F4. Correlation IDs

Estado: PENDIENTE

Cada mensaje y comando debe recibir un identificador de correlación que viaje por:

ingest → router → command → provider → media → outbox → adapter.

Así se podrá reconstruir un fallo completo sin exponer datos sensibles.

## F5. Alertas operativas

Estado: PENDIENTE

Generar alertas cuando ocurra, por ejemplo:

- demasiados 429;
- provider offline;
- Discord Gateway reconectando repetidamente;
- WhatsApp desconectado;
- cola saturada;
- FFmpeg o yt-dlp fallando;
- DB locked;
- latencia crítica;
- disco bajo;
- memoria alta.

## F6. Error grouping

Estado: PENDIENTE

Agrupar errores repetidos por fingerprint para evitar miles de entradas iguales.

Mostrar:

- primera aparición;
- última aparición;
- cantidad;
- plataforma;
- comando o provider;
- muestra sanitizada.

---

# Mejoras específicas que no deben perderse

Estas tareas están incluidas dentro de las fases anteriores:

1. Login público minimalista.
2. No exponer el mecanismo admin/subbot en la pantalla de acceso.
3. Rate limiting de autenticación.
4. CSRF y Origin.
5. 2FA administrativo.
6. Sesiones revocables.
7. Reautenticación de acciones críticas.
8. Eliminar progresivamente socket y message de comandos compartidos.
9. Command Engine único.
10. Metadata central de comandos.
11. Slash commands Discord generados.
12. Aliases centralizados.
13. Menús y ayuda centralizados.
14. Eliminar activeUserId mutable del adapter WhatsApp.
15. Caché por chatId:messageId con TTL y LRU.
16. Cola por grupo, usuario y provider.
17. Outbox fiable.
18. Fallback automático de UI.
19. Component IDs de Discord persistentes.
20. Media streaming Discord.
21. Rate limit por buckets Discord.
22. Estado uniforme de plataformas.
23. Sidebar y dashboard reorganizado.
24. Pantalla Plataformas.
25. Dashboard Providers.
26. Centro de comandos.
27. Editor de comandos.
28. Vista detallada por grupo.
29. Dashboard de usuarios.
30. Ledger económico.
31. Logs en tiempo real sanitizados.
32. Jobs activos.
33. Actualizaciones desde Web.
34. Backups mejorados.
35. Observabilidad y tracing.

---

# Registro de avance

| Fecha | Fase | Cambio | Estado | PR/Commit |
|---|---|---|---|---|
| 2026-09-18 | Plan general | Se crea este roadmap de próximas integraciones | TERMINADO | — |
| 2026-09-18 | Fase A | Login, roles, sesiones, Passkeys, TOTP y seguridad Web | TERMINADO | PR #75 · c01c0ee61726fd4325a6fc60bd62108a880684e4 |
| — | Fase B | Núcleo multiplataforma | PENDIENTE | — |
| — | Fase C | Paridad Discord y Telegram | PENDIENTE | — |
| — | Fase D | Runtime WhatsApp | PENDIENTE | — |
| 2026-09-18 | Fase E | Dashboard Web V2 · inventario de grupos por plataforma | EN PROGRESO | feat/phase-e-platform-groups-dashboard |
| 2026-09-19 | Fase E6 | Editor de configuración de comandos | TERMINADO | 8016ab107ff272bea9c80c4684023a5bcb128760 |
| 2026-09-19 | Fase E7 | Vista detallada y controles seguros de grupos | TERMINADO | 690415c9a418681173345d0e1ebe2013b3ae3237 |
| 2026-09-19 | Fase E8 | Dashboard de usuarios por instancia y permisos | TERMINADO | d8ae811b618f6c32537bcff4cfbb9d3db36d7e36 |
| 2026-09-19 | Fase E9 | Ledger económico auditable y ranking público compacto | TERMINADO | 373f552ff59a8731ba53b6df25d1684747bb3f70 |
| 2026-09-19 | Fase E10 | Logs en tiempo real sanitizados y aislados por instancia | TERMINADO | 098d691deb9e42be5a4604adceb9a6d395524201 |
| 2026-09-19 | Fase E11 | Jobs activos, cancelación/reintento y acceso adulto regular corregido | TERMINADO | aa4c4b6dedb4c1f20d63119816874372ef2fdd8a |
| — | Fase F | Observabilidad | PENDIENTE | — |

---

# Próximo paso

La siguiente tarea oficial dentro de **FASE E — Dashboard Web V2** es **E12 · Actualizaciones desde Dashboard**.

Prioridad inmediata:

1. mostrar versión instalada, commit actual y rama;
2. detectar y mostrar una nueva versión disponible y su changelog;
3. reflejar el estado real del update dentro del Dashboard;
4. modelar el progreso Fetch → Dependencies → Build → Migration → Restart → Healthcheck;
5. enlazar el progreso con los jobs de actualización creados en E11;
6. mostrar al Owner el error real sanitizado cuando una etapa falle, sin sustituirlo por mensajes genéricos.

Las fases B, C y D quedan pospuestas hasta nueva indicación.

La Fase A quedó terminada y fusionada a `main` mediante PR #75.

Resultados principales de Fase A:

- login público minimalista;
- Owner, Admin, Support y Subbot Owner;
- permisos aplicados en backend;
- aislamiento estricto de subbots;
- sesiones revocables;
- rate limiting de autenticación;
- validación Origin + CSRF;
- Passkeys/WebAuthn con huella, rostro, PIN o Windows Hello según el dispositivo;
- TOTP cifrado con AES-256-GCM;
- 2FA configurable por Owner;
- reautenticación para acciones críticas;
- panel privado de seguridad;
- CI, typecheck, build y smoke de Fase A en verde.

No iniciar la Fase C hasta dejar la Fase B validada y registrada aquí como TERMINADO.
