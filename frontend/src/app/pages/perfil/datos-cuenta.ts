// Editar nombre y teléfono (HU-PLA-07 CA2, CA3).
// Si cambia el teléfono, la cuenta queda sin verificar y se abre la pantalla de verificación.
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService, Usuario } from '../../core/auth.service';

@Component({
  selector: 'app-datos-cuenta',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="guardar()" novalidate>
      <div class="campo">
        <label for="nombre">Nombre</label>
        <input id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="name" [class.invalido]="campoError() === 'nombre'">
      </div>
      <div class="campo">
        <label for="telefono">Teléfono móvil</label>
        <input id="telefono" name="telefono" type="tel" inputmode="tel" [(ngModel)]="telefono" autocomplete="tel"
               [class.invalido]="campoError() === 'telefono'">
        <span class="ayuda">Si lo cambias, tendrás que verificar el nuevo número con Telegram.</span>
      </div>
      @if (error()) {
        <div class="alerta-error">{{ error() }}</div>
      }
      @if (exito()) {
        <p class="exito">✅ {{ exito() }}</p>
      }
      <button type="submit" class="boton" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar cambios' }}</button>
    </form>
  `,
  styles: `
    .boton { width: auto; min-width: 200px; }
    .exito { color: #146c2e; }
  `,
})
export class DatosCuenta implements OnInit {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);

  nombre = '';
  telefono = '';
  protected guardando = signal(false);
  protected error = signal('');
  protected campoError = signal<string | null>(null);
  protected exito = signal('');

  ngOnInit() {
    const u = this.auth.usuario();
    this.nombre = u?.nombre ?? '';
    this.telefono = u?.telefono ?? '';
  }

  guardar() {
    this.error.set('');
    this.exito.set('');
    this.campoError.set(null);
    if (!this.nombre.trim()) return this.fallar('nombre', 'El nombre es obligatorio');
    if (!this.telefono.trim()) return this.fallar('telefono', 'El teléfono es obligatorio');
    // Misma normalización que el backend: solo dígitos y, si son 8, se antepone 506 (Costa Rica)
    const digitos = this.telefono.replace(/\D/g, '');
    const normalizado = digitos.length === 8 ? `506${digitos}` : digitos;
    const cambiaTelefono = normalizado !== (this.auth.usuario()?.telefono ?? '');
    if (cambiaTelefono && !confirm('Al cambiar el teléfono deberás verificar el nuevo número con Telegram. Mientras tanto no recibirás alertas. ¿Continuar?')) {
      return;
    }

    this.guardando.set(true);
    this.http
      .put<{ usuario: Usuario; requiere_verificacion: boolean }>('/api/auth/perfil', {
        nombre: this.nombre.trim(),
        telefono: this.telefono.trim(),
      })
      .subscribe({
        next: (r) => {
          this.guardando.set(false);
          this.auth.refrescarUsuario().subscribe(() => {
            this.telefono = r.usuario.telefono;
            // CA3: teléfono nuevo → verificación por Telegram
            if (r.requiere_verificacion) this.router.navigateByUrl('/verificacion');
            else this.exito.set('Datos guardados.');
          });
        },
        error: (err: HttpErrorResponse) => {
          this.guardando.set(false);
          this.fallar(err.error?.campo ?? null, err.error?.error || 'No se pudieron guardar los datos.');
        },
      });
  }

  private fallar(campo: string | null, mensaje: string) {
    this.campoError.set(campo);
    this.error.set(mensaje);
  }
}
