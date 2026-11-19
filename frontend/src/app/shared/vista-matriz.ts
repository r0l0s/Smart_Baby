// Vista en tiempo real de la matriz LED 8×8: dibuja el mismo cuadro que está mostrando la matriz,
// a partir del estado que ella publica (patrón en hexadecimal, velocidad y desde cuándo anima).
import { Component, DestroyRef, inject, input, signal } from '@angular/core';

const INTERVALOS_MS: Record<string, number> = { lenta: 800, media: 400, rapida: 150 };
const INDICES = Array.from({ length: 64 }, (_, i) => i);

@Component({
  selector: 'app-vista-matriz',
  template: `
    <div class="marco" [class.apagada]="!encendida()" role="img"
         [attr.aria-label]="encendida() ? 'Matriz encendida mostrando el patrón' : 'Matriz apagada'">
      @for (i of indices; track i) {
        <span [class.on]="leds()[i]"></span>
      }
    </div>
  `,
  styles: `
    .marco { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; width: min(260px, 100%);
             padding: 12px; background: #111; border-radius: 12px; }
    span { aspect-ratio: 1; border-radius: 50%; background: #2a0a0a; transition: background 0.08s; }
    span.on { background: #ff3b3b; box-shadow: 0 0 7px 2px rgba(255, 60, 60, 0.7); }
    .apagada { opacity: 0.85; }
  `,
})
export class VistaMatriz {
  /** Estado publicado por la matriz */
  estado = input.required<Record<string, unknown>>();

  protected indices = INDICES;
  protected leds = signal<boolean[]>(new Array(64).fill(false));
  protected encendida = signal(false);

  constructor() {
    const reloj = setInterval(() => this.dibujar(), 50);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  private dibujar() {
    const e = this.estado();
    const patron = e['patron'] as string[] | undefined;
    const encendida = e['encendida'] === true && !!e['fase_inicio'] && !!patron?.length;
    this.encendida.set(encendida);
    if (!encendida) {
      if (this.leds().some(Boolean)) this.leds.set(new Array(64).fill(false));
      return;
    }
    const intervalo = INTERVALOS_MS[e['velocidad'] as string] ?? 400;
    const pasados = Math.floor((Date.now() - new Date(e['fase_inicio'] as string).getTime()) / intervalo);
    const hex = patron![(Number(e['cuadro_inicio'] ?? 0) + pasados) % patron!.length];
    const leds: boolean[] = [];
    for (let fila = 0; fila < 8; fila++) {
      const bits = parseInt(hex.slice(fila * 2, fila * 2 + 2), 16);
      for (let col = 0; col < 8; col++) leds.push((bits & (0x80 >> col)) !== 0);
    }
    this.leds.set(leds);
  }
}
