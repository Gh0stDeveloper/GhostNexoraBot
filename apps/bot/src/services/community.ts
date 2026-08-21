import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()

export type CommunityProfile = {
  userJid: string
  description: string
  birthday: string | null
  gender: string | null
  xp: number
  level: number
  commandsUsed: number
  favoriteCharacter: string | null
  claimPhrase: string | null
}

export type GroupCommunitySettings = {
  botEnabled: boolean
  goodbyeEnabled: boolean
  welcomeText: string | null
  goodbyeText: string | null
}

export type RelationshipKind = 'marriage' | 'lover'

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1)
}

function profileFromRow(row: Record<string, unknown>): CommunityProfile {
  const xp = Number(row.xp ?? 0)
  return {
    userJid: String(row.userJid),
    description: String(row.description ?? ''),
    birthday: row.birthday ? String(row.birthday) : null,
    gender: row.gender ? String(row.gender) : null,
    xp,
    level: levelFromXp(xp),
    commandsUsed: Number(row.commandsUsed ?? 0),
    favoriteCharacter: row.favoriteCharacter ? String(row.favoriteCharacter) : null,
    claimPhrase: row.claimPhrase ? String(row.claimPhrase) : null,
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS community_profiles (
    user_jid TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    birthday TEXT,
    gender TEXT,
    xp INTEGER NOT NULL DEFAULT 0,
    commands_used INTEGER NOT NULL DEFAULT 0,
    favorite_character TEXT,
    claim_phrase TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a TEXT NOT NULL,
    user_b TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_a, user_b, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_community_relationship_user_a ON community_relationships(user_a, kind);
  CREATE INDEX IF NOT EXISTS idx_community_relationship_user_b ON community_relationships(user_b, kind);
  CREATE TABLE IF NOT EXISTS community_relationship_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposer_jid TEXT NOT NULL,
    target_jid TEXT NOT NULL,
    kind TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_community_proposals_target ON community_relationship_proposals(target_jid, expires_at);
  CREATE TABLE IF NOT EXISTS community_group_settings (
    group_jid TEXT PRIMARY KEY,
    bot_enabled INTEGER NOT NULL DEFAULT 1,
    goodbye_enabled INTEGER NOT NULL DEFAULT 0,
    welcome_text TEXT,
    goodbye_text TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    chat_jid TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
`)

function ensureProfile(userJid: string) {
  db.prepare(`INSERT OR IGNORE INTO community_profiles(user_jid, created_at, updated_at) VALUES(?, ?, ?)`)
    .run(userJid, now(), now())
}

function relationshipFor(userJid: string, kind: RelationshipKind) {
  return db.prepare(`SELECT id, user_a AS userA, user_b AS userB, kind, created_at AS createdAt
    FROM community_relationships WHERE kind = ? AND (user_a = ? OR user_b = ?) ORDER BY created_at DESC LIMIT 1`)
    .get(kind, userJid, userJid) as { id: number; userA: string; userB: string; kind: RelationshipKind; createdAt: number } | undefined
}

export const community = {
  getProfile(userJid: string) {
    ensureProfile(userJid)
    const row = db.prepare(`SELECT user_jid AS userJid, description, birthday, gender, xp,
      commands_used AS commandsUsed, favorite_character AS favoriteCharacter, claim_phrase AS claimPhrase
      FROM community_profiles WHERE user_jid = ?`).get(userJid) as Record<string, unknown>
    return profileFromRow(row)
  },

  setDescription(userJid: string, description: string) {
    ensureProfile(userJid)
    const text = description.trim()
    if (!text || text.length > 240) throw new Error('La descripción debe tener entre 1 y 240 caracteres.')
    db.prepare('UPDATE community_profiles SET description = ?, updated_at = ? WHERE user_jid = ?').run(text, now(), userJid)
    return this.getProfile(userJid)
  },

  setBirthday(userJid: string, birthday: string) {
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(birthday.trim())
    if (!match) throw new Error('Usa formato DD/MM, por ejemplo 24/08.')
    const day = Number(match[1]), month = Number(match[2])
    if (day < 1 || day > 31 || month < 1 || month > 12) throw new Error('La fecha DD/MM no es válida.')
    const normalized = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
    ensureProfile(userJid)
    db.prepare('UPDATE community_profiles SET birthday = ?, updated_at = ? WHERE user_jid = ?').run(normalized, now(), userJid)
    return this.getProfile(userJid)
  },

  setGender(userJid: string, gender: string) {
    const value = gender.trim().slice(0, 32)
    if (!value) throw new Error('Indica el género que deseas mostrar en tu perfil.')
    ensureProfile(userJid)
    db.prepare('UPDATE community_profiles SET gender = ?, updated_at = ? WHERE user_jid = ?').run(value, now(), userJid)
    return this.getProfile(userJid)
  },

  setFavoriteCharacter(userJid: string, value: string | null) {
    ensureProfile(userJid)
    db.prepare('UPDATE community_profiles SET favorite_character = ?, updated_at = ? WHERE user_jid = ?').run(value?.trim() || null, now(), userJid)
  },

  setClaimPhrase(userJid: string, value: string | null) {
    ensureProfile(userJid)
    const text = value?.trim() || null
    if (text && text.length > 180) throw new Error('La frase de reclamo admite hasta 180 caracteres.')
    db.prepare('UPDATE community_profiles SET claim_phrase = ?, updated_at = ? WHERE user_jid = ?').run(text, now(), userJid)
  },

  awardCommandXp(userJid: string) {
    ensureProfile(userJid)
    const reward = 5 + Math.floor(Math.random() * 8)
    db.prepare('UPDATE community_profiles SET xp = xp + ?, commands_used = commands_used + 1, updated_at = ? WHERE user_jid = ?')
      .run(reward, now(), userJid)
    return { reward, profile: this.getProfile(userJid) }
  },

  profilesFor(userJids: string[]) {
    return userJids.map((jid) => this.getProfile(jid)).sort((a, b) => b.xp - a.xp)
  },

  getRelationship(userJid: string, kind: RelationshipKind) {
    const row = relationshipFor(userJid, kind)
    if (!row) return null
    return { ...row, partnerJid: row.userA === userJid ? row.userB : row.userA }
  },

  proposeRelationship(proposerJid: string, targetJid: string, kind: RelationshipKind) {
    if (proposerJid === targetJid) throw new Error('No puedes enviarte esta propuesta a ti mismo.')
    if (relationshipFor(proposerJid, kind)) throw new Error(kind === 'marriage' ? 'Ya tienes un matrimonio activo.' : 'Ya tienes una relación de amante activa.')
    if (relationshipFor(targetJid, kind)) throw new Error(kind === 'marriage' ? 'Ese usuario ya tiene un matrimonio activo.' : 'Ese usuario ya tiene una relación de amante activa.')
    db.prepare('DELETE FROM community_relationship_proposals WHERE expires_at <= ? OR (proposer_jid = ? AND kind = ?)').run(now(), proposerJid, kind)
    const expiresAt = now() + 10 * 60_000
    db.prepare(`INSERT INTO community_relationship_proposals(proposer_jid, target_jid, kind, expires_at, created_at)
      VALUES(?, ?, ?, ?, ?)`).run(proposerJid, targetJid, kind, expiresAt, now())
    return expiresAt
  },

  resolvePendingRelationship(targetJid: string, accept: boolean) {
    const row = db.prepare(`SELECT id, proposer_jid AS proposerJid, target_jid AS targetJid, kind, expires_at AS expiresAt
      FROM community_relationship_proposals WHERE target_jid = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
      .get(targetJid, now()) as { id: number; proposerJid: string; targetJid: string; kind: RelationshipKind; expiresAt: number } | undefined
    if (!row) return null
    db.prepare('DELETE FROM community_relationship_proposals WHERE id = ?').run(row.id)
    if (!accept) return { accepted: false as const, ...row }
    if (relationshipFor(row.proposerJid, row.kind) || relationshipFor(row.targetJid, row.kind)) {
      throw new Error('La propuesta ya no puede aceptarse porque una de las personas tiene una relación activa de ese tipo.')
    }
    const [userA, userB] = [row.proposerJid, row.targetJid].sort()
    db.prepare('INSERT INTO community_relationships(user_a, user_b, kind, created_at) VALUES(?, ?, ?, ?)')
      .run(userA, userB, row.kind, now())
    return { accepted: true as const, ...row }
  },

  endRelationship(userJid: string, kind: RelationshipKind) {
    const row = relationshipFor(userJid, kind)
    if (!row) return null
    db.prepare('DELETE FROM community_relationships WHERE id = ?').run(row.id)
    return { ...row, partnerJid: row.userA === userJid ? row.userB : row.userA }
  },

  getGroupSettings(groupJid: string): GroupCommunitySettings {
    const row = db.prepare(`SELECT bot_enabled AS botEnabled, goodbye_enabled AS goodbyeEnabled,
      welcome_text AS welcomeText, goodbye_text AS goodbyeText FROM community_group_settings WHERE group_jid = ?`)
      .get(groupJid) as Record<string, unknown> | undefined
    return {
      botEnabled: row ? Boolean(row.botEnabled) : true,
      goodbyeEnabled: row ? Boolean(row.goodbyeEnabled) : false,
      welcomeText: row?.welcomeText ? String(row.welcomeText) : null,
      goodbyeText: row?.goodbyeText ? String(row.goodbyeText) : null,
    }
  },

  setGroupBotEnabled(groupJid: string, enabled: boolean) {
    db.prepare('INSERT OR IGNORE INTO community_group_settings(group_jid, updated_at) VALUES(?, ?)').run(groupJid, now())
    db.prepare('UPDATE community_group_settings SET bot_enabled = ?, updated_at = ? WHERE group_jid = ?').run(enabled ? 1 : 0, now(), groupJid)
    return this.getGroupSettings(groupJid)
  },

  setGoodbyeEnabled(groupJid: string, enabled: boolean) {
    db.prepare('INSERT OR IGNORE INTO community_group_settings(group_jid, updated_at) VALUES(?, ?)').run(groupJid, now())
    db.prepare('UPDATE community_group_settings SET goodbye_enabled = ?, updated_at = ? WHERE group_jid = ?').run(enabled ? 1 : 0, now(), groupJid)
    return this.getGroupSettings(groupJid)
  },

  setGroupMessage(groupJid: string, kind: 'welcome' | 'goodbye', text: string | null) {
    db.prepare('INSERT OR IGNORE INTO community_group_settings(group_jid, updated_at) VALUES(?, ?)').run(groupJid, now())
    const column = kind === 'welcome' ? 'welcome_text' : 'goodbye_text'
    const value = text?.trim() || null
    if (value && value.length > 700) throw new Error('La frase admite hasta 700 caracteres.')
    db.prepare(`UPDATE community_group_settings SET ${column} = ?, updated_at = ? WHERE group_jid = ?`).run(value, now(), groupJid)
    return this.getGroupSettings(groupJid)
  },

  addSuggestion(userJid: string, chatJid: string, body: string) {
    const text = body.trim()
    if (text.length < 4 || text.length > 1200) throw new Error('La sugerencia debe tener entre 4 y 1200 caracteres.')
    const result = db.prepare('INSERT INTO community_suggestions(user_jid, chat_jid, body, created_at) VALUES(?, ?, ?, ?)')
      .run(userJid, chatJid, text, now())
    return Number(result.lastInsertRowid)
  },

  listSuggestions(limit = 15) {
    return db.prepare(`SELECT id, user_jid AS userJid, chat_jid AS chatJid, body, status, created_at AS createdAt
      FROM community_suggestions ORDER BY created_at DESC LIMIT ?`).all(Math.max(1, Math.min(50, limit))) as Array<{
        id: number; userJid: string; chatJid: string; body: string; status: string; createdAt: number
      }>
  },
}
