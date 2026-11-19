// Perfil: gestión de la cuenta (HU-PLA-07) y notificación de prueba (HU-TRN-03).
// Invitaciones y lista de perfiles: HU-PLA-08/09.
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Encabezado } from '../../shared/encabezado';
import { DatosCuenta } from './datos-cuenta';
import { CambiarPassword } from './cambiar-password';

@Component({
  selector: 'app-perfil',
  imports: [RouterLink, Encabezado, DatosCuenta, CambiarPassword],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil {
  protected auth = inject(AuthService);
  private http = inject(HttpClient);

  protected mensajePrueba = signal('');
  protected enviando = signal(false);

  constructor() {
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
