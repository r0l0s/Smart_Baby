// Historial de eventos de un dispositivo (HU-TRN-01, HU-COL-04): cada evento con su tipo y su
// fecha y hora. Permite elegir el orden (cronológico o más reciente primero), filtrar por tipo y
// cargar más eventos. Se actualiza solo cada 3 s.
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
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
  activacion: '▶️ Activación',
  desactivacion: '⏹️ Desactivación',
  alerta_temperatura: '🌡️ Alerta de temperatura',
  alerta_humedad: '💧 Alerta de humedad',
  configuracion: '⚙️ Configuración actualizada',
  peso_base: '⚖️ Peso base registrado',
  alarma_decremento: '🚨 Decremento drástico de peso',
  alarma_incremento: '🚨 Incremento drástico de peso',
  movimiento: '📷 Movimiento detectado',
  apertura_puerta: '🚪 Apertura de puerta',
  medicion: '🍼 Temperatura de la leche',
  luz: '💡 Luz de noche',
  sonido: '🎵 Sonido',
  audio: '📞 Comunicación con el bebé',
  matriz: '💡 Matriz LED',
  horario: '⏰ Horario de la matriz',
};

const INTERVALO_MS = 3000;
const POR_PAGINA = 20;

@Component({
  selector: 'app-historial-eventos',
  template: `
    <div class="barra">
      @if (filtros().length) {
        <div class="filtros" role="group" aria-label="Filtrar por tipo">
          @for (t of filtros(); track t) {
            <button type="button" class="chip" [class.activo]="elegidos().has(t)" (click)="alternar(t)">
              {{ nombre(t) }}
            </button>
          }
        </div>
      }
      <label class="orden">
        Orden:
        <select [value]="orden()" (change)="cambiarOrden($any($event.target).value)">
          <option value="asc">Cronológico (más antiguo primero)</option>
          <option value="desc">Más reciente primero</option>
        </select>
      </label>
    </div>

    @if (eventos(); as lista) {
      @if (lista.length) {
        <ul>
          @for (e of lista; track e.id) {
            <li [class]="e.tipo">
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
        <div class="pie">
          <span>Mostrando {{ lista.length }} de {{ total() }}</span>
          @if (lista.length < total()) {
            <button type="button" class="boton secundario" (click)="mostrarMas()">Mostrar más</button>
          }
        </div>
      } @else {
        <p class="vacio">{{ elegidos().size === 0 && filtros().length ? 'Elige al menos un tipo de evento.' : 'Todavía no hay eventos registrados.' }}</p>
      }
    }
  `,
  styles: `
    .barra { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .filtros { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid #c6ccd8; background: #fff; border-radius: 999px; padding: 5px 10px; font-size: 0.8rem; cursor: pointer; color: #5b6475; }
    .chip.activo { background: #e8eefc; border-color: #3b6fd8; color: #1d2433; font-weight: 600; }
    .orden { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #5b6475; }
    select { font-size: 0.9rem; padding: 5px 8px; border-radius: 8px; border: 1px solid #c6ccd8; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 8px 0; border-bottom: 1px solid #e3e6ec; align-items: baseline; }
    li.alarma_decremento .tipo, li.alarma_incremento .tipo { color: #b0281d; }
    .fecha { color: #5b6475; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
    .tipo { font-weight: 600; }
    .detalle { color: #3a4354; font-size: 0.9rem; flex-basis: 100%; }
    img { width: 100%; max-width: 320px; border-radius: 8px; margin-top: 4px; display: block; }
    a:has(img) { flex-basis: 100%; }
    .pie { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 10px; color: #5b6475; font-size: 0.85rem; }
    .pie .boton { width: auto; padding: 8px 14px; }
    .vacio { color: #5b6475; font-style: italic; margin: 0; }
  `,
})
export class HistorialEventos implements OnInit {
  dispositivoId = input.required<string>();
  /** Tipos de evento que se pueden filtrar (vacío = se muestran todos, sin botones de filtro) */
  filtros = input<string[]>([]);
  /** Orden inicial: 'asc' = cronológico, 'desc' = más reciente primero */
  ordenInicial = input<'asc' | 'desc'>('desc');

  private http = inject(HttpClient);
  protected eventos = signal<Evento[] | null>(null);
  protected total = signal(0);
  protected orden = signal<'asc' | 'desc'>('desc');
  protected elegidos = signal<Set<string>>(new Set());
  private cantidad = signal(POR_PAGINA);

  private tiposConsulta = computed(() => (this.filtros().length ? [...this.elegidos()] : []));

  constructor() {
    const temporizador = setInterval(() => this.cargar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.orden.set(this.ordenInicial());
    this.elegidos.set(new Set(this.filtros())); // al inicio, todos los tipos marcados
    this.cargar();
  }

  protected fecha = formatearFecha;
  protected nombre(tipo: string) {
    return NOMBRES[tipo] ?? tipo;
  }

  protected alternar(tipo: string) {
    const s = new Set(this.elegidos());
    if (s.has(tipo)) s.delete(tipo);
    else s.add(tipo);
    this.elegidos.set(s);
    this.cantidad.set(POR_PAGINA);
    this.cargar();
  }

  protected cambiarOrden(orden: 'asc' | 'desc') {
    this.orden.set(orden);
    this.cantidad.set(POR_PAGINA);
    this.cargar();
  }

  protected mostrarMas() {
    this.cantidad.update((c) => c + POR_PAGINA);
    this.cargar();
  }

  private cargar() {
    const tipos = this.tiposConsulta();
    if (this.filtros().length && !tipos.length) {
      this.eventos.set([]);
      this.total.set(0);
      return;
    }
    const params: Record<string, string> = { limite: String(this.cantidad()), orden: this.orden() };
    if (tipos.length) params['tipos'] = tipos.join(',');
    this.http
      .get<Evento[]>(`/api/dispositivos/${this.dispositivoId()}/eventos`, { params, observe: 'response' })
      .subscribe((r) => {
        this.eventos.set(r.body ?? []);
        this.total.set(Number(r.headers.get('X-Total') ?? r.body?.length ?? 0));
      });
  }
}
