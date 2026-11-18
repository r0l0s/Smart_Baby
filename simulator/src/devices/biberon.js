// Base de biberón simulada: sensor de temperatura de la leche.
// Al recibir {accion:"medir"} responde con una lectura "temp_biberon" (HU-ALI-01).
// La temperatura cambia poco a poco hacia el valor elegido en el panel (fría / apta / caliente).
import { DispositivoSimulado } from './base.js';

const OBJETIVOS = { fria: 30, apta: 38, caliente: 45 };

class Biberon extends DispositivoSimulado {
  constructor(codigo) {
    super(codigo, 'biberon', {});
    this.temperatura = OBJETIVOS.apta;
    this.objetivo = OBJETIVOS.apta;
    setInterval(() => {
      // se acerca rápido al objetivo, con un poco de ruido
      this.temperatura += (this.objetivo - this.temperatura) * 0.5 + (Math.random() - 0.5) * 0.3;
    }, 1000);
  }

  manejarComando(comando) {
    if (comando.accion !== 'medir') return super.manejarComando(comando);
    const valor = Math.round(this.temperatura * 10) / 10;
    this.publicarLectura('temp_biberon', valor, '°C');
    this.ultima = `${valor} °C a las ${new Date().toLocaleTimeString('es-CR', { hour12: false })}`;
    console.log(`[${this.codigo}] medición: ${valor} °C`);
  }

  escenario(nombre) {
    if (!(nombre in OBJETIVOS)) return 'Escenario desconocido';
    this.objetivo = OBJETIVOS[nombre];
    return `La leche se lleva a ~${this.objetivo} °C (tarda unos segundos)`;
  }

  infoPanel() {
    return {
      'temperatura de la leche': `${Math.round(this.temperatura * 10) / 10} °C`,
      ...(this.ultima && { 'última medición enviada': this.ultima }),
    };
  }
}

export function crearBiberon(codigo) {
  return new Biberon(codigo);
}
