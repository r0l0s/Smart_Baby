// Tipos de dispositivo y llamadas al backend relacionadas.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type TipoDispositivo = 'cuna' | 'colchon' | 'matriz' | 'seguridad' | 'biberon';

export interface Dispositivo {
  id: string;
  tipo: TipoDispositivo;
  codigo: string;
  nombre: string;
  online: boolean;
  estado: Record<string, unknown>;
  configuracion: Record<string, unknown>;
  creado_en: string;
  /** Solo en el detalle: monitoreo activo o null */
  monitoreo?: { id: string; inicio: string; fin: string | null } | null;
  /** Solo en el detalle: cada cuántos segundos se actualizan los datos */
  intervalo_seg?: number;
  /** Solo en el detalle de una base de biberón */
  ultima_medicion?: Medicion | null;
}

export interface Medicion {
  valor: number;
  clasificacion: 'muy_fria' | 'apta' | 'muy_caliente';
  mensaje: string;
  registrado_en: string;
}

export interface InfoTipo {
  tipo: TipoDispositivo;
  nombre: string;
  emoji: string;
  descripcion: string;
}

export const TIPOS_DISPOSITIVO: InfoTipo[] = [
  { tipo: 'cuna', nombre: 'Cuna', emoji: '🛏️', descripcion: 'Temperatura, humedad y movimiento' },
  { tipo: 'colchon', nombre: 'Colchón', emoji: '⚖️', descripcion: 'Sensor de peso con alarma' },
  { tipo: 'matriz', nombre: 'Matriz LED', emoji: '💡', descripcion: 'Luces para el bebé' },
  { tipo: 'seguridad', nombre: 'Sistema de seguridad', emoji: '📷', descripcion: 'Movimiento y apertura de puerta' },
  { tipo: 'biberon', nombre: 'Base de biberón', emoji: '🍼', descripcion: 'Temperatura de la leche' },
];

export function infoTipo(tipo: TipoDispositivo): InfoTipo {
  return TIPOS_DISPOSITIVO.find((t) => t.tipo === tipo)!;
}

@Injectable({ providedIn: 'root' })
export class DispositivosService {
  private http = inject(HttpClient);

  listar(): Observable<Dispositivo[]> {
    return this.http.get<Dispositivo[]>('/api/dispositivos');
  }

  obtener(id: string): Observable<Dispositivo> {
    return this.http.get<Dispositivo>(`/api/dispositivos/${id}`);
  }

  disponibles(tipo: TipoDispositivo): Observable<{ codigo: string; tipo: TipoDispositivo }[]> {
    return this.http.get<{ codigo: string; tipo: TipoDispositivo }[]>('/api/dispositivos/disponibles', {
      params: { tipo },
    });
  }

  vincular(codigo: string): Observable<Dispositivo> {
    return this.http.post<Dispositivo>('/api/dispositivos', { codigo });
  }

  /** Quita el dispositivo del ambiente (el historial se conserva en la base de datos). */
  eliminar(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/api/dispositivos/${id}`);
  }
}
