// Verificación del teléfono con Telegram (HU-PLA-02).
// PROVISIONAL: el enlace de Telegram y la espera automática se construyen en el paso 2.
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-verificacion',
  imports: [RouterLink],
  template: `
    <div class="pantalla-centrada">
      <div class="tarjeta">
        <h1>Verifica tu teléfono</h1>
        <p class="sub">¡Hola, {{ auth.usuario()?.nombre }}! Tu cuenta fue creada.</p>
        <p>
          Para recibir alertas debes verificar tu teléfono con Telegram.
          Esta función estará disponible muy pronto.
        </p>
        <a class="boton" routerLink="/">Continuar</a>
      </div>
    </div>
  `,
})
export class Verificacion {
  protected auth = inject(AuthService);
}
