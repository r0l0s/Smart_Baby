// Tiempos de comida y recordatorios (HU-ALI-04): agregar uno o más tiempos (CA1), que se repiten
// todos los días (CA2) y envían un recordatorio por Telegram (CA3); editarlos o eliminarlos (CA4).
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Dispositivo } from '../../core/dispositivos';

interface TiempoComida {
  id: string;
  hora: string;
}

@Component({
  selector: 'app-tiempos-comida',
  imports: [FormsModule],
  template: `
    <p class="detalle">
      Se repiten <strong>todos los días</strong>. A cada hora se envía un recordatorio por Telegram a todos los perfiles del ambiente.
    </p>

    @if (tiempos(); as lista) {
      @if (lista.length) {
        <ul>
          @for (t of lista; track t.id) {
            <li>
              @if (editando() === t.id) {
                <input type="time" [(ngModel)]="horaEditada" name="editar" aria-label="Nueva hora">
                <button type="button" class="mini" (click)="guardarEdicion(t)" [disabled]="ocupado()">Guardar</button>
                <button type="button" class="mini secundario" (click)="editando.set(null)">Cancelar</button>
              } @else {
                <span class="hora">🕐 {{ t.hora }}</span>
                <button type="button" class="mini secundario" (click)="editar(t)">✏️ Editar</button>
                <button type="button" class="mini peligro" (click)="eliminar(t)" [disabled]="ocupado()">🗑️ Eliminar</button>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="vacio">Todavía no hay tiempos de comida.</p>
      }
    }

    <form class="agregar" (ngSubmit)="agregar()" novalidate>
      <label for="nueva">Agregar tiempo de comida</label>
      <div class="fila">
        <input id="nueva" type="time" name="nueva" [(ngModel)]="horaNueva">
        <button type="submit" class="boton" [disabled]="ocupado()">+ Agregar</button>
      </div>
    </form>

    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
  `,
  styles: `
    .detalle { color: #5b6475; margin: 0 0 12px; }
    ul { list-style: none; padding: 0; margin: 0 0 12px; }
    li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #e3e6ec; }
    .hora { font-size: 1.15rem; font-weight: 700; flex: 1; min-width: 90px; }
    .mini { border: 1px solid #3b6fd8; background: #3b6fd8; color: #fff; border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 0.85rem; }
    .mini.secundario { background: #fff; color: #3b6fd8; }
    .mini.peligro { background: #fff; color: #b0281d; border-color: #b0281d; }
    input[type='time'] { font-size: 1rem; padding: 8px 10px; border: 1px solid #c6ccd8; border-radius: 8px; }
    .agregar label { font-weight: 600; display: block; margin-bottom: 6px; }
    .fila { display: flex; gap: 8px; flex-wrap: wrap; }
    .fila .boton { width: auto; }
    .vacio { color: #5b6475; font-style: italic; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class TiemposComida implements OnInit {
  dispositivo = input.required<Dispositivo>();

  private http = inject(HttpClient);
  protected tiempos = signal<TiempoComida[] | null>(null);
  protected editando = signal<string | null>(null);
  protected ocupado = signal(false);
  protected error = signal('');
  horaNueva = '';
  horaEditada = '';

  ngOnInit() {
    this.http.get<TiempoComida[]>(this.url()).subscribe((l) => this.tiempos.set(l));
  }

  private url(id?: string) {
    return `/api/dispositivos/${this.dispositivo().id}/comidas${id ? '/' + id : ''}`;
  }

  // Envía el cambio; el backend responde con la lista actualizada.
  private ejecutar(peticion: Observable<TiempoComida[]>, alTerminar?: () => void) {
    this.ocupado.set(true);
    this.error.set('');
    peticion.subscribe({
      next: (lista) => {
        this.ocupado.set(false);
        this.tiempos.set(lista);
        alTerminar?.();
      },
      error: (err: HttpErrorResponse) => {
        this.ocupado.set(false);
        this.error.set(err.error?.error || 'No se pudo guardar el cambio.');
      },
    });
  }

  agregar() {
    if (!this.horaNueva) return this.error.set('Elige la hora del tiempo de comida');
    this.ejecutar(this.http.post<TiempoComida[]>(this.url(), { hora: this.horaNueva }), () => (this.horaNueva = ''));
  }

  editar(t: TiempoComida) {
    this.error.set('');
    this.horaEditada = t.hora;
    this.editando.set(t.id);
  }

  guardarEdicion(t: TiempoComida) {
    if (!this.horaEditada) return this.error.set('Elige la nueva hora');
    this.ejecutar(this.http.put<TiempoComida[]>(this.url(t.id), { hora: this.horaEditada }), () => this.editando.set(null));
  }

  eliminar(t: TiempoComida) {
    if (!confirm(`¿Eliminar el tiempo de comida de las ${t.hora}? Ya no se enviará su recordatorio.`)) return;
    this.ejecutar(this.http.delete<TiempoComida[]>(this.url(t.id)));
  }
}
