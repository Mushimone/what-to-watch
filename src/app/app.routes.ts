import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { redirectIfAuthGuard } from './core/guards/redirect-if-auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
    canActivate: [redirectIfAuthGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
    canActivate: [redirectIfAuthGuard],
  },
  {
    path: 'watchlist',
    loadComponent: () => import('./features/watchlist/watchlist').then((m) => m.Watchlist),
    canActivate: [authGuard],
  },
  {
    path: 'privacy',
    loadComponent: () => import('./features/legal/legal').then((m) => m.Legal),
    data: { doc: 'privacy' },
  },
  {
    path: 'terms',
    loadComponent: () => import('./features/legal/legal').then((m) => m.Legal),
    data: { doc: 'terms' },
  },
  {
    path: 'invite/:token',
    loadComponent: () => import('./features/invite/invite').then((m) => m.Invite),
  },
  { path: '**', redirectTo: '' },
];
