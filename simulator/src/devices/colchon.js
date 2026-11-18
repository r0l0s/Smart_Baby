// Colchón con sensor de peso. La lógica de la alarma corre EN EL DISPOSITIVO (RNF-12, DA-6),
// igual que en el firmware real:
//  1. Al activar: cuenta regresiva de 30 s sin alarma (HU-COL-01 CA1, CA2).
//  2. Al terminar: el peso medido es el peso base y se mide cada 1 s (CA3).
//  3. Si |peso - base| / base >= 0.70 en 3 lecturas seguidas → suena la alarma local,
//     se publica el evento alarma_decremento / alarma_incremento (HU-COL-02).
//  4. La alarma sigue sonando hasta que se desactiva el monitoreo (CA5).
import { DispositivoSimulado } from './base.js';

const CUENTA_REGRESIVA_SEG = 30;
const UMBRAL = 0.7; // 70 %
const LECTURAS_SEGUIDAS = 3;
const PESO_BEBE = 4.5; // kg
const OBJETO_PESADO = 4.0; // kg extra al "dejar caer" algo

class Colchon extends DispositivoSimulado {
  constructor(codigo) {
    super(codigo, 'colchon', {
      monitoreo: false,
      fase: 'inactivo', // inactivo | cuenta_regresiva | midiendo
      cuenta_hasta: null, // fecha ISO en que termina la cuenta regresiva
      peso_base: null,
      alarma: false,
    });
    this.bebe = true; // ¿el bebé está sobre el colchón?
    this.objeto = 0; // kg de objetos extra
    this.pico = 0; // segundos que dura un pico momentáneo
    this.seguidas = 0;
    this.temporizadorCuenta = null;
    setInterval(() => this.cadaSegundo(), 1000);
  }

  // Peso que mide el sensor ahora mismo (con un poco de ruido)
  pesoActual() {
    let peso = (this.bebe ? PESO_BEBE : 0.1) + this.objeto;
    if (this.pico > 0) peso += 6; // golpe momentáneo
    return Math.max(0, Math.round((peso + (Math.random() - 0.5) * 0.1) * 100) / 100);
  }

  manejarComando(comando) {
    if (comando.accion === 'activar_monitoreo') this.activar();
    else if (comando.accion === 'desactivar_monitoreo') this.desactivar();
    else super.manejarComando(comando);
  }

  activar() {
    if (this.estado.monitoreo) return;
    clearTimeout(this.temporizadorCuenta);
    Object.assign(this.estado, {
      monitoreo: true,
      fase: 'cuenta_regresiva',
      cuenta_hasta: new Date(Date.now() + CUENTA_REGRESIVA_SEG * 1000).toISOString(),
      peso_base: null,
      alarma: false,
    });
    this.seguidas = 0;
    this.publicarEstado();
    console.log(`[${this.codigo}] monitoreo activado: cuenta regresiva de ${CUENTA_REGRESIVA_SEG} s`);
    this.temporizadorCuenta = setTimeout(() => this.terminarCuenta(), CUENTA_REGRESIVA_SEG * 1000);
  }

  terminarCuenta() {
    if (this.estado.fase !== 'cuenta_regresiva') return;
    const base = this.pesoActual();
    Object.assign(this.estado, { fase: 'midiendo', cuenta_hasta: null, peso_base: base });
    this.publicarEstado();
    this.publicarEvento('peso_base', { peso_base: base });
    console.log(`[${this.codigo}] peso base: ${base} kg — midiendo cada segundo`);
  }

  desactivar() {
    clearTimeout(this.temporizadorCuenta);
    const sonaba = this.estado.alarma;
    Object.assign(this.estado, { monitoreo: false, fase: 'inactivo', cuenta_hasta: null, peso_base: null, alarma: false });
    this.seguidas = 0;
    this.publicarEstado();
    console.log(`[${this.codigo}] monitoreo desactivado${sonaba ? ' — alarma apagada' : ''}`);
  }

  cadaSegundo() {
    // En cuenta regresiva o inactivo no se mide ni se evalúa nada.
    if (this.estado.fase === 'midiendo') this.medir();
    if (this.pico > 0) this.pico--; // el golpe dura exactamente una lectura
  }

  medir() {
    const peso = this.pesoActual();
    this.publicarLectura('peso', peso, 'kg');

    if (this.estado.alarma) return; // ya suena: sigue sonando hasta desactivar
    const base = this.estado.peso_base;
    const variacion = (peso - base) / base;
    this.seguidas = Math.abs(variacion) >= UMBRAL ? this.seguidas + 1 : 0;

    if (this.seguidas >= LECTURAS_SEGUIDAS) {
      this.estado.alarma = true;
      this.publicarEstado();
      const tipo = variacion < 0 ? 'alarma_decremento' : 'alarma_incremento';
      this.publicarEvento(tipo, { peso, peso_base: base, variacion: Math.round(variacion * 100) });
      console.log(`[${this.codigo}] 🚨 ALARMA (${tipo}): ${peso} kg vs base ${base} kg`);
    }
  }

  // Escenarios del panel de control
  escenario(nombre) {
    switch (nombre) {
      case 'quitar_bebe':
        this.bebe = false;
        return 'Bebé retirado del colchón';
      case 'poner_bebe':
        this.bebe = true;
        this.objeto = 0;
        return 'Bebé sobre el colchón, sin objetos';
      case 'objeto':
        this.objeto = OBJETO_PESADO;
        return `Cayó un objeto de ${OBJETO_PESADO} kg sobre el colchón`;
      case 'pico':
        this.pico = 1;
        return 'Golpe de 1 s (no debe sonar la alarma)';
      default:
        return 'Escenario desconocido';
    }
  }

  infoPanel() {
    const restante = this.estado.cuenta_hasta
      ? Math.max(0, Math.ceil((new Date(this.estado.cuenta_hasta) - Date.now()) / 1000))
      : null;
    return {
      'peso en el sensor': `${this.pesoActual()} kg`,
      ...(restante !== null && { 'cuenta regresiva': `${restante} s` }),
      ...(this.estado.fase === 'midiendo' && { 'lecturas seguidas fuera de rango': this.seguidas }),
    };
  }
}

export function crearColchon(codigo) {
  return new Colchon(codigo);
}
