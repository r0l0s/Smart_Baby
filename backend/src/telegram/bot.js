// Bot de Telegram en modo "polling" (funciona en una laptop, sin webhook).
// Flujo de verificación (HU-PLA-02):
//   1. La web muestra el enlace t.me/<bot>?start=<token>
//   2. El bot recibe "/start <token>" y pide compartir el contacto
//   3. El bot compara el número compartido con el registrado y marca la cuenta verificada
import { Telegraf, Markup } from 'telegraf';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { normalizarTelefono } from '../services/telefono.js';
import { buscarTokenVigente, marcarTokenUsado } from '../services/tokensTelegram.js';

export let bot = null;
let botActivo = false;

// Verificaciones en curso: id de Telegram de la persona → token. Si el backend se reinicia
// en medio del proceso, basta con volver a abrir el enlace.
const pendientes = new Map();

const TECLADO_CONTACTO = Markup.keyboard([Markup.button.contactRequest('📱 Compartir mi número')])
  .resize()
  .oneTime();
const QUITAR_TECLADO = Markup.removeKeyboard();

const MSJ_SIN_ENLACE =
  'Hola 👋 Soy el bot de Dispositivos Inteligentes para Bebés.\n' +
  'Para vincular tu cuenta, abre el enlace que aparece en la página de verificación.';

async function alIniciar(ctx) {
  const parametro = (ctx.payload || '').trim();
  if (!parametro) return ctx.reply(MSJ_SIN_ENLACE);

  if (parametro.startsWith('inv_')) {
    return ctx.reply('Las invitaciones todavía no están disponibles. Pronto podrás unirte a un ambiente desde aquí.');
  }

  const token = await buscarTokenVigente(parametro, 'verificacion');
  if (!token) {
    return ctx.reply(
      '❌ Este enlace de verificación no es válido o ya venció.\n' +
        'Inicia sesión en la página web y abre el enlace nuevo que aparece en la pantalla de verificación.',
    );
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('nombre, verificado')
    .eq('id', token.usuario_id)
    .single();
  if (error) throw error;
  if (usuario.verificado) return ctx.reply(`✅ ${usuario.nombre}, tu cuenta ya está verificada.`);

  pendientes.set(ctx.from.id, parametro);
  return ctx.reply(
    `Hola ${usuario.nombre} 👋\nPara verificar tu teléfono, toca el botón "📱 Compartir mi número" de abajo.`,
    TECLADO_CONTACTO,
  );
}

async function alRecibirContacto(ctx) {
  const contacto = ctx.message.contact;
  const parametro = pendientes.get(ctx.from.id);
  if (!parametro) {
    return ctx.reply('Primero abre el enlace de verificación desde la página web.', QUITAR_TECLADO);
  }

  // El contacto debe ser el de la misma persona que escribe (no el de otra).
  if (contacto.user_id !== ctx.from.id) {
    return ctx.reply('❌ Debes compartir TU propio número con el botón "📱 Compartir mi número".', TECLADO_CONTACTO);
  }

  const token = await buscarTokenVigente(parametro, 'verificacion');
  pendientes.delete(ctx.from.id);
  if (!token) {
    return ctx.reply('❌ El enlace de verificación venció. Abre el enlace nuevo desde la página web.', QUITAR_TECLADO);
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, nombre, telefono')
    .eq('id', token.usuario_id)
    .single();
  if (error) throw error;

  // CA3: el número compartido no coincide con el registrado → rechazar
  if (normalizarTelefono(contacto.phone_number) !== usuario.telefono) {
    return ctx.reply(
      '❌ Verificación rechazada: el número de este Telegram no coincide con el registrado en la cuenta.\n' +
        'Revisa que te hayas registrado con el mismo número que usas en Telegram.',
      QUITAR_TECLADO,
    );
  }

  // CA2: coincide → cuenta verificada y vinculada a este chat
  const { error: errActualizar } = await supabase
    .from('usuarios')
    .update({ telegram_chat_id: ctx.chat.id, verificado: true })
    .eq('id', usuario.id);
  if (errActualizar) throw errActualizar;
  await marcarTokenUsado(parametro);

  console.log(`[telegram] Cuenta verificada: ${usuario.nombre}`);
  return ctx.reply(
    `✅ ¡Listo, ${usuario.nombre}! Tu teléfono quedó verificado.\nA partir de ahora recibirás aquí las alertas de tus dispositivos.`,
    QUITAR_TECLADO,
  );
}

export function iniciarBot() {
  if (!config.telegramToken) {
    console.warn('[telegram] Falta TELEGRAM_BOT_TOKEN en backend/.env — el bot no se inicia');
    return;
  }
  if (!config.telegramUsername) {
    console.warn('[telegram] Falta TELEGRAM_BOT_USERNAME en backend/.env — los enlaces de verificación no funcionarán');
  }
  bot = new Telegraf(config.telegramToken);

  bot.start(alIniciar);
  bot.on('contact', alRecibirContacto);
  bot.on('message', (ctx) => ctx.reply(MSJ_SIN_ENLACE));

  // Un error dentro de un manejador nunca debe tumbar el servidor.
  bot.catch((err, ctx) => {
    console.error('[telegram] Error en el bot:', err.message);
    ctx.reply('Ocurrió un error. Intenta de nuevo en unos segundos.').catch(() => {});
  });

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
