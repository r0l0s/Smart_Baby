// "Cámara" simulada: devuelve una foto para el sistema de seguridad.
//  - Si hay imágenes .jpg / .png en simulator/assets/, elige una al azar.
//  - Si no, dibuja una imagen PNG sencilla estilo "visión nocturna": la habitación, la cuna,
//    una figura en una posición al azar y la hora en la esquina (cada foto es distinta).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const CARPETA_FOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

export function tomarFoto() {
  try {
    const archivos = fs.readdirSync(CARPETA_FOTOS).filter((f) => /\.(jpe?g|png)$/i.test(f));
    if (archivos.length) {
      const nombre = archivos[Math.floor(Math.random() * archivos.length)];
      const tipo = /\.png$/i.test(nombre) ? 'image/png' : 'image/jpeg';
      return { contenido: fs.readFileSync(path.join(CARPETA_FOTOS, nombre)), tipo, nombre };
    }
  } catch {
    // no existe la carpeta: se dibuja una imagen
  }
  return { contenido: dibujarEscena(), tipo: 'image/png', nombre: 'foto.png' };
}

// ---------- Dibujo de la imagen (PNG sin librerías) ----------
const ANCHO = 320;
const ALTO = 240;

function dibujarEscena() {
  const px = new Uint8Array(ANCHO * ALTO * 3);
  const pintar = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) return;
    const i = (y * ANCHO + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  const rect = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pintar(x, y, color);
  };

  // Fondo verde oscuro con ruido (visión nocturna) y piso
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const ruido = Math.random() * 18;
      const base = y > 170 ? 38 : 22 + y * 0.06;
      pintar(x, y, [8, base + ruido, 10]);
    }
  }
  // Puerta (derecha) y cuna (izquierda)
  rect(250, 60, 50, 112, [20, 70, 25]);
  rect(290, 115, 4, 6, [90, 160, 90]);
  rect(30, 120, 100, 6, [70, 140, 75]);
  rect(30, 160, 100, 6, [70, 140, 75]);
  for (let x = 30; x <= 126; x += 12) rect(x, 120, 4, 46, [70, 140, 75]);
  rect(30, 166, 4, 20, [70, 140, 75]);
  rect(126, 166, 4, 20, [70, 140, 75]);

  // Figura en movimiento en una posición al azar
  const fx = 150 + Math.floor(Math.random() * 80);
  const claro = [150, 230, 150];
  for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (x * x + y * y <= 121) pintar(fx + x, 82 + y, claro);
  rect(fx - 14, 95, 28, 50, claro);
  rect(fx - 22, 98, 8, 36, claro);
  rect(fx + 14, 98, 8, 36, claro);
  rect(fx - 12, 145, 10, 28, claro);
  rect(fx + 2, 145, 10, 28, claro);

  // Hora en la esquina (HH:MM:SS) con una fuente de 3x5 píxeles, escala 3
  const hora = new Date().toLocaleTimeString('es-CR', { hour12: false, timeZone: 'America/Costa_Rica' });
  let cx = 8;
  for (const ch of hora) {
    const filas = FUENTE[ch];
    if (filas) {
      filas.forEach((fila, fy) =>
        [...fila].forEach((bit, fxx) => bit === '1' && rect(cx + fxx * 3, 8 + fy * 3, 3, 3, [230, 255, 230])),
      );
    }
    cx += 12;
  }
  rect(ANCHO - 18, 10, 8, 8, [230, 40, 40]); // punto rojo "REC"

  return codificarPng(px);
}

const FUENTE = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  ':': ['000', '010', '000', '010', '000'],
};

function codificarPng(px) {
  // Cada fila empieza con el byte de filtro 0
  const crudo = Buffer.alloc((ANCHO * 3 + 1) * ALTO);
  for (let y = 0; y < ALTO; y++) {
    crudo[y * (ANCHO * 3 + 1)] = 0;
    Buffer.from(px.buffer, y * ANCHO * 3, ANCHO * 3).copy(crudo, y * (ANCHO * 3 + 1) + 1);
  }
  const bloque = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const tipoYDatos = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(tipoYDatos));
    return Buffer.concat([largo, tipoYDatos, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ANCHO, 0);
  ihdr.writeUInt32BE(ALTO, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(crudo)),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}
