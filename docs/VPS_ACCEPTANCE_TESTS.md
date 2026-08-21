# Ghost Nexora Bot — Pruebas de aceptación en VPS

Esta guía valida la rama `feature/ghost-nexora-bot-v1` antes de quitar el estado Draft del PR y antes de cualquier merge a `main`.

> No hacer merge únicamente porque GitHub Actions esté verde. Las integraciones con WhatsApp, YouTube móvil, yt1s, FFmpeg, webpmux y proveedores externos necesitan prueba real desde la VPS.

## 1. Actualizar la VPS

```bash
sudo env BRANCH=feature/ghost-nexora-bot-v1 /opt/ghost-nexora-bot/scripts/update.sh
```

El updater instala `webp/webpmux` si hace falta, actualiza dependencias, ejecuta build y reinicia los servicios.

Comprobar:

```bash
systemctl status ghost-nexora-bot --no-pager -l
journalctl -u ghost-nexora-bot -n 150 --no-pager
command -v ffmpeg
command -v webpmux
command -v yt-dlp
```

## 2. Paywall obligatorio en chat privado

Usar una cuenta que **no** sea Owner, staff ni tenga `private_access`.

### Debe funcionar sin suscripción

```text
.menu
.shop
.balance
.buy private1d
```

Antes de comprar, `.menu` debe mostrar únicamente la tarjeta de acceso privado y los planes.

### Debe quedar bloqueado sin suscripción

```text
.ping
.profile
.work
.yts prueba
.rw
.s
```

También probar responder `aceptar` o `rechazar` en privado: no debe ejecutar una propuesta sin acceso premium.

### Activación inmediata

Después de acumular NXC desde grupos:

```text
.buy private1d
```

A continuación:

```text
.ping
.profile
```

ambos deben funcionar inmediatamente, sin reiniciar el bot.

## 3. Menú e identidad visual

```text
.menu
.info
```

Verificar:

- foto real del bot si no existe banner;
- botón `Visitar canal`;
- URL del canal no expuesta como línea de texto en el menú;
- nombre, moneda, uptime y rol correctos;
- no aparecen comandos inexistentes.

### Banner del menú

Citar una imagen:

```text
.sb
```

Luego:

```text
.menu
```

Debe usar el banner. Restaurar:

```text
.delbanner
```

## 4. Staff global

Como Owner:

```text
.botadmin add @usuario
.botadmins
```

Desde la cuenta añadida probar:

```text
.status
.suggestions
```

Luego:

```text
.botadmin remove @usuario
```

La cuenta ya no debe conservar permisos globales.

## 5. Bienvenida y despedida

En un grupo donde el bot sea administrador:

```text
.welcome on
.goodbye on
.setwelcome 🌿 Bienvenido $user a $namegroup
.setgoodbye 🍂 $user dejó $namegroup
```

Agregar y retirar una cuenta de prueba.

Verificar menciones, nombre de grupo e imagen.

### Banners persistentes

Citar imagen/GIF/video corto:

```text
.welbanner
.byebanner
```

Agregar/retirar miembro nuevamente.

Restaurar:

```text
.delwelbanner
.delbyebanner
```

## 6. YouTube — búsqueda móvil + yt1s

Probar primero búsqueda:

```text
.yts Linkin Park Numb
```

Debe obtener resultados a través del parser de `m.youtube.com` cuando esté disponible.

Después:

```text
.play Linkin Park Numb
.ytmusic Linkin Park Numb
.yt Linkin Park Numb 720
```

Y con URL:

```text
.ytmp3 https://www.youtube.com/watch?v=kXYiU_JCYtU
.ytmp4 https://www.youtube.com/watch?v=kXYiU_JCYtU 720
```

Orden esperado de descarga:

1. yt1s;
2. proveedor HTTP alternativo;
3. yt-dlp local.

Si yt1s cambia su API, el bot debe intentar los fallbacks y devolver un error resumido, no una traza gigante.

## 7. Sticker pack y sprite

Configurar:

```text
.spack Ghost Test Pack
```

Citar una imagen:

```text
.s
```

Abrir los detalles del sticker desde WhatsApp y comprobar el nombre del pack.

Restablecer:

```text
.spack reset
```

Sprite:

```text
.sprite Megumin
```

Debe generar una animación MP4 con reproducción tipo GIF.

## 8. Juegos PvP

Usar dos cuentas reales en el mismo grupo.

### Tres en raya

```text
.tpvp @usuario 100
```

El rival debe aceptar con botón o:

```text
.tpvp accept
```

Probar movimientos del 1 al 9. Verificar turnos, victoria, empate y pago.

También:

```text
.lttt @usuario 100
```

### Blackjack PvP

```text
.bjvs 100 @usuario
```

El rival acepta. Verificar que **la apuesta del rival no se descuenta antes de aceptar**.

### Damas PvP

```text
.damas 100 @usuario
```

Tras aceptar, mover con coordenadas:

```text
.damas b6-a5
```

Verificar:

- turnos;
- capturas obligatorias;
- multicapturas;
- coronación;
- victoria por eliminación o falta de movimientos;
- devolución si el reto expira/rechaza;
- premio si alguien se rinde durante una partida activa.

### Damas contra IA

```text
.damasbot gratis
```

Mover con:

```text
.damasbot b6-a5
```

## 9. Gacha

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

Probar entre dos usuarios:

```text
.givewaifu Megumin @usuario
.trade Megumin / Zero @usuario
.giveallharem @usuario
```

Verificar confirmaciones y revalidación de propiedad.

## 10. Economía y Grimorio

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

Probar al menos un buff:

```text
.comprar fortuna
.usar fortuna
.work
```

Verificar que el efecto sea real y persistente.

## 11. Reacciones y roleplay 18+

SFW:

```text
.hug @usuario
.kiss @usuario
.pat @usuario
```

Para roleplay 18+, ambos participantes deben ejecutar:

```text
.adult18 accept
```

El staff habilita globalmente:

```text
.adultmode on
```

Y el admin del grupo:

```text
.nsfw on
```

Solo entonces probar:

```text
.preñar @usuario
.fuck @usuario
.cum @usuario
```

El contenido debe mantenerse no gráfico. Si uno de los dos no tiene consentimiento, el comando debe rechazarse.

## 12. Subbot e identidad independiente

Después de adquirir y vincular una instancia, **desde el propio subbot** ejecutar como dueño:

```text
.setbotname Ghost / Ghost Personal Bot
.setbotcurrency Ghost Coins
.setpfp
.sb
.welbanner
.byebanner
.menu
```

Verificar:

- esos cambios solo afectan esa instancia;
- el MainBot conserva su identidad;
- otros subbots conservan la suya;
- el dueño del subbot puede personalizar su propia instancia sin convertirse en staff global;
- usuarios ajenos no pueden personalizarla;
- bienvenida/despedida funcionan también desde el socket del subbot.

## 13. Booru y módulo adulto

SFW:

```text
.safebooru hatsune_miku
```

Con NSFW y consentimiento habilitados:

```text
.gelbooru tags
.e621 tags
```

No deben aceptar términos bloqueados relacionados con menores.

## 14. Persistencia

Reiniciar:

```bash
sudo systemctl restart ghost-nexora-bot
```

Volver a comprobar:

- saldo/economía;
- perfiles;
- staff global;
- banners;
- sticker pack;
- identidad del subbot;
- grupo `bot on/off`;
- welcome/goodbye;
- partidas persistentes que deban seguir activas.

## 15. Criterio para quitar Draft

El PR puede considerarse candidato a `Ready for review` cuando:

- GitHub Actions esté verde en el HEAD actual;
- el MainBot conecte sin error;
- paywall privado haya sido verificado con cuenta sin acceso y con cuenta suscrita;
- YouTube búsqueda/descarga funcione o falle limpiamente usando fallbacks;
- menú/banners/stickers funcionen en WhatsApp real;
- al menos una partida PvP y una partida de damas se completen;
- subbot reciba comandos y eventos de participantes;
- no haya regresiones críticas en economía/gacha/grupos.

El merge a `main` sigue requiriendo autorización explícita del propietario del repositorio.
