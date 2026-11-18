// Pantalla principal. PROVISIONAL: los botones de dispositivos y perfil llegan en HU-PLA-04.
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  protected auth = inject(AuthService);
  private http = inject(HttpClient);

  protected mensajePrueba = signal('');
  protected enviando = signal(false);

  constructor() {
    // Actualiza nombre/estado y confirma que la sesión sigue siendo válida
    // (si no, el interceptor cierra la sesión y manda a /login).
    this.auth.refrescarUsuario().subscribe({ error: () => {} });
  }

  // HU-TRN-03: manda una notificación de prueba a todos los perfiles verificados del ambiente.
  enviarPrueba() {
    this.enviando.set(true);
    this.mensajePrueba.set('');
    this.http.post<{ enviados: number; fallidos: number }>('/api/notificaciones/prueba', {}).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.mensajePrueba.set(
          r.enviados === 0
            ? 'No hay perfiles verificados en este ambiente: no se envió nada.'
            : `Notificación enviada a ${r.enviados} perfil(es) verificado(s).` +
                (r.fallidos ? ` ${r.fallidos} no se pudieron enviar.` : ''),
        );
      },
      error: () => {
        this.enviando.set(false);
        this.mensajePrueba.set('No se pudo enviar la notificación.');
      },
    });
  }
}
