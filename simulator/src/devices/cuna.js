// Cuna inteligente: temperatura, humedad, movimiento, luz y sonidos.
import { DispositivoSimulado } from './base.js';

export function crearCuna(codigo) {
  return new DispositivoSimulado(codigo, 'cuna', {
    monitoreo: false,
    temperatura: 22,
    humedad: 50,
    luz: 0, // 0 = apagada, 1-3 = niveles
    sonido: null,
  });
}
