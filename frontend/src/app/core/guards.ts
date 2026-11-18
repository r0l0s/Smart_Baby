// Guardas de rutas: deciden si se puede entrar a una pantalla.
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Pantallas que necesitan sesión. Sin sesión: primera visita → /registro (HU-PLA-01 CA1), si no → /login. */
export const conSesion: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.haySesion()) return true;
  return inject(Router).parseUrl(auth.yaVisitado() ? '/login' : '/registro');
};

/** Registro y login: si ya hay sesión, ir directo a Inicio. */
export const sinSesion: CanActivateFn = () => {
  return inject(AuthService).haySesion() ? inject(Router).parseUrl('/') : true;
};
