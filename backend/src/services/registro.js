// Registro de lecturas, eventos y monitoreos (HU-TRN-01).
// Todo se guarda con fecha y hora (timestamptz, UTC) y nunca se borra.
import { supabase } from '../db.js';

const UNIDADES = { temperatura: '°C', humedad: '%', movimiento: null, peso: 'kg', temp_biberon: '°C' };
const TIPOS_LECTURA = new Set(Object.keys(UNIDADES));
const TOLERANCIA_FUTURO_MS = 60_000;

// Usa la hora que manda el dispositivo si es válida; si no (o si viene del futuro), la hora actual.
export function fechaValida(ts) {
  const fecha = ts ? new Date(ts) : null;
  if (!fecha || Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) {
    return new Date().toISOString();
  }
  return fecha.toISOString();
}

// ---- Dispositivos vinculados (con caché corta para no consultar la BD en cada lectura) ----
const cache = new Map(); // codigo → { dispositivo, expira }
const DURACION_CACHE_MS = 10_000;

/** Devuelve { id, ambiente_id, tipo, nombre, configuracion } del dispositivo vinculado, o null. */
export async function dispositivoPorCodigo(codigo) {
  const guardado = cache.get(codigo);
  if (guardado && guardado.expira > Date.now()) return guardado.dispositivo;
  const { data, error } = await supabase
    .from('dispositivos')
    .select('id, ambiente_id, tipo, nombre, codigo, configuracion')
    .eq('codigo', codigo)
    .maybeSingle();
  if (error) throw error;
  cache.set(codigo, { dispositivo: data, expira: Date.now() + DURACION_CACHE_MS });
  return data;
}

export function olvidarDispositivo(codigo) {
  cache.delete(codigo);
}

// ---- Monitoreos ----

/** Monitoreo activo (fin = null) del dispositivo, o null. */
export async function monitoreoActivo(dispositivoId) {
  const { data, error } = await supabase
    .from('monitoreos')
    .select('*')
    .eq('dispositivo_id', dispositivoId)
    .is('fin', null)
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Abre un monitoreo nuevo (si ya hay uno activo, lo devuelve). */
export async function iniciarMonitoreo(dispositivoId) {
  const activo = await monitoreoActivo(dispositivoId);
  if (activo) return activo;
  const { data, error } = await supabase.from('monitoreos').insert({ dispositivo_id: dispositivoId }).select().single();
  if (error) throw error;
  return data;
}

/** Cierra el monitoreo activo (fin = ahora). Devuelve el monitoreo cerrado o null. */
export async function finalizarMonitoreo(dispositivoId) {
  const activo = await monitoreoActivo(dispositivoId);
  if (!activo) return null;
  const { data, error } = await supabase
    .from('monitoreos')
    .update({ fin: new Date().toISOString() })
    .eq('id', activo.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Lecturas y eventos ----

/**
 * Guarda una o varias lecturas. Cada una: { tipo, valor, unidad?, ts? }.
 * Se asocian al monitoreo indicado (o al activo, si no se indica). Devuelve las filas guardadas.
 */
export async function guardarLecturas(dispositivo, lecturas, monitoreo) {
  if (monitoreo === undefined) monitoreo = await monitoreoActivo(dispositivo.id);
  const filas = lecturas
    .filter((l) => TIPOS_LECTURA.has(l?.tipo) && Number.isFinite(Number(l.valor)))
    .map((l) => ({
      dispositivo_id: dispositivo.id,
      monitoreo_id: monitoreo?.id ?? null,
      tipo: l.tipo,
      valor: Number(l.valor),
      unidad: l.unidad ?? UNIDADES[l.tipo],
      registrado_en: fechaValida(l.ts),
    }));
  if (!filas.length) return [];
  const { data, error } = await supabase.from('lecturas').insert(filas).select();
  if (error) throw error;
  return data;
}

/** Guarda un evento: { tipo, detalle?, foto_url?, ts? }. Devuelve la fila guardada. */
export async function guardarEvento(dispositivo, { tipo, detalle = {}, foto_url = null, ts } = {}) {
  if (!tipo) throw new Error('El evento no tiene tipo');
  const { data, error } = await supabase
    .from('eventos')
    .insert({ dispositivo_id: dispositivo.id, tipo, detalle, foto_url, registrado_en: fechaValida(ts) })
    .select()
    .single();
  if (error) throw error;
  return data;
}
