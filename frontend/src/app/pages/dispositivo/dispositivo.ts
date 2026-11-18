// Pantalla dedicada de un dispositivo (HU-PLA-06).
// Consulta el estado cada 3 s mientras está abierta (RNF-03). Los controles y gráficas de
// cada tipo se agregan en sus historias (cuna: HU-CUN-*, colchón: HU-COL-*, ...).
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Dispositivo, DispositivosService, infoTipo } from '../../core/dispositivos';
import { Encabezado } from '../../shared/encabezado';

const INTERVALO_MS = 3000;

// Etiquetas legibles para los valores del estado.
const ETIQUETAS: Record<string, { texto: string; unidad?: string }> = {
  monitoreo: { texto: 'Monitoreo' },
  temperatura: { texto: 'Temperatura', unidad: '°C' },
  humedad: { texto: 'Humedad', unidad: '%' },
  luz: { texto: 'Luz (nivel)' },
  sonido: { texto: 'Sonido' },
  peso: { texto: 'Peso', unidad: 'kg' },
  alarma: { texto: 'Alarma' },
  encendida: { texto: 'Encendida' },
  velocidad: { texto: 'Velocidad' },
  activo: { texto: 'Sistema activo' },
  puertaAbierta: { texto: 'Puerta abierta' },
};

@Component({
  selector: 'app-dispositivo',
  imports: [Encabezado],
  templateUrl: './dispositivo.html',
  styleUrl: './dispositivo.css',
})
export class DispositivoPagina implements OnInit {
  /** Viene de la URL /dispositivo/:id */
  id = input.required<string>();

  private servicio = inject(DispositivosService);
  protected dispositivo = signal<Dispositivo | null>(null);
  protected error = signal('');
  protected infoTipo = infoTipo;

  constructor() {
    const temporizador = setInterval(() => this.cargar(), INTERVALO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  ngOnInit() {
    this.cargar(); // aquí el id de la URL ya está disponible
  }

  private cargar() {
    this.servicio.obtener(this.id()).subscribe({
      next: (d) => {
        this.dispositivo.set(d);
        this.error.set('');
      },
      error: (err: HttpErrorResponse) =>
        this.error.set(err.status === 404 ? 'Este dispositivo no existe o no pertenece a tu ambiente.' : 'No se pudo cargar el dispositivo.'),
    });
  }

  protected valores(d: Dispositivo): { etiqueta: string; valor: string }[] {
    return Object.entries(d.estado).map(([clave, valor]) => {
      const e = ETIQUETAS[clave] ?? { texto: clave };
      let texto: string;
      if (typeof valor === 'boolean') texto = valor ? 'Sí' : 'No';
      else if (valor === null || valor === undefined) texto = '—';
      else texto = `${valor}${e.unidad ? ' ' + e.unidad : ''}`;
      return { etiqueta: e.texto, valor: texto };
    });
  }
}
