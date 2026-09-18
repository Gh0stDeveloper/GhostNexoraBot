# Ghost Nexora Bot — Próximas integraciones y mejoras

> Documento de seguimiento oficial
>
> Estado general: EN PROGRESO
>
> Última actualización: 2026-09-18
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
| Fase B | Núcleo multiplataforma compartido | PENDIENTE |
| Fase C | Paridad Discord y Telegram | PENDIENTE |
| Fase D | Runtime y entrega WhatsApp | PENDIENTE |
| Fase E | Dashboard Web V2 | PENDIENTE |
| Fase F | Observabilidad, métricas y operación | PENDIENTE |

El orden debe respetarse salvo que aparezca una corrección crítica de producción.

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

Estado: PENDIENTE

## Objetivo

Convertir Operations Center en un dashboard de producto más ordenado y menos dependiente de vistas técnicas.

## E1. Navegación lateral

Estado: PENDIENTE

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

## E2. Separar información operativa de diagnóstico

Estado: PENDIENTE

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

## E3. Pantalla Plataformas

Estado: PENDIENTE

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

## E4. Dashboard de Providers y APIs

Estado: PENDIENTE

Mostrar:

- LemPi;
- Spotify;
- Jikan;
- Anime1v;
- OpenRouter;
- otros providers.

Datos:

- online, degraded, offline;
- requests;
- success rate;
- errores;
- latencia media;
- última latencia;
- último éxito;
- último fallo;
- último error;
- circuit breaker.

## E5. Centro de comandos

Estado: PENDIENTE

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

## E6. Editor de configuración de comandos

Estado: PENDIENTE

Configurar desde Web:

- habilitado o deshabilitado;
- plataforma;
- cooldown;
- grupos;
- privado;
- categorías;
- permisos.

Debe respetar aislamiento entre MainBot y subbots.

## E7. Vista detallada de grupo

Estado: PENDIENTE

Ruta conceptual: /admin/groups/<id>.

Mostrar:

- nombre;
- JID;
- foto;
- miembros;
- admins;
- bot admin;
- actividad;
- mensajes 24h;
- comandos;
- idioma;
- adult mode;
- bienvenida y despedida;
- anti-link;
- anti-spam;
- restricted mode;
- mute;
- configuración.

Acciones seguras:

- abrir o cerrar;
- silenciar;
- configurar;
- broadcast;
- salir.

## E8. Dashboard de usuarios

Estado: PENDIENTE

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

## E9. Ledger de economía

Estado: PENDIENTE

Añadir un libro contable de movimientos.

Modelo conceptual:

- transaction_id;
- user;
- type;
- amount;
- balance_before;
- balance_after;
- source;
- timestamp.

Ejemplos:

- +95 NXC por work;
- -500 NXC por shop;
- +200 NXC por admin_credit;
- -10 NXC por game.

Objetivo: poder auditar siempre de dónde salió o a dónde fue cada cambio de saldo.

## E10. Logs en tiempo real

Estado: PENDIENTE

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

## E11. Jobs activos

Estado: PENDIENTE

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
| — | Fase E | Dashboard Web V2 | PENDIENTE | — |
| — | Fase F | Observabilidad | PENDIENTE | — |

---

# Próximo paso

La siguiente tarea oficial es **FASE B — Núcleo multiplataforma compartido**.

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
