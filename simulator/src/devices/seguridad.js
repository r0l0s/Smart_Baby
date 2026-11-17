// Sistema de seguridad: sensor de movimiento con cámara + sensor de puerta.
import { DispositivoSimulado } from './base.js';

export function crearSeguridad(codigo) {
  return new DispositivoSimulado(codigo, 'seguridad', {
    activo: false,
    puertaAbierta: false,
  });
}
