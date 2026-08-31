# 🧠 Ollama + Ghost Nexora Bot

Integra un modelo **rápido y local** (Ollama) para el modo libre del bot, usando tu memoria/documentos como **RAG** (no hace falta “entrenar desde cero” el modelo grande).

## VPS recomendada (12 GB RAM)

| Modelo | RAM aprox. | Velocidad | Uso |
|--------|------------|-----------|-----|
| **`qwen2.5:1.5b`** (default) | ~2–3 GB | Muy rápida | Charla diaria |
| `llama3.2:3b` | ~3–4 GB | Rápida | Mejor calidad |
| `qwen2.5:3b` | ~3–4 GB | Rápida | Alternativa |

Con **12 GB RAM** y el bot + LLM worker, **1.5B–3B** es el punto ideal. Evita 7B+ en CPU si quieres respuestas de 1–3 s.

## Instalar Ollama (Ubuntu)

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull qwen2.5:1.5b
# opcional: ollama pull llama3.2:3b
```

Comprueba:

```bash
curl -s http://127.0.0.1:11434/api/tags
ollama run qwen2.5:1.5b "hola, responde en una frase"
```

## Variables `.env`

```env
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_TIMEOUT_MS=25000
```

Reinicia el bot:

```bash
sudo systemctl restart ghost-nexora-bot
```

## Comandos WhatsApp (owner/staff)

```text
.llm ollama status
.llm ollama on
.llm ollama off
.llm ollama model qwen2.5:1.5b
.llm ollama model llama3.2:3b
.llm free on
.llm free global on
.llm memory
```

## ¿Se puede entrenar Ollama?

- **Fine-tune real** (modificar pesos) en VPS CPU/12 GB: **no práctico**.
- Lo que sí funciona (y ya usa el bot):
  1. **Documentos / seeds** → `.llm add` + `.llm memory` → vectores en `corpus.bin`
  2. Ollama recibe **contexto del chat + trozos de memoria** (RAG)
  3. Responde en español con ese contexto

Así “aprende” de tus textos **sin reentrenar** el modelo base.

## Acciones del agente libre

Con modo libre activo, el bot puede:

| Acción | Cómo |
|--------|------|
| Charlar | Ollama o fallback Mini-LLM |
| Reaccionar | Emoji automático o si pides “reacciona” |
| Sticker | “manda un sticker” o triggers de `.botsticker` |
| Expulsar | Admin: “expulsa a @user” (mención o respuesta) |

El bot debe ser **admin del grupo** para kick.

## Fallback

Si Ollama está apagado o caído, el bot usa el **Mini-LLM local** (pares + vectores) automáticamente.
