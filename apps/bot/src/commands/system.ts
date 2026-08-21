import type { BotCommand } from '../types.js'
import { runSpeedTest, systemSnapshot } from '../services/system.js'

export const systemCommands: BotCommand[] = [
  {
    name: 'system', aliases: ['sys', 'vps'], category: 'owner', staffOnly: true,
    description: 'Muestra información operativa de la VPS sin exponer credenciales ni IP pública.',
    async handler(ctx) {
      const info = await systemSnapshot()
      await ctx.reply([
        '╭━━〔 🖥️ *SISTEMA VPS* 〕━━╮',
        `┃ Hostname » *${info.hostname}*`,
        `┃ Sistema » *${info.platform}*`,
        `┃ Arquitectura » *${info.arch}*`,
        `┃ CPU » *${info.cpu}*`,
        `┃ Núcleos » *${info.cores}*`,
        `┃ Load 1/5/15m » *${info.load}*`,
        `┃ RAM » *${info.ramUsed} / ${info.ramTotal}* (${info.ramPercent}%)`,
        `┃ Disco / » *${info.diskUsed} / ${info.diskTotal}* (${info.diskPercent}%)`,
        `┃ Uptime VPS » *${info.uptime}*`,
        `┃ Node.js » *${info.node}*`,
        `┃ RAM proceso bot » *${info.processMemory}*`,
        '╰━━━━━━━━━━━━━━━━━━━━╯',
        '',
        'La IP pública y las credenciales no se muestran en WhatsApp.',
      ].join('\n'))
    },
  },
  {
    name: 'speedtest', aliases: ['speed', 'netspeed'], category: 'owner', staffOnly: true,
    description: 'Mide latencia, descarga y subida de la VPS mediante Cloudflare.',
    async handler(ctx) {
      await ctx.reply('🌐 *SPEEDTEST VPS*\n━━━━━━━━━━━━━━\nEjecutando prueba de red. Puede tardar varios segundos y transferirá aproximadamente 33 MB...')
      const result = await runSpeedTest(ctx.sender)
      await ctx.reply([
        '╭━━〔 🌐 *SPEEDTEST VPS* 〕━━╮',
        `┃ Proveedor » *${result.provider}*`,
        `┃ Latencia » *${result.latencyMs.toFixed(0)} ms*`,
        `┃ Descarga » *${result.downloadMbps.toFixed(2)} Mbps*`,
        `┃ Subida » *${result.uploadMbps.toFixed(2)} Mbps*`,
        `┃ Datos prueba » *${(result.transferredBytes / 1024 / 1024).toFixed(1)} MB*`,
        '╰━━━━━━━━━━━━━━━━━━━━╯',
        '',
        'Resultado orientativo: depende de la ruta entre la VPS y el nodo de prueba.',
      ].join('\n'))
    },
  },
]
