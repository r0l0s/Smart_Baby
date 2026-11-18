// Pantalla principal (HU-PLA-04): botones Agregar dispositivo y Perfil + un botón por dispositivo.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Dispositivo, DispositivosService, infoTipo } from '../../core/dispositivos';
import { Encabezado } from '../../shared/encabezado';

const INTERVALO_MS = 5000; // refresca el estado en línea/fuera de línea

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, Encabezado],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  protected auth = inject(AuthService);
  private servicio = inject(DispositivosService);

  protected dispositivos = signal<Dispositivo[] | null>(null);
  protected error = signal('');
  protected infoTipo = infoTipo;

  constructor() {
    // Actualiza nombre/verificación y confirma que la sesión sigue siendo válida.
    this.auth.refrescarUsuario().subscribe({ error: () => {} });
    this.cargar();
    const temporizador = setInterval(() => this.cargar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  private cargar() {
    this.servicio.listar().subscribe({
      next: (lista) => {
        this.dispositivos.set(lista);
        this.error.set('');
      },
      error: () => this.error.set('No se pudieron cargar los dispositivos.'),
    });
  }
}
