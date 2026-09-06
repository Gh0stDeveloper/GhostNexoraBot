import QRCode from 'qrcode'
import { config } from '../config.js'
import type { BotCommand, CommandContext } from '../types.js'
import { economy } from '../services/economy.js'
import { subbotManager } from '../core/subbots.js'

function fmtDate(value: number | null) { return value ? new Date(value).toLocaleString('es-MX') : 'N/D' }
function webBase() { return config.publicWebUrl.replace(/\/$/, '') }
function webAvailable() { return !config.isTermuxLite && config.webEnabled }

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '⚪ Pendiente de vincular',
    pairing: '🟡 Vinculación en curso',
    starting: '🟠 Iniciando conexión',
    online: '🟢 Online',
    offline: '🟠 Offline · reconectando',
    logged_out: '🔴 Sesión cerrada por WhatsApp',
    revoked: '🔴 Revocado',
    expired: '⚫ Expirado',
  }
  return labels[status] ?? status
}

async function sendQr(ctx: CommandContext, instanceId: number, qr: string, reason?: string) {
  const image = await QRCode.toBuffer(qr, { type: 'png', width: 720, margin: 2, errorCorrectionLevel: 'M' })
  await ctx.socket.sendMessage(ctx.chatId, {
    image,
    caption: [
      '📲 *QR DE VINCULACIÓN · SUBBOT*',
      '━━━━━━━━━━━━━━',
      `Instancia: *#${instanceId}*`,
      reason ? 'El código numérico no estuvo disponible, así que activé el método QR automáticamente.' : 'Método QR listo.',
      '',
      'En el WhatsApp que quieres convertir en subbot:',
      '*Dispositivos vinculados → Vincular un dispositivo*',
      'y escanea este QR.',
      '',
      '⚠️ El QR es temporal. Si vence, vuelve a usar *.subbot qr*.',
    ].filter(Boolean).join('\n'),
  }, { quoted: ctx.message })
}

export const subbotCommands: BotCommand[] = [
  {
    name: 'subbot', aliases: ['jadibot', 'serbot'], category: 'subbots', description: 'Gestiona tu subbot comprado o regalado.', usage: webAvailable() ? 'subbot status|pair|qr|reset|portal' : 'subbot status|pair|qr|reset',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      // getActive() also repairs older databases where subbot_slot existed but
      // the runtime row was missing.
      const record = subbotManager.getActive(ctx.sender)

      if (action === 'status') {
        if (!record) throw new Error(`No tienes un subbot activo. Consulta ${ctx.prefix}shop o solicita una concesión al staff.`)
        await ctx.reply([
          '🤖 *MI SUBBOT*',
          '',
          `🆔 Instancia: #${record.id}`,
          `📱 Número: ${record.phone ?? 'sin vincular'}`,
          `🔌 Estado: *${statusLabel(record.status)}*`,
          `⏳ Vence: ${fmtDate(record.expiresAt)}`,
          `💬 Mensajes: ${record.messagesProcessed}`,
          `📥 Tráfico: ${(record.downloadBytes / 1024 / 1024).toFixed(1)} MB`,
          '',
          record.status === 'pending'
            ? `Debes volver a vincular con *${ctx.prefix}subbot pair 52XXXXXXXXXX* o *${ctx.prefix}subbot qr*.`
            : record.status === 'logged_out'
              ? `WhatsApp cerró la sesión. Usa *${ctx.prefix}subbot reset* y vuelve a vincular.`
              : record.phone
                ? (webAvailable()
                  ? `La reconexión es automática. Portal: *${ctx.prefix}subbot portal*. Si la sesión quedó dañada, usa *${ctx.prefix}subbot reset*.`
                  : `La reconexión es automática. Si la sesión quedó dañada, usa *${ctx.prefix}subbot reset* y vuelve a vincular.`)
                : `Vincula con *${ctx.prefix}subbot pair 52XXXXXXXXXX*. Si el código falla, usa *${ctx.prefix}subbot qr*.`,
        ].join('\n'))
        return
      }

      if (['reset', 'borrar', 'delete', 'unlink', 'relink'].includes(action)) {
        if (!record) throw new Error('No tienes una instancia vigente para restablecer.')
        await subbotManager.resetById(record.id)
        await ctx.reply([
          '🧹 *SESIÓN SUBBOT RESTABLECIDA*',
          '',
          `Instancia: *#${record.id}*`,
          'Se eliminaron credenciales, sesión local y tokens de portal.',
          '*Tu compra/regalo y fecha de vencimiento se conservaron.*',
          '',
          `Vuelve a vincular con *${ctx.prefix}subbot pair 52XXXXXXXXXX*`,
          `o usa *${ctx.prefix}subbot qr*.`
        ].join('\n'))
        return
      }

      if (action === 'pair') {
        if (!record) throw new Error(`Compra una suscripción en ${ctx.prefix}shop o solicita una concesión al staff antes de vincular un subbot.`)
        const phone = ctx.args[1] ?? ''
        if (!phone) throw new Error(`Uso: ${ctx.prefix}subbot pair 52XXXXXXXXXX`)
        const result = await subbotManager.pair(ctx.sender, phone)
        if (result.alreadyLinked) {
          await ctx.reply(`ℹ️ La instancia #${record.id} todavía contiene credenciales vinculadas. Si no responde, usa *${ctx.prefix}subbot reset* y vuelve a vincular.`)
          return
        }
        if (result.qr) {
          await sendQr(ctx, record.id, result.qr, result.fallbackReason)
          return
        }
        if (!result.code) throw new Error('WhatsApp no devolvió código ni QR de vinculación.')
        const pretty = result.code.match(/.{1,4}/g)?.join('-') ?? result.code
        await ctx.reply([
          '🔗 *CÓDIGO DE SUBBOT*',
          '',
          `*${pretty}*`,
          '',
          'En el WhatsApp que quieres convertir en subbot:',
          '*Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.*',
          '',
          `El código es temporal y pertenece únicamente a tu instancia #${record.id}.`,
          `El estado pasará a *online* solo cuando WhatsApp confirme la conexión.`,
          `Si WhatsApp rechaza el código, usa *${ctx.prefix}subbot qr*.`
        ].join('\n'))
        return
      }

      if (action === 'qr') {
        if (!record) throw new Error(`Compra una suscripción en ${ctx.prefix}shop o solicita una concesión al staff antes de vincular un subbot.`)
        const result = await subbotManager.qr(ctx.sender)
        if (result.alreadyLinked) {
          await ctx.reply(`ℹ️ La instancia #${record.id} ya contiene credenciales. Si no responde, usa *${ctx.prefix}subbot reset* antes de pedir un QR nuevo.`)
          return
        }
        if (!result.qr) throw new Error('WhatsApp no devolvió un QR válido.')
        await sendQr(ctx, record.id, result.qr)
        return
      }

      if (action === 'portal') {
        if (!webAvailable()) throw new Error('El dashboard web no está habilitado en esta instalación. Gestiona el subbot directamente con status, pair, qr y reset.')
        if (!record) throw new Error('No tienes un subbot activo.')
        const token = economy.createPortalToken(ctx.sender, record.id)
        await ctx.reply([
          '🌐 *ACCESO WEB DEL SUBBOT*',
          '',
          `Panel: ${webBase()}/login?mode=subbot`,
          '',
          'Token de acceso:',
          `*${token.token}*`,
          '',
          `Instancia: *#${record.id}*`,
          `Vence: *${fmtDate(token.expiresAt)}*`,
          '',
          'Abre el panel, selecciona Subbot y pega el token. Después del login se usa una sesión segura y el token no quedará en la URL.',
          'No compartas este token.',
        ].join('\n'))
        return
      }

      throw new Error(webAvailable()
        ? `Acción inválida. Usa ${ctx.prefix}subbot status, pair, qr, reset o portal.`
        : `Acción inválida. Usa ${ctx.prefix}subbot status, pair, qr o reset.`)
    },
  },
  {
    name: 'subbots', aliases: ['subbotlist', 'jadibots'], category: 'owner', ownerOnly: true, description: 'Lista todas las instancias de subbot y consumo.',
    async handler(ctx) {
      const rows = economy.listSubbots()
      if (!rows.length) { await ctx.reply('🤖 No hay subbots registrados todavía.'); return }
      const totalMessages = rows.reduce((sum, row) => sum + row.messagesProcessed, 0)
      const totalBytes = rows.reduce((sum, row) => sum + row.downloadBytes, 0)
      const lines = rows.slice(0, 30).map((row) => `#${row.id} · ${statusLabel(row.status)} · ${row.phone ?? 'sin número'}\nOwner: ${row.ownerJid.split('@')[0]} · vence ${fmtDate(row.expiresAt)}`)
      const footer = webAvailable()
        ? `Usa *${ctx.prefix}adminpanel* en chat privado para abrir el dashboard web.`
        : 'Gestión directa desde WhatsApp: el dashboard web está deshabilitado en esta instalación.'
      await ctx.reply(`👑 *CENTRO DE SUBBOTS*\n\nInstancias: *${rows.length}*\nMensajes: *${totalMessages}*\nDescargas: *${(totalBytes / 1024 / 1024).toFixed(1)} MB*\n\n${lines.join('\n\n')}\n\n${footer}`)
    },
  },
  {
    name: 'adminpanel', aliases: ['dashboard'], category: 'owner', ownerOnly: true, description: 'Entrega el acceso al panel owner.',
    async handler(ctx) {
      if (!webAvailable()) throw new Error('El dashboard web no está habilitado en esta instalación de Ghost Nexora Bot.')
      if (ctx.chatId.endsWith('@g.us')) throw new Error('Por seguridad, solicita el panel desde el chat privado del bot.')
      await ctx.reply([
        '🔐 *OWNER DASHBOARD*',
        '',
        `Panel: ${webBase()}/login?mode=admin`,
        '',
        'Token administrativo:',
        `*${config.adminWebToken}*`,
        '',
        'Pega el token en la pantalla Administrador. Después del login se usa una cookie HttpOnly firmada y el token ya no aparece en la URL.',
        'No compartas este token.',
      ].join('\n'))
    },
  },
]
