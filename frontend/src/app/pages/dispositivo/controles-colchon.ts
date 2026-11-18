// Controles del colchón: activar con cuenta regresiva (HU-COL-01), ver la alarma (HU-COL-02)
// y desactivar (HU-COL-03).
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { formatearFecha } from '../../shared/fechas';

@Component({
  selector: 'app-controles-colchon',
  template: `
    @let d = dispositivo();
    @let m = d.monitoreo;

    @if (m && d.estado['alarma']) {
      <div class="alarma" role="alert">
        <strong>🚨 ¡ALARMA SONANDO!</strong>
        <span>El peso cambió drásticamente. La alarma seguirá sonando hasta que desactives el monitoreo.</span>
      </div>
    }

    <div class="fila">
      <div>
        @if (!m) {
          <p class="estado">⚪ Monitoreo desactivado</p>
          <p class="detalle">Al activarlo tendrás 30 segundos para colocar al bebé antes de que empiece a medir.</p>
        } @else if (restante() !== null) {
          <p class="estado cuenta">⏳ Cuenta regresiva: {{ restante() }} s</p>
          <p class="detalle">Coloca al bebé en el colchón. Durante la cuenta regresiva la alarma no suena.</p>
        } @else if (d.estado['fase'] === 'midiendo') {
          <p class="estado activo">🟢 Midiendo cada segundo</p>
          <p class="detalle">
            Peso base: <strong>{{ d.estado['peso_base'] }} kg</strong>. La alarma suena si el peso cambia 70 % o más
            durante 3 lecturas seguidas.
          </p>
        } @else {
          <p class="estado activo">🟢 Monitoreo activo</p>
          <p class="detalle">Desde {{ fecha(m.inicio) }}. Esperando al colchón…</p>
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
  `,
  styles: `
    .alarma {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: #c0392b;
      color: #fff;
      padding: 14px 16px;
      border-radius: 10px;
      margin-bottom: 14px;
      animation: parpadeo 1s ease-in-out infinite;
    }
    .alarma strong { font-size: 1.2rem; }
    @keyframes parpadeo {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.75; }
    }
    .fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .estado { font-weight: 700; margin: 0 0 4px; }
    .estado.activo { color: #146c2e; }
    .estado.cuenta { color: #9a6700; font-size: 1.15rem; }
    .detalle { margin: 0; color: #5b6475; font-size: 0.9rem; max-width: 520px; }
    .boton { width: auto; min-width: 220px; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class ControlesColchon {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected fecha = formatearFecha;

  // Reloj local para que la cuenta regresiva baje de 1 en 1 aunque la pantalla consulte cada 3 s.
  private ahora = signal(Date.now());
  protected restante = computed(() => {
    const d = this.dispositivo();
    const hasta = d.estado['cuenta_hasta'] as string | null;
    if (!d.monitoreo || d.estado['fase'] !== 'cuenta_regresiva' || !hasta) return null;
    return Math.max(0, Math.ceil((new Date(hasta).getTime() - this.ahora()) / 1000));
  });

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), 500);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
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
