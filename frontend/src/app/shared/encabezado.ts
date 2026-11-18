// Barra superior reutilizable: botón "Volver" opcional + título + contenido a la derecha.
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-encabezado',
  imports: [RouterLink],
  template: `
    <header>
      <div class="izq">
        @if (volver()) {
          <a class="volver" routerLink="/" aria-label="Volver a la pantalla principal">← Volver</a>
        }
        <span class="titulo">{{ titulo() }}</span>
      </div>
      <div class="der"><ng-content /></div>
    </header>
  `,
  styles: `
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .izq { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .titulo { font-weight: 700; font-size: 1.1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .volver {
      text-decoration: none;
      border: 1px solid #c6ccd8;
      border-radius: 8px;
      padding: 7px 10px;
      color: #1d2433;
      white-space: nowrap;
    }
  `,
})
export class Encabezado {
  titulo = input.required<string>();
  volver = input(false);
}
