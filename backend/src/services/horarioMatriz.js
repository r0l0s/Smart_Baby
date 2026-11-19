// Horario diario de la matriz LED (HU-MAT-03 / HU-MAT-04).
// Todos los días a la hora de inicio (hora de Costa Rica) la matriz se enciende con la velocidad
// del horario, y al cumplirse la duración se apaga.
//
// El programador solo actúa en los BORDES de la ventana (al empezar y al terminar), no en todo
// momento. Así el control manual prevalece (HU-MAT-01 CA3):
//   - si el usuario apaga la matriz durante el horario, no se vuelve a encender ese día;
//   - si el usuario la enciende a mano, el horario no la apaga al terminar.
import cron from 'node-cron';
import { supabase } from '../db.js';
import { estadoEnVivo } from './dispositivos.js';
import { cambiarMatriz, VELOCIDADES } from './matriz.js';

const DESFASE_CR_MS = -6 * 3600 * 1000; // Costa Rica = UTC−6 todo el año (sin horario de verano)
export const DURACION_MAX_MIN = 12 * 60;

// Lo que el programador ya hizo en cada horario: id → { inicio: 'AAAA-MM-DD', fin: 'AAAA-MM-DD' }
const ejecutado = new Map();

/** "HH:MM" o "HH:MM:SS" → minutos desde la medianoche */
function aMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
}

/** Fecha y minuto actuales en Costa Rica */
function ahoraCR(ms = Date.now()) {
  const d = new Date(ms + DESFASE_CR_MS);
  return { fecha: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 };
}

/**
 * Situación de un horario en este momento.
 * @returns {{dentro: boolean, dia: string, inicio: Date, fin: Date}} `dia` = fecha (CR) en que
 *   empezó la ventana actual o la última; `inicio`/`fin` = próxima o actual ventana (para mostrar).
 */
export function situacion(horario, ms = Date.now()) {
  const { fecha, minutos } = ahoraCR(ms);
  const inicioMin = aMinutos(horario.hora_inicio);
  const desde = (minutos - inicioMin + 1440) % 1440; // minutos desde el último inicio
  const dentro = desde < horario.duracion_min;
  const diaInicio = minutos >= inicioMin ? fecha : ahoraCR(ms - 86400000).fecha;
  // Próxima ventana (o la actual, si está en curso), en hora real
  const inicioMs = ms - desde * 60000 + (dentro ? 0 : 86400000);
  return {
    dentro,
    dia: diaInicio,
    inicio: new Date(Math.round(inicioMs / 60000) * 60000),
    fin: new Date(Math.round(inicioMs / 60000) * 60000 + horario.duracion_min * 60000),
  };
}

/** Valida los datos de un horario. Devuelve el horario limpio o lanza un error 400. */
export function validarHorario(datos) {
  const fallar = (mensaje, campo) => {
    throw Object.assign(new Error(mensaje), { status: 400, campo });
  };
  const hora = String(datos?.hora_inicio ?? '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) fallar('Ingresa una hora de inicio válida (HH:MM)', 'hora_inicio');
  const duracion = Number(datos?.duracion_min);
  if (!Number.isInteger(duracion) || duracion < 1 || duracion > DURACION_MAX_MIN) {
    fallar(`La duración debe ser un número entero de minutos entre 1 y ${DURACION_MAX_MIN}`, 'duracion_min');
  }
  if (!VELOCIDADES.includes(datos?.velocidad)) fallar('Elige una velocidad: lenta, media o rápida', 'velocidad');
  return { hora_inicio: hora, duracion_min: duracion, velocidad: datos.velocidad };
}

/** Olvida lo ejecutado para un horario (al crearlo, modificarlo o eliminarlo). */
export function reiniciarHorario(horarioId) {
  ejecutado.delete(horarioId);
}

async function revisarHorarios() {
  const { data, error } = await supabase
    .from('horarios_matriz')
    .select('*, dispositivos!inner(id, codigo, nombre, tipo, ambiente_id, eliminado_en)')
    .is('dispositivos.eliminado_en', null);
  if (error) throw error;

  for (const h of data) {
    const d = h.dispositivos;
    const s = situacion(h);
    const hecho = ejecutado.get(h.id) ?? {};
    const vivo = estadoEnVivo(d.codigo);

    try {
      // Inicio de la ventana: encender una sola vez por día
      if (s.dentro && hecho.inicio !== s.dia) {
        if (!vivo?.online) continue; // se reintenta en la próxima revisión mientras dure la ventana
        await cambiarMatriz(d, { encendida: true, velocidad: h.velocidad, origen: 'horario' }, 'por horario', vivo);
        ejecutado.set(h.id, { inicio: s.dia });
        console.log(`[horario] ${d.codigo}: encendida por horario (${h.hora_inicio.slice(0, 5)}, ${h.duracion_min} min)`);
      }
      // Fin de la ventana: apagar solo si sigue encendida POR EL HORARIO
      if (!s.dentro && hecho.inicio === s.dia && hecho.fin !== s.dia) {
        ejecutado.set(h.id, { ...hecho, fin: s.dia });
        if (vivo?.online && vivo.encendida && vivo.origen === 'horario') {
          await cambiarMatriz(d, { encendida: false, velocidad: vivo.velocidad, origen: 'horario' },
            `por horario (terminaron los ${h.duracion_min} min)`, vivo);
          console.log(`[horario] ${d.codigo}: apagada al terminar el horario`);
        }
      }
    } catch (err) {
      console.error(`[horario] ${d.codigo}:`, err.message);
    }
  }
}

export function iniciarHorarios() {
  cron.schedule('*/15 * * * * *', () => revisarHorarios().catch((e) => console.error('[horario]', e.message)));
  console.log('[horario] Revisión de horarios de la matriz cada 15 s');
}
