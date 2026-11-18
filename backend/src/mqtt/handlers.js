// Qué hace el backend con los mensajes de lecturas y eventos que llegan por MQTT.
// 1) Siempre los guarda (HU-TRN-01).  2) Luego llama a la lógica propia del tipo de
// dispositivo (alertas de la cuna, del colchón, ...), registrada con registrarManejador().
import { dispositivoPorCodigo, guardarLecturas, guardarEvento } from '../services/registro.js';

// tipo de dispositivo → { lecturas?(dispositivo, filas), evento?(dispositivo, fila) }
const manejadores = {};

export function registrarManejador(tipo, manejador) {
  manejadores[tipo] = manejador;
}

export async function alRecibirLecturas(codigo, datos) {
  const dispositivo = await dispositivoPorCodigo(codigo);
  if (!dispositivo) return; // dispositivo sin vincular: no pertenece a ningún ambiente
  const lista = Array.isArray(datos?.lecturas) ? datos.lecturas : [datos];
  const filas = await guardarLecturas(dispositivo, lista);
  if (filas.length) await manejadores[dispositivo.tipo]?.lecturas?.(dispositivo, filas);
}

export async function alRecibirEvento(codigo, datos) {
  const dispositivo = await dispositivoPorCodigo(codigo);
  if (!dispositivo) return;
  const fila = await guardarEvento(dispositivo, datos);
  await manejadores[dispositivo.tipo]?.evento?.(dispositivo, fila);
}
