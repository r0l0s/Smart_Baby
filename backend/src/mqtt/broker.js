// Broker MQTT embebido (aedes). Los dispositivos (o el simulador) se conectan aquí.
import net from 'node:net';
import { Aedes } from 'aedes';
import { supabase } from '../db.js';

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
      estados.set(codigo, { ...(antes || {}), ...datos, actualizado: new Date().toISOString() });
      if (!antes || antes.online !== datos.online) {
        console.log(`[mqtt] ${codigo} → ${datos.online ? 'en línea' : 'fuera de línea'}`);
      }
      // Guarda el último estado conocido si el dispositivo está vinculado (si no, no actualiza nada).
      if (datos.online && supabase) {
        const { tipo: _t, online: _o, ...estado } = datos;
        supabase
          .from('dispositivos')
          .update({ estado })
          .eq('codigo', codigo)
          .then(({ error }) => error && console.error(`[mqtt] No se pudo guardar el estado de ${codigo}:`, error.message));
      }
    }
    // lecturas y eventos se manejarán en las historias de usuario siguientes.
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

export function clientesConectados() {
  return broker ? broker.connectedClients : 0;
}
