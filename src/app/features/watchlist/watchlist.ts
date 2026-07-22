import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
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
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
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
  /** Which section the content pane shows — same model on desktop and mobile. */
  activeSection = signal<WatchlistSection>('list');
  sectionTitle = computed(
    () => ({ list: 'What to Watch', add: 'Add a title', shared: 'Friends' })[this.activeSection()],
  );
  chatMode: ChatMode = 'list';
  /** Shown in the desktop rail's account row. */
  username = signal('Account');

  constructor() {
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(takeUntilDestroyed())
      .subscribe((state) => this.isDesktop.set(state.matches));
  }

  /** Switch the content pane and align the chat context. */
  setSection(section: WatchlistSection): void {
    this.activeSection.set(section);
    this.chatMode = section === 'add' ? 'add' : 'list';
  }

  async ngOnInit(): Promise<void> {
    this.friends.startRealtime();
    const profile = await this.profile.loadProfile();
    if (profile?.username) this.username.set(profile.username);
    if (profile && !profile.username) {
      this.dialog.open(UsernameDialog, {
        disableClose: true,
        width: '420px',
        maxWidth: '95vw',
        autoFocus: true,
      });
    }
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
