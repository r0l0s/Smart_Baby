// Sonidos pregrabados de la cuna (HU-CUN-09): elegir, reproducir y detener.
// CA3: si la comunicación de audio está activa, el backend lo impide y aquí se muestra el mensaje.
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';

@Component({
  selector: 'app-sonidos-cuna',
  template: `
    @let d = dispositivo();
    @if (audioActivo()) {
      <div class="aviso">📞 Hay una comunicación de audio activa: los sonidos no se pueden reproducir hasta que la finalices.</div>
    }
    <p class="estado">{{ sonando() ? '🔊 Sonando: ' + nombre(sonando()!) : '🔈 Sin sonido' }}</p>
    <div class="sonidos" role="group" aria-label="Sonidos disponibles">
      @for (s of d.sonidos_disponibles ?? []; track s.id) {
        <button type="button" class="sonido" [class.activo]="sonando() === s.id" [attr.aria-pressed]="sonando() === s.id"
                (click)="elegir(s.id)" [disabled]="enviando() || !d.online">
          <span class="emoji">{{ s.emoji }}</span> {{ s.nombre }}
        </button>
      }
    </div>
    <button type="button" class="boton secundario detener" (click)="elegir(null)" [disabled]="enviando() || !d.online || !sonando()">
      ⏹ Detener sonido
    </button>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
  `,
  styles: `
    .aviso { background: #fff4d6; color: #6b4e00; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .estado { font-weight: 700; margin: 0 0 10px; }
    .sonidos { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
    .sonido { display: flex; align-items: center; gap: 8px; padding: 12px; border-radius: 10px; border: 1px solid #c6ccd8;
              background: #fff; font-size: 0.95rem; cursor: pointer; text-align: left; }
    .sonido .emoji { font-size: 1.3rem; }
    .sonido.activo { background: #e8eefc; border-color: #3b6fd8; font-weight: 700; }
    .sonido:disabled { opacity: 0.5; cursor: not-allowed; }
    .detener { width: auto; margin-top: 12px; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class SonidosCuna {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected sonando = computed(() => (this.dispositivo().estado['sonido'] as string | null) ?? null);
  protected audioActivo = computed(() => this.dispositivo().estado['audio_activo'] === true);

  protected nombre(id: string) {
    return this.dispositivo().sonidos_disponibles?.find((s) => s.id === id)?.nombre ?? id;
  }

  elegir(sonido: string | null) {
    this.enviando.set(true);
    this.error.set('');
    this.http.post(`/api/dispositivos/${this.dispositivo().id}/sonido`, { sonido }).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(err.error?.error || 'No se pudo cambiar el sonido.');
      },
    });
  }
}
