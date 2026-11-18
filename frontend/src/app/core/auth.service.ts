// Maneja la sesión: registro, inicio y cierre de sesión. Guarda el token (JWT) en localStorage.
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export interface Usuario {
  id: string;
  nombre: string;
  telefono: string;
  rol: 'principal' | 'invitado';
  verificado: boolean;
}

interface RespuestaSesion {
  token: string;
  usuario: Usuario;
}

const CLAVE_TOKEN = 'token';
const CLAVE_USUARIO = 'usuario';
// Marca que este navegador ya usó la app: sin sesión, se manda a /login en vez de /registro.
const CLAVE_VISITADO = 'ya-visitado';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  /** Usuario de la sesión actual (null si no hay sesión). */
  readonly usuario = signal<Usuario | null>(leerUsuarioGuardado());

  get token(): string | null {
    return localStorage.getItem(CLAVE_TOKEN);
  }

  haySesion(): boolean {
    return !!this.token;
  }

  yaVisitado(): boolean {
    return localStorage.getItem(CLAVE_VISITADO) === 'si';
  }

  registro(nombre: string, telefono: string, password: string): Observable<RespuestaSesion> {
    return this.http
      .post<RespuestaSesion>('/api/auth/registro', { nombre, telefono, password })
      .pipe(tap((r) => this.guardarSesion(r)));
  }

  login(telefono: string, password: string): Observable<RespuestaSesion> {
    return this.http
      .post<RespuestaSesion>('/api/auth/login', { telefono, password })
      .pipe(tap((r) => this.guardarSesion(r)));
  }

  /** Pide al backend los datos actualizados del usuario (también confirma que el token sirve). */
  refrescarUsuario(): Observable<{ usuario: Usuario }> {
    return this.http.get<{ usuario: Usuario }>('/api/auth/yo').pipe(
      tap((r) => {
        localStorage.setItem(CLAVE_USUARIO, JSON.stringify(r.usuario));
        this.usuario.set(r.usuario);
      }),
    );
  }

  /** Cierra la sesión y vuelve a la pantalla de inicio de sesión (HU-PLA-03 CA4). */
  logout(): void {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    this.usuario.set(null);
    this.router.navigateByUrl('/login');
  }

  private guardarSesion(r: RespuestaSesion): void {
    localStorage.setItem(CLAVE_TOKEN, r.token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(r.usuario));
    localStorage.setItem(CLAVE_VISITADO, 'si');
    this.usuario.set(r.usuario);
  }
}

function leerUsuarioGuardado(): Usuario | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null');
  } catch {
    return null;
  }
}
