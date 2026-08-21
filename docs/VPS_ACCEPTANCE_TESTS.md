# Ghost Nexora Bot — Pruebas de aceptación en VPS

Esta guía valida la rama `feature/ghost-nexora-bot-v1` antes de quitar el estado Draft del PR y antes de cualquier merge a `main`.

> No hacer merge únicamente porque GitHub Actions esté verde. Las integraciones con WhatsApp, YouTube móvil, yt1s, Erome, Google, FFmpeg, webpmux y proveedores externos necesitan prueba real desde la VPS.

## 1. Actualizar la VPS

```bash
sudo env BRANCH=feature/ghost-nexora-bot-v1 /opt/ghost-nexora-bot/scripts/update.sh
```

Comprobar:

```bash
systemctl status ghost-nexora-bot --no-pager -l
systemctl status ghost-nexora-web --no-pager -l
journalctl -u ghost-nexora-bot -n 150 --no-pager
command -v ffmpeg
command -v webpmux
command -v yt-dlp
```

## 2. Paywall obligatorio en chat privado

Usar una cuenta que no sea Owner, staff ni tenga `private_access`.

Debe funcionar sin suscripción:

```text
.menu
.shop
.balance
.buy private1d
```

Debe quedar bloqueado sin suscripción:

```text
.ping
.profile
.work
.yts prueba
.rw
.s
```

Después de comprar `private1d`, `.ping` y `.profile` deben funcionar inmediatamente.

## 3. Menú e identidad visual

```text
.menu
.info
```

Verificar foto/banner, botón Visitar canal, nombre, moneda, uptime y rol.

## 4. Staff global

```text
.botadmin add @usuario
.botadmins
.status
.suggestions
.botadmin remove @usuario
```

## 5. Sistema VPS y speedtest

Desde Owner o staff:

```text
.system
```

Debe mostrar hostname, sistema/kernel, arquitectura, CPU, núcleos, load average, RAM, disco, uptime, Node.js y RAM del proceso. No debe mostrar credenciales ni IP pública.

Después:

```text
.speedtest
```

Verificar:

- mensaje inicial de prueba;
- latencia;
- descarga en Mbps;
- subida en Mbps;
- proveedor Cloudflare Speed Test;
- segunda ejecución inmediata bloqueada por cooldown;
- otro `.speedtest` simultáneo rechazado mientras uno está corriendo;
- usuarios normales no pueden ejecutar ninguno de los dos comandos.

La prueba transfiere aproximadamente 33 MB, por lo que no debe ejecutarse repetidamente sin necesidad.

## 6. Login web seguro

Abrir la página principal y verificar que exista el botón `Acceder`.

### Administrador

Desde el chat privado del Owner:

```text
.adminpanel
```

El bot debe entregar por separado:

1. URL `/login?mode=admin`;
2. token administrativo.

Abrir la URL, pegar el token y comprobar:

- redirección a `/admin`;
- el token no queda en la URL;
- dashboard carga instancias y métricas;
- cookie `ghost_admin_session` es HttpOnly;
- `Cerrar sesión` vuelve a `/login`;
- abrir `/admin` sin sesión redirige al login.

### Subbot

Desde un usuario con subbot activo:

```text
.subbot portal
```

Debe entregar:

1. URL `/login?mode=subbot`;
2. token de portal separado;
3. fecha de expiración.

Pegar el token y verificar:

- redirección a `/subbot`;
- solo se muestra la instancia del usuario;
- el token no queda en la URL;
- la sesión no dura más que el token ni que la suscripción del subbot;
- cerrar sesión elimina el acceso;
- un token inválido/expirado se rechaza.

Compatibilidad: un enlace antiguo `/subbot/<token>` debe canjear el token por una cookie y redirigir inmediatamente a `/subbot`.

## 7. Bienvenida y despedida

```text
.welcome on
.goodbye on
.setwelcome Bienvenido $user a $namegroup
.setgoodbye $user dejó $namegroup
```

Probar banners persistentes con `.welbanner` y `.byebanner`.

## 8. YouTube

```text
.yts Linkin Park Numb
.play Linkin Park Numb
.ytmusic Linkin Park Numb
.yt Linkin Park Numb 720
```

Orden esperado de descarga: yt1s, proveedor HTTP alternativo y yt-dlp local.

## 9. Sticker pack y sprite

```text
.spack Ghost Test Pack
.s
.sprite Megumin
```

Verificar EXIF del pack y animación del sprite.

## 10. Juegos PvP

```text
.tpvp @usuario 100
.bjvs 100 @usuario
.damas 100 @usuario
.damasbot gratis
```

Verificar aceptación, turnos, apuestas, reembolsos y finalización.

## 11. Gacha

```text
.rw
.claim
.harem
.wsearch Megumin
.winfo Megumin
.wimage Megumin
.ainfo KonoSuba
.alist
```

## 12. Economía y Grimorio

```text
.daily
.work
.crime
.slut
.invest 500 2
.cda 3 500
.loan 500
.grimorio
.tienda
```

## 13. Reacciones y roleplay 18+

Probar reacciones SFW. El roleplay 18+ requiere `adult18 accept` de ambos participantes, módulo global activo y NSFW permitido en el grupo.

## 14. Subbot e identidad independiente

Desde el propio subbot:

```text
.setbotname Ghost / Ghost Personal Bot
.setbotcurrency Ghost Coins
.setpfp
.sb
.welbanner
.byebanner
.menu
```

Los cambios no deben afectar al MainBot ni a otros subbots.

## 15. Booru y módulo adulto

```text
.safebooru hatsune_miku
```

Con controles 18+ habilitados:

```text
.gelbooru tags
.e621 tags
```

## 16. Erome

```text
.adult18 accept
.erome status
.erome
.erome new 1
.erome search <consulta>
.erome album <album-id>
.erome dl <album-id> 1
```

Verificar carruseles, paginación, únicamente videos MP4, límite de descarga y sesión opcional por cookie.

## 17. Google y Wikipedia

```text
.google OpenAI
.wiki México
```

Google debe fallar limpiamente si la IP recibe verificación anti-bot. Wikipedia usa MediaWiki API.

## 18. Acceso privado concedido por staff

```text
.privategrant @usuario 30d
.privatestatus @usuario
.privateusers
.privaterevoke @usuario
```

La revocación manual no debe eliminar una suscripción comprada con NXC.

## 19. Persistencia

```bash
sudo systemctl restart ghost-nexora-bot ghost-nexora-web
```

Comprobar economía, perfiles, staff, acceso privado, banners, subbots, welcome/goodbye y autenticación web.

## 20. Criterio para quitar Draft

El PR puede considerarse candidato a Ready for review cuando:

- GitHub Actions esté verde en el HEAD actual;
- MainBot y web conecten sin error;
- paywall privado funcione;
- login admin/subbot funcione sin tokens persistentes en URL;
- `.system` y `.speedtest` funcionen desde staff;
- YouTube/Erome/Google/Wikipedia funcionen o fallen limpiamente;
- menú/banners/stickers funcionen en WhatsApp real;
- al menos una partida PvP y una partida de damas se completen;
- subbot reciba comandos y eventos de participantes;
- no haya regresiones críticas.

El merge a `main` sigue requiriendo autorización explícita del propietario del repositorio.
