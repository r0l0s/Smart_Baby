// Gráficas de un dispositivo agrupadas por monitoreo (HU-TRN-02 CA2).
// Muestra el monitoreo más reciente (o el que elija el usuario) y, si está activo,
// se actualiza cada 3 s.
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { Grafica, Punto } from './grafica';
import { formatearFecha } from './fechas';

export interface SerieGrafica {
  tipo: string; // tipo de lectura: temperatura, humedad, movimiento, peso
  titulo: string;
  ejeY: string; // con la unidad, ej. "Temperatura (°C)"
  estilo?: 'linea' | 'puntos';
  color?: string;
  textoValor?: (v: number) => string;
}

interface Monitoreo {
  id: string;
  inicio: string;
  fin: string | null;
}

const INTERVALO_MS = 3000;

@Component({
  selector: 'app-graficas-monitoreo',
  imports: [Grafica],
  template: `
    @if (monitoreos(); as lista) {
      @if (lista.length) {
        <label class="selector">
          Monitoreo:
          <select (change)="elegir($any($event.target).value)">
            @for (m of lista; track m.id) {
              <option [value]="m.id" [selected]="m.id === elegido()?.id">{{ etiqueta(m) }}</option>
            }
          </select>
        </label>
        @if (elegido(); as m) {
          @for (s of series(); track s.tipo) {
            <app-grafica
              [titulo]="s.titulo"
              [ejeY]="s.ejeY"
              [estilo]="s.estilo ?? 'linea'"
              [color]="s.color ?? '#3b6fd8'"
              [textoValor]="s.textoValor ?? null"
              [puntos]="datos()[s.tipo] ?? []"
              [desde]="m.inicio"
              [hasta]="m.fin"
            />
          }
        }
      } @else {
        <p class="vacio">Aún no hay monitoreos. Activa el monitoreo para empezar a registrar datos.</p>
      }
    } @else {
      <p class="vacio">Cargando gráficas…</p>
    }
  `,
  styles: `
    .selector { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 0.9rem; }
    select { font-size: 0.95rem; padding: 6px 8px; border-radius: 8px; border: 1px solid #c6ccd8; max-width: 100%; }
    .vacio { color: #5b6475; font-style: italic; margin: 0; }
  `,
})
export class GraficasMonitoreo implements OnInit {
  dispositivoId = input.required<string>();
  series = input.required<SerieGrafica[]>();

  private http = inject(HttpClient);
  protected monitoreos = signal<Monitoreo[] | null>(null);
  protected elegido = signal<Monitoreo | null>(null);
  protected datos = signal<Record<string, Punto[]>>({});
  private eligioManual = false;

  constructor() {
    const temporizador = setInterval(() => this.refrescar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.refrescar();
  }

  protected etiqueta(m: Monitoreo): string {
    return m.fin
      ? `${formatearFecha(m.inicio)} → ${formatearFecha(m.fin)}`
      : `Activo desde ${formatearFecha(m.inicio)}`;
  }

  protected elegir(id: string) {
    this.eligioManual = true;
    this.elegido.set(this.monitoreos()?.find((m) => m.id === id) ?? null);
    this.cargarLecturas();
  }

  private refrescar() {
    this.http.get<Monitoreo[]>(`/api/dispositivos/${this.dispositivoId()}/monitoreos`).subscribe((lista) => {
      this.monitoreos.set(lista);
      const actual = this.elegido();
      // Por defecto se sigue el monitoreo más reciente; si el usuario eligió otro, se respeta.
      const siguiente = this.eligioManual && actual ? (lista.find((m) => m.id === actual.id) ?? lista[0]) : lista[0];
      const cambio = siguiente?.id !== actual?.id || siguiente?.fin !== actual?.fin;
      this.elegido.set(siguiente ?? null);
      // Solo se vuelven a pedir lecturas si el monitoreo cambió o sigue activo.
      if (siguiente && (cambio || !siguiente.fin)) this.cargarLecturas();
    });
  }

  private cargarLecturas() {
    const m = this.elegido();
    if (!m) return;
    const pedidos = Object.fromEntries(
      this.series().map((s) => [
        s.tipo,
        this.http.get<Punto[]>(`/api/dispositivos/${this.dispositivoId()}/lecturas`, {
          params: { tipo: s.tipo, monitoreo: m.id },
        }),
      ]),
    );
    forkJoin(pedidos).subscribe((resultado) => {
      if (this.elegido()?.id === m.id) this.datos.set(resultado);
    });
  }
}
