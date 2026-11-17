// Biberón inteligente: mide la temperatura de la leche cuando se le pide.
import { DispositivoSimulado } from './base.js';

export function crearBiberon(codigo) {
  return new DispositivoSimulado(codigo, 'biberon', {
    temperatura: 37, // °C
  });
}
