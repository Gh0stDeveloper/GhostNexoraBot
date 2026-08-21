import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from 'baileys'
import { createSocket } from './core/session.js'

const cleanPhone = (value: string) => value.replace(/\D/g, '')

async function main() {
  const rl = readline.createInterface({ input, output })
  const provided = process.env.PAIRING_NUMBER ?? ''
  const phone = cleanPhone(provided || await rl.question('📱 Número de WhatsApp con código de país (solo dígitos): '))
  rl.close()

  if (phone.length < 8 || phone.length > 15) {
    throw new Error('Número inválido. Usa código de país y solo dígitos.')
  }

  let pairingCodeRequested = false
  let reconnectAttempts = 0
  let finished = false

  const timeout = setTimeout(() => {
    if (finished) return
    finished = true
    console.error('❌ Tiempo agotado esperando la vinculación. Ejecuta de nuevo `pnpm pair`.')
    process.exit(1)
  }, 240_000)

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

    // Si la sesión ya existía antes de iniciar este comando no hace falta volver a vincular.
    // Tras un pairing nuevo, en cambio, esperamos un connection=open real para validar el reinicio.
    if (socket.authState.creds.registered && !pairingCodeRequested) {
      finish(0, '✅ La sesión ya estaba vinculada y las credenciales están guardadas.')
      return
    }

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr, isNewLogin }) => {
      if (finished) return

      if (isNewLogin) {
        console.log('✅ WhatsApp aceptó el emparejamiento. Reiniciando la conexión para completar el login...')
      }

      if (qr && !pairingCodeRequested && !socket.authState.creds.registered) {
        pairingCodeRequested = true
        try {
          const code = await socket.requestPairingCode(phone)
          const prettyCode = code.match(/.{1,4}/g)?.join('-') ?? code
          console.log('\n🔗 Código de vinculación:')
          console.log(`\n   ${prettyCode}\n`)
          console.log('En WhatsApp: Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.\n')
        } catch (error) {
          finish(1, `❌ No se pudo generar el código: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (connection === 'open') {
        finish(0, '✅ Ghost Nexora Bot quedó vinculado correctamente y la sesión está lista para reutilizarse.')
        return
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        if (statusCode === DisconnectReason.loggedOut) {
          finish(1, '❌ WhatsApp rechazó o cerró la sesión. Ejecuta de nuevo `pnpm pair`.')
          return
        }

        // Baileys/WhatsApp reinician deliberadamente el socket tras pair-success.
        // El ejemplo oficial reconecta ante cualquier cierre que no sea loggedOut.
        reconnectAttempts += 1
        if (reconnectAttempts > 5) {
          finish(1, `❌ No fue posible completar el reinicio de sesión (último código: ${statusCode ?? 'N/D'}).`)
          return
        }

        setTimeout(() => {
          void connect().catch((error) => {
            finish(1, `❌ Error al reanudar la vinculación: ${error instanceof Error ? error.message : String(error)}`)
          })
        }, 1500)
      }
    })
  }

  await connect()
}

main().catch((error) => {
  console.error('❌ Error de vinculación:', error)
  process.exit(1)
})
