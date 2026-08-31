# Ollama + Ghost Nexora Bot

Ghost Nexora Bot puede usar Ollama como LLM generativo local para el chat libre de WhatsApp. La integración no añade una dependencia Node externa: usa `fetch()` contra la API HTTP local de Ollama.

## Instalación en una VPS

Desde la raíz del repositorio:

```bash
cd /opt/ghost-nexora-bot
chmod +x scripts/install-ollama.sh
sudo ./scripts/install-ollama.sh qwen2.5:1.5b
```

El instalador:

- instala Ollama con el instalador oficial si no existe;
- habilita/inicia `ollama.service` cuando systemd está disponible;
- espera a `http://127.0.0.1:11434/api/tags`;
- descarga y verifica el modelo indicado.

No debe ejecutarse `ollama hola`. Para probar el modelo se usa `ollama run qwen2.5:1.5b "hola"`.

## Configuración `.env`

Añadir al `.env` del despliegue:

```dotenv
OLLAMA_ENABLED=true
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TIMEOUT_MS=45000
OLLAMA_TEMPERATURE=0.65
OLLAMA_TOP_P=0.9
OLLAMA_MAX_HISTORY=10
```

`OLLAMA_ENABLED=false` mantiene el comportamiento anterior basado en Mini-LLM. El bot también puede activar o desactivar Ollama en caliente con `.llm ollama on|off`; ese cambio de comando dura hasta el siguiente reinicio.

## Comandos de WhatsApp

```text
.llm ollama status
.llm ollama on
.llm ollama off
.llm free on
```

`status` comprueba conectividad con la API y confirma si el modelo configurado está instalado.

El modo libre sigue protegido por los mismos controles existentes: owner/staff para administrar, mención obligatoria en grupos cuando está activa, cooldown, anti-spam, whitelist y reacciones.

## Flujo de respuesta

1. Baileys recibe el mensaje.
2. Se conserva el contexto corto del chat en memoria.
3. Si Ollama está habilitado y disponible, se envía el historial reciente + mensaje actual a `/api/chat`.
4. Si Ollama no responde, excede el timeout o devuelve contenido vacío, el bot cae automáticamente a Mini-LLM/vector search.
5. El mensaje actual no se duplica en el historial enviado a Ollama.

## Actualización del código en una VPS

```bash
cd /opt/ghost-nexora-bot
sudo git fetch origin
sudo git reset --hard origin/main
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot ghost-nexora-llm
```

Después, comprobar:

```bash
systemctl --no-pager --full status ollama
curl -fsS http://127.0.0.1:11434/api/tags
ollama list
```

Y desde WhatsApp:

```text
.llm ollama status
.llm free on
```

## Rendimiento

`qwen2.5:1.5b` es un modelo pequeño y apropiado para una VPS CPU-only. En conversaciones largas, `OLLAMA_MAX_HISTORY` limita el historial remitido para evitar consumir memoria y tiempo de inferencia innecesariamente.
