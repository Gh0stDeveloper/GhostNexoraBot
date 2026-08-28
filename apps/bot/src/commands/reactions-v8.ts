import type { BotCommand } from '../types.js'
import { executeReactionCommand } from './reactions.js'

const variants = [
  ['highfive', 'chocar5', 'wave', 'Choca los cinco.'],
  ['clap', 'aplaudir', 'happy', 'Aplaude.'],
  ['laugh', 'reir', 'happy', 'Se ríe.'],
  ['headpat', 'headpats', 'pat', 'Acaricia la cabeza.'],
  ['boop', 'nariz', 'poke', 'Le da un boop.'],
  ['bonk', 'golpecito', 'kick', 'Le da un golpecito.'],
  ['facepalm', 'facepalm', 'confused', 'Se lleva la mano a la cara.'],
  ['shrug', 'encogerse', 'confused', 'Se encoge de hombros.'],
  ['salute', 'saludar', 'wave', 'Hace un saludo.'],
  ['handhold', 'tomarmano', 'cuddle', 'Toma la mano.'],
  ['comfort', 'consolar', 'cuddle', 'Consuela.'],
  ['cheerup', 'animar', 'cheer', 'Anima.'],
  ['stare', 'mirar', 'confused', 'Se queda mirando.'],
  ['panic', 'panic', 'confused', 'Entra en pánico.'],
  ['dizzy', 'mareado', 'spin', 'Se marea.'],
  ['sleep', 'dormir', 'happy', 'Se queda dormido.'],
  ['yawn', 'bostezo', 'happy', 'Bosteza.'],
  ['angry', 'enojo', 'kick', 'Se enoja.'],
  ['rage', 'furia', 'punch', 'Entra en furia.'],
  ['cryhug', 'llorarabrazo', 'hug', 'Abraza mientras llora.'],
  ['wave2', 'saludo2', 'wave', 'Saluda con energía.'],
  ['dance2', 'bailar2', 'dance', 'Baila.'],
  ['spin2', 'girar2', 'spin', 'Da vueltas.'],
  ['poke2', 'toque2', 'poke', 'Da otro toque.'],
  ['cuddle2', 'mimos2', 'cuddle', 'Da mimos.'],
] as const

export const reactionV8Commands: BotCommand[] = variants.map(([name, alias, category, description]) => ({
  name,
  aliases: [alias],
  category: 'social',
  description,
  handler: async (ctx) => executeReactionCommand(ctx, category as Parameters<typeof executeReactionCommand>[1]),
}))
