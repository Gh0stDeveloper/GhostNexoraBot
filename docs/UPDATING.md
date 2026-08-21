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

Ejemplos:

```text
main
```

O durante las pruebas de V1:

```text
feature/ghost-nexora-bot-v1
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

### Para la rama Draft actual

```bash
sudo git -C /opt/ghost-nexora-bot fetch origin feature/ghost-nexora-bot-v1
printf 'Instalado: '; git -C /opt/ghost-nexora-bot rev-parse --short HEAD
printf 'Remoto:    '; git -C /opt/ghost-nexora-bot rev-parse --short origin/feature/ghost-nexora-bot-v1
```

Si ambos SHA son iguales, ya tienes el último commit de esa rama.

Para ver los commits pendientes:

### `main`

```bash
git -C /opt/ghost-nexora-bot log --oneline HEAD..origin/main
```

### Draft

```bash
git -C /opt/ghost-nexora-bot log --oneline HEAD..origin/feature/ghost-nexora-bot-v1
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

Un sistema de backup cifrado automatizado forma parte del roadmap; esta copia manual es solo una medida previa sencilla.

---

## 5. Actualización normal de `main`

Cuando estés usando la versión estable:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

Ese será el comando habitual para actualizar.

---

## 6. Actualizar la rama Draft de V1

Mientras continúen las pruebas:

```bash
sudo env BRANCH=feature/ghost-nexora-bot-v1 /opt/ghost-nexora-bot/scripts/update.sh
```

Así sigues recibiendo cambios del PR Draft sin cambiar accidentalmente a `main`.

---

## 7. Qué hace `update.sh`

El script actual:

1. entra en `/opt/ghost-nexora-bot`;
2. hace `git fetch` de la rama indicada;
3. selecciona esa rama;
4. ejecuta `git pull --ff-only`;
5. intenta actualizar `yt-dlp`;
6. ejecuta `npm install`;
7. ejecuta `npm run build`;
8. prepara la caché de Next.js con los permisos correctos;
9. reinicia `ghost-nexora-bot` y `ghost-nexora-web`;
10. imprime el estado de ambos servicios.

La sesión principal, subbots y SQLite viven en `/var/lib/ghost-nexora-bot`, fuera del árbol Git, por lo que una actualización normal del código no debería borrarlos.

El archivo `.env` tampoco debe ser reemplazado por Git porque se mantiene como configuración local.

---

## 8. Verificar la actualización

Después del script:

```bash
sudo systemctl status ghost-nexora-bot --no-pager
sudo systemctl status ghost-nexora-web --no-pager
```

Comprobar que ambos estén activos:

```bash
systemctl is-active ghost-nexora-bot ghost-nexora-web
```

Ver el nuevo commit:

```bash
git -C /opt/ghost-nexora-bot rev-parse --short HEAD
```

Ver logs recientes:

```bash
sudo journalctl -u ghost-nexora-bot -n 100 --no-pager
sudo journalctl -u ghost-nexora-web -n 100 --no-pager
```

Después prueba en WhatsApp:

```text
.ping
.menu
.info
.balance
```

Si utilizas subbots, comprueba también:

```text
.subbot status
```

---

## 9. La actualización no debe pedir pairing de nuevo

Una actualización normal **no debe volver a vincular WhatsApp** porque la sesión se encuentra en:

```text
/var/lib/ghost-nexora-bot/session
```

Si después de actualizar aparece como desconectado, primero revisa los logs:

```bash
sudo journalctl -u ghost-nexora-bot -n 200 --no-pager
```

Solo repite el pairing si la sesión realmente fue cerrada/logged out.

---

## 10. Actualizar después de que el PR Draft pase a `main`

Si instalaste originalmente:

```text
feature/ghost-nexora-bot-v1
```

y después la V1 ya fue fusionada a `main`, puedes migrar la instalación una sola vez con:

```bash
sudo env BRANCH=main /opt/ghost-nexora-bot/scripts/update.sh
```

Comprueba después:

```bash
git -C /opt/ghost-nexora-bot branch --show-current
```

Debe mostrar:

```text
main
```

A partir de ese momento basta con:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

---

## 11. Si cambia `.env.example`

El updater conserva tu `.env` y no copia automáticamente todos los nuevos valores del ejemplo, porque hacerlo podría sobrescribir secretos/configuración.

Después de una versión importante puedes comparar:

```bash
cd /opt/ghost-nexora-bot
diff -u .env.example .env || true
```

No copies a ciegas valores placeholder sobre tokens reales.

Si una release introduce una nueva variable, agrégala manualmente a `.env` y reinicia los servicios:

```bash
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
```

---

## 12. Si la actualización falla durante `npm install` o build

No reinicies repetidamente los servicios sin revisar el error.

Primero ejecuta:

```bash
cd /opt/ghost-nexora-bot
sudo npm install
sudo npm run build
```

Luego consulta:

```bash
sudo journalctl -u ghost-nexora-bot -n 200 --no-pager
sudo journalctl -u ghost-nexora-web -n 200 --no-pager
```

Si el error pertenece a una versión recién publicada, conserva el SHA anterior y utiliza el procedimiento de rollback.

---

## 13. Guardar el SHA antes de actualizar

Antes de una actualización manual importante:

```bash
OLD_SHA="$(git -C /opt/ghost-nexora-bot rev-parse HEAD)"
echo "$OLD_SHA"
```

Guárdalo temporalmente en tu terminal/notas.

También puedes ver los commits recientes:

```bash
git -C /opt/ghost-nexora-bot log --oneline -10
```

---

## 14. Rollback temporal a un commit anterior

Si conoces el SHA estable anterior:

```bash
cd /opt/ghost-nexora-bot
sudo git checkout <SHA-ANTERIOR>
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
```

Verifica:

```bash
sudo systemctl status ghost-nexora-bot ghost-nexora-web --no-pager
```

Esto deja Git en `detached HEAD` deliberadamente como recuperación temporal.

Cuando exista una corrección y quieras volver a la rama:

### `main`

```bash
cd /opt/ghost-nexora-bot
sudo git checkout main
sudo git pull --ff-only origin main
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
```

### Draft

```bash
cd /opt/ghost-nexora-bot
sudo git checkout feature/ghost-nexora-bot-v1
sudo git pull --ff-only origin feature/ghost-nexora-bot-v1
sudo npm install
sudo npm run build
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
```

El rollback de código no borra automáticamente SQLite/sesiones, pero una futura migración de base de datos podría no ser reversible. Por eso el backup previo es importante.

---

## 15. Restaurar un backup manual

Hazlo únicamente si realmente necesitas recuperar estado.

Primero detén servicios:

```bash
sudo systemctl stop ghost-nexora-bot ghost-nexora-web
```

Inspecciona el contenido del archivo antes de restaurar:

```bash
tar -tzf /root/ghostnexora-before-update-YYYYMMDD-HHMMSS.tar.gz | head -100
```

Después restaura con cuidado:

```bash
sudo tar -xzf /root/ghostnexora-before-update-YYYYMMDD-HHMMSS.tar.gz -C /
```

Y vuelve a iniciar:

```bash
sudo systemctl start ghost-nexora-bot ghost-nexora-web
```

Comprueba logs inmediatamente.

---

## 16. Actualizar solo `yt-dlp`

El updater ya intenta hacerlo, pero si necesitas actualizarlo manualmente:

```bash
sudo yt-dlp -U
```

Comprueba versión:

```bash
yt-dlp --version
```

---

## 17. Actualización de certificado HTTPS

Let's Encrypt normalmente instala renovación automática mediante Certbot.

Comprueba:

```bash
sudo certbot certificates
```

Prueba la renovación sin modificar certificados:

```bash
sudo certbot renew --dry-run
```

La actualización del bot y la renovación TLS son procesos independientes.

---

## 18. Checklist recomendado después de cada release

- [ ] comprobar anuncio/changelog;
- [ ] comprobar rama instalada;
- [ ] anotar SHA actual;
- [ ] crear backup antes de releases importantes;
- [ ] ejecutar `update.sh` con la rama correcta;
- [ ] confirmar `npm audit`/CI verde en GitHub antes de producción;
- [ ] comprobar servicios;
- [ ] revisar logs;
- [ ] probar `.ping` y `.menu`;
- [ ] probar una descarga pequeña;
- [ ] comprobar panel web;
- [ ] comprobar subbots si existen;
- [ ] no repetir pairing salvo que la sesión haya sido cerrada.

---

## 19. Resumen de comandos

### Instalación estable inicial

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

### Actualizar estable

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

### Actualizar Draft

```bash
sudo env BRANCH=feature/ghost-nexora-bot-v1 /opt/ghost-nexora-bot/scripts/update.sh
```

### Logs

```bash
sudo journalctl -u ghost-nexora-bot -f
```

### Estado

```bash
sudo systemctl status ghost-nexora-bot ghost-nexora-web --no-pager
```

---

[🚀 Volver a la guía de primera instalación](FIRST_INSTALL.md)
