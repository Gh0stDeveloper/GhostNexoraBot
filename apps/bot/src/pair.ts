import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from 'baileys'
import { createSocket } from './core/session.js'

const cleanPhone = (value: string) => value.replace(/\D/g, '')

async function main() {
  const { socket } = await createSocket()
  if (socket.authState.creds.registered) {
    console.log('✅ La sesión ya está vinculada. No es necesario generar otro código.')
    process.exit(0)
  }

  const rl = readline.createInterface({ input, output })
  const provided = process.env.PAIRING_NUMBER ?? ''
  const phone = cleanPhone(provided || await rl.question('📱 Número de WhatsApp con código de país (solo dígitos): '))
  rl.close()

  if (phone.length < 8 || phone.length > 15) {
    throw new Error('Número inválido. Usa código de país y solo dígitos.')
  }

  let requested = false
  const timeout = setTimeout(() => {
    console.error('❌ Tiempo agotado esperando la vinculación. Ejecuta de nuevo `pnpm pair`.')
    process.exit(1)
  }, 180_000)

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !requested && !socket.authState.creds.registered) {
      requested = true
      try {
        const code = await socket.requestPairingCode(phone)
        const prettyCode = code.match(/.{1,4}/g)?.join('-') ?? code
        console.log('\n🔗 Código de vinculación:')
        console.log(`\n   ${prettyCode}\n`)
        console.log('En WhatsApp: Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.\n')
      } catch (error) {
        console.error('❌ No se pudo generar el código:', error)
        clearTimeout(timeout)
        process.exit(1)
      }
    }

    if (connection === 'open') {
      clearTimeout(timeout)
      console.log('✅ Ghost Nexora Bot quedó vinculado correctamente.')
      setTimeout(() => process.exit(0), 1000)
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (statusCode === DisconnectReason.loggedOut) {
        clearTimeout(timeout)
        console.error('❌ WhatsApp rechazó o cerró la sesión. Vuelve a ejecutar `pnpm pair`.')
        process.exit(1)
      }
    }
  })
}

main().catch((error) => {
  console.error('❌ Error de vinculación:', error)
  process.exit(1)
})
