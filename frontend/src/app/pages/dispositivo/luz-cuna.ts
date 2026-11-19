// Luz de noche de la cuna (HU-CUN-08): encender, apagar y elegir uno de 3 niveles.
// Muestra el estado que reporta la cuna, así que también refleja los cambios hechos con los
// botones físicos de la cuna (CA3); la pantalla se actualiza cada 3 s.
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';

@Component({
  selector: 'app-luz-cuna',
  template: `
    @let d = dispositivo();
    <div class="fila">
      <div class="lampara" [class.encendida]="encendida()" [attr.data-nivel]="nivel()" aria-hidden="true">💡</div>
      <div class="info">
        <p class="estado">
          {{ encendida() ? 'Encendida · nivel ' + nivel() + ' de 3' : 'Apagada' }}
        </p>
        <div class="botones">
          <button type="button" class="boton" [class.secundario]="encendida()" (click)="cambiar({ encendida: !encendida() })"
                  [disabled]="enviando() || !d.online">
            {{ encendida() ? 'Apagar luz' : 'Encender luz' }}
          </button>
          <div class="niveles" role="group" aria-label="Intensidad">
            @for (n of [1, 2, 3]; track n) {
              <button type="button" class="nivel" [class.activo]="encendida() && nivel() === n" [attr.aria-pressed]="encendida() && nivel() === n"
                      (click)="cambiar({ nivel: n })" [disabled]="enviando() || !d.online || !encendida()">
                {{ n }}
              </button>
            }
          </div>
        </div>
        <p class="nota">La intensidad se elige con la luz encendida. Los cambios hechos en la cuna también se ven aquí.</p>
      </div>
    </div>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
  `,
  styles: `
    .fila { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .lampara {
      font-size: 2.6rem; width: 72px; height: 72px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: #e3e6ec; filter: grayscale(1); opacity: 0.6; transition: all 0.3s;
    }
    .lampara.encendida { filter: none; opacity: 1; background: #fff6d6; }
    .lampara.encendida[data-nivel='1'] { box-shadow: 0 0 10px 2px #ffe58a; }
    .lampara.encendida[data-nivel='2'] { box-shadow: 0 0 20px 6px #ffd84d; }
    .lampara.encendida[data-nivel='3'] { box-shadow: 0 0 32px 12px #ffc800; }
    .info { flex: 1; min-width: 220px; }
    .estado { font-weight: 700; margin: 0 0 8px; }
    .botones { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .botones .boton { width: auto; min-width: 150px; }
    .niveles { display: flex; gap: 6px; }
    .nivel { width: 44px; height: 44px; border-radius: 10px; border: 1px solid #c6ccd8; background: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; }
    .nivel.activo { background: #ffc800; border-color: #c99a00; }
    .nivel:disabled { opacity: 0.45; cursor: not-allowed; }
    .nota { color: #5b6475; font-size: 0.85rem; margin: 8px 0 0; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class LuzCuna {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected enviando = signal(false);
  protected error = signal('');
  protected encendida = computed(() => this.dispositivo().estado['luz_encendida'] === true);
  protected nivel = computed(() => Number(this.dispositivo().estado['luz_nivel'] ?? 1));

  cambiar(cambio: { encendida?: boolean; nivel?: number }) {
    this.enviando.set(true);
    this.error.set('');
    this.http.post(`/api/dispositivos/${this.dispositivo().id}/luz`, cambio).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(err.error?.error || 'No se pudo cambiar la luz.');
      },
    });
  }
}
