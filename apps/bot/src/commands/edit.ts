// apps/bot/src/commands/edit.ts
import type { Command } from '../types'; // Ajusta la ruta según tu definición de tipo Command
import { sleep } from '../utils'; // Si tienes una utilidad, sino puedes definirla localmente

export default {
  name: 'edit',           // Comando: !edit
  category: 'utilidad',
  description: 'Edita el mensaje al que respondes y luego elimina el comando.',
  async execute({ sock, msg, args, body, from }) {
    // 1. Verificar permisos: solo el dueño del bot (o el propio bot) puede usarlo
    //    En GhostNexoraBot, el dueño suele estar definido en la configuración.
    //    Aquí asumo que tienes una variable global o un array de dueños.
    const isOwner = msg.key.fromMe || (global.ownerNumbers && global.ownerNumbers.includes(msg.key.participant || msg.key.remoteJid));
    if (!isOwner) {
      await sock.sendMessage(from, { text: '⛔ Solo el dueño del bot puede usar este comando.' });
      return;
    }

    // 2. Obtener el nuevo texto a establecer (args o body)
    const nuevoTexto = args.join(' ') || body?.trim(); // Si args está vacío, usa body
    if (!nuevoTexto) {
      await sock.sendMessage(from, { text: '❌ Debes proporcionar el nuevo contenido para editar.' });
      return;
    }

    // 3. Obtener el ID del mensaje que se va a editar (el mensaje al que se responde)
    const mensajeRespondido = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (!mensajeRespondido) {
      await sock.sendMessage(from, { text: '❌ Debes responder a un mensaje para poder editarlo.' });
      return;
    }

    // 4. Obtener el ID del mensaje del comando (para eliminarlo después)
    const idComando = msg.key.id;
    if (!idComando) {
      await sock.sendMessage(from, { text: '❌ No se pudo obtener el ID del comando.' });
      return;
    }

    try {
      // 5. Editar el mensaje original con el nuevo texto
      await sock.sendMessage(
        from,
        { text: nuevoTexto, edit: { id: mensajeRespondido } },
        { messageId: mensajeRespondido } // Opcional, para asegurar el ID
      );

      // 6. Eliminar el mensaje de comando (para que no quede rastro)
      await sock.sendMessage(from, { delete: { id: idComando } });

      // 7. (Opcional) Enviar confirmación al usuario (se borrará rápidamente)
      const confirm = await sock.sendMessage(from, { text: '✅ Mensaje editado correctamente.' });
      // Esperar 2 segundos y eliminar también el mensaje de confirmación (para limpiar)
      await sleep(2000);
      await sock.sendMessage(from, { delete: { id: confirm.key.id } });

    } catch (error) {
      console.error('Error al editar:', error);
      await sock.sendMessage(from, { text: '⚠️ Ocurrió un error al editar el mensaje.' });
    }
  },
} satisfies Command;
