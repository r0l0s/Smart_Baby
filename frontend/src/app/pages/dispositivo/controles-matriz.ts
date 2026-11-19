// Controles de la matriz LED: encender y apagar (HU-MAT-01), con la vista en tiempo real.
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { VistaMatriz } from '../../shared/vista-matriz';

const NOMBRE_VELOCIDAD: Record<string, string> = { lenta: 'Lenta', media: 'Media', rapida: 'Rápida' };

@Component({
  selector: 'app-controles-matriz',
  imports: [VistaMatriz],
  template: `
    @let d = dispositivo();
    <div class="fila">
      <app-vista-matriz [estado]="d.estado" />
      <div class="info">
        <p class="estado" [class.activa]="encendida()">
          {{ encendida() ? '🟢 Encendida' : '⚪ Apagada' }}
          @if (d.estado['origen'] === 'horario') { <span class="etiqueta">por horario</span> }
        </p>
        <!-- HU-MAT-02: 3 velocidades; se aplican de inmediato sin apagar la matriz -->
        <div class="velocidades" role="group" aria-label="Velocidad del patrón">
          <span class="etiqueta-vel">Velocidad:</span>
          @for (v of velocidades; track v.id) {
            <button type="button" class="vel" [class.activa]="velocidadId() === v.id" [attr.aria-pressed]="velocidadId() === v.id"
                    (click)="cambiar({ velocidad: v.id })" [disabled]="enviando() || !d.online">
              {{ v.icono }} {{ v.nombre }}
            </button>
          }
        </div>
        <button type="button" class="boton" [class.secundario]="encendida()" (click)="cambiar({ encendida: !encendida() })"
                [disabled]="enviando() || !d.online">
          {{ enviando() ? 'Un momento…' : encendida() ? 'Apagar matriz' : 'Encender matriz' }}
        </button>
        <p class="nota">Estos botones cambian la matriz <strong>ahora</strong>. La velocidad del horario se elige en <strong>⏰ Horario</strong>. La vista muestra en tiempo real el patrón de la matriz.</p>
      </div>
    </div>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
  `,
  styles: `
    .fila { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; }
    .info { flex: 1; min-width: 220px; }
    .estado { font-weight: 700; margin: 0 0 4px; }
    .estado.activa { color: #146c2e; }
    .etiqueta { font-size: 0.75rem; background: #e8eefc; color: #1d3f86; padding: 2px 8px; border-radius: 999px; margin-left: 6px; }
    .velocidades { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 14px; }
    .etiqueta-vel { color: #5b6475; margin-right: 4px; }
    .vel { border: 1px solid #c6ccd8; background: #fff; border-radius: 10px; padding: 8px 12px; font-size: 0.9rem; cursor: pointer; }
    .vel.activa { background: #ffe1e1; border-color: #d33; font-weight: 700; }
    .vel:disabled { opacity: 0.5; cursor: not-allowed; }
    .boton { width: auto; min-width: 200px; }
    .nota { color: #5b6475; font-size: 0.85rem; margin: 10px 0 0; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class ControlesMatriz {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected encendida = computed(() => this.dispositivo().estado['encendida'] === true);
  protected velocidadId = computed(() => (this.dispositivo().estado['velocidad'] as string) ?? 'media');
  protected velocidades = [
    { id: 'lenta', nombre: NOMBRE_VELOCIDAD['lenta'], icono: '🐢' },
    { id: 'media', nombre: NOMBRE_VELOCIDAD['media'], icono: '🚶' },
    { id: 'rapida', nombre: NOMBRE_VELOCIDAD['rapida'], icono: '🐇' },
  ];

  cambiar(cambio: { encendida?: boolean; velocidad?: string }) {
    this.enviando.set(true);
    this.error.set('');
    this.http.post(`/api/dispositivos/${this.dispositivo().id}/matriz`, cambio).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(err.error?.error || 'No se pudo cambiar la matriz.');
      },
    });
  }
}
