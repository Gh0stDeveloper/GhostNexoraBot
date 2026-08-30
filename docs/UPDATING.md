# 🔄 Actualizar Ghost Nexora Bot

Esta guía explica cómo comprobar si existe una versión nueva, actualizar una instalación existente, validar el resultado y volver temporalmente a un commit anterior si algo falla.

> [📖 Volver al README](../README.md)
> · [🚀 Primera instalación y activación](FIRST_INSTALL.md)
> · [📢 Canal oficial de WhatsApp](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i)

---

## 1. Dónde se anuncian las versiones

Las nuevas versiones y avisos se publicarán en:

- [📢 Canal oficial de Ghost Nexora Bot](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i)
- [📦 Repositorio de Ghost Nexora Bot](https://github.com/Gh0stDeveloper/GhostNexoraBot)
- [🧪 GitHub Actions](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

No actualices una instalación productiva hacia una rama experimental sin saber qué rama estás utilizando.

---

## 2. Comprobar qué rama tienes instalada

```bash
git -C /opt/ghost-nexora-bot branch --show-current
```

Ver el commit instalado:

```bash
git -C /opt/ghost-nexora-bot rev-parse --short HEAD
```

---

## 3. Comprobar si hay una actualización sin instalarla

### Para `main`

```bash
sudo git -C /opt/ghost-nexora-bot fetch origin main
printf 'Instalado: '; git -C /opt/ghost-nexora-bot rev-parse --short HEAD
printf 'Remoto:    '; git -C /opt/ghost-nexora-bot rev-parse --short origin/main
```

Para ver los commits pendientes:

```bash
git -C /opt/ghost-nexora-bot log --oneline HEAD..origin/main
```

---

## 4. Backup manual recomendado antes de actualizar

La actualización normal no elimina la sesión ni SQLite, pero antes de una versión importante es recomendable crear una copia del estado y `.env`.

```bash
sudo tar -czf "/root/ghostnexora-before-update-$(date +%Y%m%d-%H%M%S).tar.gz" \
  /var/lib/ghost-nexora-bot \
  /opt/ghost-nexora-bot/.env
```

Lista los backups:

```bash
ls -lh /root/ghostnexora-before-update-*.tar.gz
```

El backup contiene información sensible. No lo compartas ni lo subas a GitHub.

---

## 5. Actualización normal de `main`

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

### Actualizar desde una rama de trabajo (ejemplo)

```bash
sudo env BRANCH=feature/apk-adult-improvements /opt/ghost-nexora-bot/scripts/update.sh
```

---

## 6. Actualizar **sin interrumpir** el entrenamiento Mini-LLM

El worker `ghost-nexora-llm.service` es un proceso **separado** del bot de WhatsApp. Aun así, versiones antiguas de `update.sh` reiniciaban siempre el worker y podían cortar un entrenamiento en curso.

### Comportamiento actual de `update.sh`

1. Lee `*/llm/state.json` (por defecto bajo `/var/lib/ghost-nexora-bot/llm/`).
2. Si `learning: true` (o progreso parcial con mensaje de entrenamiento), **no** ejecuta `systemctl restart ghost-nexora-llm`.
3. Solo reinicia `ghost-nexora-bot` y `ghost-nexora-web`.
4. Actualiza el archivo de unidad systemd del LLM en disco (`SKIP_LLM_RESTART=1`) para el próximo arranque limpio, sin matar el proceso actual.

### Comprobar si el entrenamiento está activo antes de actualizar

```bash
# Estado del servicio
systemctl is-active ghost-nexora-llm

# Progreso persistido
sudo cat /var/lib/ghost-nexora-bot/llm/state.json | head -80

# Logs en vivo del worker
sudo journalctl -u ghost-nexora-llm -f
```

Campos útiles en `state.json`:

- `learning`: `true` mientras corre una pasada de entrenamiento
- `currentProgress`: porcentaje aproximado (0–100)
- `currentStep` / `currentTotalSteps`
- `currentMessage`: texto legible del paso actual

Durante el entrenamiento el modelo se guarda por checkpoints periódicos (`LLM_CHECKPOINT_EVERY`, por defecto cada 1000 pasos) en `model.bin`. Aun así, **evitar el reinicio** es lo más seguro: el bucle de épocas vive en memoria del proceso.

### Actualizar solo bot/web a mano (máxima precaución)

Si prefieres no usar el script:

```bash
cd /opt/ghost-nexora-bot
sudo git fetch origin
sudo git checkout main   # o la rama que uses
sudo git pull --ff-only
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
# NO reiniciar ghost-nexora-llm mientras learning=true
```

### Después de que el entrenamiento termine

Cuando `learning` vuelva a `false` y el progreso sea 100 o el mensaje indique completado, puedes reiniciar el worker si necesitas cargar código nuevo del LLM:

```bash
sudo systemctl restart ghost-nexora-llm
```

---

## 7. Qué hace `update.sh`

1. Entra en `/opt/ghost-nexora-bot`.
2. Detecta si el Mini-LLM está entrenando (`state.json`).
3. `git fetch` / `checkout` / `pull --ff-only` de la rama indicada.
4. Actualiza `yt-dlp` si está instalado.
5. `npm install` y `npm run build`.
6. Ajusta permisos de `STATE_DIR`.
7. Refresca la unidad `ghost-nexora-llm` (con o sin restart según entrenamiento).
8. Reinicia **solo** bot y web si hay entrenamiento activo; si no, reinicia también el worker LLM.
9. Imprime el estado de los tres servicios.

La sesión principal, subbots y SQLite viven en `/var/lib/ghost-nexora-bot`, fuera del árbol Git. El archivo `.env` tampoco debe ser reemplazado por Git.

---

## 8. Verificar la actualización

```bash
sudo systemctl status ghost-nexora-bot --no-pager
sudo systemctl status ghost-nexora-web --no-pager
sudo systemctl status ghost-nexora-llm --no-pager
```

```bash
systemctl is-active ghost-nexora-bot ghost-nexora-web ghost-nexora-llm
git -C /opt/ghost-nexora-bot rev-parse --short HEAD
```

Logs:

```bash
sudo journalctl -u ghost-nexora-bot -n 100 --no-pager
sudo journalctl -u ghost-nexora-llm -n 100 --no-pager
```

En WhatsApp: `.ping`, `.menu`, y el comando de estado del Mini-LLM si lo usas.

---

## 9. La actualización no debe pedir pairing de nuevo

Una actualización normal **no debe volver a vincular WhatsApp** porque la sesión está en:

```text
/var/lib/ghost-nexora-bot/session
```

Si aparece desconectado, revisa logs antes de repetir pairing.

---

## 10. Si cambia `.env.example`

El updater conserva tu `.env`. Compara y agrega variables nuevas a mano:

```bash
cd /opt/ghost-nexora-bot
diff -u .env.example .env || true
```

---

## 11. Rollback temporal a un commit anterior

```bash
cd /opt/ghost-nexora-bot
sudo git checkout <SHA-ANTERIOR>
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
# Solo reinicia LLM si NO hay entrenamiento activo
```

---

## 12. Resumen de comandos

### Actualizar estable

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

### Actualizar rama de mejoras (ejemplo)

```bash
sudo env BRANCH=feature/apk-adult-improvements /opt/ghost-nexora-bot/scripts/update.sh
```

### Forzar no reiniciar LLM aunque no se detecte entrenamiento

```bash
sudo env SKIP_LLM_RESTART=1 INSTALL_DIR=/opt/ghost-nexora-bot \
  bash /opt/ghost-nexora-bot/scripts/install-llm-worker-service.sh
# y reiniciar solo bot/web a mano
```

### Logs LLM

```bash
sudo journalctl -u ghost-nexora-llm -f
```

---

[🚀 Volver a la guía de primera instalación](FIRST_INSTALL.md)
