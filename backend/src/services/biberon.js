// Base de biberón: medir la temperatura de la leche (HU-ALI-01).
//  1. El usuario pulsa "Tomar temperatura" → el backend envía {accion:"medir"} por MQTT.
//  2. La base responde con una lectura "temp_biberon".
//  3. El backend la clasifica (muy fría < 36 °C ≤ apta ≤ 40 °C < muy caliente), registra el
//     evento "medicion", avisa por Telegram y devuelve el resultado a la pantalla.
import { supabase } from '../db.js';
import { enviarComando } from '../mqtt/broker.js';
import { registrarManejador } from '../mqtt/handlers.js';
import { guardarEvento } from './registro.js';
import { formatearNotificacion, notificarAmbiente } from '../telegram/notificar.js';

export const RANGO_APTO = { min: 36, max: 40 }; // centrado en 38 °C
const ESPERA_MS = 5000;

const CLASES = {
  muy_fria: { texto: 'Muy fría', emoji: '🧊', consejo: 'Caliéntala un poco más antes de dársela al bebé.' },
  apta: { texto: 'Apta', emoji: '✅', consejo: 'La temperatura es adecuada para el bebé.' },
  muy_caliente: { texto: 'Muy caliente', emoji: '🔥', consejo: 'Espera a que se enfríe antes de dársela al bebé.' },
};

export function clasificar(valor) {
  if (valor < RANGO_APTO.min) return 'muy_fria';
  if (valor > RANGO_APTO.max) return 'muy_caliente';
  return 'apta';
}

// Pedidos de medición pendientes: codigo → función que recibe el resultado
const esperando = new Map();

/** CA1: pide la medición a la base y espera el resultado ya clasificado. */
export function medir(dispositivo) {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => {
      esperando.delete(dispositivo.codigo);
      reject(Object.assign(new Error('La base de biberón no respondió. Revisa que esté encendida.'), { status: 504 }));
    }, ESPERA_MS);
    esperando.set(dispositivo.codigo, (resultado) => {
      clearTimeout(temporizador);
      esperando.delete(dispositivo.codigo);
      resolve(resultado);
    });
    enviarComando(dispositivo.codigo, { accion: 'medir' });
  });
}

/** Última medición registrada (para mostrarla al abrir la pantalla). */
export async function ultimaMedicion(dispositivoId) {
  const { data, error } = await supabase
    .from('eventos')
    .select('detalle, registrado_en')
    .eq('dispositivo_id', dispositivoId)
    .eq('tipo', 'medicion')
    .order('registrado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data.detalle, registrado_en: data.registrado_en } : null;
}

// CA2 + CA3: clasificar, registrar, notificar y devolver el resultado.
async function alRecibirLecturas(dispositivo, filas) {
  const fila = filas.find((f) => f.tipo === 'temp_biberon');
  if (!fila) return;
  const valor = Number(fila.valor);
  const clasificacion = clasificar(valor);
  const clase = CLASES[clasificacion];
  const mensaje = `${valor} °C — ${clase.texto}. ${clase.consejo}`;

  await guardarEvento(dispositivo, {
    tipo: 'medicion',
    detalle: { mensaje, valor, clasificacion, rango_apto: RANGO_APTO, lectura_id: fila.id },
    ts: fila.registrado_en,
  });
  const texto = formatearNotificacion({
    emoji: '🍼',
    dispositivo: dispositivo.nombre,
    evento: `Temperatura de la leche: ${clase.texto.toLowerCase()} ${clase.emoji}`,
    valores: [`Temperatura: ${valor} °C`, `Rango apto: ${RANGO_APTO.min}–${RANGO_APTO.max} °C`, clase.consejo],
    fecha: fila.registrado_en,
  });
  notificarAmbiente(dispositivo.ambiente_id, texto);
  console.log(`[biberon] ${dispositivo.codigo}: ${mensaje}`);

  esperando.get(dispositivo.codigo)?.({
    valor,
    clasificacion,
    mensaje,
    rango_apto: RANGO_APTO,
    registrado_en: fila.registrado_en,
  });
}

registrarManejador('biberon', { lecturas: alRecibirLecturas });
