import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { redirectIfAuthGuard } from './core/guards/redirect-if-auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
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
  { path: '**', redirectTo: '' },
];
