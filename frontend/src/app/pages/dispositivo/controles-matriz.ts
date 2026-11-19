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
        <p class="detalle">Velocidad: <strong>{{ velocidad() }}</strong></p>
        <button type="button" class="boton" [class.secundario]="encendida()" (click)="cambiar({ encendida: !encendida() })"
                [disabled]="enviando() || !d.online">
          {{ enviando() ? 'Un momento…' : encendida() ? 'Apagar matriz' : 'Encender matriz' }}
        </button>
        <p class="nota">La vista muestra en tiempo real el patrón que está mostrando la matriz.</p>
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
    .detalle { margin: 0 0 12px; color: #5b6475; }
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
  protected velocidad = computed(() => NOMBRE_VELOCIDAD[this.dispositivo().estado['velocidad'] as string] ?? 'Media');

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
