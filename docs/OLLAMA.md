# Ollama + Qwen · Ghost Nexora Bot

Ghost Nexora Bot puede utilizar **Ollama** como motor LLM generativo local. Es una capacidad **opcional**: el bot no necesita Ollama para WhatsApp, economía, juegos, grupos, descargas, subbots ni el resto de funciones normales.

La integración utiliza la API HTTP local de Ollama y puede combinar Qwen con la memoria Mini-LLM/RAG del proyecto.

> [!IMPORTANT]
> Si Ollama no está habilitado **o el ejecutable `ollama` no existe realmente en el sistema**, Ghost Nexora Bot no registra ni muestra los comandos locales de LLM, Ollama ni free-chat.

---

## Instalación nueva en VPS

El instalador principal pregunta durante la **primera instalación**:

```text
Ollama es OPCIONAL y consume RAM, almacenamiento y CPU.
Modelo recomendado: qwen2.5:1.5b
¿Instalar Ollama + Qwen para LLM local? [s/N]:
```

Instalación estándar:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

### Si respondes No

El instalador configura:

```dotenv
OLLAMA_ENABLED=false
```

No instala Ollama, no descarga Qwen, no inicia el worker LLM y el bot no registra:

```text
.llm
.minillm
.localai
.corpus
.llmcorpus
.autochat
```

También quedan fuera sus aliases y el modo libre local.

### Si respondes Sí

El instalador:

1. instala Ollama mediante el instalador oficial si hace falta;
2. habilita/inicia `ollama.service` cuando está disponible;
3. espera a `http://127.0.0.1:11434/api/tags`;
4. descarga y verifica `qwen2.5:1.5b` por defecto;
5. configura `OLLAMA_ENABLED=true`;
6. instala/habilita `ghost-nexora-llm.service`;
7. permite que el router registre los comandos locales LLM.

Si cualquier paso de instalación de Ollama falla, Ghost Nexora continúa instalándose con el LLM local deshabilitado.

---

## Instalación no interactiva

### Sin Ollama

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo env INSTALL_OLLAMA=no bash
```

### Con Ollama + Qwen

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo env INSTALL_OLLAMA=yes OLLAMA_MODEL=qwen2.5:1.5b bash
```

---

## Instalación manual posterior

Si inicialmente elegiste no instalar Ollama y luego cambias de decisión:

```bash
cd /opt/ghost-nexora-bot
sudo ./scripts/install-ollama.sh qwen2.5:1.5b
sudo sed -i 's/^OLLAMA_ENABLED=.*/OLLAMA_ENABLED=true/' .env
sudo ./scripts/install-llm-worker-service.sh
sudo systemctl restart ghost-nexora-bot
```

Comprobar:

```bash
ollama list
systemctl is-active ollama
systemctl is-active ghost-nexora-llm
curl -fsS http://127.0.0.1:11434/api/tags
```

> [!NOTE]
> El runtime verifica también que el ejecutable `ollama` exista. Un `.env` antiguo con `OLLAMA_ENABLED=true` no basta por sí solo para exponer los comandos locales.

---

## Windows

El instalador nativo de Windows aplica la misma política opcional:

```powershell
irm https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 | iex
```

Durante la primera instalación pregunta si deseas instalar Ollama + Qwen. Si lo aceptas, utiliza WinGet y descarga el modelo indicado. Si lo rechazas, el bot funciona sin el stack local LLM.

Guía completa: [`WINDOWS_INSTALL.md`](WINDOWS_INSTALL.md).

---

## Termux Lite

**Termux Lite nunca habilita Ollama.** Incluso si un `.env` antiguo contiene `OLLAMA_ENABLED=true`, el perfil `termux-lite` lo fuerza a `false` y su registro de comandos excluye todo el stack LLM local.

Guía: [`TERMUX_LITE.md`](TERMUX_LITE.md).

---

## IA HTTP independiente

Los comandos:

```text
.ai
.investiga
```

pertenecen al proveedor de IA HTTP configurado por el servidor y **no dependen de Ollama**. Por ello pueden seguir disponibles aunque el LLM local esté deshabilitado.

---

## Configuración `.env`

Configuración recomendada cuando Ollama está activado:

```dotenv
OLLAMA_ENABLED=true
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TIMEOUT_MS=360000
OLLAMA_QUEUE_WAIT_MS=360000
OLLAMA_MAX_QUEUE=8
OLLAMA_KEEP_ALIVE=30m
OLLAMA_NUM_PREDICT=768
OLLAMA_TEMPERATURE=0.65
OLLAMA_TOP_P=0.9
OLLAMA_MAX_HISTORY=10
BOT_MESSAGE_TIMEOUT_MS=900000
```

`BOT_MESSAGE_TIMEOUT_MS=900000` permite hasta 15 minutos para el procesamiento completo de un mensaje. `OLLAMA_KEEP_ALIVE=30m` mantiene el modelo cargado durante 30 minutos después de una consulta y `OLLAMA_NUM_PREDICT=768` deja margen para respuestas extensas.

---

## Comandos locales cuando Ollama está disponible

```text
.llm status
.llm ollama status
.llm ollama on
.llm ollama off
.llm free on
.llm free off
.llm ask <pregunta>
.llm search <consulta>
.llm memory
```

La administración de `.llm` está restringida a Owner/Staff. El modo libre mantiene controles de mención en grupos, cooldown, anti-spam, whitelist y reacciones.

---

## Flujo RAG local

```text
WhatsApp
   │
   ▼
Baileys
   │
   ▼
Mini-LLM / memoria vectorial
   │
   ├── búsqueda de contexto local
   └── deduplicación SHA-256
   │
   ▼
Cola de inferencia
   │
   ▼
Ollama + Qwen
   │
   ▼
Respuesta a WhatsApp
```

La cola serializa inferencias para evitar que múltiples chats saturen una VPS CPU-only. Los fragmentos RAG recuperados se entregan como contexto factual y no como instrucciones.

---

## Deduplicación del corpus

Cada chunk normalizado se identifica mediante SHA-256. Ejecutar repetidamente:

```text
.llm memory
.llm memory
```

no debe multiplicar indefinidamente los mismos vectores. La reingesta también compacta duplicados históricos.

---

## Actualizaciones

Usa el actualizador oficial:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

El actualizador respeta `OLLAMA_ENABLED`:

- si está deshabilitado, no crea ni arranca el worker LLM;
- si existe un worker antiguo, lo detiene y deshabilita;
- si está habilitado pero falta el ejecutable `ollama`, cambia la configuración a `false`;
- si hay entrenamiento activo, evita reiniciar el worker para preservar el progreso.

---

## Rendimiento

`qwen2.5:1.5b` es el modelo predeterminado porque reduce la huella de memoria respecto a modelos más grandes. El rendimiento real depende de CPU, RAM, almacenamiento, concurrencia, longitud del historial y tamaño de respuesta.

Para servidores con más recursos puedes cambiar `OLLAMA_MODEL`, pero el operador es responsable de dimensionar memoria y CPU adecuadamente.
