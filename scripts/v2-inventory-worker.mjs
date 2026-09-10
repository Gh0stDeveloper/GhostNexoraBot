const { commands } = await import('../apps/bot/dist/commands/index.js')

const rows = commands
  .map((command) => ({
    name: String(command.name || '').trim().toLowerCase(),
    aliases: [...new Set((command.aliases || []).map((alias) => String(alias).trim().toLowerCase()).filter(Boolean))].sort(),
    category: String(command.category || ''),
    description: String(command.description || ''),
    usage: command.usage ? String(command.usage) : undefined,
    ownerOnly: command.ownerOnly === true,
    staffOnly: command.staffOnly === true,
    subbotOwnerAllowed: command.subbotOwnerAllowed === true,
    groupOnly: command.groupOnly === true,
    adminOnly: command.adminOnly === true,
    botAdminOnly: command.botAdminOnly === true,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const canonicalCounts = new Map()
const tokenOwners = new Map()
const collisions = []
for (const row of rows) {
  canonicalCounts.set(row.name, (canonicalCounts.get(row.name) || 0) + 1)
  for (const token of [row.name, ...row.aliases]) {
    const owner = tokenOwners.get(token)
    if (owner && owner !== row.name) collisions.push({ token, first: owner, second: row.name })
    else tokenOwners.set(token, row.name)
  }
}

const result = {
  commandCount: rows.length,
  canonicalCommandCount: canonicalCounts.size,
  duplicateCanonicalNames: [...canonicalCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count })),
  aliasCollisions: collisions,
  commands: rows,
}

process.stdout.write(`\n__GNB_V2_INVENTORY__${JSON.stringify(result)}\n`)
