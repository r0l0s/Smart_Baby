// Matriz LED 8×8 simulada (móvil de luces para el bebé) — HU-MAT-01..04.
// Igual que el firmware real, la matriz guarda su propio patrón (una secuencia de cuadros 8×8) y
// lo anima a la velocidad elegida. Publica en su estado:
//   encendida, velocidad (lenta|media|rapida), origen (manual|horario),
//   patron: los cuadros en hexadecimal (2 caracteres por fila, 8 filas por cuadro),
//   fase_inicio + cuadro_inicio: desde cuándo y desde qué cuadro corre la animación actual,
// para que el panel y la plataforma muestren exactamente lo mismo que la matriz.
import { DispositivoSimulado } from './base.js';

// Milisegundos entre cuadros para cada velocidad (HU-MAT-02: 3 niveles)
export const INTERVALOS_MS = { lenta: 800, media: 400, rapida: 150 };

// Cuadros del patrón (1 = LED encendido)
const CUADROS = [
  // corazón pequeño / grande (latiendo)
  ['00000000', '00000000', '00100100', '01111110', '00111100', '00011000', '00000000', '00000000'],
  ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000', '00000000'],
  ['00000000', '00000000', '00100100', '01111110', '00111100', '00011000', '00000000', '00000000'],
  ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000', '00000000'],
  // carita feliz
  ['00111100', '01000010', '10100101', '10000001', '10100101', '10011001', '01000010', '00111100'],
  ['00111100', '01000010', '10100101', '10000001', '10100101', '10011001', '01000010', '00111100'],
  // estrella que brilla
  ['00011000', '00011000', '11111111', '01111110', '00111100', '01100110', '11000011', '00000000'],
  ['00000000', '00010000', '00111000', '01111100', '00111000', '00010000', '00000000', '00000000'],
  ['00011000', '00011000', '11111111', '01111110', '00111100', '01100110', '11000011', '00000000'],
  // luna con estrellitas
  ['00111000', '01110000', '11100000', '11100000', '11100000', '01110000', '00111000', '00000000'],
  ['00111000', '01110010', '11100111', '11100010', '11100000', '01110001', '00111000', '00000000'],
  ['00111000', '01110000', '11100000', '11100100', '11101110', '01110100', '00111000', '00000000'],
];
const PATRON_HEX = CUADROS.map((filas) => filas.map((f) => parseInt(f, 2).toString(16).padStart(2, '0')).join(''));

class Matriz extends DispositivoSimulado {
  constructor(codigo) {
    super(codigo, 'matriz', {
      encendida: false,
      velocidad: 'media',
      origen: null,
      patron: PATRON_HEX,
      fase_inicio: null,
      cuadro_inicio: 0,
    });
  }

  // Cuadro que se está mostrando en este momento
  cuadroActual() {
    const e = this.estado;
    if (!e.encendida || !e.fase_inicio) return null;
    const pasados = Math.floor((Date.now() - new Date(e.fase_inicio)) / INTERVALOS_MS[e.velocidad]);
    return (e.cuadro_inicio + pasados) % CUADROS.length;
  }

  manejarComando(comando) {
    if (comando.accion !== 'matriz') return super.manejarComando(comando);
    const e = this.estado;
    // Se recuerda en qué cuadro iba, para que un cambio de velocidad no reinicie la animación.
    const cuadro = this.cuadroActual() ?? 0;
    if (typeof comando.encendida === 'boolean') e.encendida = comando.encendida;
    if (comando.velocidad in INTERVALOS_MS) e.velocidad = comando.velocidad;
    if (comando.origen) e.origen = comando.origen;
    e.fase_inicio = e.encendida ? new Date().toISOString() : null;
    e.cuadro_inicio = e.encendida ? cuadro : 0;
    if (!e.encendida) e.origen = null;
    this.publicarEstado();
    console.log(`[${this.codigo}] matriz ${e.encendida ? `ENCENDIDA (${e.velocidad}${e.origen ? ', ' + e.origen : ''})` : 'APAGADA'}`);
  }

  infoPanel() {
    const e = this.estado;
    return { patrón: e.encendida ? `▶ animando, velocidad ${e.velocidad}${e.origen === 'horario' ? ' (por horario)' : ''}` : '⏹ apagada' };
  }
}

export function crearMatriz(codigo) {
  return new Matriz(codigo);
}
