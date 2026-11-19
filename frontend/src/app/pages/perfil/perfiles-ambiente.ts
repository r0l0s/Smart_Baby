// Lista de perfiles del ambiente (HU-PLA-08 CA3). Se actualiza sola para ver aparecer a quien
// acepte una invitación.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface PerfilAmbiente {
  id: string;
  nombre: string;
  telefono: string;
  rol: 'principal' | 'invitado';
  verificado: boolean;
  soy_yo: boolean;
}

@Component({
  selector: 'app-perfiles-ambiente',
  template: `
    @if (perfiles(); as lista) {
      <ul>
        @for (p of lista; track p.id) {
          <li>
            <span class="avatar">{{ p.rol === 'principal' ? '👤' : '👥' }}</span>
            <span class="datos">
              <strong>{{ p.nombre }}{{ p.soy_yo ? ' (tú)' : '' }}</strong>
              <small>+{{ p.telefono }} · {{ p.rol === 'principal' ? 'Usuario principal' : 'Invitado' }}</small>
            </span>
            <span class="estado" [class.ok]="p.verificado">{{ p.verificado ? '✅ Telegram' : '⚠️ Sin verificar' }}</span>
          </li>
        }
      </ul>
    } @else {
      <p>Cargando perfiles…</p>
    }
  `,
  styles: `
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e3e6ec; }
    .avatar { font-size: 1.5rem; }
    .datos { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    small { color: #5b6475; }
    .estado { font-size: 0.85rem; color: #9a6700; white-space: nowrap; }
    .estado.ok { color: #146c2e; }
  `,
})
export class PerfilesAmbiente {
  private http = inject(HttpClient);
  protected perfiles = signal<PerfilAmbiente[] | null>(null);

  constructor() {
    this.cargar();
    const temporizador = setInterval(() => this.cargar(), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  cargar() {
    this.http.get<PerfilAmbiente[]>('/api/ambiente/perfiles').subscribe((l) => this.perfiles.set(l));
  }
}
