// Pantalla provisional: llama a GET /api/salud y muestra si cada parte funciona.
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { JsonPipe } from '@angular/common';

interface RespuestaSalud {
  ok: boolean;
  hora: string;
  supabase: string;
  telegram: string;
  mqtt: { clientesConectados: number; dispositivos: { codigo: string; tipo: string; online: boolean }[] };
}

@Component({
  selector: 'app-salud',
  imports: [JsonPipe],
  templateUrl: './salud.html',
  styleUrl: './salud.css',
})
export class Salud {
  private http = inject(HttpClient);

  protected datos = signal<RespuestaSalud | null>(null);
  protected error = signal('');
  protected cargando = signal(false);

  constructor() {
    this.revisar();
  }

  revisar() {
    this.cargando.set(true);
    this.error.set('');
    // URL relativa: el proxy de Angular la manda al backend (sirve también desde el teléfono).
    this.http.get<RespuestaSalud>('/api/salud').subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargando.set(false);
      },
      error: () => {
        this.datos.set(null);
        this.error.set('No se pudo contactar al backend. ¿Está corriendo en el puerto 3000?');
        this.cargando.set(false);
      },
    });
  }
}
