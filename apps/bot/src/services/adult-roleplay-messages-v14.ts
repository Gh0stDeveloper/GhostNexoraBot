import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

export type AdultRoleplayMessageKey = 'fuck' | 'preñar' | 'cum' | 'dick'

type StoredTemplates = Partial<Record<AdultRoleplayMessageKey, string>>

const FILE = path.join(config.dataDir, 'adult-roleplay-messages.json')
const MAX_LENGTH = 700
const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i

const aliases: Record<string, AdultRoleplayMessageKey> = {
  fuck: 'fuck',
  room: 'fuck',
  preñar: 'preñar',
  prenar: 'preñar',
  cum: 'cum',
  finishrp: 'cum',
  dick: 'dick',
  pene: 'dick',
  cock: 'dick',
}

export const DEFAULT_ADULT_ROLEPLAY_MESSAGES: Record<AdultRoleplayMessageKey, string> = {
  fuck: '{sender} inició una escena privada de roleplay consensuado con {target}',
  preñar: '{sender} inició un roleplay consensuado de pareja/familia con {target}',
  cum: '{sender} dio por terminada su escena de roleplay consensuado con {target}',
  dick: '{sender} le mostró el dick a {target} en un roleplay consensuado',
}

function normalizeCommand(value: string) {
  const clean = value.trim().toLowerCase()
  return aliases[clean]
}

function readTemplates(): StoredTemplates {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as StoredTemplates
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeTemplates(templates: StoredTemplates) {
  fs.mkdirSync(config.dataDir, { recursive: true })
  const temp = FILE + '.' + process.pid + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(templates, null, 2) + '\n', 'utf8')
  fs.renameSync(temp, FILE)
}

function validateTemplate(input: string) {
  const template = input.replace(/\\n/g, '\n').trim()
  if (template.length < 5) throw new Error('El mensaje es demasiado corto.')
  if (template.length > MAX_LENGTH) throw new Error('El mensaje no puede superar ' + MAX_LENGTH + ' caracteres.')
  if (!template.includes('{sender}') || !template.includes('{target}')) {
    throw new Error('El mensaje debe incluir los marcadores {sender} y {target}.')
  }
  if (prohibited.test(template)) {
    throw new Error('No se permiten referencias a menores en mensajes del módulo 18+.')
  }
  return template
}

export function normalizeAdultRoleplayMessageKey(value: string) {
  return normalizeCommand(value)
}

export function listAdultRoleplayMessages() {
  const custom = readTemplates()
  return (Object.keys(DEFAULT_ADULT_ROLEPLAY_MESSAGES) as AdultRoleplayMessageKey[]).map((command) => ({
    command,
    template: custom[command] ?? DEFAULT_ADULT_ROLEPLAY_MESSAGES[command],
    customized: Boolean(custom[command]),
  }))
}

export function getAdultRoleplayMessage(command: string) {
  const canonical = normalizeCommand(command)
  if (!canonical) return null
  const custom = readTemplates()
  return {
    command: canonical,
    template: custom[canonical] ?? DEFAULT_ADULT_ROLEPLAY_MESSAGES[canonical],
    customized: Boolean(custom[canonical]),
  }
}

export function setAdultRoleplayMessage(command: string, template: string) {
  const canonical = normalizeCommand(command)
  if (!canonical) throw new Error('Comando +18 no soportado. Usa fuck, preñar, cum o dick.')
  const validated = validateTemplate(template)
  const current = readTemplates()
  current[canonical] = validated
  writeTemplates(current)
  return { command: canonical, template: validated }
}

export function resetAdultRoleplayMessage(command: string) {
  const canonical = normalizeCommand(command)
  if (!canonical) throw new Error('Comando +18 no soportado. Usa fuck, preñar, cum o dick.')
  const current = readTemplates()
  delete current[canonical]
  writeTemplates(current)
  return { command: canonical, template: DEFAULT_ADULT_ROLEPLAY_MESSAGES[canonical] }
}

export function resetAllAdultRoleplayMessages() {
  writeTemplates({})
}

export function renderAdultRoleplayMessage(command: string, senderJid: string, targetJid: string) {
  const entry = getAdultRoleplayMessage(command)
  const template = entry?.template ?? '{sender} interactuó con {target}'
  const sender = '@' + senderJid.split('@')[0]
  const target = '@' + targetJid.split('@')[0]
  return template
    .replaceAll('{sender}', sender)
    .replaceAll('{target}', target)
    .replaceAll('{command}', entry?.command ?? command)
}
