// Pantalla principal. PROVISIONAL: los botones de dispositivos y perfil llegan en HU-PLA-04.
import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  protected auth = inject(AuthService);

  constructor() {
    // Actualiza nombre/estado y confirma que la sesión sigue siendo válida
    // (si no, el interceptor cierra la sesión y manda a /login).
    this.auth.refrescarUsuario().subscribe({ error: () => {} });
  }
}
