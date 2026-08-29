# Mini-LLM local V2

Subsistema local de memoria, recuperación y aprendizaje para Ghost Nexora Bot. No depende de una API de IA externa.

## Arquitectura

- Embeddings locales `Float32Array` de 128 dimensiones.
- Atención multi-head de 4 cabezas con Q/K/V, máscara causal, residual y codificación posicional sinusoidal.
- Proyección de salida con cross-entropy, SGD y momentum.
- Vocabulario persistente y tokenizer BPE desde cero para preparar corpus.
- Memoria vectorial binaria persistente `corpus.bin` y pipeline auxiliar `corpus-v2.bin`.
- Lectura local de TXT, PDF y DOCX con `loader.ts`.
- Aprendizaje online a partir de mensajes normales del bot.
- Auto-entrenamiento cada 30 minutos cuando hay al menos 20 mensajes pendientes.
- Progreso persistente en `data/llm/state.json`.

## Archivos del pipeline

- `apps/bot/src/llm/loader.ts` — carga y limpia TXT/PDF/DOCX.
- `apps/bot/src/llm/tokenizer.ts` — BPE desde cero, vocabulario y merges persistentes.
- `apps/bot/src/llm/embedding.ts` — embeddings deterministas de 128 dimensiones.
- `apps/bot/src/llm/vector-store.ts` — almacenamiento binario y similitud coseno.
- `apps/bot/src/llm/train.ts` — prepara el corpus y lanza el entrenamiento V2.
- `apps/bot/src/services/mini-llm-transformer.ts` — motor V2 usado por el bot.

## Comandos de WhatsApp

- `.llm status` / `.llm progress` — estado completo, porcentaje, época, pasos, loss, memoria y arquitectura.
- `.llm docs` — lista de documentos cargados.
- `.llm add` — responde o envía un PDF, DOCX, TXT, MD, JSON o CSV para incorporarlo.
- `.llm import` — lee todos los PDF/DOCX/TXT de `data/llm/corpus`, prepara BPE/embeddings/vector-store y entrena.
- `.llm train` — inicia entrenamiento local en segundo plano.
- `.llm ask <pregunta>` — genera una respuesta corta usando el modelo y contexto recuperado.
- `.llm search <texto>` — busca directamente coincidencias en la memoria vectorial.
- `.llm auto on|off` — activa/desactiva el auto-entrenamiento.

## Preparación desde la VPS

Coloca documentos en `data/llm/corpus/` y ejecuta:

```bash
npm run llm:train
```

También puedes usar `.llm import` desde WhatsApp con permisos de Owner/Staff.

## Almacenamiento

Todo se conserva bajo `data/llm/` y no debe subirse a Git. El modelo V2 usa un encabezado de versión propio para evitar interpretar modelos incompatibles como si fueran actuales.
