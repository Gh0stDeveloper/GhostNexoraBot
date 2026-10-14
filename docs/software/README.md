# Ghost Nexora Bot — documentación por software

Este índice separa el estado y la arquitectura de cada producto que forma parte de V2.0. La existencia de un documento **no significa que el software ya esté implementado**; cada README declara explícitamente su estado actual y su Definition of Done.

| Software | Estado auditado | Documento |
|---|---|---|
| Core / MainBot | Existente; refactor multiplataforma pendiente | [Core](core/README.md) |
| Web / Panel | Existente; convertir a control plane común | [Web](web/README.md) |
| WhatsApp | Existente y plataforma más madura | [WhatsApp](whatsapp/README.md) |
| Telegram | Bridge existente; plataforma completa pendiente | [Telegram](telegram/README.md) |
| Discord | Pendiente | [Discord](discord/README.md) |
| Termux Lite | Implementado con alcance Lite | [Termux Lite](termux-lite/README.md) |
| Android oficial | Pendiente | [Android](android/README.md) |
| Windows `.exe` | PowerShell existente; GUI `.exe` pendiente | [Windows](windows/README.md) |
| Kali Linux | Runtime Linux existente; GUI dedicada pendiente | [Kali Linux](kali-linux/README.md) |

## Documentos transversales

- [Auditoría y roadmap V2.0](../v2/README.md)
- [Arquitectura multiplataforma](../v2/ARCHITECTURE_MULTIPLATFORM.md)
- [Descargas V15](../DOWNLOADS_V15.md)
- [Multi-lenguaje actual](../MULTILANGUAGE.md)
- [Termux Lite actual](../TERMUX_LITE.md)
- [Windows actual](../WINDOWS_INSTALL.md)
- [Instalación Linux/VPS](../FIRST_INSTALL.md)
- [Actualización](../UPDATING.md)
- [Pruebas de aceptación VPS](../VPS_ACCEPTANCE_TESTS.md)

## Regla de estado

Usar únicamente estas categorías en documentación de V2:

- **Implementado:** existe en `main`, se compila y tiene pruebas suficientes para el alcance declarado.
- **Parcial:** existe una base funcional, pero no satisface toda la promesa pública.
- **Pendiente:** no existe todavía como producto/adapter completo.
- **Experimental:** existe código, pero no supera todavía los gates de producción.

El plan maestro es la fuente de verdad para cambiar estos estados.
