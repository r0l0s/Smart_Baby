// Sesión de alimentación (HU-ALI-02): Inicio → cronómetro → Finalizar → cantidad en ml.
// La sesión se guarda en el backend, así que el cronómetro sigue aunque se recargue la página o
// se abra desde otro teléfono.
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dispositivo } from '../../core/dispositivos';
import { formatearFecha } from '../../shared/fechas';

interface Sesion {
  id: number;
  inicio: string;
  duracion_seg: number | null;
  cantidad_ml: number | null;
  estado: 'en_curso' | 'pendiente' | 'completa';
}

@Component({
  selector: 'app-sesion-alimentacion',
  imports: [FormsModule],
  template: `
    @let s = sesion();
    @if (!s || s.estado === 'completa') {
      <p class="detalle">Pulsa <strong>Iniciar</strong> cuando el bebé empiece a comer y <strong>Finalizar</strong> cuando termine.</p>
      <button type="button" class="boton" (click)="iniciar()" [disabled]="ocupado()">▶ Iniciar sesión</button>
      @if (ultima(); as u) {
        <p class="exito">✅ Registrado: {{ duracion(u.duracion_seg!) }} · {{ u.cantidad_ml }} ml ({{ fecha(u.inicio) }})</p>
      }
    } @else if (s.estado === 'en_curso') {
      <!-- CA1: la plataforma cronometra la sesión -->
      <p class="reloj" aria-live="polite">{{ cronometro() }}</p>
      <p class="detalle">Comenzó {{ fecha(s.inicio) }}</p>
      <button type="button" class="boton secundario" (click)="finalizar()" [disabled]="ocupado()">⏹ Finalizar sesión</button>
    } @else {
      <!-- CA2: al finalizar, el sistema solicita la cantidad -->
      <p class="detalle">Sesión de <strong>{{ duracion(s.duracion_seg!) }}</strong> (comenzó {{ fecha(s.inicio) }}).</p>
      <form (ngSubmit)="guardarCantidad(s)" novalidate class="cantidad">
        <label for="ml">¿Cuántos mililitros tomó el bebé?</label>
        <div class="fila">
          <input id="ml" name="ml" type="number" inputmode="decimal" min="1" max="1000" step="any" [(ngModel)]="cantidad"
                 [class.invalido]="!!error()" placeholder="Ej. 120">
          <span>ml</span>
          <button type="submit" class="boton" [disabled]="ocupado()">Guardar</button>
        </div>
      </form>
    }
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }
  `,
  styles: `
    .detalle { color: #5b6475; margin: 0 0 10px; }
    .boton { width: auto; min-width: 200px; }
    .reloj { font-size: 2.8rem; font-weight: 800; margin: 0; font-variant-numeric: tabular-nums; color: #1d3f86; }
    .cantidad label { font-weight: 600; display: block; margin-bottom: 6px; }
    .fila { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .fila input { font-size: 1.1rem; padding: 10px 12px; width: 140px; border: 1px solid #c6ccd8; border-radius: 8px; }
    .fila input.invalido { border-color: #c0392b; }
    .fila .boton { min-width: 120px; }
    .exito { color: #146c2e; margin: 12px 0 0; }
    .alerta-error { margin: 12px 0 0; }
  `,
})
export class SesionAlimentacion implements OnInit {
  dispositivo = input.required<Dispositivo>();

  private http = inject(HttpClient);
  protected sesion = signal<Sesion | null>(null);
  protected ultima = signal<Sesion | null>(null);
  protected ocupado = signal(false);
  protected error = signal('');
  protected fecha = formatearFecha;
  private ahora = signal(Date.now());
  cantidad: number | null = null;

  protected cronometro = computed(() => {
    const s = this.sesion();
    if (!s) return '00:00';
    const seg = Math.max(0, Math.floor((this.ahora() - new Date(s.inicio).getTime()) / 1000));
    const h = Math.floor(seg / 3600);
    const mm = String(Math.floor((seg % 3600) / 60)).padStart(2, '0');
    const ss = String(seg % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  });

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), 500);
    const consulta = setInterval(() => this.cargar(), 5000); // por si se maneja desde otro teléfono
    inject(DestroyRef).onDestroy(() => {
      clearInterval(reloj);
      clearInterval(consulta);
    });
  }

  ngOnInit() {
    this.cargar();
  }

  protected duracion(seg: number) {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return m ? `${m} min ${s} s` : `${s} s`;
  }

  private url(ruta: string) {
    return `/api/dispositivos/${this.dispositivo().id}/alimentacion/${ruta}`;
  }

  private cargar() {
    if (this.ocupado()) return;
    this.http.get<{ sesion: Sesion | null }>(this.url('actual')).subscribe((r) => this.sesion.set(r.sesion));
  }

  private enviar(ruta: string, cuerpo: object, alTerminar: (s: Sesion) => void) {
    this.ocupado.set(true);
    this.error.set('');
    this.http.post<{ sesion: Sesion }>(this.url(ruta), cuerpo).subscribe({
      next: (r) => {
        this.ocupado.set(false);
        alTerminar(r.sesion);
      },
      error: (err: HttpErrorResponse) => {
        this.ocupado.set(false);
        this.error.set(err.error?.error || 'No se pudo completar la acción.');
      },
    });
  }

  iniciar() {
    this.ultima.set(null);
    this.enviar('iniciar', {}, (s) => this.sesion.set(s));
  }

  finalizar() {
    this.cantidad = null;
    this.enviar('finalizar', {}, (s) => this.sesion.set(s));
  }

  // CA3 / CA4: cantidad válida → se registra; si no, se rechaza y se vuelve a pedir
  guardarCantidad(s: Sesion) {
    const valor = this.cantidad;
    if (valor === null || !(Number(valor) > 0)) {
      this.error.set('La cantidad debe ser un número positivo de mililitros.');
      return;
    }
    this.enviar(`${s.id}/cantidad`, { cantidad_ml: valor }, (guardada) => {
      this.sesion.set(null);
      this.ultima.set(guardada);
    });
  }
}
