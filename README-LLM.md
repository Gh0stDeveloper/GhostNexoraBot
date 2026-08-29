# Mini-LLM local

Subsistema de memoria y aprendizaje local para Ghost Nexora Bot.

## Comandos

- `.llm status` / `.llm progress` — estado, documentos, vectores, vocabulario, entrenamientos y pendientes.
- `.llm docs` — documentos cargados en el corpus.
- `.llm add` — envía o responde a un PDF, DOCX o TXT con este comando para incorporarlo.
- `.llm train` — inicia entrenamiento local en segundo plano.
- `.llm ask <pregunta>` — recupera contexto relevante de la memoria local.
- `.llm auto on|off` — activa/desactiva auto-entrenamiento cada 30 minutos.

Los archivos persistentes se almacenan bajo `data/llm/` y no se incluyen en Git.
