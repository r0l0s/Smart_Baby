// Verificación del teléfono con Telegram (HU-PLA-02).
// Muestra el enlace al bot (CA1) y consulta cada 3 s si ya se verificó; cuando sí, va a Inicio (CA2).
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

interface EstadoVerificacion {
  verificado: boolean;
  enlace?: string;
  qr?: string;
}

const INTERVALO_MS = 3000;

@Component({
  selector: 'app-verificacion',
  imports: [RouterLink],
  templateUrl: './verificacion.html',
  styleUrl: './verificacion.css',
})
export class Verificacion {
  protected auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);

  protected estado = signal<EstadoVerificacion | null>(null);
  protected error = signal('');

  constructor() {
    this.consultar();
    const temporizador = setInterval(() => this.consultar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  private consultar() {
    this.http.get<EstadoVerificacion>('/api/auth/verificacion').subscribe({
      next: (e) => {
        this.error.set('');
        if (e.verificado) {
          // Actualiza el usuario guardado (verificado = true) y entra a la pantalla principal
          this.auth.refrescarUsuario().subscribe(() => this.router.navigateByUrl('/'));
        } else if (e.enlace !== this.estado()?.enlace) {
          this.estado.set(e);
        }
      },
      error: () => this.error.set('No se pudo consultar el estado. Reintentando…'),
    });
  }
}
