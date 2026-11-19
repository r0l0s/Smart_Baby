// Matriz LED: encender / apagar (HU-MAT-01) y velocidad (HU-MAT-02).
// Se envía el comando por MQTT y se espera a que la matriz confirme su nuevo estado.
import { comandoConConfirmacion } from '../mqtt/broker.js';
import { guardarEvento } from './registro.js';

export const VELOCIDADES = ['lenta', 'media', 'rapida'];
const NOMBRE_VELOCIDAD = { lenta: 'lenta', media: 'media', rapida: 'rápida' };

/**
 * Cambia la matriz. `origen` = 'manual' (el usuario) u 'horario' (HU-MAT-03).
 * @returns {Promise<{encendida: boolean, velocidad: string, origen: string|null}>}
 */
export async function cambiarMatriz(dispositivo, { encendida, velocidad, origen = 'manual' }, quien) {
  const estado = await comandoConConfirmacion(
    dispositivo.codigo,
    { accion: 'matriz', encendida, velocidad, origen },
    (e) => e.encendida === encendida && e.velocidad === velocidad,
  );
  if (!estado) {
    throw Object.assign(new Error('La matriz no confirmó el cambio. Revisa que esté encendida.'), { status: 504 });
  }
  const accion = encendida ? `encendida (velocidad ${NOMBRE_VELOCIDAD[velocidad]})` : 'apagada';
  await guardarEvento(dispositivo, {
    tipo: 'matriz',
    detalle: { mensaje: `Matriz ${accion} ${quien}`, encendida, velocidad, origen },
  });
  return { encendida: estado.encendida, velocidad: estado.velocidad, origen: estado.origen ?? null };
}
