// Invitar a un familiar (HU-PLA-08 CA1, CA2): genera un enlace al bot de Telegram, de un solo uso
// y que vence a las 24 horas. Muestra también las invitaciones que siguen pendientes.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { formatearFecha } from '../../shared/fechas';

interface Invitacion {
  enlace: string;
  qr: string;
  expira_en: string;
  creado_en: string;
}

@Component({
  selector: 'app-invitar-perfil',
  template: `
    <p class="detalle">
      Genera un enlace y envíaselo al familiar. Al abrirlo, el bot de Telegram le pedirá compartir su contacto y
      quedará agregado como invitado. <strong>Cada enlace sirve una sola vez y vence en 24 horas.</strong>
    </p>
    <button type="button" class="boton" (click)="generar()" [disabled]="generando()">
      {{ generando() ? 'Generando…' : '✉️ Generar invitación' }}
    </button>
    @if (error()) {
      <div class="alerta-error">{{ error() }}</div>
    }

    @if (nueva(); as inv) {
      <div class="invitacion">
        <img [src]="inv.qr" alt="Código QR de la invitación">
        <div class="texto">
          <p class="titulo">Invitación lista</p>
          <a class="enlace" [href]="inv.enlace" target="_blank" rel="noopener">{{ inv.enlace }}</a>
          <p class="vence">Vence: {{ fecha(inv.expira_en) }} · un solo uso</p>
          <button type="button" class="boton secundario chico" (click)="copiar(inv.enlace)">
            {{ copiado() ? '✅ Copiado' : '📋 Copiar enlace' }}
          </button>
        </div>
      </div>
    }

    @if (pendientes().length) {
      <p class="sub">Invitaciones pendientes ({{ pendientes().length }}):</p>
      <ul>
        @for (p of pendientes(); track p.enlace) {
          <li>Creada {{ fecha(p.creado_en) }} · vence {{ fecha(p.expira_en) }}</li>
        }
      </ul>
    }
  `,
  styles: `
    .detalle { color: #5b6475; margin-top: 0; }
    .boton { width: auto; min-width: 220px; }
    .chico { min-width: 0; padding: 8px 14px; margin-top: 8px; }
    .alerta-error { margin: 12px 0 0; }
    .invitacion { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin-top: 16px; padding: 12px;
                  border: 1px solid #c6ccd8; border-radius: 12px; }
    img { width: 160px; height: 160px; }
    .texto { flex: 1; min-width: 220px; }
    .titulo { font-weight: 700; margin: 0 0 6px; }
    .enlace { word-break: break-all; font-size: 0.9rem; }
    .vence { color: #5b6475; font-size: 0.85rem; margin: 6px 0 0; }
    .sub { color: #5b6475; margin: 16px 0 4px; font-size: 0.9rem; }
    ul { margin: 0; padding-left: 18px; color: #5b6475; font-size: 0.85rem; }
  `,
})
export class InvitarPerfil {
  private http = inject(HttpClient);
  protected nueva = signal<Invitacion | null>(null);
  protected pendientes = signal<Invitacion[]>([]);
  protected generando = signal(false);
  protected copiado = signal(false);
  protected error = signal('');
  protected fecha = formatearFecha;

  constructor() {
    this.cargarPendientes();
    const temporizador = setInterval(() => this.cargarPendientes(), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(temporizador));
  }

  generar() {
    this.generando.set(true);
    this.error.set('');
    this.copiado.set(false);
    this.http.post<Invitacion>('/api/ambiente/invitaciones', {}).subscribe({
      next: (inv) => {
        this.generando.set(false);
        this.nueva.set(inv);
        this.cargarPendientes();
      },
      error: (err: HttpErrorResponse) => {
        this.generando.set(false);
        this.error.set(err.error?.error || 'No se pudo generar la invitación.');
      },
    });
  }

  copiar(enlace: string) {
    navigator.clipboard?.writeText(enlace).then(
      () => this.copiado.set(true),
      () => this.error.set('No se pudo copiar. Mantén presionado el enlace para copiarlo.'),
    );
  }

  private cargarPendientes() {
    this.http.get<Invitacion[]>('/api/ambiente/invitaciones').subscribe((l) => {
      this.pendientes.set(l);
      // Si la invitación mostrada ya se usó (o venció), se quita de la pantalla.
      const actual = this.nueva();
      if (actual && !l.some((p) => p.enlace === actual.enlace)) this.nueva.set(null);
    });
  }
}
