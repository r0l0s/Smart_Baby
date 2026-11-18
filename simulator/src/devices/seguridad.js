// Sistema de seguridad simulado: sensor de movimiento con cámara + sensor inductivo de puerta.
//  - Activo + movimiento → toma una foto y la sube por HTTP al backend (HU-SEG-02).
//  - Activo + puerta abierta → publica el evento "apertura_puerta" por MQTT, sin foto (HU-SEG-03).
//  - Inactivo → los sensores no vigilan: no se envía nada (HU-SEG-01 CA3).
import { DispositivoSimulado } from './base.js';
import { tomarFoto } from './camara.js';

const BACKEND_URL = () => process.env.BACKEND_URL || 'http://localhost:3000';
const IOT_CLAVE = () => process.env.IOT_CLAVE || 'clave-dispositivos-demo';
const PUERTA_SE_CIERRA_MS = 5000;

class Seguridad extends DispositivoSimulado {
  constructor(codigo) {
    super(codigo, 'seguridad', { activo: false, puertaAbierta: false });
    this.ultimoEnvio = '';
  }

  manejarComando(comando) {
    if (comando.accion === 'activar_monitoreo' || comando.accion === 'desactivar_monitoreo') {
      this.estado.activo = comando.accion === 'activar_monitoreo';
      this.publicarEstado();
      console.log(`[${this.codigo}] vigilancia ${this.estado.activo ? 'ACTIVADA' : 'DESACTIVADA'}`);
    } else {
      super.manejarComando(comando);
    }
  }

  async detectarMovimiento() {
    if (!this.estado.activo) return 'Sistema inactivo: no se registra';
    const foto = tomarFoto();
    const formulario = new FormData();
    formulario.append('foto', new Blob([foto.contenido], { type: foto.tipo }), foto.nombre);
    formulario.append('ts', new Date().toISOString());
    try {
      const r = await fetch(`${BACKEND_URL()}/api/iot/${this.codigo}/fotos`, {
        method: 'POST',
        headers: { 'X-Dispositivo-Clave': IOT_CLAVE() },
        body: formulario,
      });
      const cuerpo = await r.json().catch(() => ({}));
      this.ultimoEnvio = r.ok ? `foto enviada (${Math.round(foto.contenido.length / 1024)} KB)` : `error ${r.status}: ${cuerpo.error}`;
      return r.ok ? '📷 Foto tomada y enviada' : `No se pudo enviar la foto: ${cuerpo.error ?? r.status}`;
    } catch (err) {
      this.ultimoEnvio = `error: ${err.message}`;
      return `No se pudo contactar al backend: ${err.message}`;
    }
  }

  abrirPuerta() {
    this.estado.puertaAbierta = true;
    this.publicarEstado();
    clearTimeout(this.temporizadorPuerta);
    this.temporizadorPuerta = setTimeout(() => {
      this.estado.puertaAbierta = false;
      this.publicarEstado();
    }, PUERTA_SE_CIERRA_MS);
    if (!this.estado.activo) return 'Puerta abierta, pero el sistema está inactivo: no se registra';
    this.publicarEvento('apertura_puerta', {});
    return '🚪 Apertura de puerta enviada';
  }

  async escenario(nombre) {
    if (nombre === 'movimiento') return this.detectarMovimiento();
    if (nombre === 'puerta') return this.abrirPuerta();
    return 'Escenario desconocido';
  }

  infoPanel() {
    return this.ultimoEnvio ? { 'último envío de foto': this.ultimoEnvio } : {};
  }
}

export function crearSeguridad(codigo) {
  return new Seguridad(codigo);
}
