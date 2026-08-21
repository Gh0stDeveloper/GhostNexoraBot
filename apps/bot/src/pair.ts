import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from 'baileys'
import qrcode from 'qrcode-terminal'
import { createSocket } from './core/session.js'

const cleanPhone = (value: string) => value.replace(/\D/g, '')

type PairingMethod = 'qr' | 'code'

function normalizeMethod(value: string): PairingMethod | undefined {
  const normalized = value.trim().toLowerCase()
  if (['qr', 'qrcode'].includes(normalized)) return 'qr'
  if (['code', 'codigo', 'código', 'phone'].includes(normalized)) return 'code'
  return undefined
}

function describeDisconnect(error: unknown) {
  const boom = error as Boom | undefined
  const statusCode = boom?.output?.statusCode
  const message = error instanceof Error ? error.message : error ? String(error) : 'sin detalle'
  return { statusCode, message }
}

async function main() {
  const rl = readline.createInterface({ input, output })
  const providedMethod = normalizeMethod(process.env.PAIRING_METHOD ?? '')
  const methodAnswer = providedMethod
    ? ''
    : await rl.question('Método de vinculación [QR/código] (QR recomendado): ')
  const method = providedMethod ?? normalizeMethod(methodAnswer) ?? 'qr'

  let phone = ''
  if (method === 'code') {
    const provided = process.env.PAIRING_NUMBER ?? ''
    if (!provided) {
      console.log('\nEscribe el número exactamente en formato internacional como lo reconoce tu WhatsApp.')
      console.log('Puedes escribir +, espacios o guiones; Ghost Nexora Bot los elimina automáticamente.')
      console.log('Ejemplo: +52 55 1234 5678 se convierte internamente en 525512345678.\n')
    }
    phone = cleanPhone(provided || await rl.question('📱 Número de WhatsApp con código de país: '))
    if (phone.length < 8 || phone.length > 15) {
      rl.close()
      throw new Error('Número inválido. Usa el formato internacional completo.')
    }
  }
  rl.close()

  console.log(`\nMétodo seleccionado: ${method === 'qr' ? 'QR' : 'código por número'}.`)
  if (method === 'qr') {
    console.log('Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea el QR.\n')
  }

  let pairingCodeRequested = false
  let lastQr = ''
  let reconnectAttempts = 0
  let finished = false
  let pairingStarted = false

  const timeout = setTimeout(() => {
    if (finished) return
    finished = true
    console.error('❌ Tiempo agotado esperando la vinculación. Ejecuta de nuevo `npm run pair`.')
    process.exit(1)
  }, 300_000)

  const finish = (code: number, message: string) => {
    if (finished) return
    finished = true
    clearTimeout(timeout)
    console.log(message)
    setTimeout(() => process.exit(code), 500)
  }

  const connect = async (): Promise<void> => {
    if (finished) return
    const { socket } = await createSocket()

    if (socket.authState.creds.registered && reconnectAttempts === 0 && !pairingStarted) {
      finish(0, '✅ La sesión ya estaba vinculada y las credenciales están guardadas.')
      return
    }

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr, isNewLogin }) => {
      if (finished) return

      if (isNewLogin) {
        pairingStarted = true
        console.log('✅ WhatsApp aceptó el emparejamiento. Reiniciando conexión...')
      }

      if (qr && method === 'qr' && !socket.authState.creds.registered && qr !== lastQr) {
        pairingStarted = true
        lastQr = qr
        console.log('\n🔳 Escanea este QR desde WhatsApp:\n')
        qrcode.generate(qr, { small: true })
        console.log('\nEl QR se renueva automáticamente si expira. No cierres esta terminal.\n')
      }

      if (qr && method === 'code' && !pairingCodeRequested && !socket.authState.creds.registered) {
        pairingStarted = true
        pairingCodeRequested = true
        try {
          const code = await socket.requestPairingCode(phone)
          const prettyCode = code.match(/.{1,4}/g)?.join('-') ?? code
          console.log(`\n🔗 Código de vinculación:\n\n   ${prettyCode}\n`)
          console.log('WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.\n')
          console.log('Nota: WhatsApp/Baileys presenta actualmente incidencias con pairing por código. Si el teléfono rechaza un código recién generado, usa PAIRING_METHOD=qr.\n')
        } catch (error) {
          const detail = describeDisconnect(error)
          finish(1, `❌ No se pudo generar el código · status=${detail.statusCode ?? 'N/D'} · ${detail.message}`)
        }
      }

      if (connection === 'open') {
        finish(0, '✅ Ghost Nexora Bot quedó vinculado correctamente.')
        return
      }

      if (connection === 'close') {
        const detail = describeDisconnect(lastDisconnect?.error)
        console.error(`[PAIR] conexión cerrada · status=${detail.statusCode ?? 'N/D'} · ${detail.message}`)

        if (detail.statusCode === DisconnectReason.loggedOut) {
          finish(1, `❌ WhatsApp rechazó o cerró la sesión · status=${detail.statusCode ?? 'N/D'} · ${detail.message}`)
          return
        }

        reconnectAttempts += 1
        if (reconnectAttempts > 5) {
          finish(1, `❌ No fue posible completar el reinicio de sesión · status=${detail.statusCode ?? 'N/D'} · ${detail.message}`)
          return
        }

        setTimeout(() => {
          void connect().catch((error) => {
            const reconnectDetail = describeDisconnect(error)
            finish(1, `❌ Error al reanudar · status=${reconnectDetail.statusCode ?? 'N/D'} · ${reconnectDetail.message}`)
          })
        }, 1500)
      }
    })
  }

  await connect()
}

main().catch((error) => {
  const detail = describeDisconnect(error)
  console.error(`❌ Error de vinculación · status=${detail.statusCode ?? 'N/D'} · ${detail.message}`)
  process.exit(1)
})
