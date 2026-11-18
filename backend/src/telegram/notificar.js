// Envío de notificaciones por Telegram (HU-TRN-03).
import { bot } from './bot.js';
import { supabase } from '../db.js';
import { formatearFecha } from '../services/fechas.js';
import { config } from '../config.js';

// Sube una imagen (Buffer) a Telegram con el fetch nativo de Node.
// No se usa telegraf para esto: su subida de archivos falla en Node 26 ("socket hang up").
export async function enviarFotoArchivo(chatId, foto, texto) {
  const esPng = foto.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const formulario = new FormData();
  formulario.append('chat_id', String(chatId));
  formulario.append('caption', texto);
  formulario.append('photo', new Blob([foto], { type: esPng ? 'image/png' : 'image/jpeg' }), esPng ? 'foto.png' : 'foto.jpg');
  const respuesta = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendPhoto`, {
    method: 'POST',
    body: formulario,
  });
  const datos = await respuesta.json();
  if (!datos.ok) throw new Error(datos.description);
}

/**
 * Arma el texto estándar de una notificación:
 *   🌡️ [Cuna] Temperatura fuera de rango
 *   Temperatura: 26.1 °C (rango 20–24 °C)
 *   📅 18/11/2026 14:05
 * @param {{emoji: string, dispositivo: string, evento: string, valores?: string[], fecha?: Date|string}} datos
 */
export function formatearNotificacion({ emoji, dispositivo, evento, valores = [], fecha = new Date() }) {
  return [`${emoji} [${dispositivo}] ${evento}`, ...valores, `📅 ${formatearFecha(fecha)}`].join('\n');
}

/**
 * Envía un mensaje (y opcionalmente una foto) a TODOS los perfiles verificados del ambiente.
 * Nunca lanza errores: si Telegram falla, solo se registra en la terminal.
 * @param {string} ambienteId
 * @param {string} texto
 * @param {string|Buffer} [foto]  URL o contenido de una imagen
 * @returns {Promise<{enviados: number, fallidos: number}>}
 */
export async function notificarAmbiente(ambienteId, texto, foto) {
  const resultado = { enviados: 0, fallidos: 0 };
  try {
    if (!bot) {
      console.warn('[telegram] Bot no configurado; notificación no enviada');
      return resultado;
    }

    // CA4 de HU-PLA-02: solo perfiles verificados reciben notificaciones.
    const { data: perfiles, error } = await supabase
      .from('usuarios')
      .select('nombre, telegram_chat_id')
      .eq('ambiente_id', ambienteId)
      .eq('verificado', true)
      .not('telegram_chat_id', 'is', null);
    if (error) throw error;

    await Promise.all(
      perfiles.map(async (p) => {
        try {
          if (Buffer.isBuffer(foto)) {
            await enviarFotoArchivo(p.telegram_chat_id, foto, texto);
          } else if (foto) {
            await bot.telegram.sendPhoto(p.telegram_chat_id, foto, { caption: texto }); // foto = URL
          } else {
            await bot.telegram.sendMessage(p.telegram_chat_id, texto);
          }
          resultado.enviados++;
        } catch (err) {
          resultado.fallidos++;
          console.error(`[telegram] No se pudo notificar a ${p.nombre}:`, err.message);
        }
      }),
    );
    console.log(`[telegram] Notificación enviada a ${resultado.enviados} perfil(es) (${resultado.fallidos} fallidos)`);
  } catch (err) {
    console.error('[telegram] Error al notificar al ambiente:', err.message);
  }
  return resultado;
}
