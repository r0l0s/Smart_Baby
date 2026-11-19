// Sesiones de alimentación (HU-ALI-02): cronometrar y registrar la cantidad ingerida.
// Una sesión pasa por 3 estados (se guarda en la BD para que sobreviva a recargar la página y se
// vea igual desde otro teléfono):
//   en_curso  → tiene inicio, sin duración (el cronómetro corre)
//   pendiente → ya tiene duración, falta la cantidad (CA2: el sistema la solicita)
//   completa  → tiene duración y cantidad (CA3)
import { supabase } from '../db.js';
import { guardarEvento } from './registro.js';

export const CANTIDAD_MAX_ML = 1000;

function conEstado(s) {
  if (!s) return null;
  const estado = s.duracion_seg === null ? 'en_curso' : s.cantidad_ml === null ? 'pendiente' : 'completa';
  return { ...s, cantidad_ml: s.cantidad_ml === null ? null : Number(s.cantidad_ml), estado };
}

/** Sesión sin terminar de registrar (en curso o pendiente de cantidad), o null. */
export async function sesionAbierta(dispositivoId) {
  const { data, error } = await supabase
    .from('sesiones_alimentacion')
    .select('*')
    .eq('dispositivo_id', dispositivoId)
    .or('duracion_seg.is.null,cantidad_ml.is.null')
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return conEstado(data);
}

export async function iniciar(dispositivo) {
  const abierta = await sesionAbierta(dispositivo.id);
  if (abierta?.estado === 'en_curso') return abierta; // ya está cronometrando
  if (abierta?.estado === 'pendiente') {
    throw Object.assign(new Error('Primero registra la cantidad de la sesión anterior.'), { status: 409 });
  }
  const { data, error } = await supabase
    .from('sesiones_alimentacion')
    .insert({ dispositivo_id: dispositivo.id, inicio: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return conEstado(data);
}

export async function finalizar(dispositivo) {
  const abierta = await sesionAbierta(dispositivo.id);
  if (abierta?.estado !== 'en_curso') {
    throw Object.assign(new Error('No hay una sesión en curso.'), { status: 409 });
  }
  const duracion_seg = Math.max(1, Math.round((Date.now() - new Date(abierta.inicio).getTime()) / 1000));
  const { data, error } = await supabase
    .from('sesiones_alimentacion')
    .update({ duracion_seg })
    .eq('id', abierta.id)
    .select()
    .single();
  if (error) throw error;
  return conEstado(data);
}

/** CA3/CA4: valida y guarda la cantidad de la sesión pendiente. */
export async function registrarCantidad(dispositivo, sesionId, valor, usuario) {
  const cantidad = typeof valor === 'string' && valor.trim() === '' ? NaN : Number(valor);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw Object.assign(new Error('La cantidad debe ser un número positivo de mililitros.'), { status: 400 });
  }
  if (cantidad > CANTIDAD_MAX_ML) {
    throw Object.assign(new Error(`La cantidad no puede ser mayor que ${CANTIDAD_MAX_ML} ml.`), { status: 400 });
  }
  const { data: s, error } = await supabase
    .from('sesiones_alimentacion')
    .select('*')
    .eq('id', sesionId)
    .eq('dispositivo_id', dispositivo.id)
    .maybeSingle();
  if (error) throw error;
  if (!s) throw Object.assign(new Error('Sesión no encontrada'), { status: 404 });
  if (s.duracion_seg === null) throw Object.assign(new Error('Primero finaliza la sesión.'), { status: 409 });

  const cantidad_ml = Math.round(cantidad * 10) / 10;
  const { data, error: errUpd } = await supabase
    .from('sesiones_alimentacion')
    .update({ cantidad_ml })
    .eq('id', s.id)
    .select()
    .single();
  if (errUpd) throw errUpd;
  await guardarEvento(dispositivo, {
    tipo: 'alimentacion',
    detalle: { mensaje: `Sesión de alimentación: ${textoDuracion(s.duracion_seg)}, ${cantidad_ml} ml (por ${usuario.nombre})`, sesion_id: s.id, duracion_seg: s.duracion_seg, cantidad_ml },
    ts: s.inicio,
  });
  return conEstado(data);
}

export function textoDuracion(seg) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}
