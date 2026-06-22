import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { filter, firstValueFrom, take } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { FriendsService } from '../../core/services/friends.service';

type InviteStatus = 'working' | 'ok' | 'invalid' | 'used' | 'expired' | 'self' | 'error';

@Component({
  selector: 'app-invite',
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
})
export class Invite implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private friends = inject(FriendsService);

  status = signal<InviteStatus>('working');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.status.set('invalid');
      return;
    }

    // Wait for a resolved auth state (never the initial `undefined`).
    const user = await firstValueFrom(
      this.supabase.currentUser$.pipe(
        filter((u) => u !== undefined),
        take(1),
      ),
    );

    if (!user) {
      // Bounce through Google login and return to this exact invite URL.
      this.supabase.signInWithGoogle(window.location.href);
      return;
    }

    const outcome = await this.friends.acceptInvite(token);
    switch (outcome) {
      case 'unauthenticated':
        this.supabase.signInWithGoogle(window.location.href);
        return;
      case 'ok':
        await this.friends.getFriends();
        this.status.set('ok');
        return;
      case 'invalid':
      case 'used':
      case 'expired':
      case 'self':
        this.status.set(outcome); // each case narrows to a valid InviteStatus
        return;
      default:
        this.status.set('error');
    }
  }

  goToWatchlist(): void {
    this.router.navigate(['/watchlist']);
  }
}
