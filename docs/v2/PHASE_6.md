# V2 · Fase 6 — multi-lenguaje completo

## Estado

La Fase 6 convierte la localización ES/EN en una propiedad del runtime multiplataforma, no en una sustitución específica de WhatsApp.

El contrato efectivo de idioma es:

```text
preferencia de usuario
        ↓
preferencia de chat/grupo
        ↓
preferencia del bot/plataforma
        ↓
idioma informado por el cliente
        ↓
idioma global
        ↓
es
```

Las preferencias explícitas se guardan con namespace:

```text
platform + botInstanceId + scope + scopeId
```

Esto evita que MainBot, un subbot, Telegram o Discord compartan preferencias accidentalmente.

## Locales soportados

Catálogos oficiales de la Fase 6:

- `es`
- `en`

Se normalizan tags regionales, entre otros:

- `es-MX`, `es-419` -> `es`
- `en-US`, `en-GB` -> `en`

Un tag no soportado continúa por la cadena de fallback y termina en `es` si no existe otra preferencia.

## Persistencia

`apps/bot/src/i18n/preferences.ts` mantiene `i18n_preferences` dentro de la base de datos del runtime.

La clave primaria contiene:

- plataforma;
- instancia del bot;
- scope (`user`, `chat`, `bot`);
- identificador del scope.

La tabla histórica `community_group_settings.language` se conserva únicamente como fallback de compatibilidad para grupos WhatsApp existentes. Los cambios nuevos de chat/grupo se escriben en el namespace V2.

## WhatsApp

El router resuelve idioma con `chatId + sender + botInstanceId` antes de construir `CommandContext`.

La misma decisión se propaga mediante el socket localizado hasta:

- `ctx.reply`;
- `PlatformAdapter.sendText`;
- media/captions;
- edición;
- tarjetas;
- select-first;
- carruseles compatibles;
- fallbacks de texto;
- comandos legacy que todavía utilizan el puente `ctx.socket`.

El adapter conserva el sender activo del mensaje normalizado y no vuelve a resolver el idioma como si todas las respuestas pertenecieran a MainBot.

`.language` mantiene compatibilidad con aliases existentes y añade scopes personales/plataforma:

```text
.language
.language es|en|inherit
.language user es|en|inherit
.language group es|en|inherit
.language bot es|en|inherit
.language global es|en
```

En privado, el shorthand modifica la preferencia personal del usuario. En grupo modifica el chat. El cambio global continúa restringido a owner/staff autorizado.

## Telegram

Telegram usa `TelegramUser.language_code` como señal del cliente cuando no existe una preferencia explícita.

`/language` permite:

- preferencia personal;
- preferencia del chat;
- preferencia del runtime Telegram.

Help, runtime info, providers Phase 3, errores públicos, progreso y UI pasan por claves ES/EN.

## Discord

Discord usa:

- `interaction.locale`;
- `interaction.guild_locale` cuando corresponde.

Las respuestas usan el mismo resolver V2 y los application commands incluyen `description_localizations` para que el selector nativo de slash commands también muestre descripciones localizadas.

`/language` soporta los mismos scopes de usuario/chat/plataforma que Telegram.

## Web

`apps/web/lib/i18n.ts` contiene el catálogo Web tipado ES/EN.

La resolución inicial usa:

1. cookie `gnb_locale`;
2. `Accept-Language`;
3. `es`.

El selector global persiste `gnb_locale` durante un año y refresca los Server Components.

Superficies migradas:

- metadata/SEO;
- landing;
- Quick Start;
- login;
- administración;
- portal de subbot;
- Operations Center;
- auditor de comandos;
- auto-refresh y confirmaciones;
- navegador Web;
- tarjetas y modal de código.

Los formatos de fecha/número usan `es-MX` o `en-US` según el locale efectivo.

## Catálogos y paridad

El runtime del bot combina los módulos `default`, `system`, `platform` y `phase6` para ES/EN.

`assertCatalogParity()` es bloqueante: ninguna clave puede existir solo en un idioma.

El catálogo Web se valida de forma equivalente y TypeScript mantiene las claves sincronizadas.

## Auditoría: frontera vs. deuda histórica

El repositorio contiene una gran cantidad de strings heredadas de V1 dentro de handlers WhatsApp. Muchas no son rutas sin localización: pasan por `LocalizedSocket`/`WhatsAppAdapter` y por la capa de compatibilidad existente.

Por ello Fase 6 mantiene dos métricas distintas:

1. **Frontera i18n — bloqueante.** Toda salida soportada debe atravesar una frontera que conoce plataforma, instancia y locale. Telegram, Discord y Web no pueden reintroducir UI española directa en las superficies migradas.
2. **Deuda de literales legacy — informativa y auditable.** `scripts/i18n-user-facing-audit.mjs` continúa generando el inventario completo. No se ocultan ni se reclasifican literales para obtener artificialmente cero.

Los minijuegos/game UI permanecen fuera de la migración multilenguaje por la decisión de alcance ya existente en el proyecto; el auditor conserva esa exclusión explícita.

## Gates

`npm run v2:i18n` ejecuta:

1. build de contratos;
2. build del bot;
3. build Web;
4. reporte de literales user-facing legacy;
5. smoke de paridad, precedencia, persistencia y aislamiento;
6. auditoría bloqueante de fronteras WhatsApp/Telegram/Discord/Web.

`.github/workflows/v2-phase6.yml` ejecuta además:

- typecheck y build global;
- regresión Fases 0–5;
- Termux Lite;
- inventario de comandos;
- fingerprint de superficie WhatsApp;
- artefacto con auditoría Phase 6 + deuda legacy + inventario.

El CI principal también ejecuta los dos gates Phase 6 después del reporte i18n.

## Definition of Done

La Fase 6 se considera cerrada cuando, sobre el mismo HEAD:

- typecheck y build están verdes;
- catálogos bot ES/EN tienen paridad exacta;
- catálogo Web ES/EN tiene paridad exacta;
- precedencia `user > chat > bot > client > global > es` está probada;
- MainBot/subbots y plataformas permanecen aislados;
- WhatsApp mantiene contexto hasta Native Flow/fallback;
- Telegram usa `language_code`;
- Discord usa locale nativo y localizaciones de slash commands;
- Web no contiene literales españoles detectables en las superficies migradas fuera del catálogo;
- Fases 0–5 siguen verdes;
- fingerprint WhatsApp no cambia;
- Termux Lite y CI principal permanecen verdes;
- `.edit` ValleyBot/ValleyInvisible conserva su suite V23.
