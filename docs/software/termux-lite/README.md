# Ghost Nexora — Termux Lite

## Estado actual

**Implementado con alcance Lite.** Existe un runtime separado (`termux-lite.ts`), build `dist-termux`, `tsconfig.termux.json`, instalador, actualizador, gestor `ghostnexora` y smoke test dedicado.

El perfil Lite deshabilita deliberadamente Ollama/LLM local, dashboard Web, Nginx/systemd y componentes pesados. Esa reducción es parte del producto, no una carencia accidental.

## Objetivo V2

Mantener una edición capaz de ejecutar Ghost Nexora directamente en Termux con consumo y dependencias reducidos, preservando:

- WhatsApp/Baileys;
- pairing;
- comandos compatibles;
- economía;
- juegos ligeros;
- moderación;
- subbots dentro de límites razonables;
- descargas compatibles con las herramientas instaladas;
- i18n;
- persistencia y actualización segura.

## Fuera del alcance Lite

Por defecto:

```text
Ollama/Qwen        OFF
LLM local/RAG      OFF
Next.js dashboard  OFF
Nginx              OFF
systemd            OFF
Playwright pesado  OFF
```

Los menús no deben mostrar comandos cuya dependencia fue eliminada por el perfil.

## Runtime

```text
NEXORA_RUNTIME_PROFILE=termux-lite
apps/bot/dist-termux/termux-lite.js
apps/bot/dist-termux/pair.js
```

El build Lite debe seguir siendo explícito y no depender de haber compilado primero el runtime Full.

## Instalación

El instalador debe:

1. validar que corre dentro de Termux;
2. actualizar paquetes requeridos sin destruir configuración;
3. instalar Node compatible, Git, FFmpeg y herramientas realmente necesarias;
4. clonar/actualizar el repositorio;
5. crear datos persistentes fuera de rutas efímeras;
6. generar `.env` Lite;
7. forzar `OLLAMA_ENABLED=false`;
8. compilar `dist-termux`;
9. instalar el gestor;
10. ejecutar pairing de forma opcional;
11. iniciar el bot y mostrar health legible.

## Gestor

Comandos objetivo:

```text
ghostnexora start
ghostnexora stop
ghostnexora restart
ghostnexora status
ghostnexora logs
ghostnexora pair
ghostnexora update
ghostnexora doctor
ghostnexora backup
ghostnexora restore
```

No depender de systemd. El gestor debe usar PID/lockfile robustos y detectar procesos obsoletos.

## Persistencia

Nunca guardar la sesión únicamente dentro del checkout Git.

Objetivo:

```text
$HOME/.local/share/ghost-nexora-bot/
  session/
  data/
  subbots/
  logs/
  run/
  backups/
```

La ruta exacta puede conservar compatibilidad con la instalación actual, pero código y estado deben continuar separados.

## Optimización

V2 debe medir, no solo afirmar que es ligero.

Publicar en el release candidate:

| Métrica | Idle | Uso normal | Pico controlado |
|---|---:|---:|---:|
| RSS MainBot | medir | medir | medir |
| CPU | medir | medir | medir |
| almacenamiento inicial | medir | — | — |
| almacenamiento con assets | medir | — | — |
| tiempo de arranque | medir | — | — |

Acciones técnicas:

- lazy imports para módulos opcionales;
- no cargar assets grandes hasta usarlos;
- limitar caches;
- limpieza de temporales;
- concurrencia de descarga restringida;
- límites por subbot;
- evitar browsers headless en Lite.

## Compatibilidad Android

Matriz mínima:

```text
Android 12
Android 13
Android 14
Android 15
Android 16
arm64-v8a
```

Probar Termux estable actual y documentar cualquier paquete que no esté disponible en todas las arquitecturas.

## Doze y 24/7

Termux no puede garantizar por sí mismo ejecución perpetua bajo todas las políticas OEM. La documentación debe explicar:

- wakelock cuando proceda;
- exclusión de optimización de batería como recomendación del usuario, no bypass;
- recuperación después de pérdida de red;
- reanudación después de matar/reabrir Termux;
- limitaciones de fabricantes agresivos.

No prometer disponibilidad 24/7 absoluta en un teléfono; sí garantizar que el runtime intenta reconectar y recuperarse correctamente.

## Actualizaciones

`update-termux.sh` debe ser idempotente:

- preflight;
- backup de `.env`/estado crítico;
- fast-forward controlado;
- npm install/build;
- smoke Lite;
- restart;
- health;
- rollback si la nueva build no inicia.

## CI

Mantener el build/smoke actual y añadir:

```text
termux-dependency-audit
termux-no-heavy-imports
termux-command-registry
termux-update-fixture
termux-process-manager-smoke
termux-memory-budget-report
```

## Definition of Done V2

- instalación limpia reproducible;
- actualización conserva sesión/config;
- perfil no expone Ollama/Web por error;
- MainBot inicia con build Lite independiente;
- reconnect probado;
- métricas reales publicadas;
- matriz Android/arm64 documentada;
- fallos muestran mensajes accionables sin stack traces al usuario final.

La aplicación Android oficial es un producto distinto; ver [Android](../android/README.md).
