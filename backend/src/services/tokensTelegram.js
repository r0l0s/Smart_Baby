// Tokens de un solo uso para los enlaces de Telegram (verificación e invitación).
import crypto from 'node:crypto';
import { supabase } from '../db.js';
import { config } from '../config.js';

const VIGENCIA_HORAS = 24;

// Devuelve un token de verificación vigente para el usuario, o crea uno nuevo.
export async function tokenVerificacion(usuarioId) {
  const { data: existente, error } = await supabase
    .from('tokens_telegram')
    .select('token')
    .eq('tipo', 'verificacion')
    .eq('usuario_id', usuarioId)
    .eq('usado', false)
    .gt('expira_en', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existente) return existente.token;

  const token = crypto.randomBytes(16).toString('hex'); // 32 caracteres, válido para /start de Telegram
  const expira_en = new Date(Date.now() + VIGENCIA_HORAS * 3600 * 1000).toISOString();
  const { error: errCrear } = await supabase
    .from('tokens_telegram')
    .insert({ token, tipo: 'verificacion', usuario_id: usuarioId, expira_en });
  if (errCrear) throw errCrear;
  return token;
}

// Busca un token vigente y sin usar. Devuelve la fila o null.
export async function buscarTokenVigente(token, tipo) {
  const { data, error } = await supabase
    .from('tokens_telegram')
    .select('*')
    .eq('token', token)
    .eq('tipo', tipo)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.usado || new Date(data.expira_en) < new Date()) return null;
  return data;
}

export async function marcarTokenUsado(token) {
  const { error } = await supabase.from('tokens_telegram').update({ usado: true }).eq('token', token);
  if (error) throw error;
}

// ---- Invitaciones (HU-PLA-08): enlace de un solo uso que vence a las 24 h ----
export const PREFIJO_INVITACION = 'inv_';

/** Crea una invitación al ambiente. Devuelve { token, expira_en }. */
export async function crearInvitacion(ambienteId) {
  const token = crypto.randomBytes(16).toString('hex');
  const expira_en = new Date(Date.now() + VIGENCIA_HORAS * 3600 * 1000).toISOString();
  const { error } = await supabase.from('tokens_telegram').insert({ token, tipo: 'invitacion', ambiente_id: ambienteId, expira_en });
  if (error) throw error;
  return { token, expira_en };
}

/** Invitaciones del ambiente que todavía se pueden usar (sin usar y sin vencer). */
export async function invitacionesPendientes(ambienteId) {
  const { data, error } = await supabase
    .from('tokens_telegram')
    .select('token, expira_en, creado_en')
    .eq('tipo', 'invitacion')
    .eq('ambiente_id', ambienteId)
    .eq('usado', false)
    .gt('expira_en', new Date().toISOString())
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

export function enlaceBot(parametro) {
  return `https://t.me/${config.telegramUsername}?start=${parametro}`;
}
