// Reglas generales de los dispositivos: tipos, nombres y configuración por defecto.
import { supabase } from '../db.js';
import { estados } from '../mqtt/broker.js';

export const TIPOS = {
  cuna: { nombre: 'Cuna', configuracion: { temp_min: 20, temp_max: 24, hum_min: 40, hum_max: 60 } },
  colchon: { nombre: 'Colchón', configuracion: {} },
  matriz: { nombre: 'Matriz LED', configuracion: {} },
  seguridad: { nombre: 'Sistema de seguridad', configuracion: {} },
  biberon: { nombre: 'Base de biberón', configuracion: {} },
};

export function esTipoValido(tipo) {
  return Object.hasOwn(TIPOS, tipo);
}

// Estado en vivo (del broker MQTT) de un código: { online, ...estado } o null si nunca se vio.
export function estadoEnVivo(codigo) {
  return estados.get(codigo) ?? null;
}

// Datos que se envían al navegador: fila de la BD + si está en línea + último estado conocido.
export function dispositivoPublico(fila) {
  const vivo = estadoEnVivo(fila.codigo);
  const { tipo: _t, online, actualizado: _a, ...estado } = vivo ?? fila.estado ?? {};
  return {
    id: fila.id,
    tipo: fila.tipo,
    codigo: fila.codigo,
    nombre: fila.nombre,
    online: !!vivo?.online && !!online,
    estado,
    configuracion: fila.configuracion,
    creado_en: fila.creado_en,
  };
}

// Códigos ya vinculados a cualquier ambiente (un dispositivo solo puede pertenecer a uno).
export async function codigosVinculados() {
  const { data, error } = await supabase.from('dispositivos').select('codigo').is('eliminado_en', null);
  if (error) throw error;
  return new Set(data.map((d) => d.codigo));
}

// Dispositivos de un tipo que están en línea y todavía no se han vinculado.
export async function disponibles(tipo) {
  const vinculados = await codigosVinculados();
  return [...estados.entries()]
    .filter(([codigo, e]) => e.tipo === tipo && e.online && !vinculados.has(codigo))
    .map(([codigo]) => ({ codigo, tipo }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// Nombre por defecto: "Cuna", y si ya hay una en el ambiente, "Cuna 2", "Cuna 3"...
export async function nombrePorDefecto(ambienteId, tipo) {
  const { count, error } = await supabase
    .from('dispositivos')
    .select('id', { count: 'exact', head: true })
    .eq('ambiente_id', ambienteId)
    .eq('tipo', tipo)
    .is('eliminado_en', null);
  if (error) throw error;
  const base = TIPOS[tipo].nombre;
  return count ? `${base} ${count + 1}` : base;
}
