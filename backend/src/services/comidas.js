// Tiempos de comida y recordatorios (HU-ALI-04).
// Los tiempos se guardan por base de biberón (tabla tiempos_comida) y se repiten todos los días
// (CA2). Cada minuto se revisa la hora de Costa Rica: si coincide con un tiempo de comida, se envía
// un recordatorio por Telegram a todos los perfiles verificados del ambiente (CA3).
import cron from 'node-cron';
import { supabase } from '../db.js';
import { guardarEvento } from './registro.js';
import { formatearNotificacion, notificarAmbiente } from '../telegram/notificar.js';
import { textoDuracion } from './alimentacion.js';

const DESFASE_CR_MS = -6 * 3600 * 1000; // Costa Rica = UTC−6 todo el año

// Recordatorios ya enviados: "idTiempo|AAAA-MM-DD|HH:MM". Evita enviar dos veces el mismo
// recordatorio dentro del mismo minuto. Incluye la hora para que, si el usuario EDITA un tiempo de
// comida (mismo id, otra hora), la nueva hora también envíe su recordatorio ese mismo día.
const enviados = new Set();

export function validarHora(valor) {
  const hora = String(valor ?? '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    throw Object.assign(new Error('Ingresa una hora válida (HH:MM)'), { status: 400 });
  }
  return hora;
}

export async function listar(dispositivoId) {
  const { data, error } = await supabase
    .from('tiempos_comida')
    .select('id, hora')
    .eq('dispositivo_id', dispositivoId)
    .order('hora');
  if (error) throw error;
  return data.map((t) => ({ id: t.id, hora: t.hora.slice(0, 5) }));
}

/** Lanza 409 si ya existe ese mismo tiempo de comida (otro registro con la misma hora). */
export async function revisarDuplicado(dispositivoId, hora, exceptoId = null) {
  const lista = await listar(dispositivoId);
  if (lista.some((t) => t.hora === hora && t.id !== exceptoId)) {
    throw Object.assign(new Error(`Ya existe un tiempo de comida a las ${hora}`), { status: 409 });
  }
}

/** "hace 3 h 10 min" desde una fecha */
function haceCuanto(fecha) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
}

async function ultimaSesion(dispositivoId) {
  const { data } = await supabase
    .from('sesiones_alimentacion')
    .select('inicio, duracion_seg, cantidad_ml')
    .eq('dispositivo_id', dispositivoId)
    .not('cantidad_ml', 'is', null)
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function enviarRecordatorios() {
  const ahora = new Date(Date.now() + DESFASE_CR_MS);
  const hhmm = ahora.toISOString().slice(11, 16);
  const hoy = ahora.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('tiempos_comida')
    .select('id, hora, dispositivos!inner(id, codigo, nombre, ambiente_id, tipo, eliminado_en)')
    .eq('hora', `${hhmm}:00`)
    .is('dispositivos.eliminado_en', null);
  if (error) throw error;

  for (const t of data) {
    const clave = `${t.id}|${hoy}|${hhmm}`;
    if (enviados.has(clave)) continue;
    enviados.add(clave);
    const d = t.dispositivos;
    const ultima = await ultimaSesion(d.id);
    const texto = formatearNotificacion({
      emoji: '🍼',
      dispositivo: d.nombre,
      evento: 'Recordatorio: hora de comer',
      valores: [
        `Tiempo de comida de las ${hhmm}.`,
        ultima
          ? `Última sesión: ${haceCuanto(ultima.inicio)} (${Number(ultima.cantidad_ml)} ml en ${textoDuracion(ultima.duracion_seg)}).`
          : 'Todavía no hay sesiones registradas.',
      ],
    });
    notificarAmbiente(d.ambiente_id, texto);
    await guardarEvento(d, { tipo: 'recordatorio', detalle: { mensaje: `Recordatorio de comida enviado (${hhmm})`, hora: hhmm } });
    console.log(`[comidas] ${d.codigo}: recordatorio de las ${hhmm} enviado`);
  }
}

export function iniciarRecordatorios() {
  cron.schedule('0 * * * * *', () => enviarRecordatorios().catch((e) => console.error('[comidas]', e.message)));
  console.log('[comidas] Recordatorios de comida activos (se revisa cada minuto)');
}
