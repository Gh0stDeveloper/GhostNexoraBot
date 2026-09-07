import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BotCommand } from '../types.js'
import { config } from '../config.js'
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
  {
    name: 'actualizar', aliases: ['updatebot', 'botupdate'], category: 'owner', ownerOnly: true,
    description: 'Solicita una actualización segura del MainBot ejecutando el update.sh oficial de la VPS.',
    usage: 'actualizar',
    async handler(ctx) {
      if (ctx.instanceId) throw new Error('Este comando solo puede ejecutarse desde el MainBot.')
      if (process.platform !== 'linux' || config.isTermuxLite) throw new Error('La actualización remota solo está disponible en la instalación VPS/Linux con systemd.')
      if (!existsSync('/etc/systemd/system/ghost-nexora-update.path')) {
        throw new Error('El trigger seguro de actualización todavía no está instalado. Ejecuta una vez `sudo ghostnexorabot update` en la VPS para habilitarlo.')
      }

      await mkdir(config.dataDir, { recursive: true })
      const requestFile = path.join(config.dataDir, 'update-request')

      // Respondemos antes de crear la señal porque update.sh reiniciará el proceso
      // y la conexión puede cerrarse durante la propia actualización.
      await ctx.reply([
        '♻️ *ACTUALIZACIÓN SOLICITADA*',
        '━━━━━━━━━━━━━━',
        'Ghost Nexora Bot ejecutará el actualizador oficial de la VPS.',
        'Se actualizarán código, dependencias y build, y el MainBot se reiniciará al finalizar.',
        '',
        'El comando no acepta parámetros ni ejecuta instrucciones arbitrarias.',
      ].join('\n'))

      await writeFile(requestFile, JSON.stringify({
        requestedAt: new Date().toISOString(),
        requestedBy: ctx.sender,
      }), { encoding: 'utf8', mode: 0o600 })
    },
  },
]
