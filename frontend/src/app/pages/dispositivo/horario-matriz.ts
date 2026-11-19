// Horario diario de la matriz: crear (HU-MAT-03), ver, modificar y eliminar (HU-MAT-04).
// Solo puede haber un horario: la pantalla lo indica y el backend rechaza un segundo (HU-MAT-03 CA3).
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
        @if (!modo()) {
          <p class="regla">Solo puede haber un horario. Para cambiarlo, modifícalo o elimínalo.</p>
          <div class="acciones">
            <button type="button" class="boton secundario chico" (click)="abrir('modificar', h)">✏️ Modificar</button>
            <button type="button" class="boton peligro chico" (click)="eliminar()" [disabled]="guardando()">🗑️ Eliminar</button>
          </div>
        }
      } @else {
        <p class="sin-horario">No hay horario programado. La matriz solo se enciende de forma manual.</p>
      }

      @if (!r.horario || modo()) {
        <form (ngSubmit)="guardar()" novalidate>
          <p class="titulo-form">{{ modo() === 'modificar' ? '✏️ Modificar horario' : 'Nuevo horario' }}</p>
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
              <button type="button" class="boton secundario" (click)="modo.set(null); error.set('')">Cancelar</button>
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
    .titulo-form { font-weight: 700; margin: 4px 0 10px; }
    .regla { color: #5b6475; font-size: 0.85rem; margin: 0 0 8px; }
    .boton.peligro { background: #fff; color: #b0281d; border: 1px solid #b0281d; }
    .alerta-error { margin: 12px 0 0; }
    .exito { color: #146c2e; margin: 12px 0 0; }
  `,
})
export class HorarioMatriz implements OnInit {
  dispositivo = input.required<Dispositivo>();

  private http = inject(HttpClient);
  protected datos = signal<RespuestaHorario | null>(null);
  /** null = solo ver; 'crear' = nuevo horario; 'modificar' = editar el existente */
  protected modo = signal<'crear' | 'modificar' | null>(null);
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

  protected abrir(modo: 'crear' | 'modificar', h?: Horario) {
    this.error.set('');
    this.exito.set('');
    if (h) {
      this.hora = h.hora_inicio;
      this.duracion = h.duracion_min;
      this.vel = h.velocidad;
    }
    this.modo.set(modo);
  }

  // HU-MAT-04 CA3: eliminar, previa confirmación
  eliminar() {
    if (!confirm('¿Eliminar el horario? La matriz dejará de encenderse sola. Podrás seguir usándola de forma manual.')) return;
    this.guardando.set(true);
    this.error.set('');
    this.http.delete<RespuestaHorario>(`/api/dispositivos/${this.dispositivo().id}/horario`).subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.datos.set(r);
        this.exito.set('Horario eliminado. La matriz ya no se encenderá por horario.');
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.error.set(err.error?.error || 'No se pudo eliminar el horario.');
      },
    });
  }

  guardar() {
    this.error.set('');
    this.exito.set('');
    if (!this.hora) return this.error.set('Ingresa la hora de inicio');
    if (!this.duracion) return this.error.set('Ingresa la duración en minutos');
    this.guardando.set(true);
    const cuerpo = { hora_inicio: this.hora, duracion_min: Number(this.duracion), velocidad: this.vel };
    // Crear (POST) o modificar (PUT): el backend aplica las mismas validaciones (HU-MAT-04 CA2)
    const url = `/api/dispositivos/${this.dispositivo().id}/horario`;
    const peticion = this.modo() === 'modificar' ? this.http.put<RespuestaHorario>(url, cuerpo) : this.http.post<RespuestaHorario>(url, cuerpo);
    const eraModificar = this.modo() === 'modificar';
    peticion.subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.datos.set(r);
        this.modo.set(null);
        this.exito.set(eraModificar ? 'Horario modificado.' : 'Horario guardado.');
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.error.set(err.error?.error || 'No se pudo guardar el horario.');
      },
    });
  }
}
