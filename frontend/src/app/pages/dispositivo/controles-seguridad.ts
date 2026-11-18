// Controles del sistema de seguridad (HU-SEG-01): activar y desactivar la vigilancia.
// Las fotos de movimiento (HU-SEG-02) y las aperturas de puerta (HU-SEG-03) aparecen en el
// historial de eventos de la pantalla.
import { Component, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { formatearFecha } from '../../shared/fechas';

@Component({
  selector: 'app-controles-seguridad',
  template: `
    @let d = dispositivo();
    @let m = d.monitoreo;
    <div class="fila">
      <div>
        <p class="estado" [class.activo]="!!m">{{ m ? '🟢 Vigilancia activa' : '⚪ Vigilancia desactivada' }}</p>
        @if (m) {
          <p class="detalle">
            Desde {{ fecha(m.inicio) }}. Si se detecta movimiento se toma una foto; si se abre la puerta se registra
            el evento. Ambos te llegan por Telegram.
          </p>
        } @else {
          <p class="detalle">Los sensores no vigilan: no se registran eventos ni se envían alertas.</p>
        }
        @if (d.estado['puertaAbierta']) {
          <p class="puerta">🚪 La puerta está abierta</p>
        }
      </div>
      <button
        type="button"
        class="boton"
        [class.secundario]="!!m"
        (click)="cambiar(!m)"
        [disabled]="enviando() || (!m && !d.online)"
      >
        {{ enviando() ? 'Un momento…' : m ? 'Desactivar vigilancia' : 'Activar vigilancia' }}
      </button>
    </div>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
  `,
  styles: `
    .fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .estado { font-weight: 700; margin: 0 0 4px; }
    .estado.activo { color: #146c2e; }
    .detalle { margin: 0; color: #5b6475; font-size: 0.9rem; max-width: 520px; }
    .puerta { margin: 8px 0 0; font-weight: 600; color: #9a6700; }
    .boton { width: auto; min-width: 220px; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class ControlesSeguridad {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected fecha = formatearFecha;

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
        this.error.set(err.error?.error || 'No se pudo cambiar la vigilancia.');
      },
    });
  }
}
