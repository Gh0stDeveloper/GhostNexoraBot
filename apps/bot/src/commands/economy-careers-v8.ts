import type { BotCommand, CommandContext } from '../types.js'
import { careerLicenses, resolveCareerId } from '../services/career-licenses.js'
import { professionsV2, V2_PROFESSIONS } from '../services/professions-v2.js'

function professionRows() { return Object.entries(V2_PROFESSIONS) }
function numberToProfession(input: string) { if (!/^\d+$/.test(input)) return input; const row = professionRows()[Number(input) - 1]; if (!row) throw new Error('Profesión inválida.'); return row[0] }
function numberedList() { return professionRows().map(([id, p], i) => `${String(i + 1).padStart(2, '0')}. ${p.emoji} *${p.label}* · ${id}`).join('\n') }
async function job(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) { const current = professionsV2.get(ctx.sender); await ctx.reply(`💼 *PROFESIONES NEXORA*\n━━━━━━━━━━━━━━\nActual: ${current.emoji} *${current.label}*\n\n${numberedList()}\n\nSelecciona: *${ctx.prefix}job <número|nombre>*\nLa lista no muestra precios.`); return }
  const id = resolveCareerId(numberToProfession(input)); if (!id) throw new Error('Profesión no reconocida.')
  const status = careerLicenses.status(ctx.sender, id)
  if (!status.unlocked) { await ctx.reply(`🔒 *${status.item.emoji} ${status.item.label.toUpperCase()}*\n━━━━━━━━━━━━━━\nEsta profesión está bloqueada.\n📋 Requisitos: ${status.requirement}\n\nCuando cumplas los requisitos usa *${ctx.prefix}job ${status.profession}*.`); return }
  careerLicenses.choose(ctx.sender, status.profession)
  await ctx.reply(`✅ *PROFESIÓN SELECCIONADA*\n━━━━━━━━━━━━━━\n${status.item.emoji} *${status.item.label}*\n\nYa puedes usar *${ctx.prefix}work* o *${ctx.prefix}w*.`)
}
async function work(ctx: CommandContext) { careerLicenses.ensureCurrent(ctx.sender); const current = professionsV2.get(ctx.sender); const result = professionsV2.work(ctx.sender); if (!result.ok) throw new Error(`Ya trabajaste recientemente. Vuelve en ${Math.max(1, Math.ceil(result.remaining / 1000))} s.`); await ctx.reply(`💼 *TRABAJO COMPLETADO*\n━━━━━━━━━━━━━━\n${current.emoji} Profesión: *${current.label}*\n💰 Ganancia: *${result.reward.toLocaleString('es-MX')} NXC*\n👛 Cartera: *${result.balance.wallet.toLocaleString('es-MX')} NXC*`) }
async function requirements(ctx: CommandContext) { const input = ctx.argText.trim(); if (!input) { const m = careerLicenses.metrics(ctx.sender); await ctx.reply(`📋 *PROGRESO PROFESIONAL*\n━━━━━━━━━━━━━━\nDailys: *${m.dailies}*\nTrabajos: *${m.works}*\nMineros activos: *${m.activeMiners}*\nPatrimonio: *${m.netWorth.toLocaleString('es-MX')} NXC*`); return }; const id = resolveCareerId(numberToProfession(input)); if (!id) throw new Error('Profesión no reconocida.'); const status = careerLicenses.status(ctx.sender, id); await ctx.reply(`📋 *REQUISITOS · ${status.item.emoji} ${status.item.label}*\n━━━━━━━━━━━━━━\n${status.unlocked ? '✅ Ya está desbloqueada.' : `🔒 ${status.requirement}`}\n\nProgreso actual → Dailys: ${status.metrics.dailies} · Trabajos: ${status.metrics.works} · Mineros: ${status.metrics.activeMiners} · Patrimonio: ${status.metrics.netWorth.toLocaleString('es-MX')} NXC`) }
export const economyCareersV8Commands: BotCommand[] = [
  { name: 'job', aliases: ['profession', 'profesion', 'empleo'], category: 'economy', description: 'Lista y selecciona profesiones en texto plano, sin precios.', usage: 'job [número|profesión]', handler: job },
  { name: 'work', aliases: ['w', 'trabajar', 'trabajo'], category: 'economy', description: 'Trabaja con tu profesión actual.', usage: 'work', handler: work },
  { name: 'jobrequirements', aliases: ['jobrequisitos', 'careerrequirements'], category: 'economy', description: 'Muestra requisitos y progreso profesional.', usage: 'jobrequirements [profesión]', handler: requirements },
]
