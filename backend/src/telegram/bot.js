// Bot de Telegram en modo "polling" (funciona en una laptop, sin webhook).
// Flujo de verificación (HU-PLA-02):
//   1. La web muestra el enlace t.me/<bot>?start=<token>
//   2. El bot recibe "/start <token>" y pide compartir el contacto
//   3. El bot compara el número compartido con el registrado y marca la cuenta verificada
// Flujo de invitación (HU-PLA-09):
//   1. El familiar abre t.me/<bot>?start=inv_<token>
//   2. El bot le pide compartir su contacto
//   3. Se crea su perfil invitado en el ambiente, con su teléfono y su Telegram (ya verificado)
import { Telegraf, Markup } from 'telegraf';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { normalizarTelefono } from '../services/telefono.js';
import { buscarTokenVigente, marcarTokenUsado, PREFIJO_INVITACION } from '../services/tokensTelegram.js';
import { formatearNotificacion, notificarAmbiente } from './notificar.js';

export let bot = null;
let botActivo = false;

// Conversaciones en curso: id de Telegram de la persona → { tipo: 'verificacion'|'invitacion', token }.
// Si el backend se reinicia en medio del proceso, basta con volver a abrir el enlace.
const pendientes = new Map();

const MSJ_INVITACION_INVALIDA =
  '❌ Esta invitación no es válida: ya se usó o venció (duran 24 horas y sirven una sola vez).\n' +
  'Pide a quien te invitó que genere una invitación nueva desde Perfil.';

const TECLADO_CONTACTO = Markup.keyboard([Markup.button.contactRequest('📱 Compartir mi número')])
  .resize()
  .oneTime();
const QUITAR_TECLADO = Markup.removeKeyboard();

const MSJ_SIN_ENLACE =
  'Hola 👋 Soy el bot de Dispositivos Inteligentes para Bebés.\n' +
  'Para vincular tu cuenta, abre el enlace que aparece en la página de verificación.';

export async function alIniciar(ctx) {
  const parametro = (ctx.payload || '').trim();
  if (!parametro) return ctx.reply(MSJ_SIN_ENLACE);

  if (parametro.startsWith(PREFIJO_INVITACION)) return alAbrirInvitacion(ctx, parametro.slice(PREFIJO_INVITACION.length));

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

  pendientes.set(ctx.from.id, { tipo: 'verificacion', token: parametro });
  return ctx.reply(
    `Hola ${usuario.nombre} 👋\nPara verificar tu teléfono, toca el botón "📱 Compartir mi número" de abajo.`,
    TECLADO_CONTACTO,
  );
}

// ---- Invitaciones (HU-PLA-09) ----

async function nombrePrincipal(ambienteId) {
  const { data } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('ambiente_id', ambienteId)
    .eq('rol', 'principal')
    .maybeSingle();
  return data?.nombre ?? 'tu familia';
}

// CA1: el invitado abre el enlace → el bot le pide compartir su contacto. CA4: inválido o vencido.
export async function alAbrirInvitacion(ctx, token) {
  const invitacion = await buscarTokenVigente(token, 'invitacion');
  if (!invitacion) return ctx.reply(MSJ_INVITACION_INVALIDA, QUITAR_TECLADO);
  pendientes.set(ctx.from.id, { tipo: 'invitacion', token });
  return ctx.reply(
    `Hola 👋 ${await nombrePrincipal(invitacion.ambiente_id)} te invitó a su ambiente de Dispositivos Inteligentes para Bebés.\n` +
      'Para unirte, toca el botón "📱 Compartir mi número" de abajo.',
    TECLADO_CONTACTO,
  );
}

// CA2: comparte su contacto → se crea su perfil invitado con su teléfono y su Telegram.
async function aceptarInvitacion(ctx, contacto, token) {
  const invitacion = await buscarTokenVigente(token, 'invitacion');
  if (!invitacion) return ctx.reply(MSJ_INVITACION_INVALIDA, QUITAR_TECLADO);

  const telefono = normalizarTelefono(contacto.phone_number);
  const { data: existente, error: errBuscar } = await supabase
    .from('usuarios')
    .select('ambiente_id')
    .eq('telefono', telefono)
    .maybeSingle();
  if (errBuscar) throw errBuscar;
  if (existente) {
    const mismo = existente.ambiente_id === invitacion.ambiente_id;
    return ctx.reply(
      mismo
        ? '✅ Ya formas parte de este ambiente. Entra a la plataforma con tu teléfono y la contraseña del ambiente.'
        : '❌ Este número ya tiene una cuenta en la plataforma, así que no se puede agregar a otro ambiente.',
      QUITAR_TECLADO,
    );
  }

  // Un solo uso: se marca como usada SOLO si nadie la usó antes (evita dos aceptaciones a la vez).
  const { data: marcada, error: errMarcar } = await supabase
    .from('tokens_telegram')
    .update({ usado: true })
    .eq('token', token)
    .eq('usado', false)
    .select('token');
  if (errMarcar) throw errMarcar;
  if (!marcada?.length) return ctx.reply(MSJ_INVITACION_INVALIDA, QUITAR_TECLADO);

  const nombre = [contacto.first_name, contacto.last_name].filter(Boolean).join(' ').trim() || 'Invitado';
  const { error } = await supabase.from('usuarios').insert({
    ambiente_id: invitacion.ambiente_id,
    rol: 'invitado',
    nombre,
    telefono,
    telegram_chat_id: ctx.chat.id,
    verificado: true,
  });
  if (error) {
    await supabase.from('tokens_telegram').update({ usado: false }).eq('token', token); // no se pierde la invitación
    throw error;
  }

  const principal = await nombrePrincipal(invitacion.ambiente_id);
  console.log(`[telegram] ${nombre} aceptó una invitación al ambiente de ${principal}`);
  notificarAmbiente(
    invitacion.ambiente_id,
    formatearNotificacion({ emoji: '👥', dispositivo: 'Plataforma', evento: 'Nuevo perfil en el ambiente', valores: [`${nombre} aceptó la invitación.`] }),
  );
  return ctx.reply(
    `✅ ¡Bienvenido/a, ${nombre}! Ya formas parte del ambiente de ${principal}.\n` +
      'Aquí recibirás las alertas de los dispositivos.\n' +
      `Para entrar a la plataforma usa tu teléfono y la contraseña del ambiente (pídesela a ${principal}).`,
    QUITAR_TECLADO,
  );
}

export async function alRecibirContacto(ctx) {
  const contacto = ctx.message.contact;
  const pendiente = pendientes.get(ctx.from.id);
  if (!pendiente) {
    return ctx.reply('Primero abre el enlace de verificación o de invitación.', QUITAR_TECLADO);
  }

  // El contacto debe ser el de la misma persona que escribe (no el de otra).
  if (contacto.user_id !== ctx.from.id) {
    return ctx.reply('❌ Debes compartir TU propio número con el botón "📱 Compartir mi número".', TECLADO_CONTACTO);
  }

  pendientes.delete(ctx.from.id);
  if (pendiente.tipo === 'invitacion') return aceptarInvitacion(ctx, contacto, pendiente.token);
  const parametro = pendiente.token;

  const token = await buscarTokenVigente(parametro, 'verificacion');
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
