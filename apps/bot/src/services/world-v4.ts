import { randomBytes } from 'node:crypto'
import { economy } from './economy.js'
import { activityPeriods, periodActivity } from './progression-v4.js'

const db = economy.db
const now = () => Date.now()

export type ItemKind = 'resource' | 'crafted' | 'property' | 'vehicle'

export const ITEM_CATALOG: Record<string, { label: string; kind: ItemKind; price?: number; description: string }> = {
  wood: { label: 'Madera', kind: 'resource', description: 'Recurso básico para crafting.' },
  iron: { label: 'Hierro', kind: 'resource', description: 'Metal para herramientas y kits.' },
  crystal: { label: 'Cristal Nexora', kind: 'resource', description: 'Componente raro de crafting.' },
  herb: { label: 'Hierba lunar', kind: 'resource', description: 'Ingrediente de pociones y alimento.' },
  pet_food: { label: 'Alimento de mascota', kind: 'crafted', description: 'Recupera hambre y permite entrenar mascotas.' },
  potion: { label: 'Poción Nexora', kind: 'crafted', description: 'Objeto RPG fabricado.' },
  raid_kit: { label: 'Kit de raid', kind: 'crafted', description: 'Aumenta el daño de un ataque de raid.' },
  lucky_charm: { label: 'Amuleto de suerte', kind: 'crafted', description: 'Coleccionable de crafting avanzado.' },
  energy_core: { label: 'Núcleo de energía', kind: 'crafted', description: 'Componente avanzado para futuras mejoras.' },
  room: { label: 'Habitación', kind: 'property', price: 5_000, description: 'Primera propiedad personal.' },
  apartment: { label: 'Departamento', kind: 'property', price: 25_000, description: 'Propiedad urbana intermedia.' },
  house: { label: 'Casa', kind: 'property', price: 90_000, description: 'Vivienda premium para tu perfil.' },
  villa: { label: 'Villa Nexora', kind: 'property', price: 350_000, description: 'Propiedad de alto prestigio.' },
  bike: { label: 'Bicicleta', kind: 'vehicle', price: 3_500, description: 'Vehículo básico.' },
  scooter: { label: 'Scooter', kind: 'vehicle', price: 7_500, description: 'Movilidad urbana.' },
  car: { label: 'Auto', kind: 'vehicle', price: 50_000, description: 'Vehículo personal.' },
  sportcar: { label: 'Deportivo', kind: 'vehicle', price: 180_000, description: 'Vehículo de prestigio.' },
  helicopter: { label: 'Helicóptero', kind: 'vehicle', price: 850_000, description: 'Vehículo de élite.' },
}

export const RECIPES: Record<string, { label: string; output: string; qty: number; ingredients: Record<string, number> }> = {
  pet_food: { label: 'Alimento de mascota', output: 'pet_food', qty: 2, ingredients: { herb: 2, wood: 1 } },
  potion: { label: 'Poción Nexora', output: 'potion', qty: 1, ingredients: { herb: 3, crystal: 1 } },
  raid_kit: { label: 'Kit de raid', output: 'raid_kit', qty: 1, ingredients: { iron: 4, wood: 2 } },
  lucky_charm: { label: 'Amuleto de suerte', output: 'lucky_charm', qty: 1, ingredients: { crystal: 3, herb: 2 } },
  energy_core: { label: 'Núcleo de energía', output: 'energy_core', qty: 1, ingredients: { iron: 5, crystal: 5 } },
}

export const PET_CATALOG: Record<string, { label: string; price: number; description: string }> = {
  cat: { label: 'Gato', price: 4_000, description: 'Compañero equilibrado y curioso.' },
  dog: { label: 'Perro', price: 5_000, description: 'Compañero leal y activo.' },
  slime: { label: 'Slime Nexora', price: 12_000, description: 'Mascota rara del mundo Nexora.' },
  dragon: { label: 'Dragón bebé', price: 75_000, description: 'Mascota legendaria con bonificación de raid.' },
}

db.exec(`
  CREATE TABLE IF NOT EXISTS user_items_v4 (
    user_jid TEXT NOT NULL,
    item_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_jid, item_id)
  );
  CREATE TABLE IF NOT EXISTS action_cooldowns_v4 (
    user_jid TEXT NOT NULL,
    action TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY(user_jid, action)
  );
  CREATE TABLE IF NOT EXISTS action_events_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_action_events_user_v4 ON action_events_v4(user_jid, kind, created_at);
  CREATE TABLE IF NOT EXISTS clans_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    code TEXT NOT NULL UNIQUE,
    owner_jid TEXT NOT NULL,
    treasury INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clan_members_v4 (
    clan_id INTEGER NOT NULL,
    user_jid TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member',
    contributed INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY(clan_id, user_jid),
    FOREIGN KEY(clan_id) REFERENCES clans_v4(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_clan_members_clan_v4 ON clan_members_v4(clan_id);
  CREATE TABLE IF NOT EXISTS market_listings_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_jid TEXT NOT NULL,
    buyer_jid TEXT,
    item_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_market_status_v4 ON market_listings_v4(status, created_at);
  CREATE TABLE IF NOT EXISTS pets_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    species TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    hunger INTEGER NOT NULL DEFAULT 100,
    active INTEGER NOT NULL DEFAULT 1,
    last_fed_at INTEGER NOT NULL,
    last_trained_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pets_user_v4 ON pets_v4(user_jid, active);
  CREATE TABLE IF NOT EXISTS quest_claims_v4 (
    user_jid TEXT NOT NULL,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY(user_jid, period_type, period_key, quest_id)
  );
  CREATE TABLE IF NOT EXISTS raids_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    boss_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_raids_group_v4 ON raids_v4(group_jid, status);
  CREATE TABLE IF NOT EXISTS raid_members_v4 (
    raid_id INTEGER NOT NULL,
    user_jid TEXT NOT NULL,
    damage INTEGER NOT NULL DEFAULT 0,
    last_attack INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    rewarded INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(raid_id, user_jid),
    FOREIGN KEY(raid_id) REFERENCES raids_v4(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS casino_daily_v4 (
    user_jid TEXT NOT NULL,
    day_key TEXT NOT NULL,
    wagered INTEGER NOT NULL DEFAULT 0,
    net INTEGER NOT NULL DEFAULT 0,
    plays INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_jid, day_key)
  );
`)

function ledger(userJid: string, kind: string, amount: number, note?: string, counterparty?: string) {
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(userJid, kind, Math.floor(amount), counterparty ?? null, note ?? null, now())
}

function ensureUser(userJid: string) {
  economy.balance(userJid)
}

function debitNoTx(userJid: string, amount: number, reason: string) {
  const value = Math.floor(amount)
  if (!Number.isFinite(value) || value <= 0) throw new Error('La cantidad debe ser mayor a 0.')
  ensureUser(userJid)
  const balance = economy.balance(userJid)
  if (balance.total < value) throw new Error(`Necesitas ${value.toLocaleString('es-MX')} NXC.`)
  const walletUse = Math.min(balance.wallet, value)
  const bankUse = value - walletUse
  db.prepare('UPDATE economy_users SET wallet = wallet - ?, bank = bank - ? WHERE user_jid = ?').run(walletUse, bankUse, userJid)
  ledger(userJid, reason, -value)
}

function creditNoTx(userJid: string, amount: number, reason: string, counterparty?: string) {
  const value = Math.floor(amount)
  if (value <= 0) return
  ensureUser(userJid)
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, userJid)
  ledger(userJid, reason, value, undefined, counterparty)
}

export function spend(userJid: string, amount: number, reason: string) {
  db.exec('BEGIN IMMEDIATE')
  try { debitNoTx(userJid, amount, reason); db.exec('COMMIT') }
  catch (error) { db.exec('ROLLBACK'); throw error }
  return economy.balance(userJid)
}

export function credit(userJid: string, amount: number, reason: string) {
  db.exec('BEGIN IMMEDIATE')
  try { creditNoTx(userJid, amount, reason); db.exec('COMMIT') }
  catch (error) { db.exec('ROLLBACK'); throw error }
  return economy.balance(userJid)
}

function itemQty(userJid: string, itemId: string) {
  const row = db.prepare('SELECT quantity FROM user_items_v4 WHERE user_jid = ? AND item_id = ?').get(userJid, itemId) as { quantity?: number } | undefined
  return Number(row?.quantity ?? 0)
}

function addItemNoTx(userJid: string, itemId: string, quantity: number, kind?: ItemKind) {
  const item = ITEM_CATALOG[itemId]
  const resolvedKind = kind ?? item?.kind
  if (!resolvedKind) throw new Error('Objeto desconocido.')
  db.prepare(`INSERT INTO user_items_v4(user_jid, item_id, kind, quantity, updated_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(user_jid, item_id) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at`)
    .run(userJid, itemId, resolvedKind, Math.floor(quantity), now())
  db.prepare('DELETE FROM user_items_v4 WHERE user_jid = ? AND item_id = ? AND quantity <= 0').run(userJid, itemId)
}

function removeItemNoTx(userJid: string, itemId: string, quantity: number) {
  const value = Math.floor(quantity)
  if (value <= 0) throw new Error('Cantidad inválida.')
  if (itemQty(userJid, itemId) < value) throw new Error(`No tienes suficiente ${ITEM_CATALOG[itemId]?.label ?? itemId}.`)
  db.prepare('UPDATE user_items_v4 SET quantity = quantity - ?, updated_at = ? WHERE user_jid = ? AND item_id = ?').run(value, now(), userJid, itemId)
  db.prepare('DELETE FROM user_items_v4 WHERE user_jid = ? AND item_id = ? AND quantity <= 0').run(userJid, itemId)
}

export function inventory(userJid: string) {
  return db.prepare('SELECT item_id as itemId, kind, quantity FROM user_items_v4 WHERE user_jid = ? AND quantity > 0 ORDER BY kind, item_id')
    .all(userJid) as Array<{ itemId: string; kind: ItemKind; quantity: number }>
}

function cooldownRemaining(userJid: string, action: string, durationMs: number) {
  const row = db.prepare('SELECT last_used as lastUsed FROM action_cooldowns_v4 WHERE user_jid = ? AND action = ?').get(userJid, action) as { lastUsed?: number } | undefined
  return Math.max(0, Number(row?.lastUsed ?? 0) + durationMs - now())
}

function markCooldown(userJid: string, action: string) {
  db.prepare(`INSERT INTO action_cooldowns_v4(user_jid, action, last_used) VALUES(?, ?, ?)
    ON CONFLICT(user_jid, action) DO UPDATE SET last_used = excluded.last_used`).run(userJid, action, now())
}

function event(userJid: string, kind: string, amount = 1) {
  db.prepare('INSERT INTO action_events_v4(user_jid, kind, amount, created_at) VALUES(?, ?, ?, ?)').run(userJid, kind, amount, now())
}

export function gather(userJid: string) {
  const remaining = cooldownRemaining(userJid, 'gather', 5 * 60_000)
  if (remaining) return { ok: false as const, remaining }
  const pool = ['wood', 'iron', 'herb', 'crystal'] as const
  const drops: Record<string, number> = {}
  const rolls = 2 + Math.floor(Math.random() * 3)
  db.exec('BEGIN IMMEDIATE')
  try {
    for (let i = 0; i < rolls; i += 1) {
      const item = pool[Math.floor(Math.random() * pool.length)]!
      const qty = item === 'crystal' ? 1 : 1 + Math.floor(Math.random() * 3)
      drops[item] = (drops[item] ?? 0) + qty
    }
    for (const [itemId, qty] of Object.entries(drops)) addItemNoTx(userJid, itemId, qty)
    if (Math.random() < 0.18) { addItemNoTx(userJid, 'pet_food', 1); drops.pet_food = 1 }
    markCooldown(userJid, 'gather')
    event(userJid, 'gather')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { ok: true as const, drops }
}

export function craft(userJid: string, recipeId: string, times = 1) {
  const recipe = RECIPES[recipeId]
  if (!recipe) throw new Error('Receta desconocida. Usa .craft list.')
  const count = Math.max(1, Math.min(20, Math.floor(times)))
  for (const [itemId, qty] of Object.entries(recipe.ingredients)) {
    if (itemQty(userJid, itemId) < qty * count) throw new Error(`Te falta ${ITEM_CATALOG[itemId]?.label ?? itemId}: necesitas ${qty * count}.`)
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const [itemId, qty] of Object.entries(recipe.ingredients)) removeItemNoTx(userJid, itemId, qty * count)
    addItemNoTx(userJid, recipe.output, recipe.qty * count)
    event(userJid, 'craft', count)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { recipe, count, produced: recipe.qty * count }
}

export function buyAsset(userJid: string, itemId: string, kind: 'property' | 'vehicle') {
  const item = ITEM_CATALOG[itemId]
  if (!item || item.kind !== kind || !item.price) throw new Error(`${kind === 'property' ? 'Propiedad' : 'Vehículo'} desconocido.`)
  if (itemQty(userJid, itemId) > 0) throw new Error('Ya posees este activo.')
  db.exec('BEGIN IMMEDIATE')
  try {
    debitNoTx(userJid, item.price, `v4_${kind}_purchase`)
    addItemNoTx(userJid, itemId, 1, kind)
    event(userJid, `${kind}_purchase`)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return item
}

export function assets(userJid: string, kind: 'property' | 'vehicle') {
  return inventory(userJid).filter((item) => item.kind === kind).map((owned) => ({ ...owned, ...ITEM_CATALOG[owned.itemId] }))
}

function clanCode() {
  return randomBytes(3).toString('hex').toUpperCase()
}

export function clanForUser(userJid: string) {
  return db.prepare(`SELECT c.id, c.name, c.code, c.owner_jid as ownerJid, c.treasury, c.level, c.xp, c.created_at as createdAt,
    cm.role, cm.contributed, cm.joined_at as joinedAt
    FROM clan_members_v4 cm JOIN clans_v4 c ON c.id = cm.clan_id WHERE cm.user_jid = ?`)
    .get(userJid) as { id: number; name: string; code: string; ownerJid: string; treasury: number; level: number; xp: number; createdAt: number; role: string; contributed: number; joinedAt: number } | undefined
}

export function createClan(userJid: string, name: string) {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 32)
  if (clean.length < 3) throw new Error('El nombre del clan debe tener al menos 3 caracteres.')
  if (clanForUser(userJid)) throw new Error('Ya perteneces a un clan.')
  let code = clanCode()
  while (db.prepare('SELECT 1 as ok FROM clans_v4 WHERE code = ?').get(code)) code = clanCode()
  db.exec('BEGIN IMMEDIATE')
  try {
    debitNoTx(userJid, 5_000, 'v4_clan_create')
    const result = db.prepare('INSERT INTO clans_v4(name, code, owner_jid, created_at) VALUES(?, ?, ?, ?)').run(clean, code, userJid, now())
    const id = Number(result.lastInsertRowid)
    db.prepare('INSERT INTO clan_members_v4(clan_id, user_jid, role, joined_at) VALUES(?, ?, ?, ?)').run(id, userJid, 'owner', now())
    event(userJid, 'clan_create')
    db.exec('COMMIT')
    return clanForUser(userJid)!
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function joinClan(userJid: string, code: string) {
  if (clanForUser(userJid)) throw new Error('Ya perteneces a un clan.')
  const clan = db.prepare('SELECT id, level FROM clans_v4 WHERE code = ?').get(code.trim().toUpperCase()) as { id?: number; level?: number } | undefined
  if (!clan?.id) throw new Error('Código de clan inválido.')
  const members = db.prepare('SELECT COUNT(*) as count FROM clan_members_v4 WHERE clan_id = ?').get(clan.id) as { count: number }
  const maxMembers = Math.min(50, 15 + (Number(clan.level ?? 1) - 1) * 5)
  if (Number(members.count) >= maxMembers) throw new Error('Este clan alcanzó su límite de miembros.')
  db.prepare('INSERT INTO clan_members_v4(clan_id, user_jid, role, joined_at) VALUES(?, ?, ?, ?)').run(clan.id, userJid, 'member', now())
  event(userJid, 'clan_join')
  return clanForUser(userJid)!
}

export function leaveClan(userJid: string) {
  const clan = clanForUser(userJid)
  if (!clan) throw new Error('No perteneces a un clan.')
  if (clan.ownerJid === userJid) {
    const others = db.prepare('SELECT user_jid as userJid FROM clan_members_v4 WHERE clan_id = ? AND user_jid != ? ORDER BY joined_at ASC LIMIT 1').get(clan.id, userJid) as { userJid?: string } | undefined
    if (others?.userJid) {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE clans_v4 SET owner_jid = ? WHERE id = ?').run(others.userJid, clan.id)
        db.prepare("UPDATE clan_members_v4 SET role = 'owner' WHERE clan_id = ? AND user_jid = ?").run(clan.id, others.userJid)
        db.prepare('DELETE FROM clan_members_v4 WHERE clan_id = ? AND user_jid = ?').run(clan.id, userJid)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    } else {
      db.prepare('DELETE FROM clans_v4 WHERE id = ?').run(clan.id)
    }
  } else db.prepare('DELETE FROM clan_members_v4 WHERE clan_id = ? AND user_jid = ?').run(clan.id, userJid)
  return clan.name
}

export function donateClan(userJid: string, amount: number) {
  const clan = clanForUser(userJid)
  if (!clan) throw new Error('No perteneces a un clan.')
  const value = Math.floor(amount)
  if (value < 10) throw new Error('La donación mínima es 10 NXC.')
  db.exec('BEGIN IMMEDIATE')
  try {
    debitNoTx(userJid, value, 'v4_clan_donation')
    db.prepare('UPDATE clans_v4 SET treasury = treasury + ?, xp = xp + ? WHERE id = ?').run(value, value, clan.id)
    db.prepare('UPDATE clan_members_v4 SET contributed = contributed + ? WHERE clan_id = ? AND user_jid = ?').run(value, clan.id, userJid)
    event(userJid, 'clan_donate', value)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return clanForUser(userJid)!
}

export function upgradeClan(userJid: string) {
  const clan = clanForUser(userJid)
  if (!clan) throw new Error('No perteneces a un clan.')
  if (clan.ownerJid !== userJid) throw new Error('Solo el owner del clan puede mejorarlo.')
  if (clan.level >= 8) throw new Error('El clan ya alcanzó el nivel máximo.')
  const cost = 5_000 * clan.level
  if (clan.treasury < cost) throw new Error(`La tesorería necesita ${cost.toLocaleString('es-MX')} NXC.`)
  db.prepare('UPDATE clans_v4 SET treasury = treasury - ?, level = level + 1 WHERE id = ?').run(cost, clan.id)
  return clanForUser(userJid)!
}

export function clanDetails(id: number) {
  const clan = db.prepare('SELECT id, name, code, owner_jid as ownerJid, treasury, level, xp, created_at as createdAt FROM clans_v4 WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!clan) return null
  const members = db.prepare('SELECT user_jid as userJid, role, contributed, joined_at as joinedAt FROM clan_members_v4 WHERE clan_id = ? ORDER BY contributed DESC').all(id)
  return { ...clan, members }
}

export function clanTop(limit = 10) {
  return db.prepare(`SELECT c.id, c.name, c.level, c.xp, c.treasury, COUNT(cm.user_jid) as members
    FROM clans_v4 c LEFT JOIN clan_members_v4 cm ON cm.clan_id = c.id
    GROUP BY c.id ORDER BY c.level DESC, c.xp DESC, c.treasury DESC LIMIT ?`).all(Math.max(1, Math.min(25, limit))) as Array<{ id: number; name: string; level: number; xp: number; treasury: number; members: number }>
}

export function createListing(userJid: string, itemId: string, quantity: number, price: number) {
  const qty = Math.max(1, Math.min(999, Math.floor(quantity)))
  const totalPrice = Math.floor(price)
  const row = db.prepare('SELECT kind, quantity FROM user_items_v4 WHERE user_jid = ? AND item_id = ?').get(userJid, itemId) as { kind?: ItemKind; quantity?: number } | undefined
  if (!row?.kind || Number(row.quantity ?? 0) < qty) throw new Error('No tienes suficientes unidades de ese objeto.')
  if (totalPrice < 10 || totalPrice > 10_000_000) throw new Error('El precio debe estar entre 10 y 10,000,000 NXC.')
  db.exec('BEGIN IMMEDIATE')
  try {
    removeItemNoTx(userJid, itemId, qty)
    const result = db.prepare('INSERT INTO market_listings_v4(seller_jid, item_id, kind, quantity, price, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(userJid, itemId, row.kind, qty, totalPrice, now())
    db.exec('COMMIT')
    return Number(result.lastInsertRowid)
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function marketListings(limit = 20) {
  return db.prepare(`SELECT id, seller_jid as sellerJid, item_id as itemId, kind, quantity, price, created_at as createdAt
    FROM market_listings_v4 WHERE status = 'active' ORDER BY created_at DESC LIMIT ?`).all(Math.max(1, Math.min(50, limit))) as Array<{ id: number; sellerJid: string; itemId: string; kind: ItemKind; quantity: number; price: number; createdAt: number }>
}

export function buyListing(userJid: string, listingId: number) {
  const listing = db.prepare(`SELECT id, seller_jid as sellerJid, item_id as itemId, kind, quantity, price, status
    FROM market_listings_v4 WHERE id = ?`).get(listingId) as { id: number; sellerJid: string; itemId: string; kind: ItemKind; quantity: number; price: number; status: string } | undefined
  if (!listing || listing.status !== 'active') throw new Error('La publicación ya no está disponible.')
  if (listing.sellerJid === userJid) throw new Error('No puedes comprar tu propia publicación.')
  db.exec('BEGIN IMMEDIATE')
  try {
    debitNoTx(userJid, listing.price, 'v4_market_buy')
    creditNoTx(listing.sellerJid, listing.price, 'v4_market_sale', userJid)
    addItemNoTx(userJid, listing.itemId, listing.quantity, listing.kind)
    const changed = db.prepare("UPDATE market_listings_v4 SET status = 'sold', buyer_jid = ?, completed_at = ? WHERE id = ? AND status = 'active'").run(userJid, now(), listing.id)
    if (Number(changed.changes) !== 1) throw new Error('La publicación fue comprada por otra persona.')
    event(userJid, 'market_buy')
    event(listing.sellerJid, 'market_sale')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return listing
}

export function cancelListing(userJid: string, listingId: number) {
  const listing = db.prepare("SELECT seller_jid as sellerJid, item_id as itemId, kind, quantity FROM market_listings_v4 WHERE id = ? AND status = 'active'").get(listingId) as { sellerJid?: string; itemId?: string; kind?: ItemKind; quantity?: number } | undefined
  if (!listing?.sellerJid) throw new Error('Publicación no disponible.')
  if (listing.sellerJid !== userJid) throw new Error('Solo el vendedor puede cancelar esta publicación.')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare("UPDATE market_listings_v4 SET status = 'cancelled', completed_at = ? WHERE id = ?").run(now(), listingId)
    addItemNoTx(userJid, listing.itemId!, Number(listing.quantity), listing.kind)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function adoptPet(userJid: string, species: string, name?: string) {
  const pet = PET_CATALOG[species]
  if (!pet) throw new Error('Especie desconocida.')
  const existing = db.prepare('SELECT COUNT(*) as count FROM pets_v4 WHERE user_jid = ?').get(userJid) as { count: number }
  if (Number(existing.count) >= 5) throw new Error('Puedes tener un máximo de 5 mascotas.')
  const petName = (name?.trim().slice(0, 24) || pet.label)
  db.exec('BEGIN IMMEDIATE')
  try {
    debitNoTx(userJid, pet.price, 'v4_pet_adopt')
    db.prepare('UPDATE pets_v4 SET active = 0 WHERE user_jid = ?').run(userJid)
    const result = db.prepare('INSERT INTO pets_v4(user_jid, species, name, last_fed_at, created_at) VALUES(?, ?, ?, ?, ?)').run(userJid, species, petName, now(), now())
    event(userJid, 'pet_adopt')
    db.exec('COMMIT')
    return Number(result.lastInsertRowid)
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function pets(userJid: string) {
  return db.prepare('SELECT id, species, name, level, xp, hunger, active, last_fed_at as lastFedAt, last_trained_at as lastTrainedAt FROM pets_v4 WHERE user_jid = ? ORDER BY active DESC, level DESC, created_at ASC')
    .all(userJid) as Array<{ id: number; species: string; name: string; level: number; xp: number; hunger: number; active: number; lastFedAt: number; lastTrainedAt: number }>
}

export function setActivePet(userJid: string, petId: number) {
  const row = db.prepare('SELECT id FROM pets_v4 WHERE id = ? AND user_jid = ?').get(petId, userJid) as { id?: number } | undefined
  if (!row?.id) throw new Error('Mascota no encontrada.')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE pets_v4 SET active = 0 WHERE user_jid = ?').run(userJid)
    db.prepare('UPDATE pets_v4 SET active = 1 WHERE id = ?').run(petId)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function feedPet(userJid: string) {
  const pet = db.prepare('SELECT id, hunger FROM pets_v4 WHERE user_jid = ? AND active = 1 LIMIT 1').get(userJid) as { id?: number; hunger?: number } | undefined
  if (!pet?.id) throw new Error('No tienes una mascota activa.')
  db.exec('BEGIN IMMEDIATE')
  try {
    removeItemNoTx(userJid, 'pet_food', 1)
    db.prepare('UPDATE pets_v4 SET hunger = MIN(100, hunger + 40), last_fed_at = ? WHERE id = ?').run(now(), pet.id)
    event(userJid, 'pet_feed')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return pets(userJid).find((item) => item.id === pet.id)!
}

export function trainPet(userJid: string) {
  const pet = db.prepare('SELECT id, level, xp, hunger, last_trained_at as lastTrainedAt FROM pets_v4 WHERE user_jid = ? AND active = 1 LIMIT 1').get(userJid) as { id?: number; level?: number; xp?: number; hunger?: number; lastTrainedAt?: number } | undefined
  if (!pet?.id) throw new Error('No tienes una mascota activa.')
  const remaining = Math.max(0, Number(pet.lastTrainedAt ?? 0) + 30 * 60_000 - now())
  if (remaining) return { ok: false as const, remaining }
  if (Number(pet.hunger ?? 0) < 20) throw new Error('Tu mascota tiene hambre. Usa .pet feed primero.')
  const xpGain = 20 + Math.floor(Math.random() * 31)
  const newXp = Number(pet.xp ?? 0) + xpGain
  const newLevel = Math.min(50, 1 + Math.floor(newXp / 100))
  db.prepare('UPDATE pets_v4 SET xp = ?, level = ?, hunger = MAX(0, hunger - 15), last_trained_at = ? WHERE id = ?').run(newXp, newLevel, now(), pet.id)
  event(userJid, 'pet_train')
  return { ok: true as const, xpGain, pet: pets(userJid).find((item) => item.id === pet.id)! }
}

const questDefinitions = {
  daily_messages: { type: 'day' as const, label: 'Conversador', target: 20, reward: 350, item: 'herb', itemQty: 2 },
  daily_work: { type: 'day' as const, label: 'Jornada laboral', target: 3, reward: 500, item: 'iron', itemQty: 2 },
  daily_gather: { type: 'day' as const, label: 'Recolector', target: 2, reward: 300, item: 'wood', itemQty: 3 },
  weekly_messages: { type: 'week' as const, label: 'Activo semanal', target: 100, reward: 2_000, item: 'crystal', itemQty: 3 },
  weekly_earn: { type: 'week' as const, label: 'Economía activa', target: 5_000, reward: 2_500, item: 'raid_kit', itemQty: 1 },
  weekly_raid: { type: 'week' as const, label: 'Asaltante', target: 5, reward: 2_000, item: 'pet_food', itemQty: 3 },
}

function periodStartMs(type: 'day' | 'week') {
  if (type === 'day') {
    const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const d = new Date(); const day = d.getUTCDay() || 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 1)
}

function eventCount(userJid: string, kind: string, since: number) {
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM action_events_v4 WHERE user_jid = ? AND kind = ? AND created_at >= ?').get(userJid, kind, since) as { total?: number }
  return Number(row.total ?? 0)
}

function workCount(userJid: string, since: number) {
  const row = db.prepare("SELECT COUNT(*) as count FROM economy_ledger WHERE user_jid = ? AND kind = 'work' AND created_at >= ?").get(userJid, since) as { count: number }
  return Number(row.count ?? 0)
}

function earnedSince(userJid: string, since: number) {
  const row = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM economy_ledger
    WHERE user_jid = ? AND created_at >= ? AND amount > 0 AND kind NOT IN ('transfer_in','admin_grant','web_admin_grant','v4_market_sale')`).get(userJid, since) as { total?: number }
  return Number(row.total ?? 0)
}

export function quests(userJid: string) {
  return Object.entries(questDefinitions).map(([id, q]) => {
    const key = q.type === 'day' ? activityPeriods.dayKey() : activityPeriods.weekKey()
    const since = periodStartMs(q.type)
    let progress = 0
    if (id.endsWith('messages')) progress = periodActivity(userJid, q.type, key).messages
    else if (id === 'daily_work') progress = workCount(userJid, since)
    else if (id === 'daily_gather') progress = eventCount(userJid, 'gather', since)
    else if (id === 'weekly_earn') progress = earnedSince(userJid, since)
    else if (id === 'weekly_raid') progress = eventCount(userJid, 'raid_attack', since)
    const claimed = Boolean(db.prepare('SELECT 1 as ok FROM quest_claims_v4 WHERE user_jid = ? AND period_type = ? AND period_key = ? AND quest_id = ?').get(userJid, q.type, key, id))
    return { id, ...q, periodKey: key, progress: Math.min(progress, q.target), completed: progress >= q.target, claimed }
  })
}

export function claimQuest(userJid: string, questId: string) {
  const quest = quests(userJid).find((item) => item.id === questId)
  if (!quest) throw new Error('Quest desconocida.')
  if (!quest.completed) throw new Error(`Quest incompleta: ${quest.progress}/${quest.target}.`)
  if (quest.claimed) throw new Error('Ya reclamaste esta quest en el periodo actual.')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('INSERT INTO quest_claims_v4(user_jid, period_type, period_key, quest_id, claimed_at) VALUES(?, ?, ?, ?, ?)')
      .run(userJid, quest.type, quest.periodKey, quest.id, now())
    creditNoTx(userJid, quest.reward, 'v4_quest_reward')
    addItemNoTx(userJid, quest.item, quest.itemQty)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return quest
}

const bosses = ['Leviatán de Datos', 'Dragón del Vacío', 'Titán Nexora', 'Rey Slime', 'Centinela Fantasma']

export function activeRaid(groupJid: string) {
  return db.prepare(`SELECT id, group_jid as groupJid, boss_name as bossName, status, hp, max_hp as maxHp, created_by as createdBy, created_at as createdAt, completed_at as completedAt
    FROM raids_v4 WHERE group_jid = ? AND status = 'active' ORDER BY id DESC LIMIT 1`).get(groupJid) as { id: number; groupJid: string; bossName: string; status: string; hp: number; maxHp: number; createdBy: string; createdAt: number; completedAt?: number } | undefined
}

export function startRaid(groupJid: string, userJid: string) {
  if (activeRaid(groupJid)) throw new Error('Ya hay una raid activa en este grupo.')
  const maxHp = 3_000 + Math.floor(Math.random() * 2_001)
  const boss = bosses[Math.floor(Math.random() * bosses.length)]!
  const result = db.prepare('INSERT INTO raids_v4(group_jid, boss_name, hp, max_hp, created_by, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(groupJid, boss, maxHp, maxHp, userJid, now())
  const id = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO raid_members_v4(raid_id, user_jid, joined_at) VALUES(?, ?, ?)').run(id, userJid, now())
  return activeRaid(groupJid)!
}

export function joinRaid(groupJid: string, userJid: string) {
  const raid = activeRaid(groupJid)
  if (!raid) throw new Error('No hay una raid activa.')
  db.prepare('INSERT OR IGNORE INTO raid_members_v4(raid_id, user_jid, joined_at) VALUES(?, ?, ?)').run(raid.id, userJid, now())
  return raid
}

function distributeRaidRewards(raidId: number) {
  const members = db.prepare('SELECT user_jid as userJid, damage, rewarded FROM raid_members_v4 WHERE raid_id = ?').all(raidId) as Array<{ userJid: string; damage: number; rewarded: number }>
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const member of members) {
      if (member.rewarded) continue
      const reward = 700 + Math.min(3_000, Math.floor(member.damage * 1.5))
      creditNoTx(member.userJid, reward, 'v4_raid_reward')
      addItemNoTx(member.userJid, Math.random() < 0.25 ? 'crystal' : 'iron', 1 + Math.floor(Math.random() * 2))
      db.prepare('UPDATE raid_members_v4 SET rewarded = 1 WHERE raid_id = ? AND user_jid = ?').run(raidId, member.userJid)
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function raidAttack(groupJid: string, userJid: string, useKit = false) {
  const raid = activeRaid(groupJid)
  if (!raid) throw new Error('No hay una raid activa.')
  joinRaid(groupJid, userJid)
  const member = db.prepare('SELECT damage, last_attack as lastAttack FROM raid_members_v4 WHERE raid_id = ? AND user_jid = ?').get(raid.id, userJid) as { damage?: number; lastAttack?: number }
  const remaining = Math.max(0, Number(member.lastAttack ?? 0) + 60_000 - now())
  if (remaining) return { ok: false as const, remaining }
  const pet = db.prepare('SELECT species, level FROM pets_v4 WHERE user_jid = ? AND active = 1 LIMIT 1').get(userJid) as { species?: string; level?: number } | undefined
  let damage = 80 + Math.floor(Math.random() * 121) + Number(pet?.level ?? 0) * 4
  if (pet?.species === 'dragon') damage += 35
  db.exec('BEGIN IMMEDIATE')
  try {
    if (useKit) { removeItemNoTx(userJid, 'raid_kit', 1); damage += 120 }
    const applied = Math.min(damage, raid.hp)
    db.prepare('UPDATE raid_members_v4 SET damage = damage + ?, last_attack = ? WHERE raid_id = ? AND user_jid = ?').run(applied, now(), raid.id, userJid)
    db.prepare('UPDATE raids_v4 SET hp = MAX(0, hp - ?) WHERE id = ?').run(applied, raid.id)
    event(userJid, 'raid_attack')
    db.exec('COMMIT')
    const updated = db.prepare('SELECT hp FROM raids_v4 WHERE id = ?').get(raid.id) as { hp: number }
    const defeated = Number(updated.hp) <= 0
    if (defeated) {
      db.prepare("UPDATE raids_v4 SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'").run(now(), raid.id)
      distributeRaidRewards(raid.id)
    }
    return { ok: true as const, damage: applied, hp: Number(updated.hp), maxHp: raid.maxHp, bossName: raid.bossName, defeated }
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function raidMembers(raidId: number) {
  return db.prepare('SELECT user_jid as userJid, damage, joined_at as joinedAt, rewarded FROM raid_members_v4 WHERE raid_id = ? ORDER BY damage DESC').all(raidId) as Array<{ userJid: string; damage: number; joinedAt: number; rewarded: number }>
}

const CASINO_MAX_BET = 5_000
const CASINO_DAILY_WAGER = 25_000
const CASINO_DAILY_LOSS = 10_000

function casinoRow(userJid: string) {
  const day = activityPeriods.dayKey()
  db.prepare('INSERT OR IGNORE INTO casino_daily_v4(user_jid, day_key) VALUES(?, ?)').run(userJid, day)
  const row = db.prepare('SELECT wagered, net, plays FROM casino_daily_v4 WHERE user_jid = ? AND day_key = ?').get(userJid, day) as { wagered: number; net: number; plays: number }
  return { day, wagered: Number(row.wagered), net: Number(row.net), plays: Number(row.plays) }
}

function casinoLimits(userJid: string, bet: number) {
  const value = Math.floor(bet)
  if (value < 10 || value > CASINO_MAX_BET) throw new Error(`La apuesta debe estar entre 10 y ${CASINO_MAX_BET.toLocaleString('es-MX')} NXC.`)
  const row = casinoRow(userJid)
  if (row.wagered + value > CASINO_DAILY_WAGER) throw new Error(`Límite diario de apuestas alcanzado (${CASINO_DAILY_WAGER.toLocaleString('es-MX')} NXC).`)
  if (row.net <= -CASINO_DAILY_LOSS) throw new Error(`Límite diario de pérdidas alcanzado (${CASINO_DAILY_LOSS.toLocaleString('es-MX')} NXC).`)
  return { value, row }
}

export function casinoSummary(userJid: string) {
  const row = casinoRow(userJid)
  return { ...row, maxBet: CASINO_MAX_BET, maxWager: CASINO_DAILY_WAGER, maxLoss: CASINO_DAILY_LOSS }
}

export function casinoPlay(userJid: string, game: 'slots' | 'roulette' | 'dice', bet: number, choice?: string) {
  const { value, row } = casinoLimits(userJid, bet)
  let result = ''
  let payout = 0
  if (game === 'slots') {
    const roll = Math.random()
    const multiplier = roll < 0.03 ? 6 : roll < 0.12 ? 3 : roll < 0.30 ? 1.5 : roll < 0.48 ? 1 : 0
    payout = Math.floor(value * multiplier)
    result = multiplier >= 6 ? 'JACKPOT' : multiplier > 1 ? `x${multiplier}` : multiplier === 1 ? 'Empate' : 'Sin premio'
  } else if (game === 'roulette') {
    const selected = (choice ?? '').toLowerCase()
    if (!['red', 'rojo', 'black', 'negro', 'green', 'verde'].includes(selected)) throw new Error('Elige rojo, negro o verde.')
    const number = Math.floor(Math.random() * 37)
    const color = number === 0 ? 'green' : number % 2 === 0 ? 'red' : 'black'
    const normalized = selected === 'rojo' ? 'red' : selected === 'negro' ? 'black' : selected === 'verde' ? 'green' : selected
    payout = normalized === color ? value * (color === 'green' ? 14 : 2) : 0
    result = `${number} · ${color === 'red' ? 'rojo' : color === 'black' ? 'negro' : 'verde'}`
  } else {
    const picked = Number(choice)
    if (!Number.isInteger(picked) || picked < 1 || picked > 6) throw new Error('Elige un número del 1 al 6.')
    const rolled = 1 + Math.floor(Math.random() * 6)
    payout = picked === rolled ? value * 5 : 0
    result = `Salió ${rolled}`
  }
  const net = payout - value
  db.exec('BEGIN IMMEDIATE')
  try {
    debitNoTx(userJid, value, `v4_casino_${game}_bet`)
    if (payout > 0) creditNoTx(userJid, payout, `v4_casino_${game}_payout`)
    db.prepare('UPDATE casino_daily_v4 SET wagered = wagered + ?, net = net + ?, plays = plays + 1 WHERE user_jid = ? AND day_key = ?')
      .run(value, net, userJid, row.day)
    event(userJid, 'casino_play')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { game, bet: value, payout, net, result, balance: economy.balance(userJid), limits: casinoRow(userJid) }
}

export function worldSummary() {
  const clans = db.prepare('SELECT COUNT(*) as count FROM clans_v4').get() as { count: number }
  const listings = db.prepare("SELECT COUNT(*) as count FROM market_listings_v4 WHERE status = 'active'").get() as { count: number }
  const petsCount = db.prepare('SELECT COUNT(*) as count FROM pets_v4').get() as { count: number }
  const raids = db.prepare("SELECT COUNT(*) as count FROM raids_v4 WHERE status = 'active'").get() as { count: number }
  return { clans: Number(clans.count), activeListings: Number(listings.count), pets: Number(petsCount.count), activeRaids: Number(raids.count) }
}
