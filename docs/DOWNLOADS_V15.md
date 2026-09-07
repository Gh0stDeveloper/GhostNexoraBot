# Descargas V15 · Ghost Nexora Bot

V15 consolida los flujos de descarga que anteriormente estaban repartidos entre varias generaciones de comandos y podían sobrescribirse entre sí dentro del router.

## Aplicaciones Android

El comando global `.apk` queda retirado del registro efectivo. Cada catálogo tiene su propio comando y su propia selección/descarga.

| Fuente | Buscar | Selección interna | Descarga interna |
|---|---|---|---|
| Uptodown | `.uptodown <app>` | `.uptodownselect` | `.uptodowndl` |
| LiteAPKS | `.liteapks <app>` | `.liteapksselect` | `.liteapksdl` |
| Aptoide | `.aptoide <app>` | `.aptoideselect` | `.aptoidedl` |
| HappyMod | `.happymod <app>` | `.happymodselect` | `.happymoddl` |
| F-Droid | `.fdroid <app>` | `.fdroidselect` | `.fdroiddl` |
| APK.Tools | `.apktools <app>` | `.apktoolsselect` | `.apktoolsdl` |
| AndroForever | `.androforever <app>` | `.androforeverselect` | `.androforeverdl` |

Los comandos `*select` y `*dl` son principalmente callbacks de los botones y normalmente no se escriben manualmente.

### Filtrado de búsqueda

Las búsquedas V15 normalizan mayúsculas/minúsculas, tildes y puntuación. Los términos significativos de la consulta deben estar presentes en el nombre/metadatos del resultado antes de mostrarlo. Los resultados se ordenan por relevancia y se limita el carrusel a ocho tarjetas.

### Carrusel compatible

Cada resultado de búsqueda utiliza el mismo patrón select-first de YouTube:

1. una tarjeta por resultado;
2. máximo ocho tarjetas;
3. un único botón `Seleccionar` por tarjeta;
4. el botón contiene un token corto, no una URL extensa;
5. la pantalla de selección posterior muestra `Descargar`.

Esto evita los carruseles antiguos con combinaciones de quick-reply + URL CTA que algunos clientes de WhatsApp renderizaban como “Actualizar WhatsApp”.

## TikTok

`.tiktok` y `.tt` tienen una única implementación canónica.

```text
.tt <URL de TikTok>
.tt <búsqueda>
.tt search <búsqueda>
.tt profiles <nombre o usuario>
.tt perfil <@usuario>
.tt profile <@usuario|URL de perfil>
```

### Comportamiento

- Si la entrada empieza con `http://` o `https://`, debe pertenecer a TikTok. Se descarga directamente y nunca se transforma en una búsqueda de texto.
- Una entrada normal realiza búsqueda de videos.
- `profiles/perfiles/users/usuarios` busca cuentas públicas.
- `profile/perfil/user/usuario` abre el perfil y después obtiene videos públicos cuyo autor coincide exactamente con ese perfil.
- Los carruseles de videos/perfiles utilizan tokens cortos y un único botón por tarjeta.

## XVideos / XNXX / Pornhub

Los comandos efectivos son:

```text
.xvideos <búsqueda|url>
.xnxx <búsqueda|url>
.pornhub <búsqueda|url>
```

El consentimiento 18+ y las políticas de grupo/privado continúan aplicándose.

V15 cambia únicamente la presentación/selección y el filtrado:

- resultados estrictamente relacionados con la consulta;
- máximo ocho tarjetas;
- un solo botón `Seleccionar` por tarjeta;
- sin URL CTA dentro del carrusel;
- token corto para la selección;
- descarga en una tarjeta posterior.

## Router

Los handlers legados que colisionaban con estos comandos se filtran antes de construir el registro efectivo. El smoke test `scripts/download-routing-v15-smoke.mjs` comprueba que cada comando canónico exista exactamente una vez y que `.apk`/`.apkdl` ya no tengan ruta global.
