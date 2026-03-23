import { Component, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { WatchlistList } from './watchlist-list/watchlist-list';
import { WatchlistAdd } from './watchlist-add/watchlist-add';
import { WatchlistAiChatComponent, ChatMode } from './watchlist-ai-chat/watchlist-ai.chat';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-watchlist',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    WatchlistList,
    WatchlistAdd,
    WatchlistAiChatComponent,
  ],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  isDesktop = signal(false);
  chatMode: ChatMode = 'list';

  constructor() {
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.isDesktop.set(state.matches);
        // On desktop both panels are always visible — list context is always correct.
        if (state.matches) this.chatMode = 'list';
      });
  }

  onTabChange(event: MatTabChangeEvent): void {
    this.chatMode = event.index === 1 ? 'add' : 'list';
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
