# Ghost Nexora Bot · Multilenguaje

Ghost Nexora Bot soporta inicialmente **Español (`es`)** e **Inglés (`en`)**.

## Alcance

El sistema multilenguaje cubre la interfaz general del bot: menús, administración, perfiles, economía, descargas, búsqueda, IA, stickers, waifus, subbots, herramientas, mensajes de sistema, moderación, contenido interactivo no lúdico y demás funciones de uso normal.

El **subsystema de juegos queda excluido intencionalmente** de esta migración. Esto incluye minijuegos, juegos HTML, PvP, casino y RPG/jugabilidad. Sus textos pueden conservarse en su idioma actual y no se contabilizan como pendientes en la auditoría estricta de i18n.

Por tanto, cuando el proyecto indique que la cobertura ES/EN está completa, significa **100% de la interfaz incluida en este alcance, exceptuando juegos por decisión explícita del proyecto**.

## Prioridad de idioma

El idioma efectivo de un chat se resuelve así:

1. Si el chat es un grupo y tiene un idioma configurado, se usa el idioma del grupo.
2. Si el grupo no tiene override, hereda el idioma global de la instancia.
3. En chats privados se usa el idioma global de la instancia.

Cada MainBot/subbot conserva su configuración global dentro de su propio `settings.json`. Los overrides de grupo se almacenan en `community_group_settings.language` y se migran automáticamente en instalaciones antiguas.

## Comandos

Consultar idioma:

```text
.language
.lang
.idioma
```

Cambiar idioma global de la instancia (owner/staff/subbot owner):

```text
.language global es
.language global en
```

En chat privado también puede usarse el atajo:

```text
.language es
.language en
```

Cambiar solo el grupo actual (admin del grupo/staff/owner/subbot owner):

```text
.language group es
.language group en
```

Dentro de un grupo, `.language es` y `.language en` son atajos del override del grupo.

Restaurar herencia del idioma global:

```text
.language group inherit
```

También se aceptan `heredar`, `default`, `global` y `auto`.

## Estructura de archivos

```text
apps/bot/src/i18n/
├── index.ts
├── types.ts
└── locales/
    ├── es/
    │   ├── default.ts
    │   └── system.ts
    └── en/
        ├── default.ts
        └── system.ts
```

`default.ts` representa la voz neutral/default actual del bot. `system.ts` contiene mensajes transversales como UI interactiva, navegador y directivas del asistente.

La separación está preparada para que una fase posterior añada una capa de personalidad por estilo/waifu sin acoplarla al idioma. El idioma (`es`, `en`, etc.) y la personalidad (`default`, futura `megumin`, `rem`, etc.) permanecen como ejes independientes.

## Reglas para textos del bot

Todo texto nuevo incluido en el alcance multilenguaje debe almacenarse en el catálogo correspondiente y resolverse mediante una clave i18n. Las traducciones inglesas son textos estáticos revisados; no deben generarse traduciendo palabra por palabra en tiempo de ejecución.

Los `CommandContext` incluyen:

```ts
ctx.locale
ctx.t('clave', { valor: '...' })
```

Los bloques Markdown ` ```...``` `, URLs, nombres de comandos, identificadores técnicos y datos proporcionados por el usuario no deben traducirse.

La capa heredada de compatibilidad existe únicamente mientras se completa la extracción de módulos antiguos. No es la fuente de verdad del sistema ni sustituye los catálogos estáticos ES/EN.

## IA

OpenRouter/Ollama/auto-chat reciben una instrucción explícita basada en el idioma efectivo del chat:

- grupo `en` → respuesta en inglés;
- grupo `es` → respuesta en español;
- privado → idioma global de la instancia.

Las respuestas de IA deben respetar el idioma efectivo del chat aunque la instancia global tenga otro idioma.

## Auditoría

`scripts/i18n-user-facing-audit.mjs` revisa la interfaz incluida en el alcance y detecta textos visibles que todavía permanecen fuera de los catálogos.

La auditoría excluye deliberadamente el subsystema de juegos. Los archivos mixtos también omiten objetos de comando con `category: 'games'`.

El objetivo final para activar el modo estricto es:

```text
non-game user-facing literals outside locale catalogs = 0
```

## Añadir otro idioma

Cuando se añada un idioma nuevo:

1. Añadir su código en `SUPPORTED_LOCALES`.
2. Crear `locales/<idioma>/default.ts`.
3. Crear `locales/<idioma>/system.ts`.
4. Mantener exactamente las mismas claves que los catálogos existentes.
5. Añadir el nombre del idioma (`language.name.<codigo>`).
6. Extender los smoke tests de i18n.

El CI comprueba paridad entre español e inglés, persistencia global, override por grupo, herencia y protección de bloques de código.
