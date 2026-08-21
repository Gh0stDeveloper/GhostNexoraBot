# 🚀 Primera instalación y activación de Ghost Nexora Bot

Esta guía describe la instalación inicial del bot principal, el emparejamiento de WhatsApp, la web, los servicios de Linux y HTTPS.

> [📖 Volver al README](../README.md)
> · [🔄 Guía de actualización](UPDATING.md)
> · [📢 Canal oficial de WhatsApp](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i)

---

## 1. Requisitos recomendados

Para una instalación inicial:

- Ubuntu Server 22.04 LTS o 24.04 LTS;
- acceso `root` o usuario con `sudo`;
- 2 vCPU como mínimo recomendado;
- 2 GB RAM como mínimo, 4 GB o más si habrá varias descargas/subbots;
- almacenamiento suficiente para archivos temporales;
- salida a Internet;
- puerto SSH accesible para administración;
- puertos `80/tcp` y `443/tcp` abiertos si usarás dominio y HTTPS.

El instalador configura automáticamente Node.js 24, npm, FFmpeg, yt-dlp, nginx y los demás paquetes necesarios.

Los puertos internos `3000` y `3001` no necesitan exponerse públicamente cuando nginx está delante de la aplicación.

---

## 2. Instalación de la versión estable (`main`)

Cuando la versión se encuentre fusionada en `main`, ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

Ese es el comando normal de instalación.

---

## 3. Instalación de la rama de pruebas actual

Mientras el PR de V1 permanezca en Draft, utiliza:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/feature/ghost-nexora-bot-v1/scripts/install.sh | sudo env BRANCH=feature/ghost-nexora-bot-v1 bash
```

Esto instala exactamente la rama de pruebas sin modificar `main`.

---

## 4. Qué hace el instalador

El script realiza automáticamente:

1. actualización del índice APT;
2. instalación de Git, curl, FFmpeg, nginx y utilidades del sistema;
3. instalación de Node.js 24 si hace falta;
4. instalación/actualización de `yt-dlp`;
5. creación del usuario de servicio `ghostbot`;
6. clonación del repositorio en `/opt/ghost-nexora-bot`;
7. creación del almacenamiento persistente en `/var/lib/ghost-nexora-bot`;
8. creación de `.env` a partir de `.env.example` si todavía no existe;
9. configuración de rutas persistentes para sesión y SQLite;
10. generación de un token aleatorio para el panel owner;
11. `npm install`;
12. compilación de bot y web;
13. instalación de servicios `systemd`;
14. solicitud opcional del número de WhatsApp para pairing;
15. inicio automático del bot, la web y nginx;
16. configuración opcional de HTTPS si proporcionaste un dominio.

---

## 5. Vincular el WhatsApp principal

Durante la primera instalación, la terminal mostrará:

```text
Número principal de WhatsApp en formato internacional...
```

Introduce el número completo con código de país. Puedes escribir `+`, espacios o guiones; el instalador conserva únicamente los dígitos.

Ejemplo genérico:

```text
521234567890
```

Para México normalmente se utiliza `52` seguido del número nacional de 10 dígitos. No agregues un `1` adicional salvo que tu cuenta/número realmente lo requiera en el formato que WhatsApp reconoce.

El primer número introducido se configura también como owner si `OWNER_NUMBERS` todavía está vacío.

### Introducir el código en WhatsApp

Cuando la terminal muestre el código de emparejamiento:

1. abre WhatsApp en el teléfono que contiene la cuenta principal;
2. entra a **Dispositivos vinculados**;
3. selecciona **Vincular un dispositivo**;
4. elige la opción para **vincular con número de teléfono/código** si aparece;
5. introduce el código mostrado por Ghost Nexora Bot;
6. espera a que la terminal confirme la conexión.

La redacción exacta de los botones puede variar según la versión de WhatsApp.

---

## 6. Si omitiste el pairing o falló

No necesitas reinstalar.

Ejecuta:

```bash
sudo -u ghostbot -H env ENV_FILE=/opt/ghost-nexora-bot/.env npm --prefix /opt/ghost-nexora-bot run pair
```

Si el proceso solicita un número, introdúcelo en formato internacional.

Después reinicia el servicio:

```bash
sudo systemctl restart ghost-nexora-bot
```

---

## 7. Verificar que los servicios estén activos

```bash
sudo systemctl status ghost-nexora-bot --no-pager
sudo systemctl status ghost-nexora-web --no-pager
sudo systemctl status nginx --no-pager
```

Los servicios principales deben aparecer como `active (running)`.

Para una comprobación corta:

```bash
systemctl is-active ghost-nexora-bot ghost-nexora-web nginx
```

---

## 8. Ver los logs

Bot:

```bash
sudo journalctl -u ghost-nexora-bot -f
```

Web:

```bash
sudo journalctl -u ghost-nexora-web -f
```

Últimas 200 líneas del bot:

```bash
sudo journalctl -u ghost-nexora-bot -n 200 --no-pager
```

Para salir del modo `-f`, presiona `Ctrl+C`.

---

## 9. Primera prueba desde WhatsApp

Después de vincular la cuenta, prueba:

```text
.ping
.menu
.info
.balance
.shop
```

Si la propia cuenta vinculada envía los comandos, el router la reconoce automáticamente como owner.

Para comprobar el panel owner, hazlo **en chat privado con el bot**:

```text
.adminpanel
```

No publiques el token administrativo en grupos.

---

## 10. Archivos y directorios importantes

Código de la aplicación:

```text
/opt/ghost-nexora-bot
```

Configuración:

```text
/opt/ghost-nexora-bot/.env
```

Estado persistente:

```text
/var/lib/ghost-nexora-bot
```

Sesión principal:

```text
/var/lib/ghost-nexora-bot/session
```

SQLite, subbots y datos:

```text
/var/lib/ghost-nexora-bot/data
```

No borres `/var/lib/ghost-nexora-bot` durante una actualización normal.

---

## 11. Configuración principal `.env`

Para editarla:

```bash
sudo nano /opt/ghost-nexora-bot/.env
```

Variables importantes:

```env
BOT_NAME=Ghost Nexora Bot
PREFIX=.
OWNER_NUMBERS=521234567890
AUTO_REACT=true
MAX_DOWNLOAD_MB=1900
SESSION_DIR=/var/lib/ghost-nexora-bot/session
DATA_DIR=/var/lib/ghost-nexora-bot/data
BOT_HEALTH_PORT=3001
WEB_PORT=3000
PUBLIC_WEB_URL=http://127.0.0.1:3000
ADMIN_WEB_TOKEN=token-generado
OFFICIAL_CHANNEL_URL=https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i
LOG_LEVEL=info
```

Después de cambiar configuración que se lee al arrancar:

```bash
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
```

Nunca publiques `.env`, `ADMIN_WEB_TOKEN`, sesiones o la base SQLite.

---

## 12. Instalar directamente con dominio y HTTPS

Antes de ejecutar el instalador:

1. crea un registro DNS `A` hacia la IPv4 pública de la VPS;
2. si utilizas IPv6, configura también `AAAA` correctamente;
3. abre `80/tcp` y `443/tcp` en el firewall de la nube/VPS;
4. espera a que el DNS resuelva al servidor.

Después ejecuta, para `main`:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo env BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com bash
```

Para la rama Draft actual:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/feature/ghost-nexora-bot-v1/scripts/install.sh | sudo env BRANCH=feature/ghost-nexora-bot-v1 BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com bash
```

El instalador configura nginx, solicita el certificado Let's Encrypt y activa redirección HTTP → HTTPS.

---

## 13. Activar HTTPS después de haber instalado sin dominio

Puedes volver a ejecutar el instalador existente sin perder la sesión:

### Rama estable

```bash
sudo env BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com /opt/ghost-nexora-bot/scripts/install.sh
```

### Rama Draft

```bash
sudo env BRANCH=feature/ghost-nexora-bot-v1 BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com /opt/ghost-nexora-bot/scripts/install.sh
```

El script detectará la instalación existente y conservará los datos persistentes.

---

## 14. Firewall

Si utilizas UFW, primero asegúrate de no bloquear tu SSH. Por ejemplo:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Si tu proveedor cloud tiene firewall/security list/NSG, abre también allí los puertos necesarios.

No es necesario publicar directamente `3000` o `3001` cuando nginx funciona correctamente.

---

## 15. Comandos operativos útiles

Reiniciar bot:

```bash
sudo systemctl restart ghost-nexora-bot
```

Reiniciar web:

```bash
sudo systemctl restart ghost-nexora-web
```

Detener temporalmente:

```bash
sudo systemctl stop ghost-nexora-bot ghost-nexora-web
```

Volver a iniciar:

```bash
sudo systemctl start ghost-nexora-bot ghost-nexora-web
```

Ver rama instalada:

```bash
git -C /opt/ghost-nexora-bot branch --show-current
```

Ver commit actual:

```bash
git -C /opt/ghost-nexora-bot rev-parse --short HEAD
```

---

## 16. Problemas frecuentes

### El pairing code no aparece

Comprueba los logs y vuelve a ejecutar `npm run pair` con el usuario `ghostbot`.

### WhatsApp rechaza el código

- comprueba el número internacional;
- genera un código nuevo;
- espera unos minutos si realizaste muchos intentos consecutivos;
- comprueba que la cuenta no haya cerrado la sesión vinculada.

### El bot está vinculado pero no responde

```bash
sudo systemctl status ghost-nexora-bot --no-pager
sudo journalctl -u ghost-nexora-bot -n 200 --no-pager
```

### La web no abre

```bash
sudo systemctl status ghost-nexora-web --no-pager
sudo nginx -t
sudo systemctl status nginx --no-pager
```

### HTTPS no se pudo emitir

Verifica que el dominio resuelva a la IP pública de la VPS:

```bash
getent ahosts bot.tudominio.com
```

Y vuelve a solicitar certificado:

```bash
sudo certbot --nginx -d bot.tudominio.com
```

---

## 17. Siguiente paso

Cuando la instalación esté funcionando, consulta la guía dedicada antes de instalar una versión nueva:

[🔄 Actualizar Ghost Nexora Bot](UPDATING.md)
