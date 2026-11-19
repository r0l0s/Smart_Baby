// Comunicación con el bebé: la plataforma inicia y finaliza la llamada; la cuna la confirma.
// Mientras está activa, la cuna no reproduce sonidos (HU-CUN-09 CA3) y no se puede iniciar si
// suena un sonido (HU-CUN-10 CA3). El canal de audio (hablar y escuchar) se agrega en HU-CUN-10.
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';

@Component({
  selector: 'app-comunicacion-cuna',
  template: `
    @let d = dispositivo();
    <div class="fila">
      <div>
        <p class="estado" [class.activa]="activa()">{{ activa() ? '📞 Comunicación activa' : '📴 Sin comunicación' }}</p>
        <p class="detalle">
          {{ activa()
            ? 'Mientras dure, la cuna no reproduce sonidos pregrabados.'
            : 'Inicia una llamada con la cuna, como en un monitor de bebé.' }}
        </p>
      </div>
      <button type="button" class="boton" [class.secundario]="activa()" (click)="cambiar(!activa())" [disabled]="enviando() || !d.online">
        {{ enviando() ? 'Un momento…' : activa() ? 'Finalizar comunicación' : 'Iniciar comunicación' }}
      </button>
    </div>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
    <p class="nota">🚧 El canal de audio (hablarle al bebé y escucharlo) se habilita en HU-CUN-10.</p>
  `,
  styles: `
    .fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .estado { font-weight: 700; margin: 0 0 4px; }
    .estado.activa { color: #146c2e; }
    .detalle { margin: 0; color: #5b6475; font-size: 0.9rem; }
    .boton { width: auto; min-width: 220px; }
    .nota { color: #5b6475; font-size: 0.85rem; margin: 12px 0 0; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class ComunicacionCuna {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected activa = computed(() => this.dispositivo().estado['audio_activo'] === true);

  cambiar(activo: boolean) {
    this.enviando.set(true);
    this.error.set('');
    this.http.post(`/api/dispositivos/${this.dispositivo().id}/comunicacion`, { activo }).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(err.error?.error || 'No se pudo cambiar la comunicación.');
      },
    });
  }
}
