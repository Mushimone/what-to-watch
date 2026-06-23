import { Component, OnInit, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { WatchlistList } from './watchlist-list/watchlist-list';
import { WatchlistAdd } from './watchlist-add/watchlist-add';
import { WatchlistShared } from './watchlist-shared/watchlist-shared';
import { WatchlistAiChatComponent, ChatMode } from './watchlist-ai-chat/watchlist-ai.chat';
import { UsernameDialog } from '../auth/username-dialog/username-dialog';
import { SupabaseService } from '../../core/services/supabase.service';
import { ProfileService } from '../../core/services/profile.service';
import { FriendsService } from '../../core/services/friends.service';

export type WatchlistSection = 'list' | 'add' | 'shared';

@Component({
  selector: 'app-watchlist',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    WatchlistList,
    WatchlistAdd,
    WatchlistShared,
    WatchlistAiChatComponent,
  ],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist implements OnInit {
  private supabase = inject(SupabaseService);
  private profile = inject(ProfileService);
  private friends = inject(FriendsService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  isDesktop = signal(false);
  /** Which section the desktop content pane shows (mobile uses tabs instead). */
  activeSection = signal<WatchlistSection>('list');
  chatMode: ChatMode = 'list';

  constructor() {
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.isDesktop.set(state.matches);
        // Keep the chat context aligned with the currently visible section.
        if (state.matches) this.chatMode = this.activeSection() === 'add' ? 'add' : 'list';
      });
  }

  /** Desktop nav: switch the content pane and align the chat context. */
  setSection(section: WatchlistSection): void {
    this.activeSection.set(section);
    this.chatMode = section === 'add' ? 'add' : 'list';
  }

  async ngOnInit(): Promise<void> {
    this.friends.startRealtime();
    const profile = await this.profile.loadProfile();
    if (profile && !profile.username) {
      this.dialog.open(UsernameDialog, {
        disableClose: true,
        width: '420px',
        maxWidth: '95vw',
        autoFocus: true,
      });
    }
  }

  onTabChange(event: MatTabChangeEvent): void {
    // index 1 = Add (use 'add' chat context); index 0 = List, 2 = Shared.
    this.chatMode = event.index === 1 ? 'add' : 'list';
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
