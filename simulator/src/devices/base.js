// Clase base: un dispositivo WiFi simulado que habla MQTT igual que un ESP32 real.
import mqtt from 'mqtt';

export class DispositivoSimulado {
  constructor(codigo, tipo, estadoInicial) {
    this.codigo = codigo;
    this.tipo = tipo;
    this.estado = { ...estadoInicial };
    this.conectado = false;
    this.cliente = null;
  }

  topico(nombre) {
    return `dispositivos/${this.codigo}/${nombre}`;
  }

  conectar(url) {
    this.url = url;
    this.apagado = false;
    this.cliente = mqtt.connect(url, {
      clientId: this.codigo,
      reconnectPeriod: 2000,
      // Si el dispositivo se desconecta de golpe, el broker publica esto por él.
      will: {
        topic: this.topico('estado'),
        payload: JSON.stringify({ tipo: this.tipo, online: false }),
        qos: 1,
        retain: true,
      },
    });

    this.cliente.on('connect', () => {
      this.conectado = true;
      console.log(`[${this.codigo}] conectado al broker`);
      this.cliente.subscribe(this.topico('comandos'), { qos: 1 });
      this.publicarEstado();
    });
    this.cliente.on('close', () => {
      if (this.conectado && !this.apagado) console.log(`[${this.codigo}] desconectado, reintentando...`);
      this.conectado = false;
    });
    this.cliente.on('error', (err) => {
      // Al arrancar con "npm run dev" el broker puede tardar unos segundos: es normal.
      if (err.code === 'ECONNREFUSED') {
        if (!this.avisado) console.log(`[${this.codigo}] broker no disponible todavía, reintentando...`);
        this.avisado = true;
      } else {
        console.error(`[${this.codigo}] error MQTT:`, err.message || err.code);
      }
    });
    this.cliente.on('message', (topic, payload) => {
      try {
        this.manejarComando(JSON.parse(payload.toString()));
      } catch (err) {
        console.error(`[${this.codigo}] comando inválido:`, err.message);
      }
    });
  }

  // Estado retenido: el broker lo guarda y se lo da a quien se suscriba después.
  publicarEstado() {
    if (!this.cliente) return;
    const mensaje = { tipo: this.tipo, online: true, ...this.estado };
    this.cliente.publish(this.topico('estado'), JSON.stringify(mensaje), { qos: 1, retain: true });
  }

  publicarLectura(tipo, valor, unidad) {
    this.cliente?.publish(this.topico('lecturas'), JSON.stringify({ tipo, valor, unidad, ts: new Date().toISOString() }));
  }

  publicarEvento(tipo, detalle = {}) {
    this.cliente?.publish(this.topico('eventos'), JSON.stringify({ tipo, detalle, ts: new Date().toISOString() }));
  }

  // Cada tipo de dispositivo reemplaza este método con su propio comportamiento.
  manejarComando(comando) {
    console.log(`[${this.codigo}] comando recibido (aún sin implementar):`, comando);
  }

  // Lo que muestra el panel de control.
  resumen() {
    return {
      codigo: this.codigo,
      tipo: this.tipo,
      conectado: this.conectado,
      apagado: !!this.apagado,
      estado: this.estado,
      info: this.infoPanel(),
    };
  }

  // Datos extra para el panel (cada tipo los reemplaza).
  infoPanel() {
    return {};
  }

  // Escenarios forzados desde el panel (cada tipo los reemplaza). Devuelve un texto corto.
  escenario(nombre) {
    return `Escenario "${nombre}" no disponible todavía`;
  }

  // Simula desenchufar el dispositivo: avisa "fuera de línea" y se desconecta.
  apagar() {
    if (this.apagado || !this.cliente) return;
    this.apagado = true;
    const mensaje = JSON.stringify({ tipo: this.tipo, online: false });
    this.cliente.publish(this.topico('estado'), mensaje, { qos: 1, retain: true }, () => {
      this.cliente.end();
      this.conectado = false;
      console.log(`[${this.codigo}] apagado desde el panel`);
    });
  }

  // Vuelve a "enchufarlo".
  encender() {
    if (!this.apagado) return;
    console.log(`[${this.codigo}] encendido desde el panel`);
    this.conectar(this.url);
  }

  desconectar() {
    this.cliente?.end(true);
  }
}
