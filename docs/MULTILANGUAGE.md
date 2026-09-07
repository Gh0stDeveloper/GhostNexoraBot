# Ghost Nexora Bot · Multilenguaje

Ghost Nexora Bot soporta inicialmente **Español (`es`)** e **Inglés (`en`)**.

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

La separación está preparada para que una fase posterior añada una capa de personalidad por estilo/waifu sin acoplarla al idioma. El idioma (`es`, `en`, etc.) y la personalidad (`default`, futura `megumin`, `rem`, etc.) deben permanecer como ejes independientes.

## Uso desde comandos

Todos los `CommandContext` nuevos incluyen:

```ts
ctx.locale
ctx.t('clave', { valor: '...' })
```

Los módulos nuevos o modificados deben colocar su texto de interfaz en los catálogos y usar `ctx.t(...)`; no deben añadir nuevas frases de UI inline si pueden evitarlo.

El router, menú efectivo, permisos, errores, bienvenida/despedida, moderación y prompts de IA ya usan claves explícitas.

## Compatibilidad con comandos heredados

El bot incluye una capa de compatibilidad para comandos anteriores que todavía construyen algunos textos inline:

- `ctx.reply` pasa por el locale efectivo.
- `ctx.socket.sendMessage` usa un proxy localizado para `text`, `caption`, títulos y descripciones.
- carruseles, botones y selectores se localizan antes del relay.
- los bloques Markdown ` ```...``` ` se protegen y nunca se traducen, evitando modificar código solicitado por el usuario.

Esta compatibilidad permite migrar módulos heredados gradualmente sin romper comandos existentes. Para código nuevo, la fuente de verdad debe seguir siendo el catálogo por idioma.

## IA

OpenRouter/Ollama/auto-chat reciben una instrucción explícita basada en el idioma efectivo del chat:

- grupo `en` → respuesta en inglés;
- grupo `es` → respuesta en español;
- privado → idioma global de la instancia.

Las respuestas coloquiales rápidas escritas específicamente en español se desactivan en chats ingleses y se delegan al LLM para impedir fugas de idioma.

## Añadir otro idioma

Cuando se añada un idioma nuevo:

1. Añadir su código en `SUPPORTED_LOCALES`.
2. Crear `locales/<idioma>/default.ts`.
3. Crear `locales/<idioma>/system.ts`.
4. Mantener exactamente las mismas claves que los catálogos existentes.
5. Añadir el nombre del idioma (`language.name.<codigo>`).
6. Extender el smoke de i18n.

El CI compara las claves de español e inglés y comprueba persistencia global, override por grupo, herencia y protección de bloques de código.
