import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { WatchlistList } from './watchlist-list/watchlist-list';
import { WatchlistAdd } from './watchlist-add/watchlist-add';
import { WatchlistShared } from './watchlist-shared/watchlist-shared';
import { WatchlistProfile } from './watchlist-profile/watchlist-profile';
import { WatchlistAiChatComponent, ChatMode } from './watchlist-ai-chat/watchlist-ai.chat';
import { UsernameDialog } from '../auth/username-dialog/username-dialog';
import { ProfileService } from '../../core/services/profile.service';
import { FriendsService } from '../../core/services/friends.service';
import { SearchService } from '../../core/services/search.service';

export type WatchlistSection = 'list' | 'add' | 'shared' | 'profile';

@Component({
  selector: 'app-watchlist',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    WatchlistList,
    WatchlistAdd,
    WatchlistShared,
    WatchlistProfile,
    WatchlistAiChatComponent,
  ],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist implements OnInit {
  private profile = inject(ProfileService);
  private friends = inject(FriendsService);
  private dialog = inject(MatDialog);
  private search = inject(SearchService);

  isDesktop = signal(false);
  /** Which section the content pane shows — same model on desktop and mobile. */
  activeSection = signal<WatchlistSection>('list');
  sectionTitle = computed(
    () =>
      ({ list: 'What to Watch', add: 'Add a title', shared: 'Friends', profile: 'Profile' })[
        this.activeSection()
      ],
  );
  chatMode: ChatMode = 'list';
  /** Shown in the desktop rail's account row. */
  username = signal('Account');

  constructor() {
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(takeUntilDestroyed())
      .subscribe((state) => this.isDesktop.set(state.matches));

    // Someone asked for a search — bring the pane that runs it forward. The pane
    // picks up the query itself; this only owns which section shows.
    this.search.searchRequests$.pipe(takeUntilDestroyed()).subscribe(() => this.setSection('add'));
  }

  /**
   * Switch the content pane. The tab preselects the chat mode so the chat
   * follows where you are: the Add screen opens the discovery thread, every
   * other screen opens the from-your-list thread.
   */
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
}
