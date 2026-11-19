// Configurar los rangos de alerta de la cuna (HU-CUN-04).
// Sin configuración se usan los valores por defecto: 20–24 °C y 40–60 % (CA1).
import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';

const POR_DEFECTO = { temp_min: 20, temp_max: 24, hum_min: 40, hum_max: 60 };

@Component({
  selector: 'app-umbrales-cuna',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="guardar()" novalidate>
      <div class="grupos">
        <fieldset [class.invalido]="campoError() === 'temp'">
          <legend>🌡️ Temperatura (°C)</legend>
          <label>Mínima <input type="number" step="0.5" name="temp_min" [(ngModel)]="valores.temp_min"></label>
          <label>Máxima <input type="number" step="0.5" name="temp_max" [(ngModel)]="valores.temp_max"></label>
        </fieldset>
        <fieldset [class.invalido]="campoError() === 'hum'">
          <legend>💧 Humedad (%)</legend>
          <label>Mínima <input type="number" step="1" name="hum_min" [(ngModel)]="valores.hum_min"></label>
          <label>Máxima <input type="number" step="1" name="hum_max" [(ngModel)]="valores.hum_max"></label>
        </fieldset>
      </div>

      @if (error()) {
        <div class="alerta-error">{{ error() }}</div>
      }
      @if (exito()) {
        <p class="exito">✅ {{ exito() }}</p>
      }

      <div class="acciones">
        <button type="submit" class="boton" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar rangos' }}</button>
        <button type="button" class="boton secundario" (click)="restablecer()" [disabled]="guardando()">
          Valores por defecto
        </button>
      </div>
      <p class="nota">Por defecto: 20–24 °C y 40–60 %. Los cambios se aplican desde la siguiente medición.</p>
    </form>
  `,
  styles: `
    .grupos { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    fieldset { border: 1px solid #c6ccd8; border-radius: 10px; padding: 8px 12px 12px; display: flex; gap: 10px; }
    fieldset.invalido { border-color: #c0392b; background: #fff6f5; }
    legend { font-weight: 600; padding: 0 4px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #5b6475; flex: 1; }
    input { font-size: 1rem; padding: 8px 10px; border: 1px solid #c6ccd8; border-radius: 8px; width: 100%; }
    .acciones { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .acciones .boton { width: auto; }
    .alerta-error { margin: 12px 0 0; }
    .exito { color: #146c2e; margin: 12px 0 0; }
    .nota { color: #5b6475; font-size: 0.85rem; margin: 10px 0 0; }
  `,
})
export class UmbralesCuna implements OnInit {
  dispositivo = input.required<Dispositivo>();
  cambio = output<void>();

  private http = inject(HttpClient);
  protected valores = { ...POR_DEFECTO };
  protected guardando = signal(false);
  protected error = signal('');
  protected campoError = signal<'temp' | 'hum' | null>(null);
  protected exito = signal('');

  ngOnInit() {
    // Se cargan una sola vez (la pantalla se refresca cada 3 s y no debe borrar lo que se está escribiendo).
    this.valores = { ...POR_DEFECTO, ...(this.dispositivo().configuracion as Partial<typeof POR_DEFECTO>) };
  }

  restablecer() {
    this.valores = { ...POR_DEFECTO };
    this.guardar();
  }

  guardar() {
    this.error.set('');
    this.exito.set('');
    this.campoError.set(null);
    const v = this.valores;
    // CA3: se valida también en el navegador para avisar de inmediato
    for (const [prefijo, nombre] of [['temp', 'temperatura'], ['hum', 'humedad']] as const) {
      const min = v[`${prefijo}_min`];
      const max = v[`${prefijo}_max`];
      if (min === null || max === null || String(min) === '' || String(max) === '') {
        return this.fallar(prefijo, `Ingresa el mínimo y el máximo de ${nombre}`);
      }
      if (Number(min) >= Number(max)) return this.fallar(prefijo, `El mínimo de ${nombre} debe ser menor que el máximo`);
    }

    this.guardando.set(true);
    this.http.put(`/api/dispositivos/${this.dispositivo().id}/umbrales`, v).subscribe({
      next: () => {
        this.guardando.set(false);
        this.exito.set(`Rangos guardados: ${v.temp_min}–${v.temp_max} °C y ${v.hum_min}–${v.hum_max} %.`);
        this.cambio.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.fallar(err.error?.campo ?? null, err.error?.error || 'No se pudieron guardar los rangos.');
      },
    });
  }

  private fallar(campo: 'temp' | 'hum' | null, mensaje: string) {
    this.campoError.set(campo);
    this.error.set(mensaje);
  }
}
