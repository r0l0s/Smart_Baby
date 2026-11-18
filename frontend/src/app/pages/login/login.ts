// Pantalla de inicio de sesión (HU-PLA-03). Sirve para el usuario principal y para invitados.
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  telefono = '';
  password = '';

  protected error = signal('');
  protected enviando = signal(false);

  enviar() {
    if (!this.telefono.trim() || !this.password) {
      this.error.set('Ingresa tu teléfono y tu contraseña');
      return;
    }
    this.error.set('');
    this.enviando.set(true);
    this.auth.login(this.telefono.trim(), this.password).subscribe({
      next: () => this.router.navigateByUrl('/'), // CA1 / CA3
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        // CA2: el backend da un mensaje genérico, sin decir cuál dato falló
        this.error.set(
          err.status === 401 ? err.error?.error : 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.',
        );
      },
    });
  }
}
