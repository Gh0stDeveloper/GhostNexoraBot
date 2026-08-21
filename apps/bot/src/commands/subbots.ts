import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { economy } from '../services/economy.js'
import { subbotManager } from '../core/subbots.js'

function fmtDate(value: number | null) { return value ? new Date(value).toLocaleString('es-MX') : 'N/D' }

export const subbotCommands: BotCommand[] = [
  {
    name: 'subbot', aliases: ['jadibot', 'serbot'], category: 'subbots', description: 'Gestiona tu subbot comprado con Nexora Coins.', usage: 'subbot status|pair|portal',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      const record = economy.getActiveSubbot(ctx.sender)
      if (action === 'status') {
        if (!record) throw new Error(`No tienes un subbot activo. Consulta ${ctx.prefix}shop.`)
        await ctx.reply(['🤖 *MI SUBBOT*', '', `🆔 Instancia: #${record.id}`, `📱 Número: ${record.phone ?? 'sin vincular'}`, `🟢 Estado: ${record.status}`, `⏳ Vence: ${fmtDate(record.expiresAt)}`, `💬 Mensajes: ${record.messagesProcessed}`, `📥 Tráfico: ${(record.downloadBytes / 1024 / 1024).toFixed(1)} MB`, '', record.phone ? `Usa *${ctx.prefix}subbot portal* para abrir tu panel.` : `Vincula con *${ctx.prefix}subbot pair 52XXXXXXXXXX*.`].join('\n'))
        return
      }
      if (action === 'pair') {
        if (!record) throw new Error(`Compra una suscripción en ${ctx.prefix}shop antes de vincular un subbot.`)
        const phone = ctx.args[1] ?? ''
        if (!phone) throw new Error(`Uso: ${ctx.prefix}subbot pair 52XXXXXXXXXX`)
        const result = await subbotManager.pair(ctx.sender, phone)
        if (result.alreadyLinked) { await ctx.reply('✅ Tu subbot ya estaba vinculado.'); return }
        const pretty = result.code.match(/.{1,4}/g)?.join('-') ?? result.code
        await ctx.reply(`🔗 *CÓDIGO DE SUBBOT*\n\n*${pretty}*\n\nEn el WhatsApp que quieres convertir en subbot:\n*Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.*\n\nEl código es temporal y pertenece únicamente a tu instancia #${record.id}.`)
        return
      }
      if (action === 'portal') {
        if (!record) throw new Error('No tienes un subbot activo.')
        const token = economy.createPortalToken(ctx.sender, record.id)
        await ctx.reply(`🌐 *PANEL PRIVADO DEL SUBBOT*\n\n${config.publicWebUrl.replace(/\/$/, '')}/subbot/${token.token}\n\n🔐 Solo muestra la instancia #${record.id} y vence el ${fmtDate(token.expiresAt)}. No lo compartas.`)
        return
      }
      throw new Error(`Acción inválida. Usa ${ctx.prefix}subbot status, pair o portal.`)
    },
  },
  {
    name: 'subbots', aliases: ['subbotlist', 'jadibots'], category: 'owner', ownerOnly: true, description: 'Lista todas las instancias de subbot y consumo.',
    async handler(ctx) {
      const rows = economy.listSubbots()
      if (!rows.length) { await ctx.reply('🤖 No hay subbots registrados todavía.'); return }
      const totalMessages = rows.reduce((sum, row) => sum + row.messagesProcessed, 0)
      const totalBytes = rows.reduce((sum, row) => sum + row.downloadBytes, 0)
      const lines = rows.slice(0, 30).map((row) => `#${row.id} · ${row.status} · ${row.phone ?? 'sin número'}\nOwner: ${row.ownerJid.split('@')[0]} · vence ${fmtDate(row.expiresAt)}`)
      await ctx.reply(`👑 *CENTRO DE SUBBOTS*\n\nInstancias: *${rows.length}*\nMensajes: *${totalMessages}*\nDescargas: *${(totalBytes / 1024 / 1024).toFixed(1)} MB*\n\n${lines.join('\n\n')}\n\nUsa *${ctx.prefix}adminpanel* en chat privado para abrir el dashboard web.`)
    },
  },
  {
    name: 'adminpanel', aliases: ['dashboard'], category: 'owner', ownerOnly: true, description: 'Entrega el enlace privado al panel owner.',
    async handler(ctx) {
      if (ctx.chatId.endsWith('@g.us')) throw new Error('Por seguridad, solicita el panel desde el chat privado del bot.')
      await ctx.reply(`🔐 *OWNER DASHBOARD*\n\n${config.publicWebUrl.replace(/\/$/, '')}/admin?token=${config.adminWebToken}\n\nNo compartas este enlace. El token también está guardado en .env de la VPS.`)
    },
  },
]
