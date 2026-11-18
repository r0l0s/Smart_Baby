// Pantalla de registro (HU-PLA-01).
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

type Campo = 'nombre' | 'telefono' | 'password';

@Component({
  selector: 'app-registro',
  imports: [FormsModule, RouterLink],
  templateUrl: './registro.html',
})
export class Registro {
  private auth = inject(AuthService);
  private router = inject(Router);

  nombre = '';
  telefono = '';
  password = '';

  protected errores = signal<Partial<Record<Campo, string>>>({});
  protected errorGeneral = signal('');
  protected enviando = signal(false);

  // CA2 y CA5: revisa cada campo y dice cuál falta o está mal.
  private validar(): boolean {
    const e: Partial<Record<Campo, string>> = {};
    if (!this.nombre.trim()) e.nombre = 'El nombre es obligatorio';
    if (!this.telefono.trim()) e.telefono = 'El teléfono es obligatorio';
    if (!this.password) e.password = 'La contraseña es obligatoria';
    else if (this.password.length < 8) e.password = 'La contraseña debe tener al menos 8 caracteres';
    this.errores.set(e);
    return Object.keys(e).length === 0;
  }

  enviar() {
    this.errorGeneral.set('');
    if (!this.validar()) return;

    this.enviando.set(true);
    this.auth.registro(this.nombre.trim(), this.telefono.trim(), this.password).subscribe({
      // CA3: cuenta creada → continúa con la verificación del teléfono (HU-PLA-02)
      next: () => this.router.navigateByUrl('/verificacion'),
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        const campo = err.error?.campo as Campo | undefined;
        const mensaje = err.error?.error || 'No se pudo crear la cuenta. Intenta de nuevo.';
        // CA4: el backend responde con campo "telefono" si ya está registrado
        if (campo) this.errores.set({ [campo]: mensaje });
        else this.errorGeneral.set(mensaje);
      },
    });
  }
}
