# 🔄 Actualizar Ghost Nexora Bot

Esta guía cubre la actualización segura de una instalación existente, incluidos **Bot**, **Web opcional**, **Ollama/LLM opcional**, persistencia y la migración extraordinaria de reparación de subbots de septiembre de 2026.

> [📖 Volver al README](../README.md) · [🚀 Primera instalación](FIRST_INSTALL.md) · [📢 Canal oficial](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i)

---

## Actualización estable

Para una VPS instalada en `/opt/ghost-nexora-bot`:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

El actualizador conserva `.env`, sesión principal, SQLite y la configuración existente de **Web** y **Ollama**.

### Comprobar versión

```bash
git -C /opt/ghost-nexora-bot branch --show-current
git -C /opt/ghost-nexora-bot rev-parse --short HEAD
```

Ver si existen commits nuevos:

```bash
sudo git -C /opt/ghost-nexora-bot fetch origin main
printf 'Instalado: '; git -C /opt/ghost-nexora-bot rev-parse --short HEAD
printf 'Remoto:    '; git -C /opt/ghost-nexora-bot rev-parse --short origin/main
```

---

# 🧹 Reparación extraordinaria de subbots · septiembre 2026

> [!IMPORTANT]
> La primera ejecución de la versión que incorpora la migración `subbot-session-reset-2026-09-v1` **borra las sesiones antiguas de los subbots una sola vez**. Esto corrige instancias que figuraban vinculadas pero habían quedado offline o sin responder.

La migración **NO** elimina:

- la sesión del MainBot;
- Nexora Coins de los usuarios;
- banco o billetera global;
- compras `subbot_slot`;
- subbots regalados por staff;
- fecha de vencimiento de la suscripción;
- acceso privado comprado;
- acceso privado regalado.

Antes de borrar los directorios viejos, el runtime ejecuta nuevamente la reconciliación histórica de billeteras. Después crea un snapshot sin credenciales y reinicia únicamente el estado efímero del subbot.

### Lo que sí se elimina

- credenciales WhatsApp de cada subbot antiguo;
- archivos bajo `data/subbots/<id>/`;
- número vinculado guardado en la instancia;
- tokens antiguos del portal web del subbot;
- contadores runtime antiguos de esa instancia.

Las suscripciones vigentes quedan en estado:

```text
pending
```

El usuario debe volver a vincular:

```text
.subbot status
.subbot pair 521XXXXXXXXXX
```

o usar:

```text
.subbot qr
```

**No debe volver a comprar el subbot** mientras su `subbot_slot` siga vigente.

### Migración de una sola ejecución

Marcador:

```text
/var/lib/ghost-nexora-bot/data/.migrations/subbot-session-reset-2026-09-v1.done
```

Snapshot de recuperación sin credenciales WhatsApp:

```text
/var/lib/ghost-nexora-bot/data/backups/subbot-session-reset-2026-09-v1.json
```

Puedes comprobarlos con:

```bash
sudo cat /var/lib/ghost-nexora-bot/data/.migrations/subbot-session-reset-2026-09-v1.done
sudo ls -lh /var/lib/ghost-nexora-bot/data/backups/subbot-session-reset-2026-09-v1.json
```

Una vez creado el marcador, futuras actualizaciones **no vuelven a borrar** los subbots que ya hayan sido vinculados nuevamente.

---

## Mejoras de subbots incluidas

Después de la reparación:

- los workers reintentan conexión durante toda la vigencia de la suscripción;
- ya no existe el límite antiguo de 12 reconexiones que podía dejar un proceso “vivo pero mudo”;
- MainBot recibe heartbeat de cada worker;
- un watchdog reinicia workers atascados;
- un cierre inesperado del proceso hijo provoca respawn automático cuando corresponde;
- errores aislados de moderación no cancelan el router de comandos;
- el timeout del subbot usa `BOT_MESSAGE_TIMEOUT_MS`, igual que MainBot;
- `.subbot reset` elimina solo sesión/credenciales y conserva la suscripción;
- si existe un `subbot_slot` vigente pero falta la fila runtime, el sistema reconstruye la instancia como `pending`.

---

## Billetera, compras y permisos compartidos

MainBot y subbots utilizan una única billetera global en:

```text
/var/lib/ghost-nexora-bot/data/nexora-economy.sqlite
```

Las transferencias y compras se procesan con bloqueo transaccional sobre esa base compartida. Esto evita que dos procesos gasten simultáneamente el mismo saldo.

También se comparte la base de permisos del MainBot. Por tanto:

- una compra de acceso privado funciona desde todas las instancias;
- `privategift` queda persistido en la base principal;
- un acceso privado regalado no debe volver a pedir compra;
- `subbotgrant` queda registrado como `subbot_slot`;
- si una compra no puede registrar el entitlement, el débito intenta revertirse automáticamente.

---

## Backup manual recomendado

Antes de una actualización importante:

```bash
sudo tar -czf "/root/ghostnexora-before-update-$(date +%Y%m%d-%H%M%S).tar.gz" \
  /var/lib/ghost-nexora-bot \
  /opt/ghost-nexora-bot/.env
```

El backup contiene datos sensibles. No lo publiques ni lo subas al repositorio.

---

## Web y Ollama opcionales durante una actualización

El updater preserva instalaciones antiguas.

### Web

Si una VPS anterior no contiene `WEB_ENABLED`, el updater detecta `ghost-nexora-web.service` o un build `.next` existente. Si ya tenías dashboard, añade:

```env
WEB_ENABLED=true
```

Si estaba deshabilitado, no obliga a instalarlo.

### Ollama

Si tienes:

```env
OLLAMA_ENABLED=true
```

y el ejecutable `ollama` existe, el updater conserva Ollama y su worker. Si el binario ya no existe, desactiva el LLM local para evitar comandos rotos.

---

## Entrenamiento Mini-LLM activo

El updater detecta el estado de entrenamiento antes de reiniciar `ghost-nexora-llm.service`. Si hay entrenamiento activo, actualiza el resto del sistema sin matar ese worker.

Comprobar:

```bash
systemctl is-active ghost-nexora-llm
sudo cat /var/lib/ghost-nexora-bot/llm/state.json | head -80
sudo journalctl -u ghost-nexora-llm -f
```

---

## Verificar después de actualizar

### MainBot

```bash
sudo systemctl status ghost-nexora-bot --no-pager -l
curl -fsS http://127.0.0.1:3001/health
```

### Web, si está habilitada

```bash
sudo systemctl status ghost-nexora-web --no-pager -l
```

### Ollama/LLM, si está habilitado

```bash
sudo systemctl status ollama ghost-nexora-llm --no-pager -l
ollama list
```

### Logs del bot

```bash
sudo journalctl -u ghost-nexora-bot -n 150 --no-pager
```

En WhatsApp prueba:

```text
.ping
.menu
.subbot status
```

---

## La sesión principal no debe pedir pairing

Una actualización normal conserva:

```text
/var/lib/ghost-nexora-bot/session
```

La migración extraordinaria descrita arriba afecta **solo las sesiones de los subbots**, no la cuenta principal.

Si MainBot aparece desconectado, revisa logs antes de volver a vincularlo.

---

## Rollback temporal

```bash
cd /opt/ghost-nexora-bot
sudo git checkout <SHA-ANTERIOR>
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot
```

Reinicia Web y LLM únicamente si están habilitados y, para LLM, si no hay entrenamiento activo.

> [!WARNING]
> El rollback de código no restaura las credenciales viejas de subbots después de que la migración de reparación ya fue aplicada. Los usuarios deben completar nuevamente `.subbot pair` o `.subbot qr`.

---

## Resumen

Actualizar VPS:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

Logs:

```bash
sudo journalctl -u ghost-nexora-bot -f
```

Estado de la migración subbot:

```bash
sudo cat /var/lib/ghost-nexora-bot/data/.migrations/subbot-session-reset-2026-09-v1.done
```

[🚀 Volver a la guía de primera instalación](FIRST_INSTALL.md)
