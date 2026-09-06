# Reparación de sesión principal de WhatsApp

Ghost Nexora Bot incluye un reparador para el caso en que las credenciales locales de Baileys indiquen que la cuenta sigue vinculada, pero WhatsApp ya haya cerrado o invalidado ese dispositivo.

## Comando recomendado

Desde el repositorio:

```bash
sudo npm run session:repair
```

En una VPS instalada en la ruta estándar también puede ejecutarse:

```bash
cd /opt/ghost-nexora-bot
sudo npm run session:repair
```

El método predeterminado es **pairing por código de número**.

### Indicar el número desde el comando

```bash
sudo npm run session:repair -- --phone 521XXXXXXXXXX
```

### Usar QR

```bash
sudo npm run session:repair -- --method qr
```

### Reparar pero no iniciar automáticamente el MainBot

```bash
sudo npm run session:repair -- --no-start
```

### Solo comprobar rutas/configuración

```bash
sudo npm run session:repair -- --check
```

`--check` no detiene servicios, no mueve la sesión y no ejecuta pairing.

---

## Qué hace automáticamente

En Linux/VPS con systemd:

1. Lee `SESSION_DIR` y `DATA_DIR` desde `.env`.
2. Verifica que `SESSION_DIR` no apunte por error al directorio de datos, subbots o raíz del sistema.
3. Comprueba que `apps/bot/dist/pair.js` exista; si falta, prepara el workspace del bot antes de tocar la sesión.
4. Detecta `ghost-nexora-bot.service` y el usuario real que ejecuta el MainBot.
5. Detiene únicamente `ghost-nexora-bot.service`.
6. Renombra la sesión anterior a `session.old-<fecha>` en lugar de borrarla definitivamente.
7. Crea un `SESSION_DIR` limpio.
8. Ajusta propietario/permisos para el usuario de systemd.
9. Ejecuta `npm run pair` como ese mismo usuario.
10. Si el pairing termina correctamente, vuelve a aplicar permisos e inicia el MainBot.

En Windows, el mismo comando detecta el PID gestionado por Ghost Nexora, detiene el MainBot, respalda la sesión, ejecuta pairing y vuelve a iniciar el bot mediante el manager cuando corresponde.

---

## Qué NO modifica

La reparación está limitada a la sesión principal de WhatsApp. No modifica:

- `DATA_DIR`;
- SQLite;
- Nexora Coins / banco;
- compras y entitlements;
- sesiones de subbots;
- configuración de subbots;
- Web / Next.js;
- Ollama / Qwen;
- `.env`.

---

## Si WhatsApp restringió temporalmente Dispositivos vinculados

El reparador **no intenta eludir restricciones de WhatsApp**.

Si WhatsApp no permite vincular un dispositivo nuevo, el comando:

- conserva el backup de la sesión anterior;
- deja la carpeta de sesión nueva separada;
- no entra en un bucle agresivo de pairing;
- deja el MainBot detenido si no existe una sesión nueva válida;
- muestra el path exacto del backup y una explicación.

Cuando WhatsApp vuelva a permitir la vinculación, basta ejecutar nuevamente:

```bash
sudo npm run session:repair
```

No es necesario borrar manualmente carpetas ni modificar SQLite.

---

## Ejemplo de backup

Una sesión anterior como:

```text
/var/lib/ghost-nexora-bot/session
```

puede quedar respaldada como:

```text
/var/lib/ghost-nexora-bot/session.old-2026-09-06_23-45-10-123
```

El backup contiene credenciales sensibles de WhatsApp. No debe subirse a GitHub, enviarse por chat ni compartirse con terceros.

---

## Después de reparar

Comprueba systemd:

```bash
sudo systemctl status ghost-nexora-bot --no-pager -l
```

Logs:

```bash
sudo journalctl -u ghost-nexora-bot -n 120 --no-pager
```

Health:

```bash
curl -fsS http://127.0.0.1:3001/health
```

En WhatsApp prueba:

```text
.ping
```

---

## Wrapper VPS

También existe:

```bash
sudo bash /opt/ghost-nexora-bot/scripts/repair-session.sh
```

El wrapper entra al directorio correcto y ejecuta el mismo `session:repair`.
