// Pantalla dedicada de un dispositivo (HU-PLA-06).
// Consulta el estado cada 3 s mientras está abierta (RNF-03). Los controles y gráficas de
// cada tipo se agregan en sus historias (cuna: HU-CUN-*, colchón: HU-COL-*, ...).
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Dispositivo, DispositivosService, TipoDispositivo, infoTipo } from '../../core/dispositivos';
import { Encabezado } from '../../shared/encabezado';
import { GraficasMonitoreo, SerieGrafica } from '../../shared/graficas-monitoreo';
import { HistorialEventos } from '../../shared/historial-eventos';
import { ControlesCuna } from './controles-cuna';
import { ControlesColchon } from './controles-colchon';
import { ControlesSeguridad } from './controles-seguridad';
import { ControlesBiberon } from './controles-biberon';
import { UmbralesCuna } from './umbrales-cuna';
import { LuzCuna } from './luz-cuna';
import { SonidosCuna } from './sonidos-cuna';
import { ComunicacionCuna } from './comunicacion-cuna';
import { ControlesMatriz } from './controles-matriz';

const INTERVALO_MS = 3000;

// Gráficas de cada tipo de dispositivo (los que recolectan datos a lo largo del tiempo).
const SERIES: Partial<Record<TipoDispositivo, SerieGrafica[]>> = {
  cuna: [
    { tipo: 'temperatura', titulo: 'Temperatura', ejeY: 'Temperatura (°C)', color: '#d9534f' },
    { tipo: 'humedad', titulo: 'Humedad', ejeY: 'Humedad relativa (%)', color: '#3b6fd8' },
    {
      tipo: 'movimiento',
      titulo: 'Movimiento',
      ejeY: 'Detecciones de movimiento',
      estilo: 'puntos',
      color: '#7a4fd1',
      textoValor: () => 'Movimiento detectado',
    },
  ],
  colchon: [{ tipo: 'peso', titulo: 'Peso', ejeY: 'Peso (kg)', color: '#2e8b57' }],
};

// Historial propio de algunos dispositivos: título y tipos de evento que se pueden filtrar.
// HU-COL-04: el colchón lista activaciones, desactivaciones y alarmas (decremento / incremento).
// HU-SEG-04: el sistema de seguridad lista activaciones, desactivaciones, movimientos (con foto) y puertas.
// Ambos historiales se muestran en orden cronológico por defecto.
const HISTORIALES: Partial<Record<TipoDispositivo, { titulo: string; filtros: string[] }>> = {
  colchon: {
    titulo: 'Historial del colchón',
    filtros: ['activacion', 'desactivacion', 'alarma_decremento', 'alarma_incremento'],
  },
  seguridad: {
    titulo: 'Historial de seguridad',
    filtros: ['activacion', 'desactivacion', 'movimiento', 'apertura_puerta'],
  },
};

// Datos internos del estado que no se muestran en "Estado actual" (la matriz los usa para su vista).
const OCULTOS = new Set(['patron', 'fase_inicio', 'cuadro_inicio', 'cuenta_hasta']);

// Etiquetas legibles para los valores del estado.
const ETIQUETAS: Record<string, { texto: string; unidad?: string }> = {
  monitoreo: { texto: 'Monitoreo' },
  temperatura: { texto: 'Temperatura', unidad: '°C' },
  humedad: { texto: 'Humedad', unidad: '%' },
  luz_encendida: { texto: 'Luz encendida' },
  luz_nivel: { texto: 'Nivel de luz' },
  sonido: { texto: 'Sonido' },
  audio_activo: { texto: 'Comunicación de audio' },
  peso: { texto: 'Peso', unidad: 'kg' },
  alarma: { texto: 'Alarma sonando' },
  fase: { texto: 'Fase' },
  peso_base: { texto: 'Peso base', unidad: 'kg' },
  cuenta_hasta: { texto: 'Cuenta regresiva hasta' },
  encendida: { texto: 'Encendida' },
  origen: { texto: 'Origen' },
  velocidad: { texto: 'Velocidad' },
  activo: { texto: 'Sistema activo' },
  puertaAbierta: { texto: 'Puerta abierta' },
};

@Component({
  selector: 'app-dispositivo',
  imports: [Encabezado, GraficasMonitoreo, HistorialEventos, ControlesCuna, ControlesColchon, ControlesSeguridad, ControlesBiberon, UmbralesCuna, LuzCuna, SonidosCuna, ComunicacionCuna, ControlesMatriz],
  templateUrl: './dispositivo.html',
  styleUrl: './dispositivo.css',
})
export class DispositivoPagina implements OnInit {
  /** Viene de la URL /dispositivo/:id */
  id = input.required<string>();

  private servicio = inject(DispositivosService);
  private router = inject(Router);
  protected auth = inject(AuthService);
  protected eliminando = signal(false);
  protected dispositivo = signal<Dispositivo | null>(null);
  protected error = signal('');
  protected infoTipo = infoTipo;
  protected series = SERIES;
  protected historiales = HISTORIALES;

  constructor() {
    const temporizador = setInterval(() => this.cargar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.cargar(); // aquí el id de la URL ya está disponible
  }

  /** Quita el dispositivo del ambiente, previa confirmación, y vuelve a Inicio. */
  protected eliminar(d: Dispositivo) {
    const ok = confirm(
      `¿Eliminar "${d.nombre}" de tu ambiente?\n\nDejará de enviar datos y alertas. Podrás volver a agregarlo cuando quieras.`,
    );
    if (!ok) return;
    this.eliminando.set(true);
    this.servicio.eliminar(d.id).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (err: HttpErrorResponse) => {
        this.eliminando.set(false);
        this.error.set(err.error?.error || 'No se pudo eliminar el dispositivo.');
      },
    });
  }

  protected cargar() {
    if (this.eliminando()) return;
    this.servicio.obtener(this.id()).subscribe({
      next: (d) => {
        this.dispositivo.set(d);
        this.error.set('');
      },
      error: (err: HttpErrorResponse) =>
        this.error.set(err.status === 404 ? 'Este dispositivo no existe o no pertenece a tu ambiente.' : 'No se pudo cargar el dispositivo.'),
    });
  }

  protected valores(d: Dispositivo): { etiqueta: string; valor: string }[] {
    return Object.entries(d.estado)
      .filter(([clave]) => !OCULTOS.has(clave))
      .map(([clave, valor]) => {
      const e = ETIQUETAS[clave] ?? { texto: clave };
      let texto: string;
      if (typeof valor === 'boolean') texto = valor ? 'Sí' : 'No';
      else if (valor === null || valor === undefined) texto = '—';
      else texto = `${valor}${e.unidad ? ' ' + e.unidad : ''}`;
      return { etiqueta: e.texto, valor: texto };
    });
  }
}
