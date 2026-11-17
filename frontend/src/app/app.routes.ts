import { Routes } from '@angular/router';
import { Salud } from './pages/salud/salud';

export const routes: Routes = [
  // Pantalla provisional (paso 0). Se reemplaza por Inicio en HU-PLA-04.
  { path: '', component: Salud },
  { path: '**', redirectTo: '' },
];
