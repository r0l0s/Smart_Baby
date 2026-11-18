// Controles de la base de biberón (HU-ALI-01): tomar la temperatura de la leche y ver si es apta.
import { Component, computed, inject, input, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo, Medicion } from '../../core/dispositivos';
import { formatearFecha } from '../../shared/fechas';

const CLASES: Record<string, { texto: string; emoji: string; css: string }> = {
  muy_fria: { texto: 'Muy fría', emoji: '🧊', css: 'fria' },
  apta: { texto: 'Apta', emoji: '✅', css: 'apta' },
  muy_caliente: { texto: 'Muy caliente', emoji: '🔥', css: 'caliente' },
};

@Component({
  selector: 'app-controles-biberon',
  template: `
    <div class="fila">
      <p class="detalle">
        Coloca el biberón en la base y pulsa el botón. Rango apto: <strong>36 a 40 °C</strong> (ideal 38 °C).
        El resultado también se envía por Telegram.
      </p>
      <button type="button" class="boton" (click)="medir()" [disabled]="midiendo() || !dispositivo().online">
        {{ midiendo() ? 'Midiendo…' : '🌡️ Tomar temperatura' }}
      </button>
    </div>

    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }

    @if (resultado(); as r) {
      @let c = clase(r.clasificacion);
      <div class="resultado" [class]="c.css">
        <span class="valor">{{ r.valor }} °C</span>
        <span class="clase">{{ c.emoji }} {{ c.texto }}</span>
        <span class="mensaje">{{ r.mensaje }}</span>
        <span class="fecha">{{ esNueva() ? 'Medición de ahora' : 'Última medición' }} · {{ fecha(r.registrado_en) }}</span>
      </div>
    }
  `,
  styles: `
    .fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .detalle { margin: 0; color: #5b6475; font-size: 0.9rem; max-width: 460px; }
    .boton { width: auto; min-width: 220px; }
    .alerta-error { margin: 12px 0 0; }
    .resultado {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-top: 16px;
      padding: 18px 12px;
      border-radius: 12px;
      text-align: center;
      border: 2px solid;
    }
    .valor { font-size: 2.6rem; font-weight: 800; line-height: 1.1; }
    .clase { font-size: 1.3rem; font-weight: 700; }
    .mensaje { color: #3a4354; }
    .fecha { color: #5b6475; font-size: 0.8rem; }
    .fria { background: #e6f0ff; border-color: #3b6fd8; color: #1d3f86; }
    .apta { background: #e3f6e8; border-color: #2e8b57; color: #146c2e; }
    .caliente { background: #fde7e4; border-color: #c0392b; color: #8e1f17; }
  `,
})
export class ControlesBiberon {
  dispositivo = input.required<Dispositivo>();

  private http = inject(HttpClient);
  protected midiendo = signal(false);
  protected error = signal('');
  protected fecha = formatearFecha;

  private nueva = signal<Medicion | null>(null);
  /** CA3: se muestra la medición recién hecha o, al abrir la pantalla, la última registrada. */
  protected resultado = computed(() => this.nueva() ?? this.dispositivo().ultima_medicion ?? null);
  protected esNueva = computed(() => !!this.nueva());

  protected clase(c: string) {
    return CLASES[c] ?? CLASES['apta'];
  }

  medir() {
    this.midiendo.set(true);
    this.error.set('');
    this.http.post<Medicion>(`/api/dispositivos/${this.dispositivo().id}/medir`, {}).subscribe({
      next: (r) => {
        this.midiendo.set(false);
        this.nueva.set(r);
      },
      error: (err: HttpErrorResponse) => {
        this.midiendo.set(false);
        this.error.set(err.error?.error || 'No se pudo medir la temperatura.');
      },
    });
  }
}
