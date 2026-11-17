// Matriz LED (móvil de luces): encendida/apagada y velocidad.
import { DispositivoSimulado } from './base.js';

export function crearMatriz(codigo) {
  return new DispositivoSimulado(codigo, 'matriz', {
    encendida: false,
    velocidad: 'media', // lenta | media | rapida
  });
}
