// Gráfica reutilizable (HU-TRN-02).
//  - Eje X: tiempo, de "desde" a "hasta" (o hasta ahora si el monitoreo sigue activo).   CA1, CA2
//  - Eje Y: rotulado con la unidad de la medición.                                       CA3
//  - estilo "linea" para valores continuos (temperatura, humedad, peso) y
//    estilo "puntos" para detecciones (movimiento).
import { Component, computed, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { es } from 'date-fns/locale';
import { formatearFechaSegundos } from './fechas';

export interface Punto {
  t: string; // fecha ISO (UTC)
  v: number;
}

@Component({
  selector: 'app-grafica',
  imports: [BaseChartDirective],
  template: `
    <div class="grafica">
      <h3>{{ titulo() }}</h3>
      <div class="lienzo">
        <canvas baseChart type="line" [data]="datos()" [options]="opciones()"></canvas>
      </div>
      @if (!puntos().length) {
        <p class="vacio">Sin datos en este periodo.</p>
      }
    </div>
  `,
  styles: `
    .grafica { margin-bottom: 18px; }
    h3 { font-size: 0.95rem; margin: 0 0 6px; }
    .lienzo { position: relative; height: 240px; }
    .vacio { color: #5b6475; font-size: 0.85rem; margin: 4px 0 0; }
  `,
})
export class Grafica {
  titulo = input.required<string>();
  /** Texto del eje Y, con la unidad. Ej.: "Temperatura (°C)" */
  ejeY = input.required<string>();
  puntos = input<Punto[]>([]);
  desde = input.required<string>();
  /** null = monitoreo activo → el eje X llega hasta ahora */
  hasta = input<string | null>(null);
  /** linea = valores continuos; puntos = detecciones; sesiones = un punto grande por sesión, eje Y desde 0 */
  estilo = input<'linea' | 'puntos' | 'sesiones'>('linea');
  /** Título del eje X */
  ejeX = input('Hora');
  color = input('#3b6fd8');
  /** Valores que se muestran en vez del número en el tooltip (ej. 1 → "Movimiento detectado") */
  textoValor = input<((v: number) => string) | null>(null);

  protected datos = computed<ChartConfiguration<'line'>['data']>(() => {
    const esPuntos = this.estilo() === 'puntos';
    return {
      datasets: [
        {
          label: this.titulo(),
          data: this.puntos().map((p) => ({ x: new Date(p.t).getTime(), y: p.v })),
          borderColor: this.color(),
          backgroundColor: this.color(),
          borderWidth: 2,
          showLine: !esPuntos,
          pointRadius: esPuntos || this.estilo() === 'sesiones' ? 6 : 2,
          pointHoverRadius: esPuntos || this.estilo() === 'sesiones' ? 8 : 5,
          tension: 0.2,
        },
      ],
    };
  });

  protected opciones = computed<ChartConfiguration<'line'>['options']>(() => {
    const esPuntos = this.estilo() === 'puntos';
    const textoValor = this.textoValor();
    // Se lee "puntos" a propósito: así, cada vez que llegan datos nuevos (cada 3 s con el
    // monitoreo activo) se recalcula el final del eje X = ahora, y los puntos nuevos quedan visibles.
    this.puntos();
    const fin = this.hasta() ? new Date(this.hasta()!).getTime() : Date.now();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => formatearFechaSegundos(new Date(items[0].parsed.x as number)),
            label: (item) => {
              const v = item.parsed.y as number;
              return textoValor ? textoValor(v) : `${v} ${this.ejeY()}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          min: new Date(this.desde()).getTime(),
          max: fin,
          adapters: { date: { locale: es } },
          time: { displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'dd/MM HH:mm', day: 'dd/MM' } },
          title: { display: true, text: this.ejeX() },
          ticks: { maxRotation: 0, autoSkipPadding: 16 },
        },
        y: {
          title: { display: true, text: this.ejeY() },
          ...(esPuntos ? { min: 0, max: 2, ticks: { display: false }, grid: { display: false } } : {}),
          ...(this.estilo() === 'sesiones' ? { beginAtZero: true } : {}),
        },
      },
    };
  });
}
