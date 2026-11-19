// Cuna inteligente simulada: sensores de temperatura, humedad y movimiento.
//  - Con el monitoreo activo, cada detección de movimiento se guarda en una cola con su hora.
//  - Cuando el backend envía {accion:"solicitar_datos"}, responde con temperatura, humedad y
//    TODAS las detecciones en cola, y vacía la cola (HU-CUN-02/03/06).
//  - Con el monitoreo desactivado los sensores están apagados: no responde datos.
import { DispositivoSimulado } from './base.js';

const NORMAL = { temperatura: 22, humedad: 50 };
const ESCENARIOS = {
  temp_alta: { temperatura: 26.5 },
  temp_baja: { temperatura: 17.5 },
  temp_normal: { temperatura: NORMAL.temperatura },
  hum_alta: { humedad: 72 },
  hum_baja: { humedad: 30 },
  hum_normal: { humedad: NORMAL.humedad },
};
const PASO_MS = 1000;
const PROB_MOVIMIENTO_POR_SEG = 1 / 25; // movimientos espontáneos del bebé (~1 cada 25 s)

class Cuna extends DispositivoSimulado {
  constructor(codigo) {
    super(codigo, 'cuna', { monitoreo: false, luz_encendida: false, luz_nivel: 1, sonido: null });
    // Valores reales de los sensores (no se publican en "estado": se envían como lecturas)
    this.sensores = { ...NORMAL };
    this.objetivo = { ...NORMAL };
    this.cola = [];
    setInterval(() => this.paso(), PASO_MS);
  }

  // Los valores se acercan poco a poco al objetivo, con un poco de ruido (deriva realista).
  paso() {
    for (const clave of ['temperatura', 'humedad']) {
      const actual = this.sensores[clave];
      const diferencia = this.objetivo[clave] - actual;
      const ruido = (Math.random() - 0.5) * (clave === 'temperatura' ? 0.1 : 0.4);
      this.sensores[clave] = actual + diferencia * 0.15 + ruido;
    }
    if (this.estado.monitoreo && Math.random() < PROB_MOVIMIENTO_POR_SEG) this.detectarMovimiento();
  }

  detectarMovimiento() {
    if (!this.estado.monitoreo) return false; // sensores apagados
    this.cola.push(new Date().toISOString());
    return true;
  }

  manejarComando(comando) {
    switch (comando.accion) {
      case 'activar_monitoreo':
        this.estado.monitoreo = true;
        this.cola = [];
        this.publicarEstado();
        console.log(`[${this.codigo}] monitoreo ACTIVADO (sensores encendidos)`);
        break;
      case 'desactivar_monitoreo':
        this.estado.monitoreo = false;
        this.cola = [];
        this.publicarEstado();
        console.log(`[${this.codigo}] monitoreo DESACTIVADO (sensores apagados)`);
        break;
      case 'solicitar_datos':
        this.enviarDatos();
        break;
      case 'luz': // HU-CUN-08: la plataforma cambia la luz
        if (typeof comando.encendida === 'boolean') this.estado.luz_encendida = comando.encendida;
        if ([1, 2, 3].includes(comando.nivel)) this.estado.luz_nivel = comando.nivel;
        this.publicarEstado();
        console.log(`[${this.codigo}] luz ${this.textoLuz()} (desde la plataforma)`);
        break;
      default:
        super.manejarComando(comando);
    }
  }

  enviarDatos() {
    if (!this.estado.monitoreo) return; // sensores apagados: no hay nada que enviar
    const ahora = new Date().toISOString();
    const lecturas = [
      { tipo: 'temperatura', valor: redondear(this.sensores.temperatura, 1), unidad: '°C', ts: ahora },
      { tipo: 'humedad', valor: redondear(this.sensores.humedad, 0), unidad: '%', ts: ahora },
      ...this.cola.map((ts) => ({ tipo: 'movimiento', valor: 1, ts })),
    ];
    this.cliente?.publish(this.topico('lecturas'), JSON.stringify({ lecturas }));
    console.log(
      `[${this.codigo}] datos enviados: ${lecturas[0].valor} °C, ${lecturas[1].valor} %, ${this.cola.length} movimiento(s)`,
    );
    this.cola = [];
  }

  textoLuz() {
    return this.estado.luz_encendida ? `encendida, nivel ${this.estado.luz_nivel}` : 'apagada';
  }

  // Botones físicos de la cuna (HU-CUN-08 CA3): cambian la luz y avisan a la plataforma.
  botonLuz(cambio) {
    cambio();
    this.publicarEstado();
    this.publicarEvento('luz', { encendida: this.estado.luz_encendida, nivel: this.estado.luz_nivel, origen: 'manual' });
    return `Luz ${this.textoLuz()} (botón de la cuna)`;
  }

  // Escenarios del panel de control
  escenario(nombre) {
    if (nombre === 'boton_luz') return this.botonLuz(() => (this.estado.luz_encendida = !this.estado.luz_encendida));
    if (nombre === 'boton_nivel') {
      return this.botonLuz(() => {
        this.estado.luz_encendida = true;
        this.estado.luz_nivel = (this.estado.luz_nivel % 3) + 1;
      });
    }
    if (nombre === 'movimiento') return this.detectarMovimiento() ? 'Movimiento registrado' : 'Monitoreo apagado: no se registra';
    const cambio = ESCENARIOS[nombre];
    if (!cambio) return 'Escenario desconocido';
    Object.assign(this.objetivo, cambio);
    return 'Listo';
  }

  infoPanel() {
    return {
      sensores: `${redondear(this.sensores.temperatura, 1)} °C · ${redondear(this.sensores.humedad, 0)} %`,
      'movimientos en cola': this.cola.length,
      'luz de noche': this.estado.luz_encendida
        ? '💡 ' + '●'.repeat(this.estado.luz_nivel) + '○'.repeat(3 - this.estado.luz_nivel) + ` (nivel ${this.estado.luz_nivel})`
        : '⚫ apagada',
    };
  }
}

function redondear(n, decimales) {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export function crearCuna(codigo) {
  return new Cuna(codigo);
}
