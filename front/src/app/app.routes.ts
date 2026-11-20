import { Routes } from '@angular/router';
import { Tableau } from './vues/tableau/tableau';

// Le tableau de bord est chargé d'emblée ; les autres vues sont chargées à la demande (lazy loading).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tableau' },
  { path: 'tableau', component: Tableau, title: 'Tableau de bord' },
  { path: 'contrats', loadComponent: () => import('./vues/contrats/contrats').then((m) => m.Contrats), title: 'Contrats' },
  { path: 'recouvrement', loadComponent: () => import('./vues/recouvrement/recouvrement').then((m) => m.Recouvrement), title: 'Recouvrement' },
  { path: 'mcp', loadComponent: () => import('./vues/mcp/mcp').then((m) => m.Mcp), title: 'Serveur MCP' },
  { path: '**', redirectTo: 'tableau' },
];
