// Sistema de seguridad: activar/desactivar (HU-SEG-01), movimiento con foto (HU-SEG-02)
// y apertura de puerta (HU-SEG-03).
//  - Movimiento: el dispositivo sube la foto por HTTP → registrarMovimiento() (ver routes/iot.js).
//  - Puerta: el dispositivo publica el evento "apertura_puerta" por MQTT (sin foto).
//  - Con el sistema desactivado no se registra nada ni se envían alertas.
import crypto from 'node:crypto';
import { supabase, BUCKET_FOTOS } from '../db.js';
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
    detalle: { mensaje: `Vigilancia activada por ${usuario.nombre}`, monitoreo_id: monitoreo.id },
  });
  console.log(`[seguridad] ${dispositivo.codigo}: vigilancia activada`);
  return monitoreo;
}

export async function desactivarMonitoreo(dispositivo, usuario) {
  const monitoreo = await finalizarMonitoreo(dispositivo.id);
  if (!monitoreo) return null;
  enviarComando(dispositivo.codigo, { accion: 'desactivar_monitoreo' });
  await guardarEvento(dispositivo, {
    tipo: 'desactivacion',
    detalle: { mensaje: `Vigilancia desactivada por ${usuario.nombre}`, monitoreo_id: monitoreo.id },
  });
  console.log(`[seguridad] ${dispositivo.codigo}: vigilancia desactivada`);
  return monitoreo;
}

/**
 * HU-SEG-02: guarda la foto en Supabase Storage, registra el evento "movimiento" con la URL
 * de la foto y envía la alerta con la foto por Telegram.
 * @param {Buffer} foto  contenido de la imagen
 * @param {string} tipoMime  ej. "image/jpeg"
 */
export async function registrarMovimiento(dispositivo, foto, tipoMime, ts) {
  const extension = tipoMime === 'image/png' ? 'png' : 'jpg';
  // Nombre aleatorio: la URL pública no se puede adivinar.
  const ruta = `${dispositivo.ambiente_id}/${dispositivo.codigo}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(ruta, foto, { contentType: tipoMime });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(ruta);

  const evento = await guardarEvento(dispositivo, {
    tipo: 'movimiento',
    detalle: { mensaje: 'Movimiento detectado en la habitación. Se tomó una fotografía.' },
    foto_url: data.publicUrl,
    ts,
  });
  const texto = formatearNotificacion({
    emoji: '📷',
    dispositivo: dispositivo.nombre,
    evento: 'Movimiento detectado',
    valores: ['Se tomó esta fotografía de la habitación.'],
    fecha: evento.registrado_en,
  });
  notificarAmbiente(dispositivo.ambiente_id, texto, foto);
  console.log(`[seguridad] ${dispositivo.codigo}: movimiento con foto registrado`);
  return evento;
}

// HU-SEG-03: apertura de puerta (llega por MQTT, sin foto)
function prepararEvento(dispositivo, datos) {
  if (datos?.tipo !== 'apertura_puerta') return datos;
  return { ...datos, foto_url: null, detalle: { ...(datos.detalle ?? {}), mensaje: 'Se abrió la puerta de la habitación.' } };
}

async function alRecibirEvento(dispositivo, fila) {
  if (fila.tipo !== 'apertura_puerta') return;
  const texto = formatearNotificacion({
    emoji: '🚪',
    dispositivo: dispositivo.nombre,
    evento: 'Apertura de puerta',
    valores: ['Se abrió la puerta de la habitación.'],
    fecha: fila.registrado_en,
  });
  notificarAmbiente(dispositivo.ambiente_id, texto);
  console.log(`[seguridad] ${dispositivo.codigo}: apertura de puerta registrada`);
}

// Si el dispositivo se reinicia con la vigilancia activa, se reactiva.
function alConectarse(dispositivo, monitoreo) {
  if (monitoreo) enviarComando(dispositivo.codigo, { accion: 'activar_monitoreo' });
}

registrarManejador('seguridad', {
  requiereMonitoreo: true, // HU-SEG-01 CA3: desactivado → no se registra nada
  prepararEvento,
  evento: alRecibirEvento,
  conectado: alConectarse,
});
