import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { professionsV2, V2_PROFESSIONS } from '../services/professions-v2.js'
import { resolveTarget } from '../utils/target.js'
import {
  addReputation,
  currentSeason,
  equipTitle,
  equippedTitle,
  groupStats,
  listAchievements,
  listTitles,
  progressionProfile,
  reputation,
  reputationTop,
  seasonHistory,
  syncAchievements,
} from '../services/progression-v4.js'
import {
  ITEM_CATALOG,
  PET_CATALOG,
  RECIPES,
  activeRaid,
  adoptPet,
  assets,
  buyAsset,
  buyListing,
  cancelListing,
  casinoPlay,
  casinoSummary,
  claimQuest,
  clanDetails,
  clanForUser,
  clanTop,
  createClan,
  createListing,
  craft,
  donateClan,
  feedPet,
  gather,
  inventory,
  joinClan,
  joinRaid,
  leaveClan,
  marketListings,
  pets,
  quests,
  raidAttack,
  raidMembers,
  setActivePet,
  startRaid,
  trainPet,
  upgradeClan,
  worldSummary,
} from '../services/world-v4.js'
import {
  addAnnouncement,
  addRssFeed,
  automationSummary,
  closeTicket,
  formatDuration,
  listAnnouncements,
  listPolls,
  listRssFeeds,
  listTickets,
  openTicket,
  parseDuration,
  recordPoll,
  removeAnnouncement,
  removeRssFeed,
  replyTicket,
  ticket,
} from '../services/automation-v4.js'

const nxc = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`
const shortWait = (ms: number) => ms < 60_000 ? `${Math.ceil(ms / 1000)}s` : `${Math.ceil(ms / 60_000)}m`

async function unifiedMenu(ctx: CommandContext) {
  const title = equippedTitle(ctx.sender)
  const body = [
    `👤 ${ctx.pushName}${title ? ` · ${title}` : ''}`,
    `⌨️ Prefijo: *${ctx.prefix}*`,
    '',
    `🧠 *IA/Búsqueda* — ${ctx.prefix}ai · google · wiki · anime · manga`,
    `⬇️ *Descargas* — ${ctx.prefix}yts · ytmp3 · ytmp4 · facebook · instagram · tiktok`,
    `🪙 *Economía* — ${ctx.prefix}balance · work · job · loan · miner · top`,
    `🏆 *Progreso* — ${ctx.prefix}achievements · titles · season · rep`,
    `🛡️ *Clanes* — ${ctx.prefix}clan · clantop`,
    `🛒 *Mercado* — ${ctx.prefix}market · sell · buylisting · inventory`,
    `🏠 *Mundo* — ${ctx.prefix}property · vehicle · pet`,
    `⚒️ *Crafting* — ${ctx.prefix}gather · craft`,
    `📋 *Quests* — ${ctx.prefix}quests · quest claim`,
    `🐉 *Raids* — ${ctx.prefix}raid start/join/attack/status`,
    `🎰 *Casino NXC* — ${ctx.prefix}casino · slots · roulette · dicebet`,
    `📊 *Grupos* — ${ctx.prefix}groupstats · poll · announce · rss`,
    `🎫 *Soporte* — ${ctx.prefix}ticket open/status/reply/close`,
    `🤖 *Subbot* — ${ctx.prefix}subbot status/pair/qr/reset`,
    `🔞 *18+* — ${ctx.prefix}adult18 · xvideos · xnxx · pornhub · erome`,
    `🛡️ *Admin* — ${ctx.prefix}rules · kick · promote · antilink · antispam · welcome`,
    '',
    `📢 Canal oficial: ${config.officialChannelUrl}`,
    'Usa el comando indicado para ver opciones o ejecutar la función.',
  ].join('\n')
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '👻 GHOST NEXORA BOT · MENÚ COMPLETO',
    body,
    footer: 'Ghost Developer / Nexora · V4',
    buttons: [
      { type: 'reply', text: '👤 Perfil', id: `${ctx.prefix}profile` },
      { type: 'reply', text: '🛒 Tienda', id: `${ctx.prefix}shop` },
      { type: 'reply', text: '📋 Quests', id: `${ctx.prefix}quests` },
    ],
  })
}

async function jobText(ctx: CommandContext) {
  const requested = ctx.argText.trim()
  if (requested && !['list', 'lista', 'menu'].includes(requested.toLowerCase())) {
    const selected = professionsV2.set(ctx.sender, requested)
    await ctx.reply(`💼 *PROFESIÓN ACTUALIZADA*\n${selected.emoji} *${selected.label}*\n${selected.description}\n💰 ${nxc(selected.min)} — ${nxc(selected.max)} por trabajo\n⏱️ Cooldown: 1 minuto`)
    return
  }
  const current = professionsV2.get(ctx.sender)
  const rows = Object.entries(V2_PROFESSIONS).map(([id, item], index) => `${String(index + 1).padStart(2, '0')}. ${item.emoji} *${item.label}* — ${id}\n    ${nxc(item.min)}–${nxc(item.max)}`)
  await ctx.reply(`💼 *PROFESIONES NEXORA*\nActual: ${current.emoji} *${current.label}*\n\n${rows.join('\n')}\n\nCambiar: *${ctx.prefix}job <id>*\nEjemplo: *${ctx.prefix}job scientist*`)
}

async function achievementsCommand(ctx: CommandContext) {
  const rows = syncAchievements(ctx.sender)
  const unlocked = rows.filter((item) => item.unlocked)
  await ctx.reply(`🏆 *LOGROS NEXORA*\nDesbloqueados: *${unlocked.length}/${rows.length}*\n\n${rows.map((item) => `${item.unlocked ? '✅' : '🔒'} *${item.label}* — ${item.description}${item.unlocked ? `\n   Título: ${item.title}` : ''}`).join('\n\n')}`)
}

async function titlesCommand(ctx: CommandContext) {
  syncAchievements(ctx.sender)
  const action = (ctx.args[0] ?? '').toLowerCase()
  if (action === 'set' || action === 'equip') {
    const id = ctx.args[1] ?? ''
    const title = equipTitle(ctx.sender, id)
    await ctx.reply(`🏷️ Título equipado: *${title}*`)
    return
  }
  const rows = listTitles(ctx.sender)
  if (!rows.length) throw new Error(`Todavía no desbloqueas títulos. Consulta ${ctx.prefix}achievements.`)
  await ctx.reply(`🏷️ *TÍTULOS DESBLOQUEADOS*\n${rows.map((item) => `${item.equipped ? '✅' : '•'} *${item.title}* — id: ${item.id}`).join('\n')}\n\nEquipar: *${ctx.prefix}titles set <id>*`)
}

async function seasonCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'top').toLowerCase()
  if (['history', 'historial', 'past'].includes(action)) {
    const history = seasonHistory(6)
    if (!history.length) throw new Error('Todavía no hay temporadas históricas cerradas.')
    await ctx.reply(`🗓️ *HISTORIAL DE TEMPORADAS*\n\n${history.map((season) => `*${season.label}*\n${season.rankings.slice(0, 3).map((row) => `${row.rank}. @${row.userJid.split('@')[0]} — ${nxc(row.score)}`).join('\n') || 'Sin actividad registrada.'}`).join('\n\n')}`)
    return
  }
  const season = currentSeason(10)
  const mentions = season.rankings.map((row) => row.userJid)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `🏆 *${season.label.toUpperCase()}*\nLa billetera global NO se reinicia. El ranking mide actividad económica ganada durante el periodo.\n\n${season.rankings.map((row) => `${row.rank}. @${row.userJid.split('@')[0]} — *${nxc(row.score)}*`).join('\n') || 'Aún no hay puntuación.'}\n\nHistorial: *${ctx.prefix}season history*`,
    mentions,
  }, { quoted: ctx.message })
}

async function reputationCommand(ctx: CommandContext) {
  const target = await resolveTarget(ctx) ?? ctx.sender
  const data = reputation(target)
  await ctx.socket.sendMessage(ctx.chatId, { text: `⭐ *REPUTACIÓN*\n@${target.split('@')[0]}\nPuntuación: *${data.score}*\n✅ Positivas: ${data.positive}\n⚠️ Negativas: ${data.negative}\n\nValorar: *${ctx.prefix}rep + @user razón*`, mentions: [target] }, { quoted: ctx.message })
}

async function repCommand(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde al usuario que quieres valorar.' })
  const token = ctx.args.find((item) => ['+', '+1', '-', '-1'].includes(item)) ?? '+'
  const value: 1 | -1 = token.startsWith('-') ? -1 : 1
  const reason = ctx.args.filter((item) => !['+', '+1', '-', '-1'].includes(item) && !item.startsWith('@')).join(' ').slice(0, 180)
  const result = addReputation(ctx.sender, target!, value, reason)
  await ctx.socket.sendMessage(ctx.chatId, { text: `${value > 0 ? '⭐' : '⚠️'} Reputación de @${target!.split('@')[0]}: *${result.score}*${reason ? `\nMotivo: ${reason}` : ''}`, mentions: [target!] }, { quoted: ctx.message })
}

async function repTopCommand(ctx: CommandContext) {
  const rows = reputationTop(10)
  const mentions = rows.map((row) => row.userJid)
  await ctx.socket.sendMessage(ctx.chatId, { text: `⭐ *TOP REPUTACIÓN*\n${rows.map((row, i) => `${i + 1}. @${row.userJid.split('@')[0]} — *${row.score}*`).join('\n') || 'Sin datos.'}`, mentions }, { quoted: ctx.message })
}

async function clanCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'info').toLowerCase()
  if (action === 'create' || action === 'crear') {
    const name = ctx.args.slice(1).join(' ')
    const clan = createClan(ctx.sender, name)
    await ctx.reply(`🛡️ *CLAN CREADO*\n*${clan.name}* · nivel ${clan.level}\nCódigo para unirse: *${clan.code}*\nCosto: 5,000 NXC`)
    return
  }
  if (action === 'join' || action === 'unir') {
    const clan = joinClan(ctx.sender, ctx.args[1] ?? '')
    await ctx.reply(`🛡️ Te uniste a *${clan.name}*.`)
    return
  }
  if (action === 'leave' || action === 'salir') {
    const name = leaveClan(ctx.sender); await ctx.reply(`🚪 Saliste de *${name}*.`); return
  }
  if (action === 'donate' || action === 'donar') {
    const amount = Number(ctx.args[1])
    const clan = donateClan(ctx.sender, amount)
    await ctx.reply(`💰 Donaste *${nxc(amount)}* a *${clan.name}*.\nTesorería: *${nxc(clan.treasury)}*`)
    return
  }
  if (action === 'upgrade' || action === 'mejorar') {
    const clan = upgradeClan(ctx.sender)
    await ctx.reply(`⬆️ *${clan.name}* ahora es nivel *${clan.level}*.\nCapacidad: ${Math.min(50, 15 + (clan.level - 1) * 5)} miembros.`)
    return
  }
  const clan = clanForUser(ctx.sender)
  if (!clan) {
    await ctx.reply(`🛡️ *CLANES / GREMIOS*\nCrear: *${ctx.prefix}clan create <nombre>* — 5,000 NXC\nUnirse: *${ctx.prefix}clan join <código>*\nRanking: *${ctx.prefix}clantop*`)
    return
  }
  const details = clanDetails(clan.id)!
  const members = details.members as Array<{ userJid: string; role: string; contributed: number }>
  await ctx.socket.sendMessage(ctx.chatId, { text: `🛡️ *${String(details.name).toUpperCase()}*\nNivel: *${details.level}* · XP: ${nxc(Number(details.xp))}\nTesorería: *${nxc(Number(details.treasury))}*\nCódigo: *${details.code}*\nMiembros: ${members.length}/${Math.min(50, 15 + (Number(details.level) - 1) * 5)}\n\n${members.slice(0, 15).map((m) => `• @${m.userJid.split('@')[0]} · ${m.role} · ${nxc(m.contributed)}`).join('\n')}\n\n${ctx.prefix}clan donate <NXC> · ${ctx.prefix}clan upgrade · ${ctx.prefix}clan leave`, mentions: members.map((m) => m.userJid) }, { quoted: ctx.message })
}

async function clanTopCommand(ctx: CommandContext) {
  const rows = clanTop(10)
  await ctx.reply(`🛡️ *TOP CLANES*\n${rows.map((row, i) => `${i + 1}. *${row.name}* · Nv.${row.level} · ${row.members} miembros · ${nxc(row.treasury)}`).join('\n') || 'Aún no hay clanes.'}`)
}

async function marketCommand(ctx: CommandContext) {
  const rows = marketListings(20)
  if (!rows.length) { await ctx.reply(`🛒 *MERCADO ENTRE USUARIOS*\nNo hay publicaciones activas.\nVender: *${ctx.prefix}sell <item> <cantidad> <precio total>*`); return }
  const mentions = rows.map((row) => row.sellerJid)
  await ctx.socket.sendMessage(ctx.chatId, { text: `🛒 *MERCADO NEXORA*\n${rows.map((row) => `#${row.id} · *${ITEM_CATALOG[row.itemId]?.label ?? row.itemId}* x${row.quantity} — *${nxc(row.price)}*\n   Vendedor: @${row.sellerJid.split('@')[0]} · Comprar: ${ctx.prefix}buylisting ${row.id}`).join('\n\n')}`, mentions }, { quoted: ctx.message })
}

async function inventoryCommand(ctx: CommandContext) {
  const rows = inventory(ctx.sender)
  await ctx.reply(`🎒 *INVENTARIO*\n${rows.length ? rows.map((row) => `• ${ITEM_CATALOG[row.itemId]?.label ?? row.itemId} (${row.itemId}) x${row.quantity} · ${row.kind}`).join('\n') : 'Inventario vacío.'}\n\nRecolecta: *${ctx.prefix}gather* · Fabrica: *${ctx.prefix}craft list*`)
}

async function propertyCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'buy' || action === 'comprar') {
    const item = buyAsset(ctx.sender, ctx.args[1] ?? '', 'property')
    await ctx.reply(`🏠 Compraste *${item.label}* por *${nxc(item.price!)}*.`); return
  }
  const owned = assets(ctx.sender, 'property')
  const catalog = Object.entries(ITEM_CATALOG).filter(([, item]) => item.kind === 'property')
  await ctx.reply(`🏠 *PROPIEDADES*\nPosees: ${owned.map((item) => item.label).join(', ') || 'ninguna'}\n\n${catalog.map(([id, item]) => `• *${item.label}* (${id}) — ${nxc(item.price!)}\n  ${item.description}`).join('\n')}\n\nComprar: *${ctx.prefix}property buy <id>*`)
}

async function vehicleCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'buy' || action === 'comprar') {
    const item = buyAsset(ctx.sender, ctx.args[1] ?? '', 'vehicle')
    await ctx.reply(`🚗 Compraste *${item.label}* por *${nxc(item.price!)}*.`); return
  }
  const owned = assets(ctx.sender, 'vehicle')
  const catalog = Object.entries(ITEM_CATALOG).filter(([, item]) => item.kind === 'vehicle')
  await ctx.reply(`🚗 *VEHÍCULOS*\nPosees: ${owned.map((item) => item.label).join(', ') || 'ninguno'}\n\n${catalog.map(([id, item]) => `• *${item.label}* (${id}) — ${nxc(item.price!)}`).join('\n')}\n\nComprar: *${ctx.prefix}vehicle buy <id>*`)
}

async function petCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'adopt' || action === 'adoptar') {
    const species = ctx.args[1] ?? ''
    const id = adoptPet(ctx.sender, species, ctx.args.slice(2).join(' '))
    await ctx.reply(`🐾 Mascota adoptada con ID *#${id}*. Usa *${ctx.prefix}pet* para verla.`); return
  }
  if (action === 'feed' || action === 'alimentar') {
    const p = feedPet(ctx.sender); await ctx.reply(`🍖 *${p.name}* fue alimentado. Hambre: ${p.hunger}/100.`); return
  }
  if (action === 'train' || action === 'entrenar') {
    const result = trainPet(ctx.sender)
    if (!result.ok) throw new Error(`Tu mascota puede entrenar de nuevo en ${shortWait(result.remaining)}.`)
    await ctx.reply(`🐾 *${result.pet.name}* ganó ${result.xpGain} XP. Nivel: *${result.pet.level}* · Hambre: ${result.pet.hunger}/100.`); return
  }
  if (action === 'active' || action === 'activar') {
    setActivePet(ctx.sender, Number(ctx.args[1])); await ctx.reply('🐾 Mascota activa actualizada.'); return
  }
  const rows = pets(ctx.sender)
  const catalog = Object.entries(PET_CATALOG).map(([id, item]) => `• ${item.label} (${id}) — ${nxc(item.price)}`).join('\n')
  await ctx.reply(`🐾 *MASCOTAS*\n${rows.length ? rows.map((p) => `${p.active ? '✅' : '•'} #${p.id} *${p.name}* · ${PET_CATALOG[p.species]?.label ?? p.species} · Nv.${p.level} · XP ${p.xp} · hambre ${p.hunger}/100`).join('\n') : 'No tienes mascotas.'}\n\nAdoptar:\n${catalog}\n\n${ctx.prefix}pet adopt <especie> [nombre]\n${ctx.prefix}pet feed · ${ctx.prefix}pet train · ${ctx.prefix}pet active <id>`)
}

async function gatherCommand(ctx: CommandContext) {
  const result = gather(ctx.sender)
  if (!result.ok) throw new Error(`Vuelve a recolectar en ${shortWait(result.remaining)}.`)
  await ctx.reply(`🌲 *RECOLECCIÓN COMPLETADA*\n${Object.entries(result.drops).map(([id, qty]) => `• ${ITEM_CATALOG[id]?.label ?? id} x${qty}`).join('\n')}\n\nInventario: *${ctx.prefix}inventory*`)
}

async function craftCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'list' || action === 'lista') {
    await ctx.reply(`⚒️ *RECETAS DE CRAFTING*\n${Object.entries(RECIPES).map(([id, r]) => `• *${r.label}* (${id}) → x${r.qty}\n  ${Object.entries(r.ingredients).map(([item, qty]) => `${ITEM_CATALOG[item]?.label ?? item} x${qty}`).join(' + ')}`).join('\n\n')}\n\nFabricar: *${ctx.prefix}craft <id> [cantidad]*`)
    return
  }
  const result = craft(ctx.sender, action, Number(ctx.args[1] ?? 1))
  await ctx.reply(`⚒️ Fabricaste *${result.recipe.label}* x${result.produced}.`)
}

async function questsCommand(ctx: CommandContext) {
  const rows = quests(ctx.sender)
  await ctx.reply(`📋 *QUESTS NEXORA*\n${rows.map((q) => `${q.claimed ? '✅' : q.completed ? '🎁' : '▫️'} *${q.label}* [${q.type === 'day' ? 'diaria' : 'semanal'}]\n   ${q.progress}/${q.target} · recompensa ${nxc(q.reward)} + ${ITEM_CATALOG[q.item]?.label ?? q.item} x${q.itemQty}\n   id: ${q.id}`).join('\n\n')}\n\nReclamar: *${ctx.prefix}quest claim <id>*`)
}

async function questCommand(ctx: CommandContext) {
  if ((ctx.args[0] ?? '').toLowerCase() !== 'claim') { await questsCommand(ctx); return }
  const result = claimQuest(ctx.sender, ctx.args[1] ?? '')
  await ctx.reply(`🎁 Quest *${result.label}* reclamada: *${nxc(result.reward)}* + ${ITEM_CATALOG[result.item]?.label ?? result.item} x${result.itemQty}.`)
}

async function raidCommand(ctx: CommandContext) {
  if (!ctx.isGroup) throw new Error('Las raids son cooperativas y solo funcionan en grupos.')
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (action === 'start' || action === 'crear') {
    const raid = startRaid(ctx.chatId, ctx.sender)
    await ctx.reply(`🐉 *RAID INICIADA*\nBoss: *${raid.bossName}*\nHP: *${raid.hp}/${raid.maxHp}*\n\nUnirse: *${ctx.prefix}raid join*\nAtacar: *${ctx.prefix}raid attack*`); return
  }
  if (action === 'join' || action === 'unir') { const raid = joinRaid(ctx.chatId, ctx.sender); await ctx.reply(`⚔️ Entraste a la raid contra *${raid.bossName}*.`); return }
  if (action === 'attack' || action === 'atacar') {
    const useKit = ['kit', 'raid_kit'].includes((ctx.args[1] ?? '').toLowerCase())
    const result = raidAttack(ctx.chatId, ctx.sender, useKit)
    if (!result.ok) throw new Error(`Puedes volver a atacar en ${shortWait(result.remaining)}.`)
    await ctx.reply(`⚔️ Infligiste *${result.damage}* de daño a *${result.bossName}*.\nHP restante: *${result.hp}/${result.maxHp}*${result.defeated ? '\n\n🏆 ¡BOSS DERROTADO! Las recompensas fueron distribuidas automáticamente.' : ''}`); return
  }
  const raid = activeRaid(ctx.chatId)
  if (!raid) { await ctx.reply(`🐉 No hay raid activa. Inicia una con *${ctx.prefix}raid start*.`); return }
  const members = raidMembers(raid.id)
  await ctx.socket.sendMessage(ctx.chatId, { text: `🐉 *${raid.bossName}*\nHP: *${raid.hp}/${raid.maxHp}*\nParticipantes: ${members.length}\n\n${members.slice(0, 15).map((m, i) => `${i + 1}. @${m.userJid.split('@')[0]} — ${m.damage} daño`).join('\n')}\n\n${ctx.prefix}raid join · ${ctx.prefix}raid attack [kit]`, mentions: members.map((m) => m.userJid) }, { quoted: ctx.message })
}

async function casinoCommand(ctx: CommandContext) {
  const s = casinoSummary(ctx.sender)
  await ctx.reply(`🎰 *CASINO NEXORA · SOLO NXC*\nNo usa dinero real.\nApostado hoy: *${nxc(s.wagered)} / ${nxc(s.maxWager)}*\nResultado neto: *${nxc(s.net)}*\nJugadas: ${s.plays}\nLímite por apuesta: *${nxc(s.maxBet)}*\nLímite de pérdidas: *${nxc(s.maxLoss)}*\n\n${ctx.prefix}slots <NXC>\n${ctx.prefix}roulette <NXC> <rojo|negro|verde>\n${ctx.prefix}dicebet <NXC> <1-6>`)
}

async function casinoGame(ctx: CommandContext, game: 'slots' | 'roulette' | 'dice') {
  const bet = Number(ctx.args[0])
  const result = casinoPlay(ctx.sender, game, bet, ctx.args[1])
  await ctx.reply(`🎰 *${game.toUpperCase()}*\nResultado: *${result.result}*\nApuesta: ${nxc(result.bet)}\nPremio: ${nxc(result.payout)}\nBalance neto: ${result.net >= 0 ? '+' : ''}${nxc(result.net)}\nCartera+banco: *${nxc(result.balance.total)}*`)
}

async function groupStatsCommand(ctx: CommandContext) {
  if (!ctx.isGroup) throw new Error('Este comando solo funciona en grupos.')
  const stats = groupStats(ctx.chatId)
  const mentions = stats.topUsers.map((u) => u.userJid)
  await ctx.socket.sendMessage(ctx.chatId, { text: `📊 *ESTADÍSTICAS DEL GRUPO*\nMensajes observados: *${stats.messages.toLocaleString('es-MX')}*\nComandos: *${stats.commands.toLocaleString('es-MX')}*\nUsuarios activos: *${stats.uniqueUsers}*\nEconomía combinada: *${nxc(stats.economyTotal)}*\n${stats.firstSeenAt ? `Registro desde: ${new Date(stats.firstSeenAt).toLocaleDateString('es-MX')}` : ''}\n\n*Más activos*\n${stats.topUsers.map((u, i) => `${i + 1}. @${u.userJid.split('@')[0]} — ${u.messages} mensajes · ${u.commands} comandos`).join('\n') || 'Sin datos.'}`, mentions }, { quoted: ctx.message })
}

async function announceCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'add' || action === 'crear') {
    const [durationRaw, ...messageParts] = ctx.argText.replace(/^\S+\s*/, '').split('|').map((x) => x.trim())
    const interval = parseDuration(durationRaw || '', 5 * 60_000, 30 * 86400_000)
    const message = messageParts.join(' | ')
    const id = addAnnouncement(ctx.chatId, ctx.sender, message, interval)
    await ctx.reply(`📢 Anuncio #${id} programado cada *${formatDuration(interval)}*.`); return
  }
  if (action === 'remove' || action === 'delete' || action === 'borrar') {
    removeAnnouncement(ctx.chatId, Number(ctx.args[1])); await ctx.reply('🗑️ Anuncio eliminado.'); return
  }
  const rows = listAnnouncements(ctx.chatId)
  await ctx.reply(`📢 *ANUNCIOS PROGRAMADOS*\n${rows.map((row) => `#${row.id} · cada ${formatDuration(row.intervalMs)} · ${row.enabled ? 'ON' : 'OFF'}\n${row.message.slice(0, 100)}`).join('\n\n') || 'No hay anuncios.'}\n\nCrear: *${ctx.prefix}announce add 1h | mensaje*`)
}

async function rssCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'add' || action === 'agregar') {
    const raw = ctx.argText.replace(/^\S+\s*/, '')
    const [url, label] = raw.split('|').map((x) => x.trim())
    await addRssFeed(ctx.chatId, ctx.sender, url ?? '', label)
    await ctx.reply('📰 Feed RSS/Atom validado y agregado. Se comprobará aproximadamente cada 10 minutos.'); return
  }
  if (action === 'remove' || action === 'delete' || action === 'borrar') {
    removeRssFeed(ctx.chatId, Number(ctx.args[1])); await ctx.reply('🗑️ Feed eliminado.'); return
  }
  const rows = listRssFeeds(ctx.chatId)
  await ctx.reply(`📰 *RSS / NOTICIAS CONFIGURADAS*\n${rows.map((row) => `#${row.id} · *${row.label || 'Feed'}* · ${row.enabled ? 'ON' : 'OFF'}\n${row.url}`).join('\n\n') || 'No hay feeds.'}\n\nAgregar: *${ctx.prefix}rss add <url> | nombre*`)
}

async function pollCommand(ctx: CommandContext) {
  const raw = ctx.argText.trim()
  if (!raw) throw new Error(`Uso: ${ctx.prefix}poll [multi |] Pregunta | Opción 1 | Opción 2 [| close=2h]`)
  const parts = raw.split('|').map((x) => x.trim()).filter(Boolean)
  let multi = false
  if (parts[0]?.toLowerCase() === 'multi') { multi = true; parts.shift() }
  let closesAt: number | undefined
  const closeIndex = parts.findIndex((part) => /^close=/i.test(part))
  if (closeIndex >= 0) {
    const closeRaw = parts.splice(closeIndex, 1)[0]!.split('=')[1] ?? ''
    closesAt = Date.now() + parseDuration(closeRaw, 5 * 60_000, 7 * 86400_000)
  }
  const question = parts.shift() ?? ''
  const options = parts.slice(0, 12)
  if (question.length < 2 || options.length < 2) throw new Error('La encuesta necesita una pregunta y al menos 2 opciones separadas por |.')
  const selectableCount = multi ? options.length : 1
  const sent = await ctx.socket.sendMessage(ctx.chatId, { poll: { name: question.slice(0, 240), values: options.map((x) => x.slice(0, 100)), selectableCount } }, { quoted: ctx.message })
  const id = recordPoll(ctx.chatId, ctx.sender, sent?.key?.id ?? undefined, question, options, selectableCount, closesAt)
  if (closesAt) await ctx.reply(`📊 Encuesta #${id} registrada. Cierre informativo: ${new Date(closesAt).toLocaleString('es-MX')}. WhatsApp no permite cerrar remotamente una encuesta ya enviada.`)
}

async function pollsCommand(ctx: CommandContext) {
  const rows = listPolls(ctx.chatId)
  await ctx.reply(`📊 *ENCUESTAS RECIENTES*\n${rows.map((p) => `#${p.id} · ${p.question}${p.closesAt ? ` · hasta ${new Date(p.closesAt).toLocaleString('es-MX')}` : ''}`).join('\n') || 'No hay encuestas registradas.'}`)
}

async function notifyOwners(ctx: CommandContext, text: string) {
  const ownerJids = config.owners.map((number) => `${number}@s.whatsapp.net`)
  for (const jid of ownerJids) await ctx.socket.sendMessage(jid, { text }).catch(() => undefined)
}

async function ticketCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (action === 'open' || action === 'crear') {
    const raw = ctx.argText.replace(/^\S+\s*/, '')
    const [subject, ...message] = raw.split('|').map((x) => x.trim())
    const id = openTicket(ctx.sender, ctx.chatId, subject ?? '', message.join(' | '))
    await ctx.reply(`🎫 Ticket *#${id}* creado. El staff podrá responder desde el bot.`)
    await notifyOwners(ctx, `🎫 *NUEVO TICKET #${id}*\nUsuario: ${ctx.pushName}\nAsunto: ${subject}\nRevisar: ${ctx.prefix}ticket view ${id}`)
    return
  }
  if (action === 'view' || action === 'status' || action === 'ver') {
    const id = Number(ctx.args[1])
    const data = ticket(id)
    if (!data) throw new Error('Ticket no encontrado.')
    if (data.userJid !== ctx.sender && !ctx.isBotStaff && !ctx.isOwner) throw new Error('No tienes permiso para ver ese ticket.')
    await ctx.reply(`🎫 *TICKET #${data.id} · ${data.status.toUpperCase()}*\nAsunto: *${data.subject}*\n\n${data.messages.slice(-10).map((m) => `${m.senderRole === 'staff' ? '🛡️ Staff' : '👤 Usuario'}: ${m.message}`).join('\n\n')}\n\nResponder: *${ctx.prefix}ticket reply ${id} <mensaje>*`)
    return
  }
  if (action === 'reply' || action === 'responder') {
    const id = Number(ctx.args[1])
    const current = ticket(id)
    if (!current) throw new Error('Ticket no encontrado.')
    const isStaff = ctx.isBotStaff || ctx.isOwner
    if (!isStaff && current.userJid !== ctx.sender) throw new Error('No tienes permiso para responder ese ticket.')
    const message = ctx.args.slice(2).join(' ')
    const updated = replyTicket(id, ctx.sender, isStaff ? 'staff' : 'user', message)
    if (isStaff) await ctx.socket.sendMessage(updated.chatJid, { text: `🎫 *RESPUESTA DEL STAFF · TICKET #${id}*\n${message}\n\nResponder: *${ctx.prefix}ticket reply ${id} <mensaje>*` }).catch(() => undefined)
    await ctx.reply(`✅ Respuesta añadida al ticket #${id}.`); return
  }
  if (action === 'close' || action === 'cerrar') {
    const id = Number(ctx.args[1])
    closeTicket(id, ctx.sender, ctx.isBotStaff || ctx.isOwner)
    await ctx.reply(`✅ Ticket #${id} cerrado.`); return
  }
  const rows = listTickets(ctx.sender) as Array<{ id: number; subject: string; status: string }>
  await ctx.reply(`🎫 *MIS TICKETS*\n${rows.map((t) => `#${t.id} · ${t.status} · ${t.subject}`).join('\n') || 'No tienes tickets.'}\n\nCrear: *${ctx.prefix}ticket open <asunto> | <mensaje>*`)
}

async function ticketsStaffCommand(ctx: CommandContext) {
  const rows = listTickets(undefined, (ctx.args[0] ?? 'open').toLowerCase(), 30) as Array<{ id: number; userJid: string; subject: string; status: string }>
  await ctx.socket.sendMessage(ctx.chatId, { text: `🎫 *TICKETS · STAFF*\n${rows.map((t) => `#${t.id} · ${t.status} · @${t.userJid.split('@')[0]} · ${t.subject}`).join('\n') || 'No hay tickets.'}`, mentions: rows.map((t) => t.userJid) }, { quoted: ctx.message })
}

async function apiInfoCommand(ctx: CommandContext) {
  const world = worldSummary(); const auto = automationSummary()
  await ctx.reply(`🔌 *GHOST NEXORA API · V1*\nAutenticación: Bearer ADMIN_WEB_TOKEN\nBase local: http://127.0.0.1:${config.healthPort}\n\nGET /api/v1/status\nGET /api/v1/seasons/current\nGET /api/v1/clans\nGET /api/v1/market\nGET /api/v1/groups/<jid>/stats\nGET /api/v1/users/<jid>/profile\nGET /api/v1/tickets\n\nEstado V4: ${world.clans} clanes · ${world.activeListings} ventas · ${world.activeRaids} raids · ${auto.openTickets} tickets.`)
}

export const expansionV4Commands: BotCommand[] = [
  { name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Menú único completo con botones.', handler: unifiedMenu },
  { name: 'job', aliases: ['profession', 'profesion', 'empleo'], category: 'economy', description: 'Lista/cambia profesión en texto compatible.', handler: jobText },
  { name: 'achievements', aliases: ['logros'], category: 'profile', description: 'Logros y títulos desbloqueables.', handler: achievementsCommand },
  { name: 'titles', aliases: ['titulos'], category: 'profile', description: 'Administra títulos desbloqueados.', handler: titlesCommand },
  { name: 'season', aliases: ['temporada', 'seasons'], category: 'economy', description: 'Temporadas económicas sin reset de billetera.', handler: seasonCommand },
  { name: 'reputation', aliases: ['reputacion'], category: 'social', description: 'Consulta reputación de usuario.', handler: reputationCommand },
  { name: 'rep', aliases: ['valorar'], category: 'social', description: 'Da reputación positiva o negativa.', handler: repCommand },
  { name: 'reptop', aliases: ['toprep'], category: 'social', description: 'Top de reputación.', handler: repTopCommand },
  { name: 'clan', aliases: ['guild', 'gremio'], category: 'social', description: 'Crea y administra clanes/gremios.', handler: clanCommand },
  { name: 'clantop', aliases: ['guildtop'], category: 'social', description: 'Ranking de clanes.', handler: clanTopCommand },
  { name: 'market', aliases: ['mercado'], category: 'economy', description: 'Mercado entre usuarios.', handler: marketCommand },
  { name: 'sell', aliases: ['vender'], category: 'economy', description: 'Publica un objeto en el mercado.', async handler(ctx) { const id = createListing(ctx.sender, ctx.args[0] ?? '', Number(ctx.args[1]), Number(ctx.args[2])); await ctx.reply(`🛒 Publicación creada: *#${id}*.`) } },
  { name: 'buylisting', aliases: ['marketbuy', 'compraritem'], category: 'economy', description: 'Compra una publicación del mercado.', async handler(ctx) { const item = buyListing(ctx.sender, Number(ctx.args[0])); await ctx.reply(`✅ Compraste ${ITEM_CATALOG[item.itemId]?.label ?? item.itemId} x${item.quantity} por *${nxc(item.price)}*.`) } },
  { name: 'cancellisting', aliases: ['marketcancel'], category: 'economy', description: 'Cancela tu publicación.', async handler(ctx) { cancelListing(ctx.sender, Number(ctx.args[0])); await ctx.reply('🗑️ Publicación cancelada y objeto devuelto.') } },
  { name: 'inventory', aliases: ['inv', 'inventario'], category: 'profile', description: 'Inventario RPG y de mercado.', handler: inventoryCommand },
  { name: 'property', aliases: ['propiedad', 'casa'], category: 'economy', description: 'Compra y consulta propiedades.', handler: propertyCommand },
  { name: 'vehicle', aliases: ['vehiculo', 'car'], category: 'economy', description: 'Compra y consulta vehículos.', handler: vehicleCommand },
  { name: 'pet', aliases: ['mascota'], category: 'profile', description: 'Adopta, alimenta y entrena mascotas.', handler: petCommand },
  { name: 'gather', aliases: ['recolectar'], category: 'games', description: 'Recolecta recursos para crafting.', handler: gatherCommand },
  { name: 'craft', aliases: ['crafting', 'fabricar'], category: 'games', description: 'Fabrica objetos RPG.', handler: craftCommand },
  { name: 'quests', aliases: ['misiones'], category: 'games', description: 'Quests diarias y semanales.', handler: questsCommand },
  { name: 'quest', aliases: ['mision'], category: 'games', description: 'Gestiona/reclama quests.', handler: questCommand },
  { name: 'raid', aliases: ['raids'], category: 'games', description: 'Raids cooperativas por grupo.', handler: raidCommand },
  { name: 'casino', category: 'games', description: 'Casino NXC con límites diarios.', handler: casinoCommand },
  { name: 'slots', aliases: ['tragamonedas'], category: 'games', description: 'Slots con NXC virtual.', handler: (ctx) => casinoGame(ctx, 'slots') },
  { name: 'roulette', aliases: ['ruleta'], category: 'games', description: 'Ruleta con NXC virtual.', handler: (ctx) => casinoGame(ctx, 'roulette') },
  { name: 'dicebet', aliases: ['dadoapuesta'], category: 'games', description: 'Apuesta virtual a un dado.', handler: (ctx) => casinoGame(ctx, 'dice') },
  { name: 'groupstats', aliases: ['statsgrupo'], category: 'groups', description: 'Estadísticas completas del grupo.', groupOnly: true, handler: groupStatsCommand },
  { name: 'announce', aliases: ['anuncio'], category: 'groups', description: 'Scheduler de anuncios recurrentes.', groupOnly: true, adminOnly: true, handler: announceCommand },
  { name: 'rss', aliases: ['newsfeed', 'noticiasrss'], category: 'groups', description: 'RSS/noticias configurables.', groupOnly: true, adminOnly: true, handler: rssCommand },
  { name: 'poll', aliases: ['encuesta'], category: 'groups', description: 'Encuesta avanzada single/multi.', groupOnly: true, handler: pollCommand },
  { name: 'polls', aliases: ['encuestas'], category: 'groups', description: 'Lista encuestas recientes.', groupOnly: true, handler: pollsCommand },
  { name: 'ticket', aliases: ['support', 'soporte'], category: 'general', description: 'Sistema persistente de tickets.', handler: ticketCommand },
  { name: 'tickets', aliases: ['supporttickets'], category: 'owner', description: 'Lista tickets para staff.', staffOnly: true, handler: ticketsStaffCommand },
  { name: 'api', aliases: ['apiinfo'], category: 'owner', description: 'Describe la API V1 del bot.', staffOnly: true, handler: apiInfoCommand },
  { name: 'v4profile', aliases: ['progress'], category: 'profile', description: 'Resumen de progreso V4.', async handler(ctx) { const p = progressionProfile(ctx.sender); await ctx.reply(`📈 *PROGRESO V4*\nTítulo: ${p.title ?? 'sin equipar'}\nLogros: ${p.achievements}\nTítulos: ${p.titles}\nReputación: ${p.reputation.score}\nMensajes: ${p.activity.messages}\nComandos: ${p.activity.commands}\nPatrimonio: ${nxc(p.balance.total)}`) } },
]
