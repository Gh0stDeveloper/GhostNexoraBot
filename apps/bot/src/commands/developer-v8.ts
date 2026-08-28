import os from 'node:os'
import { statfsSync } from 'node:fs'
import type { BotCommand, CommandContext } from '../types.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { isDeveloperAccessEnabled } from '../services/developer-access-v7.js'
import { BOT_VERSION, BOT_STATUS } from './version-v8.js'

function allowed(ctx: CommandContext) { if (ctx.isOwner || ctx.isSubbotOwner) return true; if (isDeveloperAccessEnabled(ctx.instanceId) && ctx.isBotStaff) return true; if (isDeveloperAccessEnabled(ctx.instanceId)) return true; throw new Error(`El modo Developer está desactivado. El owner debe usar ${ctx.prefix}devaccess on.`) }
function fmtBytes(v: number) { if (v > 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} GB`; return `${(v / 1024 ** 2).toFixed(1)} MB` }

async function devStatus(ctx: CommandContext) { allowed(ctx); const mem = process.memoryUsage(); await ctx.reply(`🛠️ *DEVELOPER STATUS*\n━━━━━━━━━━━━━━\nVersión: *${BOT_VERSION}*\nEstado: *${BOT_STATUS}*\nNode: *${process.version}*\nPlataforma: *${process.platform}*\nArquitectura: *${process.arch}*\nCPU: *${os.cpus().length}*\nRAM RSS: *${fmtBytes(mem.rss)}*\nHeap: *${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}*\nComandos efectivos: *${effectiveCommands().length}*\nUptime: *${Math.floor(process.uptime())} s*`) }
async function devMemory(ctx: CommandContext) { allowed(ctx); const m = process.memoryUsage(); await ctx.reply(`🧠 *MEMORIA*\n━━━━━━━━━━━━━━\nRSS: ${fmtBytes(m.rss)}\nHeap usado: ${fmtBytes(m.heapUsed)}\nHeap total: ${fmtBytes(m.heapTotal)}\nExternal: ${fmtBytes(m.external)}`) }
async function devDisk(ctx: CommandContext) { allowed(ctx); const target = process.cwd(); const fs = statfsSync(target); const total = Number(fs.blocks) * Number(fs.bsize); const free = Number(fs.bavail) * Number(fs.bsize); await ctx.reply(`💾 *DISCO*\n━━━━━━━━━━━━━━\nRuta: *${target}*\nTotal: *${fmtBytes(total)}*\nLibre: *${fmtBytes(free)}*\nUsado: *${fmtBytes(Math.max(0, total - free))}*`) }
async function devEnv(ctx: CommandContext) { allowed(ctx); const names = Object.keys(process.env).filter((k) => /^(BOT_|DATA_|SESSION_|PUBLIC_|WEB_|LOG_|TELEGRAM_|LEMPI_|AI_|OPENROUTER_|ADULT_)/i.test(k)).filter((k) => !/KEY|TOKEN|COOKIE|SECRET|PASSWORD/i.test(k)); await ctx.reply(`⚙️ *CONFIGURACIÓN NO SENSIBLE*\n━━━━━━━━━━━━━━\n${names.sort().map((n) => `• ${n}`).join('\n') || 'Sin variables públicas.'}\n\n🔐 Valores secretos no se muestran.`) }
async function devCommands(ctx: CommandContext) { allowed(ctx); const rows = effectiveCommands().map((x) => `${x.command.name} → ${x.command.description}`); await ctx.reply(`🧩 *COMANDOS REGISTRADOS*\n━━━━━━━━━━━━━━\n${rows.join('\n').slice(0, 12000)}`) }
async function devHelp(ctx: CommandContext) { allowed(ctx); await ctx.reply(`🛠️ *DEVELOPER MENU*\n━━━━━━━━━━━━━━\n${ctx.prefix}devaccess on|off|status\n${ctx.prefix}devstatus · estado runtime\n${ctx.prefix}devmemory · memoria\n${ctx.prefix}devdisk · disco\n${ctx.prefix}devenv · nombres de configuración no sensible\n${ctx.prefix}devcommands · catálogo de comandos\n${ctx.prefix}version · beta del bot\n\nEl owner/dueño de subbot controla la activación.`) }
export const developerV8Commands: BotCommand[] = [
  { name: 'devstatus', aliases: ['developerstatus'], category: 'owner', description: 'Estado técnico del modo Developer.', usage: 'devstatus', handler: devStatus },
  { name: 'devmemory', aliases: ['devram'], category: 'owner', description: 'Muestra memoria del proceso.', usage: 'devmemory', handler: devMemory },
  { name: 'devdisk', aliases: ['devstorage'], category: 'owner', description: 'Muestra espacio del sistema de archivos.', usage: 'devdisk', handler: devDisk },
  { name: 'devenv', aliases: ['devconfig'], category: 'owner', description: 'Lista únicamente nombres de variables no sensibles.', usage: 'devenv', handler: devEnv },
  { name: 'devcommands', aliases: ['devcatalog'], category: 'owner', description: 'Lista comandos efectivos del bot.', usage: 'devcommands', handler: devCommands },
  { name: 'devhelp', aliases: ['developer'], category: 'owner', description: 'Muestra las herramientas Developer disponibles.', usage: 'devhelp', handler: devHelp },
]
