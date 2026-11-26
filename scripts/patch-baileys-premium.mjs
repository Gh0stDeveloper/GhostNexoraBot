// Parche para Baileys 7.0.0-rc14: campos completos de StickerMessage y
// de Message para los stickers con sonido.
//
// El proto de WhatsApp ya tiene estos campos, pero el Baileys que usa el
// bot (7.0.0-rc14, la última versión publicada) no los conoce: al
// decodificar, esos campos se descartan.
//
//   StickerMessage:
//     premium = 24 (int32: 1 = sticker premium, 0 = no premium)
//     emojis = 25 (repeated string: emojis asociados al sticker)
//     audioMessage = 26 (AudioMessage: el sonido de un sticker con sonido)
//   Message:
//     audioStickerMessage = 134 (FutureProofMessage: el envoltorio de un
//       sticker con sonido; adentro trae el stickerMessage con su audio)
//
// (wppconnect-team/wa-proto, WAProto.proto)
//
// Sin este parche, .get nunca muestra el audio de un sticker con sonido
// ni si es premium, y .relay/.stickerpremium no pueden conservar el
// sonido al reenviar (el audio ni siquiera llega al JSON).
//
// El campo 134 es además el único sitio donde vive el audio: cuando se
// responde a un sticker con sonido, la cita que manda WhatsApp solo trae
// lo visual (el stickerMessage sin audioMessage). El audio solo está en
// el mensaje original, dentro de audioStickerMessage. Sin el campo 134,
// Baileys tira el envoltorio entero al decodificar y el bot jamás ve
// el audio, aunque el sticker se le mande directo.
//
// Este script añade los cuatro campos al codec generado de Baileys
// (WAProto) para que la decodificación los conserve y .get muestre el
// JSON completo.
//
// Uso:
//   node scripts/patch-baileys-premium.mjs            (busca Baileys en node_modules)
//   node scripts/patch-baileys-premium.mjs <ruta>    (ruta a baileys o @whiskeysockets/baileys)
//
// Es idempotente: cada campo se revisa por separado; si ya está aplicado,
// ese campo no se toca (así, si ya corriste la versión que solo ponía
// premium, esta versión solo agrega emojis y audioMessage).
// Busca Baileys con nombre con ámbito (@whiskeysockets/baileys) o sin
// ámbito (baileys). Si la versión no es 7.0.0-rc14 avisa y lo intenta
// igual: si los textos que busca no coinciden, falla sin tocar nada.
// Después de aplicar el parche hay que compilar de nuevo el bot
// (npm run build) y reiniciar el servicio.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ESPERADA = '7.0.0-rc14'

// Campos de StickerMessage en el proto actual de WhatsApp.
// Tags en el cable: premium (24<<3)|0 = 192, emojis (25<<3)|2 = 202,
// audioMessage (26<<3)|2 = 210.
// Campo de Message: audioStickerMessage (134<<3)|2 = 1074.
const TAG_PREMIUM = 192
const TAG_EMOJIS = 202
const TAG_AUDIO = 210
const TAG_AUDIO_STICKER = 1074

// Baileys puede estar instalado con ámbito (@whiskeysockets/baileys)
// o sin ámbito (baileys). Se prueban los dos nombres en cada búsqueda.
const NOMBRES_BAILEYS = ['@whiskeysockets/baileys', 'baileys']

function buscarBaileys() {
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const raiz = path.resolve(aqui, '..')
  // 1) Donde Node lo resolvería (igual que el bot al arrancar)
  const req = createRequire(import.meta.url)
  for (const base of [raiz, path.join(raiz, 'apps', 'bot')]) {
    for (const nombre of NOMBRES_BAILEYS) {
      try {
        const pkgJson = req.resolve(`${nombre}/package.json`, { paths: [base] })
        return path.dirname(pkgJson)
      } catch {}
    }
  }
  // 2) Rutas directas habituales
  const candidatos = []
  for (const nombre of NOMBRES_BAILEYS) {
    candidatos.push(path.join(raiz, 'node_modules', nombre))
    candidatos.push(path.join(raiz, 'apps', 'bot', 'node_modules', nombre))
  }
  for (const c of candidatos) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c
  }
  // 3) Búsqueda bajo la raíz, por si npm lo instaló en otro sitio
  const cola = [{ dir: raiz, prof: 0 }]
  while (cola.length) {
    const { dir, prof } = cola.shift()
    for (const nombre of NOMBRES_BAILEYS) {
      const cand = path.join(dir, 'node_modules', nombre, 'package.json')
      if (fs.existsSync(cand)) return path.dirname(cand)
    }
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

// Devuelve el bloque de Message en WAProto/index.js (desde su inicio
// hasta su `return Message;`). Igual que bloqueStickerJs: las ediciones
// del campo audioStickerMessage se hacen solo dentro de este bloque.
function bloqueMessageJs(texto) {
  const inicio = texto.indexOf('proto.Message = (function() {')
  if (inicio < 0) throw new Error('no encontré el bloque de Message en index.js')
  const fin = texto.indexOf('return Message;', inicio)
  if (fin < 0) throw new Error('no encontré el final del bloque de Message en index.js')
  return { inicio, fin, bloque: texto.slice(inicio, fin) }
}

// --- premium (campo 24, int32) ---
function parchearPremium(b) {
  if (b.includes('StickerMessage.prototype.premium = null')) return b
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
  return b
}

// --- emojis (campo 25, repeated string) ---
// Los campos repetidos no llevan oneOf. El prototype usa $util.emptyArray
// (patrón de protobufjs, igual que mentionedJid en ContextInfo).
function parchearEmojis(b) {
  if (b.includes('StickerMessage.prototype.emojis = $util.emptyArray')) return b
  b = reemplazarUnaVez(
    b,
    '            StickerMessage.prototype.premium = null;',
    '            StickerMessage.prototype.premium = null;\n            StickerMessage.prototype.emojis = $util.emptyArray;',
    'prototype.emojis',
  )
  b = reemplazarUnaVez(
    b,
    `                if (m.premium != null && Object.hasOwnProperty.call(m, "premium"))
                    w.uint32(${TAG_PREMIUM}).int32(m.premium);
                return w;`,
    `                if (m.premium != null && Object.hasOwnProperty.call(m, "premium"))
                    w.uint32(${TAG_PREMIUM}).int32(m.premium);
                if (m.emojis != null && m.emojis.length) {
                    for (var i = 0; i < m.emojis.length; ++i)
                        w.uint32(${TAG_EMOJIS}).string(m.emojis[i]);
                }
                return w;`,
    'encode emojis',
  )
  b = reemplazarUnaVez(
    b,
    `                    case 24: {
                            m.premium = r.int32();
                            break;
                        }
                    default:`,
    `                    case 24: {
                            m.premium = r.int32();
                            break;
                        }
                    case 25: {
                            if (!(m.emojis && m.emojis.length))
                                m.emojis = [];
                            m.emojis.push(r.string());
                            break;
                        }
                    default:`,
    'decode emojis',
  )
  b = reemplazarUnaVez(
    b,
    `                if (d.premium != null) {
                    m.premium = d.premium | 0;
                }
                return m;`,
    `                if (d.premium != null) {
                    m.premium = d.premium | 0;
                }
                if (d.emojis) {
                    if (!Array.isArray(d.emojis))
                        throw TypeError(".proto.Message.StickerMessage.emojis: array expected");
                    m.emojis = [];
                    for (var i = 0; i < d.emojis.length; ++i) {
                        m.emojis[i] = String(d.emojis[i]);
                    }
                }
                return m;`,
    'fromObject emojis',
  )
  b = reemplazarUnaVez(
    b,
    `                if (m.premium != null && m.hasOwnProperty("premium")) {
                    d.premium = m.premium;
                    if (o.oneofs)
                        d._premium = "premium";
                }
                return d;`,
    `                if (m.premium != null && m.hasOwnProperty("premium")) {
                    d.premium = m.premium;
                    if (o.oneofs)
                        d._premium = "premium";
                }
                if (m.emojis && m.emojis.length) {
                    d.emojis = [];
                    for (var j = 0; j < m.emojis.length; ++j)
                        d.emojis[j] = m.emojis[j];
                }
                return d;`,
    'toObject emojis',
  )
  return b
}

// --- audioMessage (campo 26, AudioMessage) ---
// Mismo patrón que contextInfo (campo mensaje): prototype null, oneOf,
// encode con fork+ldelim (tag 210), decode, fromObject y toObject.
function parchearAudio(b) {
  if (b.includes('StickerMessage.prototype.audioMessage = null')) return b
  b = reemplazarUnaVez(
    b,
    '            StickerMessage.prototype.emojis = $util.emptyArray;',
    '            StickerMessage.prototype.emojis = $util.emptyArray;\n            StickerMessage.prototype.audioMessage = null;',
    'prototype.audioMessage',
  )
  b = reemplazarUnaVez(
    b,
    `            Object.defineProperty(StickerMessage.prototype, "_premium", {
                get: $util.oneOfGetter($oneOfFields = ["premium"]),
                set: $util.oneOfSetter($oneOfFields)
            });`,
    `            Object.defineProperty(StickerMessage.prototype, "_premium", {
                get: $util.oneOfGetter($oneOfFields = ["premium"]),
                set: $util.oneOfSetter($oneOfFields)
            });
            Object.defineProperty(StickerMessage.prototype, "_audioMessage", {
                get: $util.oneOfGetter($oneOfFields = ["audioMessage"]),
                set: $util.oneOfSetter($oneOfFields)
            });`,
    'oneOf _audioMessage',
  )
  b = reemplazarUnaVez(
    b,
    `                if (m.emojis != null && m.emojis.length) {
                    for (var i = 0; i < m.emojis.length; ++i)
                        w.uint32(${TAG_EMOJIS}).string(m.emojis[i]);
                }
                return w;`,
    `                if (m.emojis != null && m.emojis.length) {
                    for (var i = 0; i < m.emojis.length; ++i)
                        w.uint32(${TAG_EMOJIS}).string(m.emojis[i]);
                }
                if (m.audioMessage != null && Object.hasOwnProperty.call(m, "audioMessage"))
                    $root.proto.Message.AudioMessage.encode(m.audioMessage, w.uint32(${TAG_AUDIO}).fork()).ldelim();
                return w;`,
    'encode audioMessage',
  )
  b = reemplazarUnaVez(
    b,
    `                    case 25: {
                            if (!(m.emojis && m.emojis.length))
                                m.emojis = [];
                            m.emojis.push(r.string());
                            break;
                        }
                    default:`,
    `                    case 25: {
                            if (!(m.emojis && m.emojis.length))
                                m.emojis = [];
                            m.emojis.push(r.string());
                            break;
                        }
                    case 26: {
                            m.audioMessage = $root.proto.Message.AudioMessage.decode(r, r.uint32());
                            break;
                        }
                    default:`,
    'decode audioMessage',
  )
  b = reemplazarUnaVez(
    b,
    `                if (d.emojis) {
                    if (!Array.isArray(d.emojis))
                        throw TypeError(".proto.Message.StickerMessage.emojis: array expected");
                    m.emojis = [];
                    for (var i = 0; i < d.emojis.length; ++i) {
                        m.emojis[i] = String(d.emojis[i]);
                    }
                }
                return m;`,
    `                if (d.emojis) {
                    if (!Array.isArray(d.emojis))
                        throw TypeError(".proto.Message.StickerMessage.emojis: array expected");
                    m.emojis = [];
                    for (var i = 0; i < d.emojis.length; ++i) {
                        m.emojis[i] = String(d.emojis[i]);
                    }
                }
                if (d.audioMessage != null) {
                    m.audioMessage = $root.proto.Message.AudioMessage.fromObject(d.audioMessage);
                }
                return m;`,
    'fromObject audioMessage',
  )
  b = reemplazarUnaVez(
    b,
    `                if (m.emojis && m.emojis.length) {
                    d.emojis = [];
                    for (var j = 0; j < m.emojis.length; ++j)
                        d.emojis[j] = m.emojis[j];
                }
                return d;`,
    `                if (m.emojis && m.emojis.length) {
                    d.emojis = [];
                    for (var j = 0; j < m.emojis.length; ++j)
                        d.emojis[j] = m.emojis[j];
                }
                if (m.audioMessage != null && m.hasOwnProperty("audioMessage")) {
                    d.audioMessage = $root.proto.Message.AudioMessage.toObject(m.audioMessage, o);
                    if (o.oneofs)
                        d._audioMessage = "audioMessage";
                }
                return d;`,
    'toObject audioMessage',
  )
  return b
}

// --- audioStickerMessage (campo 134 de Message, FutureProofMessage) ---
// El envoltorio de un sticker con sonido en el mensaje original. Sin
// este campo, Baileys tira el envoltorio entero al decodificar y el bot
// jamás ve el audio (la cita al responder tampoco lo trae).
// Mismo patrón que lottieStickerMessage (campo 74, FutureProofMessage):
// prototype null, oneOf, encode con fork+ldelim (tag 1074), decode,
// fromObject y toObject. Se ancla en pollResultSnapshotMessageV3,
// el último campo de Message (114), que ya está presente.
function parchearAudioSticker(b) {
  if (b.includes('Message.prototype.audioStickerMessage = null')) return b
  b = reemplazarUnaVez(
    b,
    '        Message.prototype.pollResultSnapshotMessageV3 = null;',
    '        Message.prototype.pollResultSnapshotMessageV3 = null;\n        Message.prototype.audioStickerMessage = null;',
    'prototype.audioStickerMessage',
  )
  b = reemplazarUnaVez(
    b,
    `        Object.defineProperty(Message.prototype, "_pollResultSnapshotMessageV3", {
            get: $util.oneOfGetter($oneOfFields = ["pollResultSnapshotMessageV3"]),
            set: $util.oneOfSetter($oneOfFields)
        });`,
    `        Object.defineProperty(Message.prototype, "_pollResultSnapshotMessageV3", {
            get: $util.oneOfGetter($oneOfFields = ["pollResultSnapshotMessageV3"]),
            set: $util.oneOfSetter($oneOfFields)
        });
        Object.defineProperty(Message.prototype, "_audioStickerMessage", {
            get: $util.oneOfGetter($oneOfFields = ["audioStickerMessage"]),
            set: $util.oneOfSetter($oneOfFields)
        });`,
    'oneOf _audioStickerMessage',
  )
  b = reemplazarUnaVez(
    b,
    `            if (m.pollResultSnapshotMessageV3 != null && Object.hasOwnProperty.call(m, "pollResultSnapshotMessageV3"))
                $root.proto.Message.PollResultSnapshotMessage.encode(m.pollResultSnapshotMessageV3, w.uint32(914).fork()).ldelim();
            return w;`,
    `            if (m.pollResultSnapshotMessageV3 != null && Object.hasOwnProperty.call(m, "pollResultSnapshotMessageV3"))
                $root.proto.Message.PollResultSnapshotMessage.encode(m.pollResultSnapshotMessageV3, w.uint32(914).fork()).ldelim();
            if (m.audioStickerMessage != null && Object.hasOwnProperty.call(m, "audioStickerMessage"))
                $root.proto.Message.FutureProofMessage.encode(m.audioStickerMessage, w.uint32(${TAG_AUDIO_STICKER}).fork()).ldelim();
            return w;`,
    'encode audioStickerMessage',
  )
  b = reemplazarUnaVez(
    b,
    `                case 114: {
                        m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.decode(r, r.uint32());
                        break;
                    }
                default:`,
    `                case 114: {
                        m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.decode(r, r.uint32());
                        break;
                    }
                case 134: {
                        m.audioStickerMessage = $root.proto.Message.FutureProofMessage.decode(r, r.uint32());
                        break;
                    }
                default:`,
    'decode audioStickerMessage',
  )
  b = reemplazarUnaVez(
    b,
    `            if (d.pollResultSnapshotMessageV3 != null) {
                if (typeof d.pollResultSnapshotMessageV3 !== "object")
                    throw TypeError(".proto.Message.pollResultSnapshotMessageV3: object expected");
                m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.fromObject(d.pollResultSnapshotMessageV3);
            }
            return m;`,
    `            if (d.pollResultSnapshotMessageV3 != null) {
                if (typeof d.pollResultSnapshotMessageV3 !== "object")
                    throw TypeError(".proto.Message.pollResultSnapshotMessageV3: object expected");
                m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.fromObject(d.pollResultSnapshotMessageV3);
            }
            if (d.audioStickerMessage != null) {
                if (typeof d.audioStickerMessage !== "object")
                    throw TypeError(".proto.Message.audioStickerMessage: object expected");
                m.audioStickerMessage = $root.proto.Message.FutureProofMessage.fromObject(d.audioStickerMessage);
            }
            return m;`,
    'fromObject audioStickerMessage',
  )
  b = reemplazarUnaVez(
    b,
    `            if (m.pollResultSnapshotMessageV3 != null && m.hasOwnProperty("pollResultSnapshotMessageV3")) {
                d.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.toObject(m.pollResultSnapshotMessageV3, o);
                if (o.oneofs)
                    d._pollResultSnapshotMessageV3 = "pollResultSnapshotMessageV3";
            }
            return d;`,
    `            if (m.pollResultSnapshotMessageV3 != null && m.hasOwnProperty("pollResultSnapshotMessageV3")) {
                d.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.toObject(m.pollResultSnapshotMessageV3, o);
                if (o.oneofs)
                    d._pollResultSnapshotMessageV3 = "pollResultSnapshotMessageV3";
            }
            if (m.audioStickerMessage != null && m.hasOwnProperty("audioStickerMessage")) {
                d.audioStickerMessage = $root.proto.Message.FutureProofMessage.toObject(m.audioStickerMessage, o);
                if (o.oneofs)
                    d._audioStickerMessage = "audioStickerMessage";
            }
            return d;`,
    'toObject audioStickerMessage',
  )
  return b
}

function parchearIndexJs(ruta) {
  let texto = fs.readFileSync(ruta, 'utf8')
  const yaPremium = texto.includes('StickerMessage.prototype.premium = null')
  const yaEmojis = texto.includes('StickerMessage.prototype.emojis = $util.emptyArray')
  const yaAudio = texto.includes('StickerMessage.prototype.audioMessage = null')
  const yaAudioSticker = texto.includes('Message.prototype.audioStickerMessage = null')
  if (yaPremium && yaEmojis && yaAudio && yaAudioSticker) {
    console.log('WAProto/index.js: el parche ya está aplicado, no hago nada.')
    return false
  }
  // StickerMessage: premium (24), emojis (25), audioMessage (26).
  {
    const { inicio, fin, bloque } = bloqueStickerJs(texto)
    let b = bloque
    // En orden de campo: premium (24), emojis (25), audioMessage (26).
    // Cada uno se ancla en el anterior, que ya está presente o se acaba
    // de agregar en esta misma corrida.
    b = parchearPremium(b)
    b = parchearEmojis(b)
    b = parchearAudio(b)
    texto = texto.slice(0, inicio) + b + texto.slice(fin)
  }
  // Message: audioStickerMessage (134). Bloque aparte: los anclajes son
  // de Message, no de StickerMessage.
  {
    const { inicio, fin, bloque } = bloqueMessageJs(texto)
    let b = bloque
    b = parchearAudioSticker(b)
    texto = texto.slice(0, inicio) + b + texto.slice(fin)
  }
  fs.writeFileSync(ruta, texto)
  console.log('WAProto/index.js: parche aplicado (premium 24, emojis 25, audioMessage 26, audioStickerMessage 134).')
  return true
}

function parchearIndexDts(ruta) {
  let texto = fs.readFileSync(ruta, 'utf8')
  // OJO: premium/emojis/audioMessage existen en OTROS mensajes del .d.ts
  // (audioMessage está en IMessage, por ejemplo). La revisión de si ya
  // están aplicados tiene que ser solo dentro de IStickerMessage y de la
  // clase StickerMessage, no en todo el archivo.
  function bloqueDts(inicioTexto) {
    const inicio = texto.indexOf(inicioTexto)
    if (inicio < 0) throw new Error(`no encontré ${inicioTexto} en index.d.ts`)
    const posCierre = texto.indexOf('\n        }\n', inicio)
    if (posCierre < 0) throw new Error(`no encontré el final de ${inicioTexto} en index.d.ts`)
    const fin = posCierre + '\n        }\n'.length
    return { inicio, fin, bloque: texto.slice(inicio, fin) }
  }
  function agregarCampo(bloque, ancla, linea) {
    const pos = bloque.indexOf(ancla)
    if (pos < 0) throw new Error(`no encontré el ancla de ${linea.trim()} en index.d.ts`)
    return bloque.slice(0, pos + ancla.length) + '\n' + linea + bloque.slice(pos + ancla.length)
  }
  let cambio = false
  // Interfaz IStickerMessage
  {
    const { inicio, fin, bloque } = bloqueDts('interface IStickerMessage {')
    let b = bloque
    if (!b.includes('premium?: (number|null);')) {
      b = agregarCampo(b, '            mediaKeyDomain?: (proto.Message.MediaKeyDomain|null);', '            premium?: (number|null);')
      cambio = true
    }
    if (!b.includes('emojis?: (string[]|null);')) {
      b = agregarCampo(b, '            premium?: (number|null);', '            emojis?: (string[]|null);')
      cambio = true
    }
    if (!b.includes('audioMessage?: (proto.Message.IAudioMessage|null);')) {
      b = agregarCampo(b, '            emojis?: (string[]|null);', '            audioMessage?: (proto.Message.IAudioMessage|null);')
      cambio = true
    }
    texto = texto.slice(0, inicio) + b + texto.slice(fin)
  }
  // Clase StickerMessage
  {
    const { inicio, fin, bloque } = bloqueDts('class StickerMessage implements IStickerMessage {')
    let b = bloque
    if (!b.includes('public premium?: (number|null);')) {
      b = agregarCampo(b, '            public mediaKeyDomain?: (proto.Message.MediaKeyDomain|null);', '            public premium?: (number|null);')
      cambio = true
    }
    if (!b.includes('public emojis?: (string[]|null);')) {
      b = agregarCampo(b, '            public premium?: (number|null);', '            public emojis?: (string[]|null);')
      cambio = true
    }
    if (!b.includes('public audioMessage?: (proto.Message.IAudioMessage|null);')) {
      b = agregarCampo(b, '            public emojis?: (string[]|null);', '            public audioMessage?: (proto.Message.IAudioMessage|null);')
      cambio = true
    }
    texto = texto.slice(0, inicio) + b + texto.slice(fin)
  }
  // Interfaz IMessage (nivel superior): audioStickerMessage (134).
  // OJO: el ancla lleva el salto de línea + 8 espacios y SIN `public`,
  // para no confundirla con la línea de la clase Message.
  if (!texto.includes('\n        audioStickerMessage?: (proto.Message.IFutureProofMessage|null);')) {
    texto = reemplazarUnaVez(
      texto,
      '        pollResultSnapshotMessageV3?: (proto.Message.IPollResultSnapshotMessage|null);',
      '        pollResultSnapshotMessageV3?: (proto.Message.IPollResultSnapshotMessage|null);\n        audioStickerMessage?: (proto.Message.IFutureProofMessage|null);',
      'IMessage.audioStickerMessage',
    )
    cambio = true
  }
  // Clase Message (nivel superior): audioStickerMessage (134).
  if (!texto.includes('\n        public audioStickerMessage?: (proto.Message.IFutureProofMessage|null);')) {
    texto = reemplazarUnaVez(
      texto,
      '        public pollResultSnapshotMessageV3?: (proto.Message.IPollResultSnapshotMessage|null);',
      '        public pollResultSnapshotMessageV3?: (proto.Message.IPollResultSnapshotMessage|null);\n        public audioStickerMessage?: (proto.Message.IFutureProofMessage|null);',
      'Message.audioStickerMessage',
    )
    cambio = true
  }
  if (!cambio) {
    console.log('WAProto/index.d.ts: el parche ya está aplicado, no hago nada.')
    return false
  }
  fs.writeFileSync(ruta, texto)
  console.log('WAProto/index.d.ts: parche aplicado (premium, emojis, audioMessage, audioStickerMessage).')
  return true
}

const dirBaileys = process.argv[2] ? path.resolve(process.argv[2]) : buscarBaileys()
if (!dirBaileys) {
  console.error('No encontré Baileys. Busca dónde está con: find . -maxdepth 6 -type d -name baileys (desde la raíz del repo)')
  console.error('Y luego corre: node scripts/patch-baileys-premium.mjs <esa ruta>')
  process.exit(1)
}
const pkg = JSON.parse(fs.readFileSync(path.join(dirBaileys, 'package.json'), 'utf8'))
console.log(`Baileys ${pkg.version} en ${dirBaileys}`)
if (pkg.version !== ESPERADA) {
  // No se bloquea: los campos premium (24), emojis (25), audioMessage (26)
  // y audioStickerMessage (134) son del proto de WhatsApp y no dependen
  // de la versión de Baileys. Si los textos que busca el parche no
  // coinciden, falla sin tocar nada (esa es la verdadera protección).
  console.log(`Aviso: el parche se probó en ${ESPERADA}; intento aplicarlo de todas formas.`)
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
