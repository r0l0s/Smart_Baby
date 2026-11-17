// Bot de Telegram en modo "polling" (funciona en una laptop, sin webhook).
import { Telegraf } from 'telegraf';
import { config } from '../config.js';

export let bot = null;
let botActivo = false;

export function iniciarBot() {
  if (!config.telegramToken) {
    console.warn('[telegram] Falta TELEGRAM_BOT_TOKEN en backend/.env — el bot no se inicia');
    return;
  }
  bot = new Telegraf(config.telegramToken);

  bot.start((ctx) => ctx.reply('Hola'));

  // Un error dentro de un manejador nunca debe tumbar el servidor.
  bot.catch((err) => console.error('[telegram] Error en el bot:', err.message));

  // launch() no termina mientras el bot esté corriendo, por eso no se espera con await.
  bot
    .launch({ dropPendingUpdates: true }, () => {
      botActivo = true;
      console.log(`[telegram] Bot @${bot.botInfo?.username} escuchando (polling)`);
    })
    .catch((err) => {
      botActivo = false;
      console.error('[telegram] No se pudo iniciar el bot:', err.message);
    });
}

export function detenerBot(motivo) {
  if (bot && botActivo) bot.stop(motivo);
}

export function estadoBot() {
  if (botActivo) return `ok (@${bot.botInfo?.username})`;
  return config.telegramToken ? 'error o iniciando (revisa la terminal)' : 'sin configurar';
}
