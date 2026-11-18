// Agregar dispositivo (HU-PLA-05). Pasos: elegir tipo → elegir un dispositivo encontrado → Vincular.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { DispositivosService, InfoTipo, TIPOS_DISPOSITIVO } from '../../core/dispositivos';
import { Encabezado } from '../../shared/encabezado';

const INTERVALO_MS = 3000; // busca dispositivos en línea mientras la lista está abierta

@Component({
  selector: 'app-agregar-dispositivo',
  imports: [Encabezado],
  templateUrl: './agregar-dispositivo.html',
  styleUrl: './agregar-dispositivo.css',
})
export class AgregarDispositivo {
  private servicio = inject(DispositivosService);
  private router = inject(Router);

  protected tipos = TIPOS_DISPOSITIVO;
  protected tipoElegido = signal<InfoTipo | null>(null);
  protected encontrados = signal<string[] | null>(null);
  protected vinculando = signal<string | null>(null);
  protected error = signal('');

  constructor() {
    const temporizador = setInterval(() => this.buscar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  // CA2: al elegir el tipo se inicia la vinculación (búsqueda de dispositivos de ese tipo)
  elegirTipo(info: InfoTipo) {
    this.tipoElegido.set(info);
    this.encontrados.set(null);
    this.error.set('');
    this.buscar();
  }

  cambiarTipo() {
    this.tipoElegido.set(null);
    this.error.set('');
  }

  private buscar() {
    const info = this.tipoElegido();
    if (!info || this.vinculando()) return;
    this.servicio.disponibles(info.tipo).subscribe({
      next: (lista) => {
        if (this.tipoElegido() === info) this.encontrados.set(lista.map((d) => d.codigo));
      },
      error: () => this.error.set('No se pudo buscar dispositivos. Revisa tu conexión.'),
    });
  }

  vincular(codigo: string) {
    this.vinculando.set(codigo);
    this.error.set('');
    this.servicio.vincular(codigo).subscribe({
      // CA3: éxito → volver a la pantalla principal, donde aparece el nuevo botón
      next: () => this.router.navigateByUrl('/'),
      // CA4: falla → mostrar el error; el dispositivo no se agrega
      error: (err: HttpErrorResponse) => {
        this.vinculando.set(null);
        this.error.set(err.error?.error || 'No se pudo vincular el dispositivo. Intenta de nuevo.');
        this.buscar();
      },
    });
  }
}
