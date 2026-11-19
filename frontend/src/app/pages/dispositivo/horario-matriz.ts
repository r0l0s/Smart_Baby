// Horario diario de la matriz (HU-MAT-03): hora de inicio, duración y velocidad.
// Si ya hay un horario se muestra; intentar agregar otro lo rechaza el sistema (CA3).
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { formatearFecha } from '../../shared/fechas';

interface Horario {
  id: string;
  hora_inicio: string;
  duracion_min: number;
  velocidad: 'lenta' | 'media' | 'rapida';
}
interface RespuestaHorario {
  horario: Horario | null;
  en_curso?: boolean;
  proximo_inicio?: string;
  proximo_fin?: string;
}

const NOMBRE_VELOCIDAD: Record<string, string> = { lenta: 'lenta', media: 'media', rapida: 'rápida' };

@Component({
  selector: 'app-horario-matriz',
  imports: [FormsModule],
  template: `
    @if (datos(); as r) {
      @if (r.horario; as h) {
        <div class="horario">
          <p class="principal">⏰ Todos los días a las <strong>{{ h.hora_inicio }}</strong> durante
            <strong>{{ duracionTexto(h.duracion_min) }}</strong> · velocidad <strong>{{ velocidad(h.velocidad) }}</strong></p>
          <p class="proximo" [class.en-curso]="r.en_curso">
            {{ r.en_curso ? '▶ En curso: termina ' + fecha(r.proximo_fin!) : 'Próximo encendido: ' + fecha(r.proximo_inicio!) + ' → ' + fecha(r.proximo_fin!) }}
          </p>
        </div>
        @if (!mostrarFormulario()) {
          <button type="button" class="boton secundario chico" (click)="mostrarFormulario.set(true)">+ Agregar otro horario</button>
        }
      } @else {
        <p class="sin-horario">No hay horario programado. La matriz solo se enciende de forma manual.</p>
      }

      @if (!r.horario || mostrarFormulario()) {
        <form (ngSubmit)="guardar()" novalidate>
          <div class="campos">
            <label>Hora de inicio <input type="time" name="hora" [(ngModel)]="hora" required></label>
            <label>Duración (minutos) <input type="number" name="duracion" min="1" max="720" [(ngModel)]="duracion" required></label>
            <label>Velocidad
              <select name="velocidad" [(ngModel)]="vel">
                <option value="lenta">🐢 Lenta</option>
                <option value="media">🚶 Media</option>
                <option value="rapida">🐇 Rápida</option>
              </select>
            </label>
          </div>
          <div class="acciones">
            <button type="submit" class="boton" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar horario' }}</button>
            @if (r.horario) {
              <button type="button" class="boton secundario" (click)="mostrarFormulario.set(false); error.set('')">Cancelar</button>
            }
          </div>
        </form>
      }
      @if (error()) {
        <div class="alerta-error">{{ error() }}</div>
      }
      @if (exito()) {
        <p class="exito">✅ {{ exito() }}</p>
      }
    } @else {
      <p>Cargando horario…</p>
    }
  `,
  styles: `
    .horario { background: #f4f6fa; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
    .principal { margin: 0 0 4px; }
    .proximo { margin: 0; color: #5b6475; font-size: 0.9rem; }
    .proximo.en-curso { color: #146c2e; font-weight: 600; }
    .sin-horario { color: #5b6475; margin: 0 0 12px; }
    .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #5b6475; }
    input, select { font-size: 1rem; padding: 8px 10px; border: 1px solid #c6ccd8; border-radius: 8px; }
    .acciones { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .acciones .boton, .chico { width: auto; }
    .alerta-error { margin: 12px 0 0; }
    .exito { color: #146c2e; margin: 12px 0 0; }
  `,
})
export class HorarioMatriz implements OnInit {
  dispositivo = input.required<Dispositivo>();

  private http = inject(HttpClient);
  protected datos = signal<RespuestaHorario | null>(null);
  protected mostrarFormulario = signal(false);
  protected guardando = signal(false);
  protected error = signal('');
  protected exito = signal('');
  protected fecha = formatearFecha;

  hora = '';
  duracion: number | null = 30;
  vel = 'media';

  constructor() {
    const temporizador = setInterval(() => this.cargar(), 10000); // "en curso" / "próximo" al día
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.cargar();
  }

  protected velocidad(v: string) {
    return NOMBRE_VELOCIDAD[v] ?? v;
  }

  protected duracionTexto(min: number) {
    return min % 60 === 0 ? `${min / 60} h` : min > 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  }

  private cargar() {
    this.http.get<RespuestaHorario>(`/api/dispositivos/${this.dispositivo().id}/horario`).subscribe((r) => this.datos.set(r));
  }

  guardar() {
    this.error.set('');
    this.exito.set('');
    if (!this.hora) return this.error.set('Ingresa la hora de inicio');
    if (!this.duracion) return this.error.set('Ingresa la duración en minutos');
    this.guardando.set(true);
    const cuerpo = { hora_inicio: this.hora, duracion_min: Number(this.duracion), velocidad: this.vel };
    this.http.post<RespuestaHorario>(`/api/dispositivos/${this.dispositivo().id}/horario`, cuerpo).subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.datos.set(r);
        this.mostrarFormulario.set(false);
        this.exito.set('Horario guardado.');
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.error.set(err.error?.error || 'No se pudo guardar el horario.');
      },
    });
  }
}
