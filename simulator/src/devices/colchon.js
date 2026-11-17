// Colchón con sensor de peso. La lógica de alarma vive en el dispositivo (RNF-12).
import { DispositivoSimulado } from './base.js';

export function crearColchon(codigo) {
  return new DispositivoSimulado(codigo, 'colchon', {
    monitoreo: false,
    peso: 4.5, // kg
    alarma: false,
  });
}
