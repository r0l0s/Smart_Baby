// Colchón con sensor de peso: activar con cuenta regresiva (HU-COL-01), alarma por variación
// drástica (HU-COL-02) y desactivar (HU-COL-03).
//
// La lógica de la alarma (cuenta regresiva, peso base, 70 %, 3 lecturas seguidas) corre en el
// propio colchón (RNF-12, DA-6). El backend: abre/cierra el monitoreo, guarda las lecturas de peso
// (1 por segundo) y los eventos, y avisa por Telegram cuando el colchón reporta una alarma.
import { enviarComando } from '../mqtt/broker.js';
import { registrarManejador } from '../mqtt/handlers.js';
import { guardarEvento, iniciarMonitoreo, finalizarMonitoreo, monitoreoActivo } from './registro.js';
import { formatearNotificacion, notificarAmbiente } from '../telegram/notificar.js';

export async function activarMonitoreo(dispositivo, usuario) {
  const activo = await monitoreoActivo(dispositivo.id);
  if (activo) return activo;
  const monitoreo = await iniciarMonitoreo(dispositivo.id);
  enviarComando(dispositivo.codigo, { accion: 'activar_monitoreo' });
  await guardarEvento(dispositivo, {
    tipo: 'activacion',
    detalle: {
      mensaje: `Monitoreo activado por ${usuario.nombre}. Cuenta regresiva de 30 s para colocar al bebé.`,
      monitoreo_id: monitoreo.id,
    },
  });
  console.log(`[colchon] ${dispositivo.codigo}: monitoreo activado`);
  return monitoreo;
}

export async function desactivarMonitoreo(dispositivo, usuario) {
  const monitoreo = await finalizarMonitoreo(dispositivo.id);
  if (!monitoreo) return null;
  enviarComando(dispositivo.codigo, { accion: 'desactivar_monitoreo' });
  await guardarEvento(dispositivo, {
    tipo: 'desactivacion',
    detalle: { mensaje: `Monitoreo desactivado por ${usuario.nombre}`, monitoreo_id: monitoreo.id },
  });
  console.log(`[colchon] ${dispositivo.codigo}: monitoreo desactivado`);
  return monitoreo;
}

const ALARMAS = {
  alarma_decremento: { titulo: 'Alarma: el peso bajó drásticamente', causa: '¿El bebé ya no está en el colchón?' },
  alarma_incremento: { titulo: 'Alarma: el peso subió drásticamente', causa: '¿Cayó algo sobre el colchón?' },
};

// Agrega un mensaje legible al detalle de los eventos que manda el colchón.
function prepararEvento(dispositivo, datos) {
  const d = datos?.detalle ?? {};
  let mensaje;
  if (datos?.tipo === 'peso_base') mensaje = `Cuenta regresiva terminada. Peso base: ${d.peso_base} kg. Midiendo cada segundo.`;
  if (ALARMAS[datos?.tipo]) {
    mensaje = `Peso medido ${d.peso} kg frente a un peso base de ${d.peso_base} kg (${signo(d.variacion)} %). La alarma del colchón está sonando.`;
  }
  return mensaje ? { ...datos, detalle: { ...d, mensaje } } : datos;
}

// HU-COL-02: el colchón reportó una alarma → Telegram a todos los perfiles verificados.
async function alRecibirEvento(dispositivo, fila) {
  const alarma = ALARMAS[fila.tipo];
  if (!alarma) return;
  const d = fila.detalle;
  const texto = formatearNotificacion({
    emoji: '🚨',
    dispositivo: dispositivo.nombre,
    evento: alarma.titulo,
    valores: [
      `Peso medido: ${d.peso} kg`,
      `Peso base: ${d.peso_base} kg (${signo(d.variacion)} %)`,
      alarma.causa,
      'La alarma sigue sonando hasta que desactives el monitoreo.',
    ],
    fecha: fila.registrado_en,
  });
  notificarAmbiente(dispositivo.ambiente_id, texto);
  console.log(`[colchon] ${dispositivo.codigo}: ${alarma.titulo}`);
}

// Si el colchón se reinicia con un monitoreo abierto, se reactiva (empieza una nueva cuenta regresiva).
function alConectarse(dispositivo, monitoreo) {
  if (!monitoreo) return;
  enviarComando(dispositivo.codigo, { accion: 'activar_monitoreo' });
  console.log(`[colchon] ${dispositivo.codigo} volvió en línea con monitoreo activo: reactivado`);
}

function signo(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

registrarManejador('colchon', {
  requiereMonitoreo: true, // HU-COL-03 CA2: sin monitoreo, ni lecturas ni alarmas
  prepararEvento,
  evento: alRecibirEvento,
  conectado: alConectarse,
});
