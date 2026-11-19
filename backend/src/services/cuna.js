// Cuna inteligente: monitoreo (HU-CUN-01), temperatura (CUN-02), humedad (CUN-03),
// alertas fuera de rango (CUN-05) y movimiento (CUN-06).
//
// Funcionamiento:
//  - Al activar, se abre un monitoreo y se le ordena a la cuna encender sus sensores.
//  - Cada INTERVALO_CUNA_SEG (180 s; 10 s en modo demo) el backend le pide los datos
//    ({accion:"solicitar_datos"}). La cuna responde con temperatura, humedad y TODAS las
//    detecciones de movimiento acumuladas desde la última vez, y vacía su cola.
//  - Cada temperatura/humedad fuera de rango genera un evento y una alerta por Telegram.
import cron from 'node-cron';
import { supabase } from '../db.js';
import { config } from '../config.js';
import { enviarComando } from '../mqtt/broker.js';
import { registrarManejador } from '../mqtt/handlers.js';
import { guardarEvento, iniciarMonitoreo, finalizarMonitoreo, monitoreoActivo } from './registro.js';
import { formatearNotificacion, notificarAmbiente } from '../telegram/notificar.js';
import { TIPOS } from './dispositivos.js';

const ESPERA_DATOS_FINALES_MS = 3000;

// Promesas pendientes de "datos finales" al desactivar: codigo → función resolver
const esperandoDatos = new Map();

// ---- Activar / desactivar (HU-CUN-01) ----

export async function activarMonitoreo(dispositivo, usuario) {
  const activo = await monitoreoActivo(dispositivo.id);
  if (activo) return activo;
  const monitoreo = await iniciarMonitoreo(dispositivo.id);
  enviarComando(dispositivo.codigo, { accion: 'activar_monitoreo' });
  await guardarEvento(dispositivo, {
    tipo: 'activacion',
    detalle: { mensaje: `Monitoreo activado por ${usuario.nombre}`, monitoreo_id: monitoreo.id },
  });
  console.log(`[cuna] ${dispositivo.codigo}: monitoreo activado`);
  return monitoreo;
}

export async function desactivarMonitoreo(dispositivo, usuario) {
  const activo = await monitoreoActivo(dispositivo.id);
  if (!activo) return null;

  // Antes de cerrar, se piden los últimos datos para no perder movimientos acumulados.
  await new Promise((resolve) => {
    const temporizador = setTimeout(resolve, ESPERA_DATOS_FINALES_MS);
    esperandoDatos.set(dispositivo.codigo, () => {
      clearTimeout(temporizador);
      resolve();
    });
    enviarComando(dispositivo.codigo, { accion: 'solicitar_datos' });
  });
  esperandoDatos.delete(dispositivo.codigo);

  const monitoreo = await finalizarMonitoreo(dispositivo.id);
  enviarComando(dispositivo.codigo, { accion: 'desactivar_monitoreo' });
  await guardarEvento(dispositivo, {
    tipo: 'desactivacion',
    detalle: { mensaje: `Monitoreo desactivado por ${usuario.nombre}`, monitoreo_id: monitoreo.id },
  });
  console.log(`[cuna] ${dispositivo.codigo}: monitoreo desactivado`);
  return monitoreo;
}

// ---- Consulta periódica (cada 3 min; 10 s en demo) ----

export function iniciarConsultaPeriodica() {
  const seg = config.intervaloCunaSeg;
  // node-cron: con segundos si es menos de un minuto, si no en minutos.
  const expresion = seg < 60 ? `*/${seg} * * * * *` : `0 */${Math.round(seg / 60)} * * * *`;
  cron.schedule(expresion, () => solicitarDatosACunasActivas().catch((e) => console.error('[cuna]', e.message)));
  console.log(`[cuna] Consulta de datos cada ${seg} s${config.modoDemo ? ' (modo demo)' : ''}`);
}

async function solicitarDatosACunasActivas() {
  const { data, error } = await supabase
    .from('monitoreos')
    .select('dispositivos!inner(codigo, tipo)')
    .is('fin', null)
    .eq('dispositivos.tipo', 'cuna')
    .is('dispositivos.eliminado_en', null);
  if (error) throw error;
  for (const fila of data) enviarComando(fila.dispositivos.codigo, { accion: 'solicitar_datos' });
}

// ---- Alertas por valores fuera de rango (HU-CUN-05) ----

const VARIABLES = {
  temperatura: { nombre: 'Temperatura', emoji: '🌡️', unidad: '°C', min: 'temp_min', max: 'temp_max', evento: 'alerta_temperatura' },
  humedad: { nombre: 'Humedad', emoji: '💧', unidad: '%', min: 'hum_min', max: 'hum_max', evento: 'alerta_humedad' },
};

/** Revisa una lectura contra los umbrales. Devuelve null si está en rango. */
export function revisarRango(tipo, valor, configuracion) {
  const v = VARIABLES[tipo];
  if (!v) return null;
  const umbrales = { ...TIPOS.cuna.configuracion, ...configuracion };
  const min = Number(umbrales[v.min]);
  const max = Number(umbrales[v.max]);
  if (valor < min) return { ...v, limite: min, tipoLimite: 'mínimo', comparacion: 'menor que' };
  if (valor > max) return { ...v, limite: max, tipoLimite: 'máximo', comparacion: 'mayor que' };
  return null;
}

async function alRecibirLecturas(dispositivo, filas) {
  esperandoDatos.get(dispositivo.codigo)?.();

  // Cada lectura fuera de rango genera su propia alerta (CA3: también en la siguiente actualización).
  for (const fila of filas) {
    const valor = Number(fila.valor);
    const fuera = revisarRango(fila.tipo, valor, dispositivo.configuracion);
    if (!fuera) continue;

    const mensaje = `${fuera.nombre} de ${valor} ${fuera.unidad}, ${fuera.comparacion} el ${fuera.tipoLimite} de ${fuera.limite} ${fuera.unidad}`;
    await guardarEvento(dispositivo, {
      tipo: fuera.evento,
      detalle: { mensaje, valor, limite: fuera.limite, tipo_limite: fuera.tipoLimite, lectura_id: fila.id },
      ts: fila.registrado_en,
    });
    const texto = formatearNotificacion({
      emoji: fuera.emoji,
      dispositivo: dispositivo.nombre,
      evento: `${fuera.nombre} fuera de rango`,
      valores: [`Medido: ${valor} ${fuera.unidad}`, `Límite ${fuera.tipoLimite}: ${fuera.limite} ${fuera.unidad}`],
      fecha: fila.registrado_en,
    });
    notificarAmbiente(dispositivo.ambiente_id, texto); // sin await: Telegram no debe frenar el registro
    console.log(`[cuna] ${dispositivo.codigo}: ${mensaje}`);
  }

  // HU-CUN-07: una notificación por cada detección de movimiento, solo si el usuario lo habilitó
  // (deshabilitado por defecto). El movimiento siempre se registra (ya se guardó arriba).
  if (dispositivo.configuracion?.notificar_movimiento === true) {
    for (const fila of filas.filter((f) => f.tipo === 'movimiento')) {
      const texto = formatearNotificacion({
        emoji: '🏃',
        dispositivo: dispositivo.nombre,
        evento: 'Movimiento detectado',
        valores: ['El sensor de la cuna detectó movimiento del bebé.'],
        fecha: fila.registrado_en,
      });
      notificarAmbiente(dispositivo.ambiente_id, texto);
    }
  }
}

// Si la cuna se reinicia con un monitoreo abierto, se le vuelve a ordenar que encienda los sensores.
function alConectarse(dispositivo, monitoreo) {
  if (!monitoreo) return;
  enviarComando(dispositivo.codigo, { accion: 'activar_monitoreo' });
  console.log(`[cuna] ${dispositivo.codigo} volvió en línea con monitoreo activo: sensores reactivados`);
}

registrarManejador('cuna', { requiereMonitoreo: true, lecturas: alRecibirLecturas, conectado: alConectarse });
