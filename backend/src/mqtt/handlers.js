// Qué hace el backend con los mensajes de lecturas y eventos que llegan por MQTT.
// 1) Los guarda (HU-TRN-01).  2) Luego llama a la lógica propia del tipo de dispositivo
// (alertas de la cuna, del colchón, ...), registrada con registrarManejador().
import { dispositivoPorCodigo, guardarLecturas, guardarEvento, monitoreoActivo } from '../services/registro.js';

/**
 * tipo de dispositivo → {
 *   requiereMonitoreo?: boolean,                    // si true, sin monitoreo activo no se guardan lecturas
 *   lecturas?(dispositivo, filas, monitoreo),        // después de guardar lecturas
 *   evento?(dispositivo, fila),                      // después de guardar un evento
 * }
 */
const manejadores = {};

export function registrarManejador(tipo, manejador) {
  manejadores[tipo] = manejador;
}

export async function alRecibirLecturas(codigo, datos) {
  const dispositivo = await dispositivoPorCodigo(codigo);
  if (!dispositivo) return; // dispositivo sin vincular: no pertenece a ningún ambiente
  const manejador = manejadores[dispositivo.tipo];
  const monitoreo = await monitoreoActivo(dispositivo.id);
  if (manejador?.requiereMonitoreo && !monitoreo) {
    console.log(`[mqtt] ${codigo}: lecturas ignoradas (monitoreo desactivado)`);
    return;
  }
  const lista = Array.isArray(datos?.lecturas) ? datos.lecturas : [datos];
  const filas = await guardarLecturas(dispositivo, lista, monitoreo);
  if (filas.length) await manejador?.lecturas?.(dispositivo, filas, monitoreo);
}

// Un dispositivo vuelve a estar en línea (por ejemplo, tras reiniciarse).
export async function alConectarse(codigo) {
  const dispositivo = await dispositivoPorCodigo(codigo);
  if (!dispositivo) return;
  const manejador = manejadores[dispositivo.tipo];
  if (manejador?.conectado) await manejador.conectado(dispositivo, await monitoreoActivo(dispositivo.id));
}

export async function alRecibirEvento(codigo, datos) {
  const dispositivo = await dispositivoPorCodigo(codigo);
  if (!dispositivo) return;
  const fila = await guardarEvento(dispositivo, datos);
  await manejadores[dispositivo.tipo]?.evento?.(dispositivo, fila);
}
