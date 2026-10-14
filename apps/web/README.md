# `@ghostnexora/web`

Workspace del panel Web de Ghost Nexora Bot.

## Estado actual

Aplicación Next.js App Router opcional. El árbol actual incluye administración, API, navegador/proxy, login y portal de subbots. En V2 evolucionará a un control plane neutral para WhatsApp, Telegram, Discord y las aplicaciones oficiales.

Documentación detallada:

- [Web / Panel V2](../../docs/software/web/README.md)
- [Arquitectura multiplataforma](../../docs/v2/ARCHITECTURE_MULTIPLATFORM.md)
- [Plan V2.0](../../docs/v2/README.md)

## Requisitos

```text
Node.js >= 24
npm >= 11
```

El Web es opcional. El MainBot debe continuar funcionando con `WEB_ENABLED=false`.

## Desarrollo y build

Desde la raíz:

```bash
npm run build --workspace=@ghostnexora/web
npm run typecheck --workspace=@ghostnexora/web
npm run web
```

Desde `apps/web` usar los scripts declarados en su `package.json`.

## Estructura actual

```text
app/
  admin/       administración
  api/         endpoints
  browser/     interfaz de navegador
  login/       autenticación
  proxy/       integración proxy
  subbot/      portal/subbots
  layout.tsx
  page.tsx
components/
lib/
```

## Reglas V2

- no asumir que toda conexión es WhatsApp;
- consumir DTOs comunes de Control API;
- secretos se muestran como configurados/no configurados, nunca en claro;
- todas las mutaciones administrativas requieren autenticación/autorización;
- internacionalizar texto user-facing en español e inglés;
- Web deshabilitado no debe registrar dependencias funcionales obligatorias en el bot;
- proxy/browser debe conservar mitigaciones SSRF y límites de red/tamaño.

## Control plane objetivo

```text
Dashboard
Plataformas
Instancias/Subbots
Configuración
Idiomas
Módulos
Descargas/providers
Ollama/IA
Logs
Métricas
Actualización/rollback
Backups
Seguridad
```

## Aplicaciones oficiales

La aplicación desktop Windows/Kali puede compartir componentes y contratos con este workspace, pero no debe depender de abrir una URL pública para administrar un runtime local. Android consumirá los mismos endpoints mediante cliente nativo.

## Testing

Además de build/typecheck, V2 debe cubrir:

```text
auth y sesiones
roles
Control API contract
i18n
platform status
redacción de secretos
security headers
proxy SSRF regression
update workflow
```

## Release

La compatibilidad del Web debe declararse contra la versión del Control API. El cambio a V2 no debe romper una instalación Bot Only.
