// Cambiar la contraseña (HU-PLA-07 CA2). Solo el usuario principal: es la contraseña del ambiente,
// con la que también entran los invitados.
import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-cambiar-password',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="guardar()" novalidate>
      <div class="campo">
        <label for="actual">Contraseña actual</label>
        <input id="actual" name="actual" type="password" [(ngModel)]="actual" autocomplete="current-password"
               [class.invalido]="campoError() === 'actual'">
      </div>
      <div class="campo">
        <label for="nueva">Contraseña nueva</label>
        <input id="nueva" name="nueva" type="password" [(ngModel)]="nueva" autocomplete="new-password"
               [class.invalido]="campoError() === 'nueva'">
        <span class="ayuda">Mínimo 8 caracteres. Los invitados también usarán esta contraseña.</span>
      </div>
      <div class="campo">
        <label for="confirmar">Repite la contraseña nueva</label>
        <input id="confirmar" name="confirmar" type="password" [(ngModel)]="confirmar" autocomplete="new-password"
               [class.invalido]="campoError() === 'confirmar'">
      </div>
      @if (error()) {
        <div class="alerta-error">{{ error() }}</div>
      }
      @if (exito()) {
        <p class="exito">✅ {{ exito() }}</p>
      }
      <button type="submit" class="boton" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Cambiar contraseña' }}</button>
    </form>
  `,
  styles: `
    .boton { width: auto; min-width: 200px; }
    .exito { color: #146c2e; }
  `,
})
export class CambiarPassword {
  private http = inject(HttpClient);
  actual = '';
  nueva = '';
  confirmar = '';
  protected guardando = signal(false);
  protected error = signal('');
  protected campoError = signal<string | null>(null);
  protected exito = signal('');

  guardar() {
    this.error.set('');
    this.exito.set('');
    this.campoError.set(null);
    if (!this.actual) return this.fallar('actual', 'Ingresa tu contraseña actual');
    if (this.nueva.length < 8) return this.fallar('nueva', 'La contraseña nueva debe tener al menos 8 caracteres');
    if (this.nueva !== this.confirmar) return this.fallar('confirmar', 'Las contraseñas nuevas no coinciden');

    this.guardando.set(true);
    this.http.put('/api/auth/password', { actual: this.actual, nueva: this.nueva }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.actual = this.nueva = this.confirmar = '';
        this.exito.set('Contraseña cambiada. Úsala la próxima vez que inicies sesión.');
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.fallar(err.error?.campo ?? null, err.error?.error || 'No se pudo cambiar la contraseña.');
      },
    });
  }

  private fallar(campo: string | null, mensaje: string) {
    this.campoError.set(campo);
    this.error.set(mensaje);
  }
}
