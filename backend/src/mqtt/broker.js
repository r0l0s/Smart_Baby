// Broker MQTT embebido (aedes). Los dispositivos (o el simulador) se conectan aquí.
import net from 'node:net';
import { Aedes } from 'aedes';
import { supabase } from '../db.js';
import { alRecibirLecturas, alRecibirEvento, alConectarse } from './handlers.js';

// Último "estado" conocido de cada dispositivo, por código (ej. "cuna-01").
// Se llena con los mensajes retenidos dispositivos/{codigo}/estado.
export const estados = new Map();

let broker = null;

export async function iniciarBroker(puerto) {
  broker = await Aedes.createBroker();

  broker.on('publish', (packet, client) => {
    // client es null para mensajes internos, pero NO para el Last-Will
    // (aedes lo publica en nombre del cliente desconectado), así que se procesa igual.
    const partes = packet.topic.split('/');
    if (partes[0] !== 'dispositivos' || partes.length !== 3) return;
    const [, codigo, tipoMensaje] = partes;

    let datos;
    try {
      datos = JSON.parse(packet.payload.toString());
    } catch {
      console.warn(`[mqtt] JSON inválido en ${packet.topic}`);
      return;
    }

    if (tipoMensaje === 'estado') {
      const antes = estados.get(codigo);
      // Un estado completo (online) reemplaza al anterior; el aviso "fuera de línea" (Last-Will,
      // solo trae online:false) se combina para conservar los últimos datos conocidos.
      const base = datos.online ? {} : antes || {};
      estados.set(codigo, { ...base, ...datos, actualizado: new Date().toISOString() });
      // Avisa a quien esté esperando un cambio de estado de este dispositivo.
      for (const espera of [...(esperas.get(codigo) ?? [])]) espera(estados.get(codigo));
      if (!antes || antes.online !== datos.online) {
        console.log(`[mqtt] ${codigo} → ${datos.online ? 'en línea' : 'fuera de línea'}`);
        if (datos.online) {
          alConectarse(codigo).catch((err) => console.error(`[mqtt] Error al reconectar ${codigo}:`, err.message));
        }
      }
      // Guarda el último estado conocido si el dispositivo está vinculado (si no, no actualiza nada).
      if (datos.online && supabase) {
        const { tipo: _t, online: _o, ...estado } = datos;
        supabase
          .from('dispositivos')
          .update({ estado })
          .eq('codigo', codigo)
          .is('eliminado_en', null)
          .then(({ error }) => error && console.error(`[mqtt] No se pudo guardar el estado de ${codigo}:`, error.message));
      }
    }

    // Lecturas y eventos: guardar y aplicar la lógica del tipo de dispositivo.
    // Un error aquí nunca debe tumbar el broker.
    const registrar = { lecturas: alRecibirLecturas, eventos: alRecibirEvento }[tipoMensaje];
    if (registrar && client) {
      registrar(codigo, datos).catch((err) =>
        console.error(`[mqtt] Error procesando ${tipoMensaje} de ${codigo}:`, err.message),
      );
    }
  });

  await new Promise((resolve, reject) => {
    const servidor = net.createServer(broker.handle);
    servidor.once('error', reject);
    servidor.listen(puerto, '0.0.0.0', resolve);
  });
  console.log(`[mqtt] Broker escuchando en el puerto ${puerto}`);
  return broker;
}

// Envía un comando a un dispositivo: dispositivos/{codigo}/comandos
export function enviarComando(codigo, comando) {
  if (!broker) return;
  broker.publish(
    { topic: `dispositivos/${codigo}/comandos`, payload: Buffer.from(JSON.stringify(comando)), qos: 1, retain: false },
    () => {},
  );
}

// Funciones que esperan un cambio de estado: codigo → Set<función>
const esperas = new Map();

/**
 * Envía un comando y espera a que el dispositivo publique un estado que cumpla `condicion`.
 * Así la plataforma muestra el estado REAL del dispositivo, no solo lo que se pidió.
 * @returns {Promise<object|null>} el estado confirmado, o null si no llegó a tiempo
 */
export function comandoConConfirmacion(codigo, comando, condicion, ms = 3000) {
  return new Promise((resolve) => {
    const lista = esperas.get(codigo) ?? new Set();
    esperas.set(codigo, lista);
    const terminar = (resultado) => {
      clearTimeout(temporizador);
      lista.delete(revisar);
      resolve(resultado);
    };
    const revisar = (estado) => {
      if (estado && condicion(estado)) terminar(estado);
    };
    const temporizador = setTimeout(() => terminar(null), ms);
    lista.add(revisar);
    enviarComando(codigo, comando);
  });
}

export function clientesConectados() {
  return broker ? broker.connectedClients : 0;
}
