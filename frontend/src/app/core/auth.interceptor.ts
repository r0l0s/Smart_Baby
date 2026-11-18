// Agrega "Authorization: Bearer <token>" a cada llamada a /api.
// Si el backend responde 401 (sesión vencida o inválida), cierra la sesión.
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(peticion).pipe(
    catchError((err: HttpErrorResponse) => {
      const esLoginORegistro = req.url.startsWith('/api/auth/login') || req.url.startsWith('/api/auth/registro');
      if (err.status === 401 && token && !esLoginORegistro) auth.logout();
      return throwError(() => err);
    }),
  );
};
