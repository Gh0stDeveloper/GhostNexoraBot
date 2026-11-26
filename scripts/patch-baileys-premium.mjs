// Parche para Baileys 7.0.0-rc14: campo `premium` en los stickers.
//
// El proto de WhatsApp ya tiene `premium` en StickerMessage (campo 24,
// int32: 1 = sticker premium, 0 = no premium), pero el Baileys que usa
// el bot (7.0.0-rc14, la última versión publicada) no lo conoce: al
// decodificar un sticker, ese campo se descarta y .get nunca lo muestra.
// Este script añade el campo al codec generado de Baileys (WAProto)
// para que la decodificación lo conserve y .get lo muestre.
//
// Uso:
//   node scripts/patch-baileys-premium.mjs            (busca Baileys en node_modules)
//   node scripts/patch-baileys-premium.mjs <ruta>    (ruta a @whiskeysockets/baileys)
//
// Es idempotente: si el parche ya está aplicado, no hace nada.
// Falla con mensaje claro si la versión de Baileys no es 7.0.0-rc14 o si
// los textos que busca no coinciden (en ese caso no toca nada).
// Después de aplicar el parche hay que compilar de nuevo el bot
// (npm run build) y reiniciar el servicio.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ESPERADA = '7.0.0-rc14'

// Campo 24 de StickerMessage en el proto actual de WhatsApp
// (wppconnect-team/wa-proto, WAProto.proto): optional int32 premium = 24
// Tag en el cable: (24 << 3) | 0 = 192, varint.
const TAG_PREMIUM = 192

function buscarBaileys() {
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const raiz = path.resolve(aqui, '..')
  // 1) Donde Node lo resolvería (igual que el bot al arrancar)
  const req = createRequire(import.meta.url)
  for (const base of [raiz, path.join(raiz, 'apps', 'bot')]) {
    try {
      const pkgJson = req.resolve('@whiskeysockets/baileys/package.json', { paths: [base] })
      return path.dirname(pkgJson)
    } catch {}
  }
  // 2) Rutas directas habituales
  const candidatos = [
    path.join(raiz, 'node_modules', '@whiskeysockets', 'baileys'),
    path.join(raiz, 'apps', 'bot', 'node_modules', '@whiskeysockets', 'baileys'),
  ]
  for (const c of candidatos) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c
  }
  // 3) Búsqueda bajo la raíz, por si npm lo instaló en otro sitio
  const cola = [{ dir: raiz, prof: 0 }]
  while (cola.length) {
    const { dir, prof } = cola.shift()
    const cand = path.join(dir, 'node_modules', '@whiskeysockets', 'baileys', 'package.json')
    if (fs.existsSync(cand)) return path.dirname(cand)
    if (prof >= 3) continue
    let entradas
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entradas) {
      if (!e.isDirectory()) continue
      if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('dist')) continue
      cola.push({ dir: path.join(dir, e.name), prof: prof + 1 })
    }
  }
  return null
}

function reemplazarUnaVez(texto, ancla, nuevo, etiqueta) {
  const n = texto.split(ancla).length - 1
  if (n === 0) throw new Error(`no encontré el texto de: ${etiqueta}`)
  if (n > 1) throw new Error(`el texto de ${etiqueta} aparece ${n} veces, no es único`)
  return texto.replace(ancla, nuevo)
}

// Devuelve el bloque de StickerMessage en WAProto/index.js (desde su
// inicio hasta su `return StickerMessage;`). Todas las ediciones se hacen
// solo dentro de ese bloque: otros mensajes (imagen, video, audio...)
// tienen campos iguales y no se deben tocar.
function bloqueStickerJs(texto) {
  const inicio = texto.indexOf('Message.StickerMessage = (function() {')
  if (inicio < 0) throw new Error('no encontré el bloque de StickerMessage en index.js')
  const fin = texto.indexOf('return StickerMessage;', inicio)
  if (fin < 0) throw new Error('no encontré el final del bloque de StickerMessage en index.js')
  return { inicio, fin, bloque: texto.slice(inicio, fin) }
}

function parchearIndexJs(ruta) {
  let texto = fs.readFileSync(ruta, 'utf8')
  if (texto.includes('StickerMessage.prototype.premium = null')) {
    console.log('WAProto/index.js: el parche ya está aplicado, no hago nada.')
    return false
  }
  const { inicio, fin, bloque } = bloqueStickerJs(texto)
  let b = bloque
  b = reemplazarUnaVez(
    b,
    '            StickerMessage.prototype.mediaKeyDomain = null;',
    '            StickerMessage.prototype.mediaKeyDomain = null;\n            StickerMessage.prototype.premium = null;',
    'prototype.premium',
  )
  b = reemplazarUnaVez(
    b,
    `            Object.defineProperty(StickerMessage.prototype, "_mediaKeyDomain", {
                get: $util.oneOfGetter($oneOfFields = ["mediaKeyDomain"]),
                set: $util.oneOfSetter($oneOfFields)
            });`,
    `            Object.defineProperty(StickerMessage.prototype, "_mediaKeyDomain", {
                get: $util.oneOfGetter($oneOfFields = ["mediaKeyDomain"]),
                set: $util.oneOfSetter($oneOfFields)
            });
            Object.defineProperty(StickerMessage.prototype, "_premium", {
                get: $util.oneOfGetter($oneOfFields = ["premium"]),
                set: $util.oneOfSetter($oneOfFields)
            });`,
    'oneOf _premium',
  )
  b = reemplazarUnaVez(
    b,
    `                if (m.mediaKeyDomain != null && Object.hasOwnProperty.call(m, "mediaKeyDomain"))
                    w.uint32(184).int32(m.mediaKeyDomain);
                return w;`,
    `                if (m.mediaKeyDomain != null && Object.hasOwnProperty.call(m, "mediaKeyDomain"))
                    w.uint32(184).int32(m.mediaKeyDomain);
                if (m.premium != null && Object.hasOwnProperty.call(m, "premium"))
                    w.uint32(${TAG_PREMIUM}).int32(m.premium);
                return w;`,
    'encode premium',
  )
  b = reemplazarUnaVez(
    b,
    `                    case 23: {
                            m.mediaKeyDomain = r.int32();
                            break;
                        }
                    default:`,
    `                    case 23: {
                            m.mediaKeyDomain = r.int32();
                            break;
                        }
                    case 24: {
                            m.premium = r.int32();
                            break;
                        }
                    default:`,
    'decode premium',
  )
  b = reemplazarUnaVez(
    b,
    `                    m.mediaKeyDomain = 4;
                    break;
                }
                return m;`,
    `                    m.mediaKeyDomain = 4;
                    break;
                }
                if (d.premium != null) {
                    m.premium = d.premium | 0;
                }
                return m;`,
    'fromObject premium',
  )
  b = reemplazarUnaVez(
    b,
    `                if (m.mediaKeyDomain != null && m.hasOwnProperty("mediaKeyDomain")) {
                    d.mediaKeyDomain = o.enums === String ? $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] === undefined ? m.mediaKeyDomain : $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] : m.mediaKeyDomain;
                    if (o.oneofs)
                        d._mediaKeyDomain = "mediaKeyDomain";
                }
                return d;`,
    `                if (m.mediaKeyDomain != null && m.hasOwnProperty("mediaKeyDomain")) {
                    d.mediaKeyDomain = o.enums === String ? $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] === undefined ? m.mediaKeyDomain : $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] : m.mediaKeyDomain;
                    if (o.oneofs)
                        d._mediaKeyDomain = "mediaKeyDomain";
                }
                if (m.premium != null && m.hasOwnProperty("premium")) {
                    d.premium = m.premium;
                    if (o.oneofs)
                        d._premium = "premium";
                }
                return d;`,
    'toObject premium',
  )
  texto = texto.slice(0, inicio) + b + texto.slice(fin)
  fs.writeFileSync(ruta, texto)
  console.log('WAProto/index.js: parche aplicado (premium, campo 24).')
  return true
}

function parchearIndexDts(ruta) {
  let texto = fs.readFileSync(ruta, 'utf8')
  if (texto.includes('premium?: (number|null);')) {
    console.log('WAProto/index.d.ts: el parche ya está aplicado, no hago nada.')
    return false
  }
  // Interfaz IStickerMessage: añadir premium después de su mediaKeyDomain
  const inicioInterfaz = texto.indexOf('interface IStickerMessage {')
  if (inicioInterfaz < 0) throw new Error('no encontré IStickerMessage en index.d.ts')
  const anclaInterfaz = '            mediaKeyDomain?: (proto.Message.MediaKeyDomain|null);'
  const posInterfaz = texto.indexOf(anclaInterfaz, inicioInterfaz)
  if (posInterfaz < 0) throw new Error('no encontré mediaKeyDomain en IStickerMessage')
  texto =
    texto.slice(0, posInterfaz + anclaInterfaz.length) +
    '\n            premium?: (number|null);' +
    texto.slice(posInterfaz + anclaInterfaz.length)
  // Clase StickerMessage: añadir premium después de su mediaKeyDomain
  const inicioClase = texto.indexOf('class StickerMessage implements IStickerMessage {')
  if (inicioClase < 0) throw new Error('no encontré la clase StickerMessage en index.d.ts')
  const anclaClase = '            public mediaKeyDomain?: (proto.Message.MediaKeyDomain|null);'
  const posClase = texto.indexOf(anclaClase, inicioClase)
  if (posClase < 0) throw new Error('no encontré mediaKeyDomain en la clase StickerMessage')
  texto =
    texto.slice(0, posClase + anclaClase.length) +
    '\n            public premium?: (number|null);' +
    texto.slice(posClase + anclaClase.length)
  fs.writeFileSync(ruta, texto)
  console.log('WAProto/index.d.ts: parche aplicado (premium).')
  return true
}

const dirBaileys = process.argv[2] ? path.resolve(process.argv[2]) : buscarBaileys()
if (!dirBaileys) {
  console.error('No encontré Baileys. Busca dónde está con: find . -maxdepth 6 -type d -name baileys (desde la raíz del repo)')
  console.error('Y luego corre: node scripts/patch-baileys-premium.mjs <esa ruta>')
  process.exit(1)
}
const pkg = JSON.parse(fs.readFileSync(path.join(dirBaileys, 'package.json'), 'utf8'))
if (pkg.version !== ESPERADA) {
  console.error(`Baileys es ${pkg.version}, el parche es solo para ${ESPERADA}. No toco nada.`)
  process.exit(1)
}
const js = path.join(dirBaileys, 'WAProto', 'index.js')
const dts = path.join(dirBaileys, 'WAProto', 'index.d.ts')
try {
  const a = parchearIndexJs(js)
  const b = parchearIndexDts(dts)
  if (!a && !b) console.log('Parche ya aplicado en todo. Nada que hacer.')
  else console.log('Listo. Compila el bot (npm run build) y reinicia el servicio.')
} catch (e) {
  console.error('ERROR al aplicar el parche:', e.message)
  console.error('No se tocó nada que no se haya podido verificar. Revisa la versión de Baileys.')
  process.exit(1)
}
