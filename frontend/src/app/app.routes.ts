import { Routes } from '@angular/router';
import { conSesion, sinSesion } from './core/guards';
import { Registro } from './pages/registro/registro';
import { Login } from './pages/login/login';
import { Verificacion } from './pages/verificacion/verificacion';
import { Inicio } from './pages/inicio/inicio';
import { AgregarDispositivo } from './pages/agregar-dispositivo/agregar-dispositivo';
import { DispositivoPagina } from './pages/dispositivo/dispositivo';
import { Perfil } from './pages/perfil/perfil';
import { Salud } from './pages/salud/salud';

export const routes: Routes = [
  { path: 'registro', component: Registro, canActivate: [sinSesion], title: 'Crear cuenta' },
  { path: 'login', component: Login, canActivate: [sinSesion], title: 'Iniciar sesión' },
  { path: 'verificacion', component: Verificacion, canActivate: [conSesion], title: 'Verificar teléfono' },
  { path: 'agregar-dispositivo', component: AgregarDispositivo, canActivate: [conSesion], title: 'Agregar dispositivo' },
  { path: 'dispositivo/:id', component: DispositivoPagina, canActivate: [conSesion], title: 'Dispositivo' },
  { path: 'perfil', component: Perfil, canActivate: [conSesion], title: 'Perfil' },
  { path: 'estado', component: Salud, title: 'Estado del sistema' },
  { path: '', component: Inicio, canActivate: [conSesion], title: 'Inicio' },
  { path: '**', redirectTo: '' },
];
