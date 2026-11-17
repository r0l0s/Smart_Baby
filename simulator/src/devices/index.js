// Fábrica de los cinco tipos de dispositivo. Cada archivo (cuna.js, colchon.js, ...)
// tendrá su comportamiento propio cuando se implemente su historia de usuario.
import { crearCuna } from './cuna.js';
import { crearColchon } from './colchon.js';
import { crearMatriz } from './matriz.js';
import { crearSeguridad } from './seguridad.js';
import { crearBiberon } from './biberon.js';

const fabricas = {
  cuna: crearCuna,
  colchon: crearColchon,
  matriz: crearMatriz,
  seguridad: crearSeguridad,
  biberon: crearBiberon,
};

// sets = 1 → cuna-01, colchon-01, ...; sets = 2 → además cuna-02, colchon-02, ...
export function crearDispositivos(sets) {
  const lista = [];
  for (let n = 1; n <= sets; n++) {
    const sufijo = String(n).padStart(2, '0');
    for (const [tipo, crear] of Object.entries(fabricas)) {
      lista.push(crear(`${tipo}-${sufijo}`));
    }
  }
  return lista;
}
