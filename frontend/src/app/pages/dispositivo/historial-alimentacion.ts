// Historial de alimentación (HU-ALI-03): gráficas de cantidad y duración de cada sesión en
// función del tiempo (reutiliza la gráfica de HU-TRN-02).
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { Grafica, Punto } from '../../shared/grafica';

interface SesionGuardada {
  id: number;
  inicio: string;
  duracion_seg: number;
  cantidad_ml: number;
}

const RANGOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 0, texto: 'Todo' },
];

@Component({
  selector: 'app-historial-alimentacion',
  imports: [Grafica],
  template: `
    <div class="rango" role="group" aria-label="Periodo">
      <span>Periodo:</span>
      @for (r of rangos; track r.dias) {
        <button type="button" class="chip" [class.activo]="dias() === r.dias" (click)="elegir(r.dias)">{{ r.texto }}</button>
      }
    </div>

    @if (sesiones(); as lista) {
      @if (lista.length) {
        <p class="resumen">
          {{ lista.length }} sesión(es) · total <strong>{{ total() }} ml</strong> · promedio
          <strong>{{ promedioMl() }} ml</strong> y <strong>{{ promedioMin() }} min</strong> por sesión
        </p>
        <app-grafica titulo="Cantidad por sesión" ejeY="Cantidad (ml)" ejeX="Fecha y hora" estilo="sesiones" color="#2e8b57"
                     [puntos]="puntosCantidad()" [desde]="desde()" [textoValor]="textoMl" />
        <app-grafica titulo="Duración por sesión" ejeY="Duración (min)" ejeX="Fecha y hora" estilo="sesiones" color="#7a4fd1"
                     [puntos]="puntosDuracion()" [desde]="desde()" [textoValor]="textoMin" />
      } @else {
        <p class="vacio">No hay sesiones registradas en este periodo. Registra una en "Sesión de alimentación".</p>
      }
    } @else {
      <p class="vacio">Cargando historial…</p>
    }
  `,
  styles: `
    .rango { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; color: #5b6475; font-size: 0.9rem; }
    .chip { border: 1px solid #c6ccd8; background: #fff; border-radius: 999px; padding: 5px 12px; cursor: pointer; }
    .chip.activo { background: #e8eefc; border-color: #3b6fd8; font-weight: 600; }
    .resumen { margin: 0 0 12px; color: #3a4354; }
    .vacio { color: #5b6475; font-style: italic; margin: 0; }
  `,
})
export class HistorialAlimentacion implements OnInit {
  dispositivo = input.required<Dispositivo>();

  private http = inject(HttpClient);
  protected rangos = RANGOS;
  protected dias = signal(7);
  protected sesiones = signal<SesionGuardada[] | null>(null);
  private desdeServidor = signal<string | null>(null);

  // Sin límite ("Todo"): el eje X empieza en la primera sesión
  protected desde = computed(() => this.desdeServidor() ?? this.sesiones()?.[0]?.inicio ?? new Date().toISOString());
  protected puntosCantidad = computed<Punto[]>(() => (this.sesiones() ?? []).map((s) => ({ t: s.inicio, v: s.cantidad_ml })));
  protected puntosDuracion = computed<Punto[]>(() =>
    (this.sesiones() ?? []).map((s) => ({ t: s.inicio, v: Math.round((s.duracion_seg / 60) * 10) / 10 })),
  );
  protected total = computed(() => Math.round((this.sesiones() ?? []).reduce((a, s) => a + s.cantidad_ml, 0)));
  protected promedioMl = computed(() => Math.round(this.total() / Math.max(1, this.sesiones()?.length ?? 1)));
  protected promedioMin = computed(() => {
    const l = this.sesiones() ?? [];
    return l.length ? Math.round((l.reduce((a, s) => a + s.duracion_seg, 0) / l.length / 60) * 10) / 10 : 0;
  });
  protected textoMl = (v: number) => `${v} ml`;
  protected textoMin = (v: number) => `${v} min`;

  constructor() {
    const temporizador = setInterval(() => this.cargar(), 10000); // aparece la sesión recién registrada
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.cargar();
  }

  protected elegir(dias: number) {
    this.dias.set(dias);
    this.sesiones.set(null);
    this.cargar();
  }

  private cargar() {
    this.http
      .get<{ desde: string | null; sesiones: SesionGuardada[] }>(`/api/dispositivos/${this.dispositivo().id}/alimentacion/sesiones`, {
        params: { dias: this.dias() },
      })
      .subscribe((r) => {
        this.desdeServidor.set(r.desde);
        this.sesiones.set(r.sesiones);
      });
  }
}
