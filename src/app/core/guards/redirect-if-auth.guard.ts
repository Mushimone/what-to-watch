import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';

export const redirectIfAuthGuard: CanActivateFn = () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  return supabase.currentUser$.pipe(
    filter((user) => user !== undefined),
    take(1),
    map((user) => (user ? router.createUrlTree(['/watchlist']) : true)),
  );
};
