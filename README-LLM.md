# Mini-LLM local V2

Subsistema local de memoria, recuperación y aprendizaje para Ghost Nexora Bot. No depende de una API de IA externa.

## Arquitectura V2

- Embeddings locales `Float32Array` de 128 dimensiones.
- Atención multi-head de 4 cabezas con Q/K/V, máscara causal, residual y codificación posicional sinusoidal.
- Proyección de salida con cross-entropy, SGD y momentum.
- Vocabulario persistente de hasta 8000 tokens con `<unk>`, `<bos>` y `<eos>`.
- Memoria vectorial binaria `corpus.bin` y modelo binario versionado `model.bin`.
- Aprendizaje online a partir de mensajes normales del bot.
- Auto-entrenamiento cada 30 minutos cuando hay al menos 20 mensajes pendientes.
- Progreso persistente en `data/llm/state.json`.

## Comandos

- `.llm status` / `.llm progress` — estado completo, porcentaje, época, pasos, loss, memoria y arquitectura.
- `.llm docs` — lista de documentos cargados.
- `.llm add` — responde o envía un PDF, DOCX, TXT, MD, JSON o CSV para incorporarlo al corpus.
- `.llm train` — inicia entrenamiento local en segundo plano.
- `.llm ask <pregunta>` — genera una respuesta corta usando el modelo y contexto recuperado.
- `.llm search <texto>` — busca directamente coincidencias en la memoria vectorial.
- `.llm auto on|off` — activa/desactiva el auto-entrenamiento.

## Almacenamiento

Todo se conserva bajo `data/llm/` y no debe subirse a Git. El modelo V2 usa el encabezado `NXLLM2` para evitar interpretar archivos del motor anterior como si fueran compatibles.
