// Controles de la cuna (HU-CUN-01): activar y desactivar el monitoreo.
import { Component, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { formatearFecha } from '../../shared/fechas';

@Component({
  selector: 'app-controles-cuna',
  template: `
    @let d = dispositivo();
    @let m = d.monitoreo;
    <div class="fila">
      <div>
        <p class="estado" [class.activo]="!!m">
          {{ m ? '🟢 Monitoreo activo' : '⚪ Monitoreo desactivado' }}
        </p>
        @if (m) {
          <p class="detalle">Desde {{ fecha(m.inicio) }}. Sensores de temperatura, humedad y movimiento encendidos.</p>
        } @else {
          <p class="detalle">Los sensores están apagados: no se registran lecturas ni se envían alertas.</p>
        }
      </div>
      <button
        type="button"
        class="boton"
        [class.secundario]="!!m"
        (click)="cambiar(!m)"
        [disabled]="enviando() || (!m && !d.online)"
      >
        {{ enviando() ? 'Un momento…' : m ? 'Desactivar monitoreo' : 'Activar monitoreo' }}
      </button>
    </div>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
    <p class="nota">
      Rangos de alerta actuales: {{ d.configuracion['temp_min'] }}–{{ d.configuracion['temp_max'] }} °C ·
      {{ d.configuracion['hum_min'] }}–{{ d.configuracion['hum_max'] }} %.
      Los datos se actualizan cada {{ intervalo() }}.
    </p>

    <!-- HU-CUN-07: notificación por cada movimiento (deshabilitada por defecto) -->
    <label class="opcion">
      <input
        type="checkbox"
        [checked]="d.configuracion['notificar_movimiento'] === true"
        [disabled]="guardandoOpcion()"
        (change)="cambiarNotificarMovimiento($any($event.target).checked)"
      >
      <span>
        <strong>🏃 Notificarme cada movimiento por Telegram</strong>
        <small>Si está desmarcado, los movimientos se registran y grafican, pero no se notifican.</small>
      </span>
    </label>
  `,
  styles: `
    .fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .estado { font-weight: 700; margin: 0 0 4px; }
    .estado.activo { color: #146c2e; }
    .detalle { margin: 0; color: #5b6475; font-size: 0.9rem; }
    .boton { width: auto; min-width: 220px; }
    .nota { color: #5b6475; font-size: 0.85rem; margin: 12px 0 0; }
    .alerta-error { margin: 12px 0 0; }
    .opcion {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-top: 14px;
      padding: 12px;
      background: #f4f6fa;
      border-radius: 10px;
      cursor: pointer;
    }
    .opcion input { width: 20px; height: 20px; margin-top: 2px; flex: none; }
    .opcion span { display: flex; flex-direction: column; gap: 2px; }
    .opcion small { color: #5b6475; }
  `,
})
export class ControlesCuna {
  dispositivo = input.required<Dispositivo>();
  /** Avisa a la pantalla para que recargue el dispositivo */
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected fecha = formatearFecha;

  protected intervalo() {
    const s = this.dispositivo().intervalo_seg ?? 180;
    return s % 60 === 0 ? `${s / 60} min` : `${s} s (modo demo)`;
  }

  protected guardandoOpcion = signal(false);

  cambiarNotificarMovimiento(valor: boolean) {
    this.guardandoOpcion.set(true);
    this.error.set('');
    this.http.put(`/api/dispositivos/${this.dispositivo().id}/opciones`, { notificar_movimiento: valor }).subscribe({
      next: () => {
        this.guardandoOpcion.set(false);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.guardandoOpcion.set(false);
        this.error.set(err.error?.error || 'No se pudo guardar la opción.');
        this.cambio.emit(); // vuelve a mostrar el valor guardado
      },
    });
  }

  cambiar(activo: boolean) {
    this.enviando.set(true);
    this.error.set('');
    this.http.post(`/api/dispositivos/${this.dispositivo().id}/monitoreo`, { activo }).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(err.error?.error || 'No se pudo cambiar el monitoreo.');
      },
    });
  }
}
