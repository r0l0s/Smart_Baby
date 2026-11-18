// Historial de eventos de un dispositivo (HU-TRN-01): cada evento con su fecha y hora.
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { formatearFecha } from './fechas';

interface Evento {
  id: number;
  tipo: string;
  detalle: Record<string, unknown>;
  foto_url: string | null;
  registrado_en: string;
}

const NOMBRES: Record<string, string> = {
  activacion: '▶️ Monitoreo activado',
  desactivacion: '⏹️ Monitoreo desactivado',
  alerta_temperatura: '🌡️ Alerta de temperatura',
  alerta_humedad: '💧 Alerta de humedad',
  peso_base: '⚖️ Peso base registrado',
  alarma_decremento: '🚨 Alarma: el peso bajó',
  alarma_incremento: '🚨 Alarma: el peso subió',
  movimiento: '📷 Movimiento detectado',
  apertura_puerta: '🚪 Puerta abierta',
  medicion: '🍼 Temperatura de la leche',
};

const INTERVALO_MS = 3000;

@Component({
  selector: 'app-historial-eventos',
  template: `
    @if (eventos(); as lista) {
      @if (lista.length) {
        <ul>
          @for (e of lista; track e.id) {
            <li>
              <span class="fecha">{{ fecha(e.registrado_en) }}</span>
              <span class="tipo">{{ nombre(e.tipo) }}</span>
              @if (e.detalle['mensaje']) {
                <span class="detalle">{{ e.detalle['mensaje'] }}</span>
              }
              @if (e.foto_url) {
                <a [href]="e.foto_url" target="_blank" rel="noopener"><img [src]="e.foto_url" alt="Fotografía del evento"></a>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="vacio">Todavía no hay eventos registrados.</p>
      }
    }
  `,
  styles: `
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 8px 0; border-bottom: 1px solid #e3e6ec; align-items: baseline; }
    .fecha { color: #5b6475; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
    .tipo { font-weight: 600; }
    .detalle { color: #3a4354; font-size: 0.9rem; flex-basis: 100%; }
    img { width: 100%; max-width: 320px; border-radius: 8px; margin-top: 4px; display: block; }
    a:has(img) { flex-basis: 100%; }
    .vacio { color: #5b6475; font-style: italic; margin: 0; }
  `,
})
export class HistorialEventos implements OnInit {
  dispositivoId = input.required<string>();
  limite = input(20);

  private http = inject(HttpClient);
  protected eventos = signal<Evento[] | null>(null);

  constructor() {
    const temporizador = setInterval(() => this.cargar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.cargar();
  }

  protected fecha = formatearFecha;
  protected nombre(tipo: string) {
    return NOMBRES[tipo] ?? tipo;
  }

  private cargar() {
    this.http
      .get<Evento[]>(`/api/dispositivos/${this.dispositivoId()}/eventos`, { params: { limite: this.limite() } })
      .subscribe((lista) => this.eventos.set(lista));
  }
}
